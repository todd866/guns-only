import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import wave


MODULE_PATH = Path(__file__).with_name("korea_narrative_voice.py")
SPEC = importlib.util.spec_from_file_location(
    "korea_narrative_voice", MODULE_PATH
)
korea_voice = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(korea_voice)


def inputs():
    return korea_voice.load_inputs()


def candidates(*entries):
    spec, _catalog = inputs()
    return {
        "schemaVersion": "1.0.0",
        "auditionId": spec["auditionId"],
        "candidates": list(entries),
    }


def candidate(
    candidate_id="eleven-armstrong-a",
    provider="elevenlabs",
    speaker_id="speaker.armstrong.v1",
):
    return {
        "candidateId": candidate_id,
        "provider": provider,
        "speakerId": speaker_id,
        "voiceId": f"{provider}-voice-id",
        "voiceName": f"{provider} review voice",
        "rightsNote": "Commercial rights review pending.",
    }


def wav_bytes(seconds=0.1, sample_rate=48_000):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(b"\0\0" * round(seconds * sample_rate))
    return output.getvalue()


class KoreaNarrativeVoiceTests(unittest.TestCase):
    def test_canonical_spec_and_catalog_validate(self):
        spec, catalog = inputs()
        korea_voice.validate_spec(spec, catalog)
        self.assertEqual(5, len(spec["evaluationLines"]))
        self.assertEqual(3, len(spec["takeProfiles"]))
        self.assertEqual(
            {"elevenlabs", "hume", "cartesia"},
            set(spec["providers"]),
        )

    def test_empty_candidate_template_validates_but_cannot_generate(self):
        spec, catalog = inputs()
        document = candidates()
        korea_voice.validate_candidates(document, spec, catalog)
        with self.assertRaisesRegex(ValueError, "empty"):
            korea_voice.validate_candidates(
                document, spec, catalog, require_nonempty=True
            )

    def test_provider_key_prefers_environment_then_uses_keychain(self):
        spec, _catalog = inputs()
        with mock.patch.dict(
            os.environ,
            {"HUME_API_KEY": "environment-key"},
        ), mock.patch.object(
            korea_voice.subprocess,
            "run",
        ) as run:
            self.assertEqual(
                "environment-key",
                korea_voice.key_for_provider("hume", spec),
            )
            run.assert_not_called()

        completed = korea_voice.subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="keychain-key\n",
        )
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(
            korea_voice.subprocess,
            "run",
            return_value=completed,
        ) as run:
            self.assertEqual(
                "keychain-key",
                korea_voice.key_for_provider("hume", spec),
            )
            self.assertEqual(
                [
                    "security",
                    "find-generic-password",
                    "-a",
                    "HUME_API_KEY",
                    "-s",
                    korea_voice.KEYCHAIN_SERVICE,
                    "-w",
                ],
                run.call_args.args[0],
            )
            self.assertIs(
                korea_voice.subprocess.DEVNULL,
                run.call_args.kwargs["stderr"],
            )

    def test_plan_is_speaker_scoped_and_has_three_take_profiles(self):
        spec, catalog = inputs()
        document = candidates(
            candidate(),
            candidate(
                "hume-carpenter-a",
                "hume",
                "speaker.carpenter.v1",
            ),
        )
        korea_voice.validate_candidates(
            document, spec, catalog, require_nonempty=True
        )
        plan = korea_voice.build_plan(spec, catalog, document)
        self.assertEqual(15, len(plan))
        armstrong = [
            entry for entry in plan
            if entry["speakerId"] == "speaker.armstrong.v1"
        ]
        carpenter = [
            entry for entry in plan
            if entry["speakerId"] == "speaker.carpenter.v1"
        ]
        self.assertEqual(9, len(armstrong))
        self.assertEqual(6, len(carpenter))
        self.assertEqual(
            {"restrained", "compressed", "recovery"},
            {entry["takeId"] for entry in plan},
        )

    def test_plan_can_select_one_line_and_take(self):
        spec, catalog = inputs()
        document = candidates(candidate())
        plan = korea_voice.build_plan(
            spec,
            catalog,
            document,
            line_ids={"line.armstrong.06-damage-report.v1"},
            take_ids={"compressed"},
        )
        self.assertEqual(1, len(plan))
        self.assertEqual(
            "Lead, Two—I hit a cable; right wing's damaged.",
            plan[0]["performanceText"],
        )

    def test_performance_text_may_change_punctuation_but_not_words(self):
        spec, catalog = inputs()
        line = next(
            entry for entry in catalog["lines"]
            if entry["lineId"] == "line.armstrong.06-damage-report.v1"
        )
        line["performanceText"] = "Lead Two—cable strike; losing the wing."
        with self.assertRaisesRegex(
            ValueError, "performanceText must preserve the scripted words"
        ):
            korea_voice.validate_catalog(catalog)

    def test_elevenlabs_request_uses_v3_audio_tag_and_pcm_without_key_in_body(self):
        spec, catalog = inputs()
        line = next(
            entry for entry in catalog["lines"]
            if entry["lineId"] == "line.armstrong.06-damage-report.v1"
        )
        profile = next(
            entry for entry in spec["takeProfiles"]
            if entry["takeId"] == "compressed"
        )
        voice = candidate()
        request = korea_voice.generation_request(
            "elevenlabs", spec, voice, line, profile, "secret-eleven-key"
        )
        payload = json.loads(request.data)
        self.assertEqual("eleven_v3", payload["model_id"])
        self.assertTrue(payload["text"].startswith("[tense] "))
        self.assertEqual(
            "[tense] Lead, Two—I hit a cable; right wing's damaged.",
            payload["text"],
        )
        self.assertIn("output_format=pcm_48000", request.full_url)
        self.assertEqual(
            "secret-eleven-key", request.get_header("Xi-api-key")
        )
        self.assertEqual(
            "guns-only-korea-narrative/1.0",
            request.get_header("User-agent"),
        )
        self.assertNotIn("secret-eleven-key", request.data.decode("utf-8"))

    def test_hume_request_pins_octave_two_and_decodes_base64_wav(self):
        spec, catalog = inputs()
        line = next(
            entry for entry in catalog["lines"]
            if entry["speakerId"] == "speaker.carpenter.v1"
        )
        profile = spec["takeProfiles"][0]
        voice = candidate(
            "hume-carpenter-a", "hume", "speaker.carpenter.v1"
        )
        request = korea_voice.generation_request(
            "hume", spec, voice, line, profile, "secret-hume-key"
        )
        payload = json.loads(request.data)
        self.assertEqual("2", payload["version"])
        self.assertEqual("wav", payload["format"]["type"])
        self.assertEqual("hume-voice-id", payload["utterances"][0]["voice"]["id"])
        encoded = base64.b64encode(wav_bytes()).decode("ascii")
        audio, metadata = korea_voice.decode_generation(
            "hume",
            spec,
            json.dumps({
                "request_id": "request-1",
                "generations": [{
                    "audio": encoded,
                    "generation_id": "generation-1",
                }],
            }).encode("utf-8"),
        )
        self.assertEqual(wav_bytes(), audio)
        self.assertEqual("request-1", metadata["requestId"])
        self.assertEqual("generation-1", metadata["generationId"])

    def test_cartesia_request_pins_api_version_and_48khz_wav(self):
        spec, catalog = inputs()
        line = next(
            entry for entry in catalog["lines"]
            if entry["speakerId"] == "speaker.carpenter.v1"
        )
        voice = candidate(
            "cartesia-carpenter-a",
            "cartesia",
            "speaker.carpenter.v1",
        )
        request = korea_voice.generation_request(
            "cartesia",
            spec,
            voice,
            line,
            spec["takeProfiles"][0],
            "secret-cartesia-key",
        )
        payload = json.loads(request.data)
        self.assertEqual("sonic-3.5", payload["model_id"])
        self.assertEqual(
            {
                "container": "wav",
                "encoding": "pcm_s16le",
                "sample_rate": 48_000,
            },
            payload["output_format"],
        )
        self.assertEqual(
            "2026-03-01", request.get_header("Cartesia-version")
        )
        self.assertNotIn("secret-cartesia-key", request.data.decode("utf-8"))

    def test_voice_lists_are_normalized_without_downloading_previews(self):
        eleven = korea_voice.normalize_voice_list("elevenlabs", {
            "voices": [{
                "voice_id": "voice-1",
                "name": "Candidate",
                "description": "American adult voice",
                "labels": {"accent": "American"},
                "category": "generated",
                "preview_url": "https://example.invalid/preview.mp3",
            }]
        })
        self.assertEqual("voice-1", eleven[0]["voiceId"])
        self.assertEqual(
            "https://example.invalid/preview.mp3",
            eleven[0]["previewUrl"],
        )

        hume = korea_voice.normalize_voice_list("hume", {
            "voices_page": [{
                "id": "voice-2",
                "name": "Operational",
                "provider": "HUME_AI",
            }]
        }, query="oper")
        self.assertEqual("voice-2", hume[0]["voiceId"])

        cartesia = korea_voice.normalize_voice_list("cartesia", {
            "data": [{
                "id": "voice-3",
                "name": "Pilot",
                "gender": "masculine",
                "language": "en",
                "country": "US",
                "is_owner": False,
            }]
        })
        self.assertEqual("US", cartesia[0]["labels"]["country"])

    def test_generation_writes_hashed_manifest_without_api_key(self):
        spec, catalog = inputs()
        document = candidates(candidate())

        def fake_synthesize(
            provider,
            _spec,
            _candidate,
            _line,
            _profile,
            api_key,
        ):
            self.assertEqual("elevenlabs", provider)
            self.assertEqual("secret-eleven-key", api_key)
            return wav_bytes(), {"requestId": "fake-request"}

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with mock.patch.dict(
                os.environ,
                {"ELEVENLABS_API_KEY": "secret-eleven-key"},
            ):
                manifest = korea_voice.generate_assets(
                    spec,
                    catalog,
                    document,
                    output_root=output,
                    run_id="test-run",
                    synthesize_func=fake_synthesize,
                )
            self.assertEqual("audition_only", manifest["status"])
            self.assertEqual(9, len(manifest["assets"]))
            manifest_path = output / "test-run/audition-manifest.json"
            serialized = manifest_path.read_text(encoding="utf-8")
            self.assertNotIn("secret-eleven-key", serialized)
            for asset in manifest["assets"]:
                path = manifest_path.parent / asset["path"]
                self.assertTrue(path.is_file())
                self.assertEqual(
                    48_000,
                    korea_voice.inspect_wav_bytes(path.read_bytes())[
                        "sampleRateHz"
                    ],
                )

    def test_blind_pack_omits_provider_and_candidate_from_review_sheet(self):
        manifest = {
            "schemaVersion": "1.0.0",
            "status": "audition_only",
            "blindReviewCriteria": ["Natural timing"],
            "assets": [{
                "path": "elevenlabs/a/line.wav",
                "provider": "elevenlabs",
                "model": "eleven_v3",
                "candidateId": "secret-candidate",
                "voiceId": "secret-voice-id",
                "speakerId": "speaker.armstrong.v1",
                "lineId": "line.armstrong.test.v1",
                "text": "Test.",
                "takeId": "restrained",
                "fileSha256": korea_voice.sha256_bytes(wav_bytes()),
            }],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "run"
            audio = source / manifest["assets"][0]["path"]
            audio.parent.mkdir(parents=True)
            audio.write_bytes(wav_bytes())
            manifest_path = source / "audition-manifest.json"
            manifest_path.write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            review, private_map = korea_voice.build_blind_pack(
                [manifest_path], root / "blind"
            )
            serialized_review = json.dumps(review)
            self.assertNotIn("elevenlabs", serialized_review)
            self.assertNotIn("secret-candidate", serialized_review)
            self.assertNotIn("secret-voice-id", serialized_review)
            self.assertEqual(
                "secret-candidate",
                private_map["items"][0]["candidateId"],
            )


if __name__ == "__main__":
    unittest.main()
