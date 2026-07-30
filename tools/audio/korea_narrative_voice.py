#!/usr/bin/env python3
"""Build silent, provider-neutral voice auditions for the Korea narrative mission."""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import wave


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SPEC = ROOT / "audio/narrative/korea-1950s/audition.json"
DEFAULT_CATALOG = (
    ROOT / "docs/art-direction/korea-1950s/narrative/radio-lines.json"
)
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
PROVIDERS = frozenset({"elevenlabs", "hume", "cartesia"})
KEYCHAIN_SERVICE = "guns-only-voice-providers"
LEXICAL_WORD = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.IGNORECASE)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_hash(value: object) -> str:
    return sha256_bytes(canonical_json(value))


def unique_ids(items: list[dict], key: str, label: str) -> None:
    values = [entry.get(key) for entry in items]
    if any(not isinstance(value, str) or not value for value in values):
        raise ValueError(f"every {label} requires a non-empty {key}")
    if len(values) != len(set(values)):
        raise ValueError(f"duplicate {key} in {label}")


def validate_catalog(catalog: dict) -> None:
    if not str(catalog.get("catalogId", "")).strip():
        raise ValueError("radio catalog requires catalogId")
    speakers = catalog.get("speakers")
    lines = catalog.get("lines")
    if not isinstance(speakers, list) or not speakers:
        raise ValueError("radio catalog requires speakers")
    if not isinstance(lines, list) or not lines:
        raise ValueError("radio catalog requires lines")
    unique_ids(speakers, "speakerId", "speakers")
    unique_ids(lines, "lineId", "lines")
    speaker_ids = {entry["speakerId"] for entry in speakers}
    for line in lines:
        if line.get("speakerId") not in speaker_ids:
            raise ValueError(
                f"line {line.get('lineId')!r} references an unknown speaker"
            )
        if not str(line.get("text", "")).strip():
            raise ValueError(f"line {line.get('lineId')!r} has no text")
        performance_text = str(line.get("performanceText", "")).strip()
        if "performanceText" in line and not performance_text:
            raise ValueError(
                f"line {line.get('lineId')!r} has an empty performanceText"
            )
        if performance_text and lexical_words(performance_text) != lexical_words(
            line["text"]
        ):
            raise ValueError(
                f"line {line.get('lineId')!r} performanceText must preserve "
                "the scripted words"
            )


def lexical_words(value: str) -> list[str]:
    return [match.group(0).casefold() for match in LEXICAL_WORD.finditer(value)]


def performance_text(line: dict) -> str:
    return str(line.get("performanceText") or line["text"])


def validate_spec(spec: dict, catalog: dict) -> None:
    if spec.get("catalogId") != catalog.get("catalogId"):
        raise ValueError("audition and radio catalog IDs do not match")
    if spec.get("sequenceId") != catalog.get("sequenceId"):
        raise ValueError("audition and radio sequence IDs do not match")

    providers = spec.get("providers")
    if not isinstance(providers, dict) or set(providers) != PROVIDERS:
        raise ValueError(
            "audition providers must be exactly elevenlabs, hume and cartesia"
        )
    for provider, details in providers.items():
        if not str(details.get("model", "")).strip():
            raise ValueError(f"{provider} requires a model")
        if not str(details.get("apiKeyEnvironment", "")).strip():
            raise ValueError(f"{provider} requires apiKeyEnvironment")
        if not str(details.get("endpoint", "")).startswith("https://"):
            raise ValueError(f"{provider} requires an HTTPS endpoint")
        if details.get("sampleRateHz") != 48_000:
            raise ValueError(f"{provider} audition output must be 48 kHz")

    profiles = spec.get("takeProfiles")
    if not isinstance(profiles, list) or not profiles:
        raise ValueError("audition requires takeProfiles")
    unique_ids(profiles, "takeId", "takeProfiles")
    for profile in profiles:
        if not str(profile.get("direction", "")).strip():
            raise ValueError(f"take {profile.get('takeId')!r} has no direction")
        controls = profile.get("providerControls")
        if not isinstance(controls, dict) or set(controls) != PROVIDERS:
            raise ValueError(
                f"take {profile.get('takeId')!r} needs all provider controls"
            )

    line_ids = {entry["lineId"] for entry in catalog["lines"]}
    evaluation = spec.get("evaluationLines")
    if not isinstance(evaluation, list) or not evaluation:
        raise ValueError("audition requires evaluationLines")
    if len(evaluation) != len(set(evaluation)):
        raise ValueError("audition evaluationLines contain duplicates")
    unknown = sorted(set(evaluation) - line_ids)
    if unknown:
        raise ValueError(f"audition references unknown lines: {', '.join(unknown)}")
    catalog_evaluation = catalog.get("generation", {}).get("evaluationSet", [])
    if evaluation != catalog_evaluation:
        raise ValueError(
            "audition evaluationLines must exactly match the radio evaluationSet"
        )


