import base64
from array import array
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import wave


MODULE_PATH = Path(__file__).with_name("radio_voice.py")
SPEC = importlib.util.spec_from_file_location("radio_voice", MODULE_PATH)
radio_voice = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(radio_voice)


def catalog():
    return {
        "version": 1,
        "provider": "openai",
        "model": "gpt-4o-mini-tts",
        "response_format": "wav",
        "roles": {
            "tower": {
                "voice": "cedar",
                "speed": 1.08,
                "instructions": "Calm controller.",
            }
        },
        "lines": [
            {"id": "tower-test", "role": "tower", "text": "Continue."}
        ],
    }


def wav_bytes():
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24_000)
        audio.writeframes(b"\xa0\x0f" * 2_400)
    return output.getvalue()


class FakeResponse:
    def __init__(self, data=None):
        self.data = wav_bytes() if data is None else data

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.data


class RadioVoiceTests(unittest.TestCase):
    def test_catalog_validation_rejects_duplicates(self):
        duplicate = catalog()
        duplicate["lines"].append(dict(duplicate["lines"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            radio_voice.validate_catalog(duplicate)

    def test_version_five_catalog_requires_line_duration_targets(self):
        missing_target = catalog()
        missing_target["version"] = 5
        with self.assertRaisesRegex(ValueError, "target_duration_s"):
            radio_voice.validate_catalog(missing_target)

    def test_request_uses_official_speech_shape_without_leaking_key(self):
        captured = {}

        def urlopen(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse()

        audio = radio_voice.speech_request(
            catalog(),
            catalog()["lines"][0],
            "secret-test-key",
            urlopen=urlopen,
        )
        payload = json.loads(captured["request"].data)
        self.assertEqual("gpt-4o-mini-tts", payload["model"])
        self.assertEqual("cedar", payload["voice"])
        self.assertEqual("wav", payload["response_format"])
        self.assertEqual(1.08, payload["speed"])
        self.assertEqual("Calm controller.", payload["instructions"])
        self.assertEqual(wav_bytes(), audio)

    def test_generate_writes_valid_wav_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "clips"
            manifest = output / "manifest.json"
            original = radio_voice.speech_request
            radio_voice.speech_request = lambda *_args, **_kwargs: wav_bytes()
            try:
                count = radio_voice.generate(
                    catalog(), output, manifest, "secret-test-key"
                )
            finally:
                radio_voice.speech_request = original

            self.assertEqual(1, count)
            details = radio_voice.inspect_wav(output / "tower-test.wav")
            self.assertEqual(24_000, details["sample_rate_hz"])
            data = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertIn("tower-test", data["clips"])
            self.assertNotIn("secret-test-key", manifest.read_text(encoding="utf-8"))

    def test_generate_rejects_audio_outside_authored_duration(self):
        authored = catalog()
        authored["version"] = 5
        authored["lines"][0]["target_duration_s"] = [1.0, 2.0]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "clips"
            manifest = output / "manifest.json"
            original = radio_voice.speech_request
            radio_voice.speech_request = lambda *_args, **_kwargs: wav_bytes()
            try:
                with self.assertRaisesRegex(ValueError, "outside 1-2s target"):
                    radio_voice.generate(
                        authored, output, manifest, "secret-test-key"
                    )
            finally:
                radio_voice.speech_request = original
            self.assertFalse((output / "tower-test.wav").exists())


    def test_inspect_wav_handles_openai_unknown_chunk_sizes(self):
        # OpenAI speech returns RIFF/data sizes of 0xFFFFFFFF; duration must come from bytes.
        pcm = b"\0\0" * 24_000  # 1.0 s mono 16-bit @ 24 kHz
        header = bytearray()
        header += b"RIFF"
        header += (0xFFFFFFFF).to_bytes(4, "little")
        header += b"WAVE"
        header += b"fmt "
        header += (16).to_bytes(4, "little")
        header += (1).to_bytes(2, "little")  # PCM
        header += (1).to_bytes(2, "little")  # mono
        header += (24_000).to_bytes(4, "little")
        header += (48_000).to_bytes(4, "little")  # byte rate
        header += (2).to_bytes(2, "little")  # block align
        header += (16).to_bytes(2, "little")  # bits
        header += b"data"
        header += (0xFFFFFFFF).to_bytes(4, "little")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "openai.wav"
            path.write_bytes(bytes(header) + pcm)
            details = radio_voice.inspect_wav(path)
            self.assertEqual(1.0, details["duration_s"])
            radio_voice.normalize_wav(path)
            with wave.open(str(path), "rb") as audio:
                self.assertEqual(24_000, audio.getnframes())

    def test_trim_wav_silence_preserves_short_keying_margins(self):
        rate = 1_000
        samples = array(
            "h",
            ([0] * 300)
            + ([4_000] * 200)
            + ([0] * 500),
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "padded.wav"
            with wave.open(str(path), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(rate)
                audio.writeframes(samples.tobytes())

            radio_voice.trim_wav_silence(path)

            with wave.open(str(path), "rb") as audio:
                self.assertEqual(300, audio.getnframes())
                trimmed = array("h")
                trimmed.frombytes(audio.readframes(audio.getnframes()))
            self.assertEqual([0] * 20, list(trimmed[:20]))
            self.assertEqual([4_000] * 200, list(trimmed[20:220]))
            self.assertEqual([0] * 80, list(trimmed[220:]))
            self.assertEqual(
                {
                    "leading_silence_s": 0.02,
                    "trailing_silence_s": 0.08,
                },
                radio_voice.wav_silence_padding(path),
            )

    def test_elevenlabs_request_uses_voice_id_and_wraps_pcm_as_wav(self):
        eleven = {
            "version": 1,
            "provider": "elevenlabs",
            "model": "eleven_v3",
            "response_format": "wav",
            "pcm_sample_rate_hz": 24_000,
            "roles": {
                "tower": {
                    "voice_id": "tower-character-id",
                    "instructions": "Calm controller.",
                    "voice_settings": {"stability": 0.45},
                }
            },
            "lines": [{
                "id": "tower-test",
                "role": "tower",
                "text": "Continue.",
                "audio_tags": "[calm]",
            }],
        }
        radio_voice.validate_catalog(eleven)
        captured = {}
        pcm = b"\0\0" * 2_400

        class PcmResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return pcm

        def urlopen(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return PcmResponse()

        result = radio_voice.speech_request(
            eleven, eleven["lines"][0], "eleven-secret", urlopen=urlopen
        )
        request = captured["request"]
        payload = json.loads(request.data)
        self.assertIn("/tower-character-id?output_format=pcm_24000", request.full_url)
        self.assertEqual("eleven_v3", payload["model_id"])
        self.assertEqual("[calm] Continue.", payload["text"])
        self.assertEqual("eleven-secret", request.get_header("Xi-api-key"))
        self.assertTrue(result.startswith(b"RIFF"))

    def test_hume_request_decodes_octave_wav(self):
        hume = {
            "version": 1,
            "provider": "hume",
            "model": "1",
            "response_format": "wav",
            "roles": {
                "tower": {
                    "voice_id": "hume-tower-id",
                    "speed": 1.05,
                    "instructions": "Calm controller.",
                    "description": "professional, clipped, matter-of-fact",
                }
            },
            "lines": [{
                "id": "tower-test",
                "role": "tower",
                "text": "Continue.",
                "speed": 1.25,
                "direction": "One connected packet.",
            }],
        }
        radio_voice.validate_catalog(hume)
        captured = {}
        encoded = base64.b64encode(wav_bytes()).decode("ascii")

        def urlopen(request, timeout):
            captured["request"] = request
            return FakeResponse(json.dumps({
                "generations": [{"audio": encoded}],
            }).encode("utf-8"))

        result = radio_voice.speech_request(
            hume, hume["lines"][0], "hume-secret", urlopen=urlopen
        )
        payload = json.loads(captured["request"].data)
        self.assertEqual("1", payload["version"])
        self.assertEqual("hume-tower-id", payload["utterances"][0]["voice"]["id"])
        self.assertEqual(1.25, payload["utterances"][0]["speed"])
        self.assertEqual(
            "professional, clipped, matter-of-fact",
            payload["utterances"][0]["description"],
        )
        self.assertEqual("hume-secret", captured["request"].get_header("X-hume-api-key"))
        self.assertEqual(wav_bytes(), result)

    def test_hume_octave_two_omits_unsupported_description(self):
        hume = {
            "version": 1,
            "provider": "hume",
            "model": "2",
            "response_format": "wav",
            "roles": {
                "tower": {
                    "voice_id": "hume-tower-id",
                    "speed": 1.05,
                    "instructions": "Calm controller.",
                }
            },
            "lines": [{
                "id": "tower-test",
                "role": "tower",
                "text": "Continue.",
                "direction": "One connected packet.",
            }],
        }
        captured = {}
        encoded = base64.b64encode(wav_bytes()).decode("ascii")

        def urlopen(request, timeout):
            captured["request"] = request
            return FakeResponse(json.dumps({
                "generations": [{"audio": encoded}],
            }).encode("utf-8"))

        radio_voice.speech_request(
            hume, hume["lines"][0], "hume-secret", urlopen=urlopen
        )
        utterance = json.loads(captured["request"].data)["utterances"][0]
        self.assertNotIn("description", utterance)

    def test_hume_octave_one_rejects_long_acting_descriptions(self):
        hume = {
            "version": 1,
            "provider": "hume",
            "model": "1",
            "response_format": "wav",
            "roles": {
                "tower": {
                    "voice_id": "hume-tower-id",
                    "instructions": "Calm controller.",
                    "description": "x" * 101,
                }
            },
            "lines": [{"id": "tower-test", "role": "tower", "text": "Continue."}],
        }
        with self.assertRaisesRegex(ValueError, "exceeds 100 characters"):
            radio_voice.validate_catalog(hume)

    def test_cartesia_request_pins_snapshot_api_version_and_wav(self):
        cartesia = {
            "version": 1,
            "provider": "cartesia",
            "model": "sonic-3.5-2026-05-04",
            "api_version": "2026-03-01",
            "response_format": "wav",
            "pcm_sample_rate_hz": 48_000,
            "roles": {
                "tower": {
                    "voice_id": "cartesia-tower-id",
                    "instructions": "Calm controller.",
                }
            },
            "lines": [{"id": "tower-test", "role": "tower", "text": "Continue."}],
        }
        radio_voice.validate_catalog(cartesia)
        captured = {}

        def urlopen(request, timeout):
            captured["request"] = request
            return FakeResponse()

        result = radio_voice.speech_request(
            cartesia, cartesia["lines"][0], "cartesia-secret", urlopen=urlopen
        )
        request = captured["request"]
        payload = json.loads(request.data)
        self.assertEqual("sonic-3.5-2026-05-04", payload["model_id"])
        self.assertEqual("cartesia-tower-id", payload["voice"]["id"])
        self.assertEqual(48_000, payload["output_format"]["sample_rate"])
        self.assertEqual("2026-03-01", request.get_header("Cartesia-version"))
        self.assertEqual("Bearer cartesia-secret", request.get_header("Authorization"))
        self.assertEqual(wav_bytes(), result)

    def test_provider_key_prefers_environment_then_uses_keychain(self):
        with mock.patch.dict(
            os.environ, {"HUME_API_KEY": "environment-key"}
        ), mock.patch.object(radio_voice.subprocess, "run") as run:
            self.assertEqual("environment-key", radio_voice.key_for_provider("hume"))
            run.assert_not_called()

        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="keychain-key\n"
        )
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(
            radio_voice.subprocess, "run", return_value=completed
        ) as run:
            self.assertEqual("keychain-key", radio_voice.key_for_provider("hume"))
            self.assertEqual(
                [
                    "security",
                    "find-generic-password",
                    "-a",
                    "HUME_API_KEY",
                    "-s",
                    radio_voice.KEYCHAIN_SERVICE,
                    "-w",
                ],
                run.call_args.args[0],
            )
            self.assertIs(
                radio_voice.subprocess.DEVNULL,
                run.call_args.kwargs["stderr"],
            )


if __name__ == "__main__":
    unittest.main()
