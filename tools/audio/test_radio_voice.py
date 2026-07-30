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


def equipment_catalog():
    authored = catalog()
    authored["version"] = 6
    authored["roles"]["tower"].update({
        "talker_profile": "ground.controller.close-mic",
        "transceiver_profile": "modern.uhf-am.ground",
    })
    authored["lines"][0]["target_duration_s"] = [0.01, 1.0]
    return authored


def cadence_catalog():
    authored = equipment_catalog()
    authored["version"] = 7
    authored["lines"][0].update({
        "text": "Ghost One One.",
        "rt_profile": "acknowledgement",
        "cadence": [{
            "text": "Ghost One One",
            "pace": "connected",
            "focus": "authority received",
        }],
        "direction": "One connected unit.",
    })
    return authored


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

    def test_version_six_catalog_requires_known_equipment_profiles(self):
        missing_talker = equipment_catalog()
        del missing_talker["roles"]["tower"]["talker_profile"]
        with self.assertRaisesRegex(ValueError, "talker_profile"):
            radio_voice.validate_catalog(missing_talker)

        unknown_radio = equipment_catalog()
        unknown_radio["roles"]["tower"]["transceiver_profile"] = "generic.radio"
        with self.assertRaisesRegex(ValueError, "transceiver_profile"):
            radio_voice.validate_catalog(unknown_radio)

    def test_cadence_map_must_cover_canonical_words_in_order(self):
        authored = cadence_catalog()
        radio_voice.validate_catalog(authored)
        instructions = radio_voice.line_instructions(
            authored, authored["lines"][0]
        )
        self.assertIn("Cadence map", instructions)
        self.assertIn("connected", instructions)

        authored["lines"][0]["cadence"][0]["text"] = "One One Ghost"
        with self.assertRaisesRegex(ValueError, "canonical spoken words"):
            radio_voice.validate_catalog(authored)

    def test_cadence_map_requires_a_known_performance_profile(self):
        authored = cadence_catalog()
        authored["lines"][0]["rt_profile"] = "cinematic"
        with self.assertRaisesRegex(ValueError, "unknown rt_profile"):
            radio_voice.validate_catalog(authored)

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
            self.assertEqual(
                "Continue.", data["clips"]["tower-test"]["transcript"]
            )
            self.assertNotIn("secret-test-key", manifest.read_text(encoding="utf-8"))

    def test_generate_reuses_only_wavs_with_matching_manifest_provenance(self):
        authored = catalog()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = output / "manifest.json"
            wav_path = output / "tower-test.wav"
            wav_path.write_bytes(wav_bytes())
            radio_voice.write_manifest(
                authored,
                output,
                manifest,
                trusted_sources={
                    wav_path.name: radio_voice.source_hash(
                        authored, authored["lines"][0]
                    )
                },
            )
            requests = []
            original = radio_voice.speech_request
            radio_voice.speech_request = lambda *_args, **_kwargs: (
                requests.append(True) or wav_bytes()
            )
            try:
                self.assertEqual(
                    0,
                    radio_voice.generate(
                        authored, output, manifest, "secret-test-key"
                    ),
                )
                authored["roles"]["tower"]["instructions"] = "Different person."
                self.assertEqual(
                    1,
                    radio_voice.generate(
                        authored, output, manifest, "secret-test-key"
                    ),
                )
            finally:
                radio_voice.speech_request = original

            self.assertEqual([True], requests)
            refreshed = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(
                radio_voice.source_hash(authored, authored["lines"][0]),
                refreshed["clips"]["tower-test"]["takes"][0]["source_sha256"],
            )

    def test_manifest_does_not_relabel_a_stale_take_with_new_words(self):
        authored = catalog()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = output / "manifest.json"
            wav_path = output / "tower-test.wav"
            wav_path.write_bytes(wav_bytes())
            radio_voice.write_manifest(
                authored,
                output,
                manifest,
                trusted_sources={
                    wav_path.name: radio_voice.source_hash(
                        authored, authored["lines"][0]
                    )
                },
            )

            authored["lines"][0]["text"] = "Different words."
            radio_voice.write_manifest(authored, output, manifest)
            refreshed = json.loads(manifest.read_text(encoding="utf-8"))

        self.assertEqual({}, refreshed["clips"])

    def test_manifest_rejects_a_take_whose_file_hash_changed(self):
        authored = catalog()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = output / "manifest.json"
            wav_path = output / "tower-test.wav"
            wav_path.write_bytes(wav_bytes())
            radio_voice.write_manifest(
                authored,
                output,
                manifest,
                trusted_sources={
                    wav_path.name: radio_voice.source_hash(
                        authored, authored["lines"][0]
                    )
                },
            )
            wav_path.write_bytes(wav_path.read_bytes() + b"tampered")

            radio_voice.write_manifest(authored, output, manifest)
            refreshed = json.loads(manifest.read_text(encoding="utf-8"))

        self.assertEqual({}, refreshed["clips"])

    def test_manifest_carries_equipment_without_baking_the_radio_into_source_hash(self):
        authored = equipment_catalog()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "tower-test.wav").write_bytes(wav_bytes())
            manifest = radio_voice.build_manifest(authored, output)
            clip = manifest["clips"]["tower-test"]

            self.assertEqual(3, manifest["version"])
            self.assertEqual(1, manifest["equipment_profile_version"])
            self.assertEqual(
                "ground.controller.close-mic", clip["talker_profile"]
            )
            self.assertEqual(
                "modern.uhf-am.ground", clip["transceiver_profile"]
            )

            source_before = radio_voice.source_hash(
                authored, authored["lines"][0]
            )
            authored["roles"]["tower"][
                "transceiver_profile"
            ] = "modern.uhf-am.airborne"
            source_after_radio_change = radio_voice.source_hash(
                authored, authored["lines"][0]
            )
            self.assertEqual(source_before, source_after_radio_change)

            authored["roles"]["tower"][
                "talker_profile"
            ] = "carrier.deck-lso.close-mic"
            source_after_mic_change = radio_voice.source_hash(
                authored, authored["lines"][0]
            )
            self.assertNotEqual(source_before, source_after_mic_change)

    def test_manifest_records_objective_rt_performance_result(self):
        authored = cadence_catalog()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "tower-test.wav").write_bytes(wav_bytes())
            manifest = radio_voice.build_manifest(authored, output)

        performance = manifest["clips"]["tower-test"]["takes"][0][
            "rt_performance"
        ]
        self.assertEqual("pass", performance["status"])
        self.assertEqual("acknowledgement", performance["profile"])

    def test_generate_rejects_take_outside_rt_performance_envelope(self):
        authored = cadence_catalog()
        authored["lines"][0].update({
            "text": "Ghost One One base gear down full stop.",
            "rt_profile": "pattern-report",
            "cadence": [
                {
                    "text": "Ghost One One",
                    "pace": "clear-even",
                    "focus": "identity",
                },
                {
                    "text": "base gear down",
                    "pace": "compressed",
                    "focus": "position and configuration",
                },
                {
                    "text": "full stop",
                    "pace": "measured",
                    "focus": "intention",
                },
            ],
        })
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = output / "manifest.json"
            with mock.patch.object(
                radio_voice,
                "speech_request",
                return_value=wav_bytes(),
            ):
                with self.assertRaisesRegex(
                    ValueError, "does not pass pattern-report R/T performance"
                ):
                    radio_voice.generate(
                        authored, output, manifest, "secret-test-key"
                    )
            self.assertFalse((output / "tower-test.wav").exists())

    def test_failed_regeneration_preserves_previous_take(self):
        authored = cadence_catalog()
        authored["lines"][0].update({
            "text": "Ghost One One base gear down full stop.",
            "rt_profile": "pattern-report",
            "cadence": [
                {
                    "text": "Ghost One One",
                    "pace": "clear-even",
                    "focus": "identity",
                },
                {
                    "text": "base gear down",
                    "pace": "compressed",
                    "focus": "position and configuration",
                },
                {
                    "text": "full stop",
                    "pace": "measured",
                    "focus": "intention",
                },
            ],
        })
        previous = b"previous-production-take"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            manifest = output / "manifest.json"
            wav_path = output / "tower-test.wav"
            wav_path.write_bytes(previous)
            with mock.patch.object(
                radio_voice,
                "speech_request",
                return_value=wav_bytes(),
            ):
                with self.assertRaisesRegex(
                    ValueError, "does not pass pattern-report R/T performance"
                ):
                    radio_voice.generate(
                        authored,
                        output,
                        manifest,
                        "secret-test-key",
                        force=True,
                    )
            self.assertEqual(previous, wav_path.read_bytes())
            self.assertFalse(
                (output / ".tower-test.wav.candidate").exists()
            )

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

    def test_hume_line_source_voice_override_preserves_role_and_provenance(self):
        hume = {
            "version": 1,
            "provider": "hume",
            "model": "1",
            "response_format": "wav",
            "roles": {
                "tower": {
                    "voice_id": "primary-tower-id",
                    "voice_name": "Primary Tower",
                    "speed": 1.15,
                    "instructions": "Calm controller.",
                    "description": "professional, clipped, matter-of-fact",
                }
            },
            "lines": [{
                "id": "tower-safety",
                "role": "tower",
                "text": "Go around.",
                "source_voice_id": "safety-controller-id",
                "source_voice_name": "Safety Controller",
                "source_casting_status": "provisional; rights review pending",
                "source_voice_context": "second tower operator on the same frequency",
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

        radio_voice.speech_request(
            hume, hume["lines"][0], "hume-secret", urlopen=urlopen
        )
        utterance = json.loads(captured["request"].data)["utterances"][0]
        self.assertEqual("safety-controller-id", utterance["voice"]["id"])

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "tower-safety.wav").write_bytes(wav_bytes())
            manifest = radio_voice.build_manifest(hume, output)
        clip = manifest["clips"]["tower-safety"]
        self.assertEqual("tower", clip["role"])
        self.assertEqual("safety-controller-id", clip["voice"])
        self.assertEqual("Safety Controller", clip["voice_name"])
        self.assertEqual(
            "second tower operator on the same frequency",
            clip["source_voice_context"],
        )

        source_before = radio_voice.source_hash(hume, hume["lines"][0])
        hume["lines"][0]["source_voice_id"] = "different-controller-id"
        self.assertNotEqual(
            source_before,
            radio_voice.source_hash(hume, hume["lines"][0]),
        )

    def test_hume_line_source_voice_override_requires_complete_provenance(self):
        hume = {
            "version": 1,
            "provider": "hume",
            "model": "1",
            "response_format": "wav",
            "roles": {
                "tower": {
                    "voice_id": "primary-tower-id",
                    "instructions": "Calm controller.",
                    "description": "professional, clipped, matter-of-fact",
                }
            },
            "lines": [{
                "id": "tower-safety",
                "role": "tower",
                "text": "Go around.",
                "source_voice_id": "safety-controller-id",
            }],
        }
        with self.assertRaisesRegex(ValueError, "requires source_voice_id"):
            radio_voice.validate_catalog(hume)

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