def validate_candidates(
    candidates_document: dict,
    spec: dict,
    catalog: dict,
    *,
    require_nonempty: bool = False,
) -> None:
    if candidates_document.get("auditionId") != spec.get("auditionId"):
        raise ValueError("candidate file auditionId does not match")
    candidates = candidates_document.get("candidates")
    if not isinstance(candidates, list):
        raise ValueError("candidate file requires a candidates array")
    if require_nonempty and not candidates:
        raise ValueError(
            "candidate file is empty; list provider voices and add candidates"
        )
    unique_ids(candidates, "candidateId", "candidates")
    speaker_ids = {entry["speakerId"] for entry in catalog["speakers"]}
    for candidate in candidates:
        candidate_id = candidate["candidateId"]
        if not SAFE_ID.fullmatch(candidate_id):
            raise ValueError(f"unsafe candidateId {candidate_id!r}")
        if candidate.get("provider") not in PROVIDERS:
            raise ValueError(f"candidate {candidate_id!r} has unknown provider")
        if candidate.get("speakerId") not in speaker_ids:
            raise ValueError(f"candidate {candidate_id!r} has unknown speaker")
        if not str(candidate.get("voiceId", "")).strip():
            raise ValueError(f"candidate {candidate_id!r} has no voiceId")
        if not str(candidate.get("voiceName", "")).strip():
            raise ValueError(f"candidate {candidate_id!r} has no voiceName")
        if not str(candidate.get("rightsNote", "")).strip():
            raise ValueError(f"candidate {candidate_id!r} has no rightsNote")


def load_inputs(
    spec_path: Path = DEFAULT_SPEC,
    catalog_path: Path = DEFAULT_CATALOG,
) -> tuple[dict, dict]:
    spec = load_json(spec_path)
    catalog = load_json(catalog_path)
    validate_catalog(catalog)
    validate_spec(spec, catalog)
    return spec, catalog


def key_for_provider(provider: str, spec: dict) -> str:
    environment = spec["providers"][provider]["apiKeyEnvironment"]
    key = os.environ.get(environment, "").strip()
    if key:
        return key
    try:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                environment,
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        result = None
    if result is not None:
        key = result.stdout.strip()
    if key:
        return key
    raise RuntimeError(
        f"{environment} is not set and no matching macOS Keychain item exists; "
        "no provider request was made"
    )


def json_request(
    url: str,
    payload: dict | None,
    headers: dict[str, str],
    *,
    method: str = "POST",
) -> urllib.request.Request:
    body = None if payload is None else canonical_json(payload)
    request_headers = {
        "User-Agent": "guns-only-korea-narrative/1.0",
        **headers,
    }
    return urllib.request.Request(
        url,
        data=body,
        method=method,
        headers=request_headers,
    )


def voice_list_request(
    provider: str,
    spec: dict,
    api_key: str,
    query: str = "",
) -> urllib.request.Request:
    if provider == "elevenlabs":
        parameters = {
            "page_size": "100",
            "include_total_count": "true",
        }
        if query:
            parameters["search"] = query
        url = "https://api.elevenlabs.io/v2/voices?" + urllib.parse.urlencode(
            parameters
        )
        return json_request(
            url,
            None,
            {"xi-api-key": api_key, "Accept": "application/json"},
            method="GET",
        )
    if provider == "hume":
        parameters = {
            "provider": "HUME_AI",
            "page_size": "100",
            "page_number": "0",
        }
        url = "https://api.hume.ai/v0/tts/voices?" + urllib.parse.urlencode(
            parameters
        )
        return json_request(
            url,
            None,
            {"X-Hume-Api-Key": api_key, "Accept": "application/json"},
            method="GET",
        )
    if provider == "cartesia":
        parameters = {"limit": "100", "expand[]": "preview_file_url"}
        if query:
            parameters["q"] = query
        url = "https://api.cartesia.ai/voices?" + urllib.parse.urlencode(
            parameters
        )
        return json_request(
            url,
            None,
            {
                "Authorization": f"Bearer {api_key}",
                "Cartesia-Version": spec["providers"][provider]["apiVersion"],
                "Accept": "application/json",
            },
            method="GET",
        )
    raise ValueError(f"unknown provider {provider!r}")


