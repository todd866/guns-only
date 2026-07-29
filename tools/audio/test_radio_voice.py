import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import wave


MODULE_PATH = Path(__file__).with_name("radio_voice.py")
SPEC = importlib.util.spec_from_file_location("radio_voice", MODULE_PATH)
radio_voice = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(radio_voice)


def catalog():
    return {
        "version": 1,
        "model": "gpt-4o-mini-tts",
        "response_format": "wav",
        "roles": {
            "tower": {
                "voice": "cedar",
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
        audio.writeframes(b"\0\0" * 2_400)
    return output.getvalue()


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return wav_bytes()


class RadioVoiceTests(unittest.TestCase):
    def test_catalog_validation_rejects_duplicates(self):
        duplicate = catalog()
        duplicate["lines"].append(dict(duplicate["lines"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            radio_voice.validate_catalog(duplicate)

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


if __name__ == "__main__":
    unittest.main()