def normalize_voice_list(provider: str, payload: dict, query: str = "") -> list[dict]:
    if provider == "elevenlabs":
        records = payload.get("voices", [])
        normalized = [{
            "voiceId": entry.get("voice_id"),
            "name": entry.get("name"),
            "description": entry.get("description"),
            "labels": entry.get("labels") or {},
            "category": entry.get("category"),
            "previewUrl": entry.get("preview_url"),
        } for entry in records]
    elif provider == "hume":
        records = payload.get("voices_page", [])
        normalized = [{
            "voiceId": entry.get("id"),
            "name": entry.get("name"),
            "description": entry.get("description"),
            "labels": entry.get("tags") or {},
            "category": entry.get("provider"),
            "previewUrl": entry.get("preview_url"),
        } for entry in records]
    elif provider == "cartesia":
        records = payload.get("data", [])
        normalized = [{
            "voiceId": entry.get("id"),
            "name": entry.get("name"),
            "description": entry.get("description"),
            "labels": {
                "gender": entry.get("gender"),
                "language": entry.get("language"),
                "country": entry.get("country"),
            },
            "category": "owned" if entry.get("is_owner") else "public",
            "previewUrl": entry.get("preview_file_url"),
        } for entry in records]
    else:
        raise ValueError(f"unknown provider {provider!r}")

    if query and provider == "hume":
        needle = query.casefold()
        normalized = [
            entry for entry in normalized
            if needle in " ".join([
                str(entry.get("name") or ""),
                str(entry.get("description") or ""),
                json.dumps(entry.get("labels") or {}),
            ]).casefold()
        ]
    return [
        entry for entry in normalized
        if isinstance(entry.get("voiceId"), str) and entry["voiceId"]
    ]


def generation_request(
    provider: str,
    spec: dict,
    candidate: dict,
    line: dict,
    profile: dict,
    api_key: str,
) -> urllib.request.Request:
    provider_spec = spec["providers"][provider]
    controls = profile["providerControls"][provider]
    rendered_text = performance_text(line)
    if provider == "elevenlabs":
        text = rendered_text
        audio_tag = str(controls.get("audioTag", "")).strip()
        if audio_tag:
            text = f"{audio_tag} {text}"
        voice_id = urllib.parse.quote(candidate["voiceId"], safe="")
        url = (
            f"{provider_spec['endpoint']}/{voice_id}?"
            + urllib.parse.urlencode({
                "output_format": provider_spec["outputFormat"],
            })
        )
        return json_request(
            url,
            {
                "text": text,
                "model_id": provider_spec["model"],
            },
            {
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/octet-stream",
            },
        )
    if provider == "hume":
        return json_request(
            provider_spec["endpoint"],
            {
                "version": provider_spec["model"],
                "utterances": [{
                    "text": rendered_text,
                    "voice": {"id": candidate["voiceId"]},
                    "speed": controls.get("speed", 1.0),
                    "trailing_silence": 0.1,
                }],
                "format": {"type": "wav"},
                "num_generations": 1,
                "include_timestamp_types": ["word"],
            },
            {
                "X-Hume-Api-Key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
    if provider == "cartesia":
        return json_request(
            provider_spec["endpoint"],
            {
                "model_id": provider_spec["model"],
                "transcript": rendered_text,
                "voice": {"id": candidate["voiceId"]},
                "language": "en",
                "output_format": {
                    "container": "wav",
                    "encoding": "pcm_s16le",
                    "sample_rate": provider_spec["sampleRateHz"],
                },
            },
            {
                "Authorization": f"Bearer {api_key}",
                "Cartesia-Version": provider_spec["apiVersion"],
                "Content-Type": "application/json",
                "Accept": "audio/wav",
            },
        )
    raise ValueError(f"unknown provider {provider!r}")


def pcm_s16le_to_wav(pcm: bytes, sample_rate_hz: int) -> bytes:
    if len(pcm) % 2:
        raise ValueError("16-bit PCM response has an odd byte count")
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate_hz)
        audio.writeframes(pcm)
    return output.getvalue()


def decode_generation(
    provider: str,
    spec: dict,
    response_bytes: bytes,
) -> tuple[bytes, dict]:
    if provider == "elevenlabs":
        return (
            pcm_s16le_to_wav(
                response_bytes,
                spec["providers"][provider]["sampleRateHz"],
            ),
            {},
        )
    if provider == "hume":
        payload = json.loads(response_bytes)
        generations = payload.get("generations", [])
        if not generations or not generations[0].get("audio"):
            raise ValueError("Hume response contains no generation audio")
        generation = generations[0]
        return (
            base64.b64decode(generation["audio"], validate=True),
            {
                "requestId": payload.get("request_id"),
                "generationId": generation.get("generation_id"),
            },
        )
    if provider == "cartesia":
        return response_bytes, {}
    raise ValueError(f"unknown provider {provider!r}")


def response_bytes(
    request: urllib.request.Request,
    *,
    urlopen=urllib.request.urlopen,
) -> bytes:
    try:
        with urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(
            f"speech provider returned HTTP {error.code}: {detail}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"speech provider request failed: {error.reason}") from error


def synthesize(
    provider: str,
    spec: dict,
    candidate: dict,
    line: dict,
    profile: dict,
    api_key: str,
    *,
    urlopen=urllib.request.urlopen,
) -> tuple[bytes, dict]:
    request = generation_request(
        provider, spec, candidate, line, profile, api_key
    )
    raw = response_bytes(request, urlopen=urlopen)
    return decode_generation(provider, spec, raw)


def inspect_wav_bytes(data: bytes) -> dict:
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            frames = audio.getnframes()
            rate = audio.getframerate()
            channels = audio.getnchannels()
            width = audio.getsampwidth()
    except (EOFError, wave.Error) as error:
        raise ValueError(f"invalid PCM WAV: {error}") from error
    if frames <= 0 or rate <= 0 or channels <= 0 or width <= 0:
        raise ValueError("invalid empty PCM WAV")
    return {
        "durationSeconds": round(frames / rate, 3),
        "sampleRateHz": rate,
        "channels": channels,
        "sampleWidthBytes": width,
    }


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)
        temporary.write(data)
        temporary.flush()
        os.fsync(temporary.fileno())
    try:
        temporary_path.replace(path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def write_json_atomic(path: Path, value: object) -> None:
    write_atomic(
        path,
        json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8") + b"\n",
    )


def selected_candidates(
    candidates_document: dict,
    providers: set[str] | None = None,
    candidate_ids: set[str] | None = None,
) -> list[dict]:
    candidates = candidates_document["candidates"]
    if providers:
        candidates = [
            entry for entry in candidates if entry["provider"] in providers
        ]
    if candidate_ids:
        candidates = [
            entry for entry in candidates
            if entry["candidateId"] in candidate_ids
        ]
    if not candidates:
        raise ValueError("candidate filters select no voices")
    return candidates


def build_plan(
    spec: dict,
    catalog: dict,
    candidates_document: dict,
    *,
    providers: set[str] | None = None,
    candidate_ids: set[str] | None = None,
    line_ids: set[str] | None = None,
    take_ids: set[str] | None = None,
) -> list[dict]:
    candidates = selected_candidates(
        candidates_document, providers, candidate_ids
    )
    lines_by_id = {entry["lineId"]: entry for entry in catalog["lines"]}
    evaluation_lines = spec["evaluationLines"]
    if line_ids:
        unknown_lines = sorted(line_ids - set(evaluation_lines))
        if unknown_lines:
            raise ValueError(
                "line filters are not in the evaluation set: "
                + ", ".join(unknown_lines)
            )
        evaluation_lines = [
            line_id for line_id in evaluation_lines if line_id in line_ids
        ]
    profiles = spec["takeProfiles"]
    if take_ids:
        available_takes = {entry["takeId"] for entry in profiles}
        unknown_takes = sorted(take_ids - available_takes)
        if unknown_takes:
            raise ValueError(
                "unknown take filters: " + ", ".join(unknown_takes)
            )
        profiles = [
            profile for profile in profiles
            if profile["takeId"] in take_ids
        ]
    plan = []
    for candidate in candidates:
        for line_id in evaluation_lines:
            line = lines_by_id[line_id]
            if line["speakerId"] != candidate["speakerId"]:
                continue
            for profile in profiles:
                plan.append({
                    "provider": candidate["provider"],
                    "model": spec["providers"][candidate["provider"]]["model"],
                    "candidateId": candidate["candidateId"],
                    "speakerId": candidate["speakerId"],
                    "lineId": line_id,
                    "text": line["text"],
                    "performanceText": performance_text(line),
                    "takeId": profile["takeId"],
                    "direction": profile["direction"],
                })
    if not plan:
        raise ValueError("selected candidates have no evaluation lines")
    return plan


def request_source(
    spec: dict,
    candidate: dict,
    line: dict,
    profile: dict,
) -> dict:
    provider = candidate["provider"]
    return {
        "provider": provider,
        "model": spec["providers"][provider]["model"],
        "voiceId": candidate["voiceId"],
        "lineId": line["lineId"],
        "text": line["text"],
        "performanceText": performance_text(line),
        "speakerDirection": candidate.get("speakerDirection"),
        "takeId": profile["takeId"],
        "takeDirection": profile["direction"],
        "providerControls": profile["providerControls"][provider],
        "outputFormat": spec["providers"][provider]["outputFormat"],
    }


def default_output(spec: dict) -> Path:
    return (ROOT / spec["defaultOutput"]).resolve()


def generate_assets(
    spec: dict,
    catalog: dict,
    candidates_document: dict,
    *,
    output_root: Path,
    run_id: str,
    providers: set[str] | None = None,
    candidate_ids: set[str] | None = None,
    line_ids: set[str] | None = None,
    take_ids: set[str] | None = None,
    force: bool = False,
    synthesize_func=synthesize,
) -> dict:
    if not SAFE_ID.fullmatch(run_id):
        raise ValueError("run-id may contain only lowercase letters, digits, ._-")
    candidates = selected_candidates(
        candidates_document, providers, candidate_ids
    )
    lines_by_id = {entry["lineId"]: entry for entry in catalog["lines"]}
    profiles_by_id = {
        entry["takeId"]: entry for entry in spec["takeProfiles"]
    }
    run_root = output_root / run_id
    manifest_path = run_root / "audition-manifest.json"
    assets = []
    plan = build_plan(
        spec,
        catalog,
        candidates_document,
        providers=providers,
        candidate_ids=candidate_ids,
        line_ids=line_ids,
        take_ids=take_ids,
    )

    manifest = {
        "schemaVersion": "1.0.0",
        "auditionId": spec["auditionId"],
        "runId": run_id,
        "status": "generating",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCatalog": spec["sourceCatalog"],
        "sourceCatalogSha256": sha256_bytes(canonical_json(catalog)),
        "auditionSpecSha256": sha256_bytes(canonical_json(spec)),
        "purpose": spec["policy"]["purpose"],
        "blindReviewCriteria": spec["blindReviewCriteria"],
        "assets": assets,
    }

    try:
        for item in plan:
            candidate = next(
                entry for entry in candidates
                if entry["candidateId"] == item["candidateId"]
            )
            line = lines_by_id[item["lineId"]]
            profile = profiles_by_id[item["takeId"]]
            relative = Path(
                item["provider"],
                item["candidateId"],
                f"{item['lineId']}--{item['takeId']}.wav",
            )
            output_path = run_root / relative
            source = request_source(spec, candidate, line, profile)
            if output_path.exists() and not force:
                wav = output_path.read_bytes()
                provider_metadata = {}
            else:
                api_key = key_for_provider(item["provider"], spec)
                wav, provider_metadata = synthesize_func(
                    item["provider"],
                    spec,
                    candidate,
                    line,
                    profile,
                    api_key,
                )
                inspect_wav_bytes(wav)
                write_atomic(output_path, wav)
            details = inspect_wav_bytes(wav)
            assets.append({
                "path": relative.as_posix(),
                "provider": item["provider"],
                "model": item["model"],
                "candidateId": item["candidateId"],
                "voiceId": candidate["voiceId"],
                "voiceName": candidate["voiceName"],
                "rightsNote": candidate["rightsNote"],
                "speakerId": item["speakerId"],
                "lineId": item["lineId"],
                "text": item["text"],
                "performanceText": item["performanceText"],
                "takeId": item["takeId"],
                "takeDirection": item["direction"],
                "requestSha256": stable_hash(source),
                "textSha256": sha256_bytes(item["text"].encode("utf-8")),
                "performanceTextSha256": sha256_bytes(
                    item["performanceText"].encode("utf-8")
                ),
                "fileSha256": sha256_bytes(wav),
                **details,
                **provider_metadata,
            })
            manifest["assets"] = assets
            write_json_atomic(manifest_path, manifest)
    except Exception as error:
        manifest["status"] = "incomplete"
        manifest["error"] = {
            "type": type(error).__name__,
            "message": str(error),
        }
        write_json_atomic(manifest_path, manifest)
        raise

    manifest["status"] = "audition_only"
    manifest.pop("error", None)
    write_json_atomic(manifest_path, manifest)
    return manifest


def build_blind_pack(
    manifest_paths: list[Path],
    output: Path,
    *,
    force: bool = False,
) -> tuple[dict, dict]:
    entries = []
    criteria = None
    for manifest_path in manifest_paths:
        manifest = load_json(manifest_path)
        if manifest.get("status") != "audition_only":
            raise ValueError(f"{manifest_path} is not a complete audition run")
        if criteria is None:
            criteria = manifest.get("blindReviewCriteria", [])
        for asset in manifest.get("assets", []):
            source = manifest_path.parent / asset["path"]
            if not source.is_file():
                raise ValueError(f"missing audition asset {source}")
            entries.append((manifest_path, source, asset))
    if not entries:
        raise ValueError("blind pack has no assets")

    entries.sort(key=lambda item: stable_hash({
        "manifest": str(item[0].resolve()),
        "fileSha256": item[2]["fileSha256"],
        "candidateId": item[2]["candidateId"],
    }))
    clips_dir = output / "clips"
    review_items = []
    private_items = []
    for index, (manifest_path, source, asset) in enumerate(entries, start=1):
        blind_id = f"clip-{index:03d}"
        target = clips_dir / f"{blind_id}.wav"
        if target.exists() and not force:
            raise FileExistsError(f"blind asset already exists: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        review_items.append({
            "blindId": blind_id,
            "path": f"clips/{blind_id}.wav",
            "speakerId": asset["speakerId"],
            "lineId": asset["lineId"],
            "text": asset["text"],
            "takeId": asset["takeId"],
            "scores": {
                criterion: None for criterion in criteria or []
            },
            "notes": "",
        })
        private_items.append({
            "blindId": blind_id,
            "sourceManifest": str(manifest_path.resolve()),
            "sourcePath": asset["path"],
            "provider": asset["provider"],
            "model": asset["model"],
            "candidateId": asset["candidateId"],
            "voiceId": asset["voiceId"],
            "fileSha256": asset["fileSha256"],
        })

    review = {
        "schemaVersion": "1.0.0",
        "status": "blind_review",
        "criteria": criteria or [],
        "items": review_items,
    }
    private_map = {
        "schemaVersion": "1.0.0",
        "status": "private_mapping_do_not_give_to_reviewers",
        "items": private_items,
    }
    write_json_atomic(output / "review-sheet.json", review)
    write_json_atomic(output / "blind-map.private.json", private_map)
    return review, private_map


def provider_voices(
    provider: str,
    spec: dict,
    query: str = "",
    *,
    urlopen=urllib.request.urlopen,
) -> list[dict]:
    api_key = key_for_provider(provider, spec)
    request = voice_list_request(provider, spec, api_key, query)
    payload = json.loads(response_bytes(request, urlopen=urlopen))
    return normalize_voice_list(provider, payload, query)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--spec", type=Path, default=DEFAULT_SPEC)
    result.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    commands = result.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate")
    validate.add_argument("--candidates", type=Path)

    voices = commands.add_parser("voices")
    voices.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    voices.add_argument("--query", default="")
    voices.add_argument("--output", type=Path)

    plan = commands.add_parser("plan")
    plan.add_argument("--candidates", type=Path, required=True)
    plan.add_argument("--provider", action="append", choices=sorted(PROVIDERS))
    plan.add_argument("--candidate", action="append", default=[])
    plan.add_argument("--line", action="append", default=[])
    plan.add_argument("--take", action="append", default=[])

    generate = commands.add_parser("generate")
    generate.add_argument("--candidates", type=Path, required=True)
    generate.add_argument("--provider", action="append", choices=sorted(PROVIDERS))
    generate.add_argument("--candidate", action="append", default=[])
    generate.add_argument("--line", action="append", default=[])
    generate.add_argument("--take", action="append", default=[])
    generate.add_argument("--output", type=Path)
    generate.add_argument("--run-id")
    generate.add_argument("--force", action="store_true")
    generate.add_argument("--dry-run", action="store_true")

    blind = commands.add_parser("blind")
    blind.add_argument("manifests", type=Path, nargs="+")
    blind.add_argument("--output", type=Path, required=True)
    blind.add_argument("--force", action="store_true")
    return result


def main() -> int:
    arguments = parser().parse_args()
    spec, catalog = load_inputs(arguments.spec, arguments.catalog)

    if arguments.command == "validate":
        candidate_count = 0
        if arguments.candidates:
            candidates_document = load_json(arguments.candidates)
            validate_candidates(candidates_document, spec, catalog)
            candidate_count = len(candidates_document["candidates"])
        print(
            "korea-voice-audition: ok"
            f" — {len(spec['evaluationLines'])} evaluation lines"
            f" · {len(spec['takeProfiles'])} take profiles"
            f" · {len(spec['providers'])} providers"
            f" · {candidate_count} candidates"
        )
        return 0

    if arguments.command == "voices":
        voices = provider_voices(
            arguments.provider, spec, arguments.query
        )
        value = {
            "provider": arguments.provider,
            "query": arguments.query,
            "voices": voices,
        }
        if arguments.output:
            write_json_atomic(arguments.output, value)
            print(
                f"korea-voice-audition: wrote {len(voices)} voices"
                f" to {arguments.output}"
            )
        else:
            print(json.dumps(value, indent=2, ensure_ascii=False))
        return 0

    if arguments.command in {"plan", "generate"}:
        candidates_document = load_json(arguments.candidates)
        validate_candidates(
            candidates_document,
            spec,
            catalog,
            require_nonempty=True,
        )
        providers = set(arguments.provider or [])
        candidate_ids = set(arguments.candidate or [])
        line_ids = set(arguments.line or [])
        take_ids = set(arguments.take or [])
        plan = build_plan(
            spec,
            catalog,
            candidates_document,
            providers=providers or None,
            candidate_ids=candidate_ids or None,
            line_ids=line_ids or None,
            take_ids=take_ids or None,
        )
        if arguments.command == "plan" or arguments.dry_run:
            print(json.dumps({
                "auditionId": spec["auditionId"],
                "requestCount": len(plan),
                "requests": plan,
            }, indent=2, ensure_ascii=False))
            return 0

        run_id = arguments.run_id or datetime.now(timezone.utc).strftime(
            "%Y%m%d-%H%M%S"
        )
        output = (arguments.output or default_output(spec)).resolve()
        manifest = generate_assets(
            spec,
            catalog,
            candidates_document,
            output_root=output,
            run_id=run_id,
            providers=providers or None,
            candidate_ids=candidate_ids or None,
            line_ids=line_ids or None,
            take_ids=take_ids or None,
            force=arguments.force,
        )
        print(
            f"korea-voice-audition: generated {len(manifest['assets'])} dry takes"
            f" at {output / run_id}"
        )
        return 0

    if arguments.command == "blind":
        review, _private_map = build_blind_pack(
            arguments.manifests,
            arguments.output.resolve(),
            force=arguments.force,
        )
        print(
            f"korea-voice-audition: built {len(review['items'])}-clip blind pack"
            f" at {arguments.output.resolve()}"
        )
        return 0

    raise AssertionError(f"unhandled command {arguments.command}")


if __name__ == "__main__":
    raise SystemExit(main())
