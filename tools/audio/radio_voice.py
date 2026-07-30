#!/usr/bin/env python3
"""Validate and build Guns Only mission-radio WAV assets with authored TTS providers."""

from __future__ import annotations

import argparse
from array import array
import base64
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import wave

DEFAULT_API_URLS = {
    "openai": "https://api.openai.com/v1/audio/speech",
    "elevenlabs": "https://api.elevenlabs.io/v1/text-to-speech",
    "hume": "https://api.hume.ai/v0/tts",
    "cartesia": "https://api.cartesia.ai/tts/bytes",
}
API_KEY_ENVIRONMENTS = {
    "openai": "OPENAI_API_KEY",
    "elevenlabs": "ELEVENLABS_API_KEY",
    "hume": "HUME_API_KEY",
    "cartesia": "CARTESIA_API_KEY",
}
KEYCHAIN_SERVICE = "guns-only-voice-providers"
USER_AGENT = "guns-only-radio-voice/2.0"
VALID_FORMATS = {"mp3", "opus", "aac", "flac", "wav", "pcm"}
VALID_VOICES = {
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx",
    "sage", "shimmer", "verse", "marin", "cedar",
}
VALID_TALKER_PROFILES = {
    "rapier.pressure-vessel.emergency-mask",
    "modern.fast-jet.oxygen-mask",
    "korea.f9f.a13a-mask",
    "ground.controller.close-mic",
    "carrier.deck-lso.close-mic",
}
VALID_TRANSCEIVER_PROFILES = {
    "modern.uhf-am.airborne",
    "modern.uhf-am.ground",
    "modern.uhf-am.deck",
    "korea.arc-1.vhf-airborne",
    "korea.arc-1.vhf-ship",
}
VALID_CADENCE_PACES = {
    "clear-even",
    "compressed",
    "measured",
    "connected",
}
SPOKEN_WORD = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.IGNORECASE)
_RT_PERFORMANCE = None
_RT_PROFILES = None


def normalized_spoken_words(text: str) -> list[str]:
    return [word.lower() for word in SPOKEN_WORD.findall(text)]


def rt_performance_module():
    """Load the sibling audit tool without assuming tools/audio is on sys.path."""
    global _RT_PERFORMANCE
    if _RT_PERFORMANCE is not None:
        return _RT_PERFORMANCE
    module_path = Path(__file__).with_name("rt_performance.py")
    specification = importlib.util.spec_from_file_location(
        "guns_only_rt_performance", module_path
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load R/T performance audit module: {module_path}")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    _RT_PERFORMANCE = module
    return module


def rt_profiles():
    global _RT_PROFILES
    if _RT_PROFILES is None:
        _RT_PROFILES = rt_performance_module().load_profiles()
    return _RT_PROFILES


def analyze_rt_take(path: Path, line: dict) -> dict | None:
    profile = line.get("rt_profile")
    if profile is None:
        return None
    return rt_performance_module().analyze_wav(
        path,
        str(line["text"]),
        str(profile),
        rt_profiles(),
    )


def compact_rt_result(result: dict | None) -> dict | None:
    if result is None:
        return None
    keys = (
        "status",
        "profile",
        "wordCount",
        "durationSeconds",
        "wholePacketWordsPerMinute",
        "articulationWordsPerMinute",
        "internalSilenceRatio",
        "longestInternalPauseSeconds",
        "errorCount",
        "warningCount",
        "issues",
    )
    return {key: result[key] for key in keys if key in result}


def load_catalog(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    validate_catalog(catalog)
    return catalog


def validate_catalog(catalog: dict) -> None:
    if not isinstance(catalog.get("version"), int) or catalog["version"] < 1:
        raise ValueError("catalog version must be a positive integer")
    if not str(catalog.get("model", "")).strip():
        raise ValueError("catalog model is required")
    provider = str(catalog.get("provider", "openai")).strip().lower()
    if provider not in DEFAULT_API_URLS:
        raise ValueError(f"unsupported speech provider: {provider!r}")
    response_format = catalog.get("response_format")
    if response_format not in VALID_FORMATS:
        raise ValueError(f"unsupported response_format: {response_format!r}")
    if response_format != "wav":
        raise ValueError("mission-radio runtime currently requires response_format 'wav'")
    roles = catalog.get("roles")
    lines = catalog.get("lines")
    if not isinstance(roles, dict) or not roles:
        raise ValueError("catalog roles must be a non-empty object")
    if not isinstance(lines, list) or not lines:
        raise ValueError("catalog lines must be a non-empty array")
    for role, spec in roles.items():
        if not role or not isinstance(spec, dict):
            raise ValueError("every role needs an object definition")
        if provider == "openai":
            voice = spec.get("voice")
            built_in = isinstance(voice, str) and voice in VALID_VOICES
            custom = isinstance(voice, dict) and bool(str(voice.get("id", "")).strip())
            if not built_in and not custom:
                raise ValueError(f"role {role!r} has unsupported voice {voice!r}")
            speed = spec.get("speed", 1.0)
            if not isinstance(speed, (int, float)) or not 0.25 <= speed <= 4.0:
                raise ValueError(f"role {role!r} speed must be from 0.25 to 4.0")
        elif not str(spec.get("voice_id", "")).strip():
            raise ValueError(f"role {role!r} needs a {provider} voice_id")
        if provider == "hume":
            speed = spec.get("speed", 1.0)
            if not isinstance(speed, (int, float)) or not 0.5 <= speed <= 2.0:
                raise ValueError(f"role {role!r} speed must be from 0.5 to 2.0")
            if str(catalog["model"]) == "1":
                description = str(spec.get("description", "")).strip()
                if not description:
                    raise ValueError(
                        f"role {role!r} needs a concise Hume Octave 1 description"
                    )
                if len(description) > 100:
                    raise ValueError(
                        f"role {role!r} Hume description exceeds 100 characters"
                    )
        if not str(spec.get("instructions", "")).strip():
            raise ValueError(f"role {role!r} has no instructions")
        if catalog["version"] >= 6:
            talker_profile = str(spec.get("talker_profile", "")).strip()
            if talker_profile not in VALID_TALKER_PROFILES:
                raise ValueError(
                    f"role {role!r} has unsupported talker_profile {talker_profile!r}"
                )
            transceiver_profile = str(spec.get("transceiver_profile", "")).strip()
            if transceiver_profile not in VALID_TRANSCEIVER_PROFILES:
                raise ValueError(
                    f"role {role!r} has unsupported transceiver_profile "
                    f"{transceiver_profile!r}"
                )
        if "voice_settings" in spec and not isinstance(spec["voice_settings"], dict):
            raise ValueError(f"role {role!r} voice_settings must be an object")
    if provider == "cartesia" and not str(catalog.get("api_version", "")).strip():
        raise ValueError("Cartesia catalog requires api_version")
    seen: set[str] = set()
    for line in lines:
        if not isinstance(line, dict):
            raise ValueError("every line must be an object")
        line_id = str(line.get("id", ""))
        if not line_id or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789-" for char in line_id):
            raise ValueError(f"invalid line id: {line_id!r}")
        if line_id in seen:
            raise ValueError(f"duplicate line id: {line_id}")
        seen.add(line_id)
        if line.get("role") not in roles:
            raise ValueError(f"line {line_id!r} references unknown role")
        if not str(line.get("text", "")).strip():
            raise ValueError(f"line {line_id!r} has no text")
        if "direction" in line and not str(line["direction"]).strip():
            raise ValueError(f"line {line_id!r} has an empty direction")
        target_duration = line.get("target_duration_s")
        if catalog["version"] >= 5 or target_duration is not None:
            if (
                not isinstance(target_duration, list)
                or len(target_duration) != 2
                or not all(isinstance(value, (int, float)) for value in target_duration)
                or not 0 < target_duration[0] <= target_duration[1]
            ):
                raise ValueError(
                    f"line {line_id!r} target_duration_s must be a positive "
                    "[minimum, maximum]"
                )
        if provider == "hume" and "description" in line:
            description = str(line["description"]).strip()
            if not description:
                raise ValueError(f"line {line_id!r} has an empty Hume description")
            if len(description) > 100:
                raise ValueError(
                    f"line {line_id!r} Hume description exceeds 100 characters"
                )
        source_voice_fields = (
            "source_voice_id",
            "source_voice_name",
            "source_casting_status",
            "source_voice_context",
        )
        present_source_voice_fields = [
            field for field in source_voice_fields if field in line
        ]
        if present_source_voice_fields:
            if provider != "hume":
                raise ValueError(
                    f"line {line_id!r} source voice override is unsupported for "
                    f"{provider}"
                )
            missing_source_voice_fields = [
                field
                for field in source_voice_fields
                if not str(line.get(field, "")).strip()
            ]
            if missing_source_voice_fields:
                raise ValueError(
                    f"line {line_id!r} source voice override requires "
                    f"{', '.join(source_voice_fields)}"
                )
        if "speed" in line:
            speed = line["speed"]
            if provider == "hume":
                valid_speed = isinstance(speed, (int, float)) and 0.5 <= speed <= 2.0
            elif provider == "openai":
                valid_speed = isinstance(speed, (int, float)) and 0.25 <= speed <= 4.0
            else:
                raise ValueError(
                    f"line {line_id!r} speed override is unsupported for {provider}"
                )
            if not valid_speed:
                raise ValueError(f"line {line_id!r} has invalid {provider} speed")
        takes = line.get("takes", 1)
        if not isinstance(takes, int) or not 1 <= takes <= 4:
            raise ValueError(f"line {line_id!r} takes must be an integer from 1 to 4")
        rt_profile = line.get("rt_profile")
        cadence = line.get("cadence")
        if rt_profile is not None:
            profile_document = rt_profiles()["profiles"]
            if rt_profile not in profile_document:
                raise ValueError(
                    f"line {line_id!r} has unknown rt_profile {rt_profile!r}"
                )
            if not isinstance(cadence, list) or not cadence:
                raise ValueError(
                    f"line {line_id!r} with rt_profile requires a cadence map"
                )
        elif cadence is not None:
            raise ValueError(
                f"line {line_id!r} cadence map requires an rt_profile"
            )
        if cadence is not None:
            cadence_words = []
            for unit_index, unit in enumerate(cadence):
                if not isinstance(unit, dict):
                    raise ValueError(
                        f"line {line_id!r} cadence unit {unit_index} must be an object"
                    )
                unit_text = str(unit.get("text", "")).strip()
                if not unit_text:
                    raise ValueError(
                        f"line {line_id!r} cadence unit {unit_index} requires text"
                    )
                if unit.get("pace") not in VALID_CADENCE_PACES:
                    raise ValueError(
                        f"line {line_id!r} cadence unit {unit_index} has invalid pace"
                    )
                if not str(unit.get("focus", "")).strip():
                    raise ValueError(
                        f"line {line_id!r} cadence unit {unit_index} requires focus"
                    )
                cadence_words.extend(normalized_spoken_words(unit_text))
            if cadence_words != normalized_spoken_words(str(line["text"])):
                raise ValueError(
                    f"line {line_id!r} cadence text must cover the canonical "
                    "spoken words in order"
                )
            profile = profile_document[rt_profile]
            words = len(normalized_spoken_words(str(line["text"])))
            if (
                target_duration is not None
                and words >= int(profile.get("minimumWordsForRate", 0))
            ):
                preferred_maximum_wpm = profile.get(
                    "targetMaximumWordsPerMinute",
                    profile.get("maximumWordsPerMinute"),
                )
                preferred_minimum_wpm = profile.get(
                    "targetMinimumWordsPerMinute",
                    profile.get("minimumWordsPerMinute"),
                )
                if preferred_maximum_wpm is not None:
                    minimum_duration = words * 60.0 / preferred_maximum_wpm
                    if target_duration[0] + 1e-9 < minimum_duration:
                        raise ValueError(
                            f"line {line_id!r} duration target permits speech "
                            f"faster than its {rt_profile} preferred envelope"
                        )
                if preferred_minimum_wpm is not None:
                    maximum_duration = words * 60.0 / preferred_minimum_wpm
                    if target_duration[1] - 1e-9 > maximum_duration:
                        raise ValueError(
                            f"line {line_id!r} duration target permits speech "
                            f"slower than its {rt_profile} preferred envelope"
                        )


def line_instructions(catalog: dict, line: dict, take: int = 1) -> str:
    """The role's standing speech behavior plus the transmission-specific direction."""
    role = catalog["roles"][line["role"]]
    parts = [str(role["instructions"]).strip()]
    direction = str(line.get("direction", "")).strip()
    if direction:
        parts.append(f"This moment: {direction}")
    cadence = line.get("cadence")
    if cadence:
        units = "; ".join(
            f"“{unit['text']}” = {unit['pace']} ({unit['focus']})"
            for unit in cadence
        )
        parts.append(
            "Cadence map—relative pace inside one connected transmission: "
            f"{units}. Preserve these pace changes; do not flatten every unit to "
            "the same tempo or separate them into dramatic sentences."
        )
    if "target_duration_s" in line:
        minimum, maximum = line["target_duration_s"]
        parts.append(
            f"Target audible speech duration: {minimum:g} to {maximum:g} seconds; "
            "do not pad a short packet to sound important."
        )
    if take > 1:
        parts.append(
            "Alternate take: same character, same register, naturally different "
            "micro-timing and emphasis.")
    return "\n\n".join(parts)


def hume_description(catalog: dict, line: dict) -> str:
    """Return the short Octave acting cue; long prose can leak into generated speech."""
    role = catalog["roles"][line["role"]]
    return str(line.get("description", role["description"])).strip()


def line_speed(catalog: dict, line: dict) -> float:
    """Use a speech-act-specific rate when supplied, otherwise retain role continuity."""
    role = catalog["roles"][line["role"]]
    return float(line.get("speed", role.get("speed", 1.0)))


def source_voice_id(catalog: dict, line: dict) -> str | None:
    """Resolve the dry-performance voice without changing the runtime radio role."""
    role = catalog["roles"][line["role"]]
    return line.get("source_voice_id", role.get("voice_id"))


def source_voice_name(catalog: dict, line: dict) -> str | None:
    """Resolve the review-facing source voice name for provenance."""
    role = catalog["roles"][line["role"]]
    return line.get("source_voice_name", role.get("voice_name"))


def take_filename(line_id: str, take: int) -> str:
    return f"{line_id}.wav" if take == 1 else f"{line_id}--t{take}.wav"


def source_hash(catalog: dict, line: dict, take: int = 1) -> str:
    role = catalog["roles"][line["role"]]
    source = {
        "provider": catalog.get("provider", "openai"),
        "model": catalog["model"],
        "api_version": catalog.get("api_version"),
        "response_format": catalog["response_format"],
        "voice": role.get("voice"),
        "voice_id": source_voice_id(catalog, line),
        "voice_settings": role.get("voice_settings"),
        # The microphone/mask affects the dry performance and must invalidate a take. The
        # transceiver is applied non-destructively at runtime and deliberately is not hashed.
        "talker_profile": role.get("talker_profile"),
        "speed": line_speed(catalog, line),
        "instructions": line_instructions(catalog, line, take),
        "description": (
            hume_description(catalog, line)
            if str(catalog.get("provider", "openai")).lower() == "hume"
            and str(catalog["model"]) == "1"
            else None
        ),
        "audio_tags": line.get("audio_tags"),
        "target_duration_s": line.get("target_duration_s"),
        "text": line["text"],
    }
    canonical = json.dumps(source, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def speech_request(
    catalog: dict,
    line: dict,
    api_key: str,
    *,
    take: int = 1,
    api_url: str | None = None,
    urlopen=urllib.request.urlopen,
) -> bytes:
    provider = str(catalog.get("provider", "openai")).strip().lower()
    resolved_url = api_url or DEFAULT_API_URLS[provider]
    if provider == "elevenlabs":
        return elevenlabs_speech_request(
            catalog, line, api_key, take=take, api_url=resolved_url, urlopen=urlopen
        )
    if provider == "hume":
        return hume_speech_request(
            catalog, line, api_key, take=take, api_url=resolved_url, urlopen=urlopen
        )
    if provider == "cartesia":
        return cartesia_speech_request(
            catalog, line, api_key, take=take, api_url=resolved_url, urlopen=urlopen
        )
    return openai_speech_request(
        catalog, line, api_key, take=take, api_url=resolved_url, urlopen=urlopen
    )


def openai_speech_request(
    catalog: dict,
    line: dict,
    api_key: str,
    *,
    take: int,
    api_url: str,
    urlopen,
) -> bytes:
    role = catalog["roles"][line["role"]]
    request_body = {
        "model": catalog["model"],
        "input": line["text"],
        "voice": role["voice"],
        "instructions": line_instructions(catalog, line, take),
        "response_format": catalog["response_format"],
    }
    if "speed" in role or "speed" in line:
        request_body["speed"] = line_speed(catalog, line)
    payload = json.dumps(request_body).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    return perform_request(request, urlopen)


def elevenlabs_speech_request(
    catalog: dict,
    line: dict,
    api_key: str,
    *,
    take: int,
    api_url: str,
    urlopen,
) -> bytes:
    role = catalog["roles"][line["role"]]
    tags = str(line.get("audio_tags", "")).strip()
    spoken_text = f"{tags} {line['text']}".strip()
    request_body: dict[str, object] = {
        "text": spoken_text,
        "model_id": catalog["model"],
    }
    if "voice_settings" in role:
        request_body["voice_settings"] = role["voice_settings"]
    if str(catalog.get("language_code", "")).strip():
        request_body["language_code"] = str(catalog["language_code"]).strip()
    # PCM keeps the provider response lossless; wrap it as a browser-safe WAV before writing.
    sample_rate = int(catalog.get("pcm_sample_rate_hz", 24_000))
    endpoint = (
        f"{api_url.rstrip('/')}/{urllib.parse.quote(str(role['voice_id']), safe='')}"
        f"?output_format=pcm_{sample_rate}"
    )
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    pcm = perform_request(request, urlopen)
    return pcm16_mono_wav(pcm, sample_rate)


def hume_speech_request(
    catalog: dict,
    line: dict,
    api_key: str,
    *,
    take: int,
    api_url: str,
    urlopen,
) -> bytes:
    role = catalog["roles"][line["role"]]
    utterance = {
        "text": line["text"],
        "voice": {"id": source_voice_id(catalog, line)},
        "speed": line_speed(catalog, line),
        "trailing_silence": 0.08,
    }
    # The live Hume API currently rejects utterance descriptions on Octave 2 even though
    # descriptions remain part of the general Utterance schema. Directed performance therefore
    # uses Octave 1; Octave 2 is retained only for explicitly undirected stock-voice catalogs.
    if str(catalog["model"]) == "1":
        utterance["description"] = hume_description(catalog, line)
    request_body = {
        "version": catalog["model"],
        "utterances": [utterance],
        "format": {"type": "wav"},
        "num_generations": 1,
    }
    request = urllib.request.Request(
        api_url,
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "X-Hume-Api-Key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    payload = json.loads(perform_request(request, urlopen))
    generations = payload.get("generations", [])
    if not generations or not generations[0].get("audio"):
        raise RuntimeError("Hume speech response contains no generation audio")
    try:
        return base64.b64decode(generations[0]["audio"], validate=True)
    except (ValueError, TypeError) as error:
        raise RuntimeError("Hume speech response contains invalid audio") from error


def cartesia_speech_request(
    catalog: dict,
    line: dict,
    api_key: str,
    *,
    take: int,
    api_url: str,
    urlopen,
) -> bytes:
    role = catalog["roles"][line["role"]]
    request_body = {
        "model_id": catalog["model"],
        "transcript": line["text"],
        "voice": {"id": role["voice_id"]},
        "language": str(catalog.get("language_code", "en")),
        "output_format": {
            "container": "wav",
            "encoding": "pcm_s16le",
            "sample_rate": int(catalog.get("pcm_sample_rate_hz", 48_000)),
        },
    }
    request = urllib.request.Request(
        api_url,
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Cartesia-Version": str(catalog["api_version"]),
            "Content-Type": "application/json",
            "Accept": "audio/wav",
            "User-Agent": USER_AGENT,
        },
    )
    return perform_request(request, urlopen)


def key_for_provider(provider: str) -> str:
    environment = API_KEY_ENVIRONMENTS[provider]
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
    if result is not None and result.stdout.strip():
        return result.stdout.strip()
    raise RuntimeError(
        f"{environment} is not set and no matching macOS Keychain item exists"
    )


def perform_request(request: urllib.request.Request, urlopen) -> bytes:
    try:
        with urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"speech API returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"speech API request failed: {error.reason}") from error


def pcm16_mono_wav(pcm: bytes, sample_rate_hz: int) -> bytes:
    if sample_rate_hz <= 0:
        raise ValueError("PCM sample rate must be positive")
    if len(pcm) == 0 or len(pcm) % 2:
        raise ValueError("PCM response must contain whole 16-bit samples")
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate_hz)
        audio.writeframes(pcm)
    return output.getvalue()


def inspect_wav(path: Path) -> dict:
    """Measure a PCM WAV. OpenAI speech often writes 0xFFFFFFFF RIFF/data sizes; fall back to bytes."""
    raw = path.read_bytes()
    if len(raw) < 44 or raw[0:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError(f"invalid WAV data in {path}")
    # Walk chunks so nonstandard sizes still yield rate/width/channels.
    offset = 12
    rate = channels = width = 0
    data_offset = data_declared = None
    while offset + 8 <= len(raw):
        chunk_id = raw[offset:offset + 4]
        chunk_size = int.from_bytes(raw[offset + 4:offset + 8], "little")
        payload = offset + 8
        if chunk_id == b"fmt " and chunk_size >= 16 and payload + 16 <= len(raw):
            channels = int.from_bytes(raw[payload + 2:payload + 4], "little")
            rate = int.from_bytes(raw[payload + 4:payload + 8], "little")
            bits = int.from_bytes(raw[payload + 14:payload + 16], "little")
            width = max(bits // 8, 1)
        elif chunk_id == b"data":
            data_offset = payload
            data_declared = chunk_size
            break
        # 0xFFFFFFFF means "until EOF" — stop walking.
        if chunk_size == 0xFFFFFFFF:
            break
        offset = payload + chunk_size + (chunk_size & 1)
    if not rate or not channels or not width or data_offset is None:
        raise ValueError(f"invalid WAV data in {path}")
    payload_bytes = (
        len(raw) - data_offset
        if data_declared in (None, 0xFFFFFFFF)
        else min(data_declared, len(raw) - data_offset)
    )
    frame_bytes = channels * width
    frames = payload_bytes // frame_bytes
    if frames <= 0:
        raise ValueError(f"invalid WAV data in {path}")
    return {
        "duration_s": round(frames / rate, 3),
        "sample_rate_hz": rate,
        "channels": channels,
        "sample_width_bytes": width,
    }


def normalize_wav(path: Path) -> None:
    """Rewrite OpenAI's unknown-size WAV headers to ordinary PCM so tools and browsers agree."""
    info = inspect_wav(path)
    raw = path.read_bytes()
    data_at = raw.find(b"data")
    if data_at < 0:
        raise ValueError(f"WAV missing data chunk: {path}")
    pcm = raw[data_at + 8:]
    # Trim to whole frames.
    frame_bytes = info["channels"] * info["sample_width_bytes"]
    pcm = pcm[: len(pcm) - (len(pcm) % frame_bytes)]
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(info["channels"])
        audio.setsampwidth(info["sample_width_bytes"])
        audio.setframerate(info["sample_rate_hz"])
        audio.writeframes(pcm)


def trim_wav_silence(
    path: Path,
    *,
    threshold_dbfs: float = -48.0,
    pre_roll_s: float = 0.02,
    post_roll_s: float = 0.08,
) -> None:
    """Remove provider padding while preserving a short natural key-up/key-down margin."""
    with wave.open(str(path), "rb") as audio:
        channels = audio.getnchannels()
        width = audio.getsampwidth()
        rate = audio.getframerate()
        frames = audio.readframes(audio.getnframes())
    if channels != 1 or width != 2 or rate <= 0 or not frames:
        return

    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    threshold = max(1, int(32767.0 * math.pow(10.0, threshold_dbfs / 20.0)))
    audible = [index for index, sample in enumerate(samples) if abs(sample) >= threshold]
    if not audible:
        return
    pre_roll = max(0, round(pre_roll_s * rate))
    post_roll = max(0, round(post_roll_s * rate))
    start = max(0, audible[0] - pre_roll)
    end = min(len(samples), audible[-1] + post_roll + 1)
    trimmed = samples[start:end]
    if sys.byteorder != "little":
        trimmed.byteswap()
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(width)
        audio.setframerate(rate)
        audio.writeframes(trimmed.tobytes())


def wav_silence_padding(path: Path, *, threshold_dbfs: float = -48.0) -> dict:
    """Measure leading and trailing below-threshold padding on mono 16-bit PCM."""
    with wave.open(str(path), "rb") as audio:
        channels = audio.getnchannels()
        width = audio.getsampwidth()
        rate = audio.getframerate()
        frames = audio.readframes(audio.getnframes())
    if channels != 1 or width != 2 or rate <= 0 or not frames:
        return {}

    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    threshold = max(1, int(32767.0 * math.pow(10.0, threshold_dbfs / 20.0)))
    audible = [index for index, sample in enumerate(samples) if abs(sample) >= threshold]
    if not audible:
        duration = len(samples) / rate
        return {
            "leading_silence_s": round(duration, 3),
            "trailing_silence_s": round(duration, 3),
        }
    return {
        "leading_silence_s": round(audible[0] / rate, 3),
        "trailing_silence_s": round((len(samples) - audible[-1] - 1) / rate, 3),
    }


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as temp:
        temp_path = Path(temp.name)
        temp.write(data)
        temp.flush()
        os.fsync(temp.fileno())
    try:
        temp_path.replace(path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def build_manifest(
    catalog: dict,
    output_dir: Path,
    *,
    trusted_sources: dict[str, str] | None = None,
) -> dict:
    clips: dict[str, dict] = {}
    for line in catalog["lines"]:
        takes = []
        for take in range(1, line.get("takes", 1) + 1):
            wav_path = output_dir / take_filename(line["id"], take)
            if not wav_path.exists():
                continue
            expected_source = source_hash(catalog, line, take)
            if (
                trusted_sources is not None
                and trusted_sources.get(wav_path.name) != expected_source
            ):
                continue
            wav = inspect_wav(wav_path)
            padding = wav_silence_padding(wav_path)
            audible_duration = round(
                wav["duration_s"]
                - padding.get("leading_silence_s", 0.0)
                - padding.get("trailing_silence_s", 0.0),
                3,
            )
            target_duration = line.get("target_duration_s")
            take_manifest = {
                "url": f"./{wav_path.name}",
                "source_sha256": expected_source,
                "file_sha256": hashlib.sha256(wav_path.read_bytes()).hexdigest(),
                **wav,
                **padding,
                "audible_duration_s": audible_duration,
                "target_duration_s": target_duration,
                "duration_within_target": (
                    target_duration is None
                    or target_duration[0] <= audible_duration <= target_duration[1]
                ),
            }
            rt_result = compact_rt_result(analyze_rt_take(wav_path, line))
            if rt_result is not None:
                take_manifest["rt_performance"] = rt_result
            takes.append(take_manifest)
        if not takes:
            continue
        role = catalog["roles"][line["role"]]
        clips[line["id"]] = {
            "url": takes[0]["url"],
            "role": line["role"],
            # The browser refuses to play a take unless this exact authored transcript matches
            # current simulation state. Reusing an id after phraseology changes must fail silent,
            # never put stale words on the air.
            "transcript": line["text"],
            "voice": role.get("voice", source_voice_id(catalog, line)),
            "voice_name": source_voice_name(catalog, line),
            "source_casting_status": line.get(
                "source_casting_status",
                role.get("casting_status"),
            ),
            "source_voice_context": line.get("source_voice_context"),
            "talker_profile": role.get("talker_profile"),
            "transceiver_profile": role.get("transceiver_profile"),
            "duration_s": max(take["duration_s"] for take in takes),
            "takes": takes,
        }
    return {
        "version": 3,
        "equipment_profile_version": 1,
        "catalog_version": catalog["version"],
        "provider": catalog.get("provider", "openai"),
        "model": catalog["model"],
        "disclosure": catalog.get(
            "disclosure", "Radio speech may use AI-generated training voices."
        ),
        "clips": clips,
    }


DURATIONS_HEADER = """\
// Generated by tools/audio/radio_voice.py --write-durations from measured mission-radio WAVs.
// Empty until clips are generated; MissionRadioDirector falls back to its word-count estimate.
// Do not edit by hand — regenerate after any clip generation run.

namespace GunsOnly.Sim;

public static class MissionRadioClipDurations {
    static readonly Dictionary<string, double> Seconds = new() {
"""

DURATIONS_FOOTER = """\
    };

    /// <summary>Longest measured take for the catalog id, in seconds.</summary>
    public static bool TryGet(string id, out double seconds) =>
        Seconds.TryGetValue(id, out seconds);

    public static int Count => Seconds.Count;
}
"""


def write_durations(manifest: dict, durations_path: Path) -> int:
    """Bake measured clip durations into the deterministic kernel's lookup table."""
    entries = sorted(
        (line_id, clip["duration_s"]) for line_id, clip in manifest["clips"].items()
    )
    body = "".join(
        f'        ["{line_id}"] = {duration:.3f},\n' for line_id, duration in entries
    )
    write_atomic(
        durations_path, (DURATIONS_HEADER + body + DURATIONS_FOOTER).encode("utf-8")
    )
    return len(entries)


def write_manifest(
    catalog: dict,
    output_dir: Path,
    manifest_path: Path,
    *,
    trusted_sources: dict[str, str] | None = None,
) -> None:
    if trusted_sources is None:
        trusted_sources = manifest_source_hashes(
            manifest_path, output_dir=output_dir
        )
    manifest = build_manifest(
        catalog, output_dir, trusted_sources=trusted_sources
    )
    write_atomic(
        manifest_path,
        (json.dumps(manifest, indent=2, sort_keys=False) + "\n").encode("utf-8"),
    )


def manifest_source_hashes(
    manifest_path: Path,
    *,
    output_dir: Path | None = None,
) -> dict[str, str]:
    """Return source hashes only for takes whose recorded file hash still matches."""
    if not manifest_path.exists():
        return {}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    result: dict[str, str] = {}
    clips = manifest.get("clips", {})
    if not isinstance(clips, dict):
        return result
    for clip in clips.values():
        if not isinstance(clip, dict):
            continue
        takes = clip.get("takes", [])
        if not isinstance(takes, list):
            continue
        for take in takes:
            if not isinstance(take, dict):
                continue
            url = str(take.get("url", "")).strip()
            source = str(take.get("source_sha256", "")).strip()
            if url and source:
                name = Path(urllib.parse.urlparse(url).path).name
                if not name:
                    continue
                if output_dir is not None:
                    file_hash = str(take.get("file_sha256", "")).strip()
                    wav_path = output_dir / name
                    if (
                        not file_hash
                        or not wav_path.is_file()
                        or hashlib.sha256(wav_path.read_bytes()).hexdigest()
                            != file_hash
                    ):
                        continue
                result[name] = source
    return result


def generate(
    catalog: dict,
    output_dir: Path,
    manifest_path: Path,
    api_key: str,
    *,
    selected: set[str] | None = None,
    force: bool = False,
    dry_run: bool = False,
    api_url: str | None = None,
) -> int:
    made = 0
    recorded_sources = manifest_source_hashes(
        manifest_path, output_dir=output_dir
    )
    trusted_sources = dict(recorded_sources)
    for line in catalog["lines"]:
        if selected and line["id"] not in selected:
            continue
        for take in range(1, line.get("takes", 1) + 1):
            wav_path = output_dir / take_filename(line["id"], take)
            if wav_path.exists() and not force:
                inspect_wav(wav_path)
                expected_source = source_hash(catalog, line, take)
                if recorded_sources.get(wav_path.name) == expected_source:
                    continue
            if dry_run:
                action = "regenerate stale" if wav_path.exists() else "generate"
                print(
                    f"would {action} {line['id']} take {take} -> {wav_path}"
                )
                continue
            audio = speech_request(catalog, line, api_key, take=take, api_url=api_url)
            candidate_path = wav_path.with_name(f".{wav_path.name}.candidate")
            write_atomic(candidate_path, audio)
            try:
                normalize_wav(candidate_path)
                trim_wav_silence(candidate_path)
                wav = inspect_wav(candidate_path)
                padding = wav_silence_padding(candidate_path)
                if padding.get("trailing_silence_s", 0.0) > 0.12:
                    raise ValueError(
                        f"WAV has excessive trailing silence after trim: {candidate_path}"
                    )
                if "target_duration_s" in line:
                    audible_duration = (
                        wav["duration_s"]
                        - padding.get("leading_silence_s", 0.0)
                        - padding.get("trailing_silence_s", 0.0)
                    )
                    minimum, maximum = line["target_duration_s"]
                    if not minimum <= audible_duration <= maximum:
                        raise ValueError(
                            f"WAV audible duration {audible_duration:.3f}s is outside "
                            f"{minimum:g}-{maximum:g}s target: {candidate_path}"
                        )
                rt_result = analyze_rt_take(candidate_path, line)
                if rt_result is not None:
                    if rt_result["status"] != "pass":
                        codes = ", ".join(
                            problem["code"]
                            for problem in rt_result.get("issues", [])
                        )
                        raise ValueError(
                            f"WAV does not pass {line['rt_profile']} R/T "
                            f"performance profile ({rt_result['status']}: {codes}): "
                            f"{candidate_path}"
                        )
            except Exception:
                candidate_path.unlink(missing_ok=True)
                raise
            candidate_path.replace(wav_path)
            trusted_sources[wav_path.name] = source_hash(
                catalog, line, take
            )
            made += 1
            print(f"generated {line['id']} take {take}")
    if not dry_run:
        write_manifest(
            catalog,
            output_dir,
            manifest_path,
            trusted_sources=trusted_sources,
        )
    return made


def parser() -> argparse.ArgumentParser:
    root = Path(__file__).resolve().parents[2]
    default_catalog = root / "audio/radio/mission/lines.json"
    default_output = root / "web/wwwroot/render/audio/samples/radio"
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--catalog", type=Path, default=default_catalog)
    result.add_argument("--output", type=Path, default=default_output)
    result.add_argument("--manifest", type=Path, default=default_output / "manifest.json")
    result.add_argument(
        "--durations", type=Path, default=root / "sim/MissionRadioClipDurations.g.cs")
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    commands.add_parser("manifest")
    commands.add_parser("durations")
    generate_command = commands.add_parser("generate")
    generate_command.add_argument("--only", action="append", default=[])
    generate_command.add_argument("--force", action="store_true")
    generate_command.add_argument("--dry-run", action="store_true")
    generate_command.add_argument(
        "--api-url",
        help="Override the selected provider's API base URL (normally only for tests).",
    )
    return result


def main() -> int:
    args = parser().parse_args()
    catalog = load_catalog(args.catalog)
    if args.command == "validate":
        print(f"valid: {len(catalog['lines'])} lines, {len(catalog['roles'])} roles")
        return 0
    if args.command == "manifest":
        write_manifest(catalog, args.output, args.manifest)
        print(f"wrote {args.manifest}")
        return 0
    if args.command == "durations":
        trusted_sources = manifest_source_hashes(
            args.manifest, output_dir=args.output
        )
        count = write_durations(
            build_manifest(
                catalog,
                args.output,
                trusted_sources=trusted_sources,
            ),
            args.durations,
        )
        print(f"wrote {count} durations to {args.durations}")
        return 0
    provider = str(catalog.get("provider", "openai")).strip().lower()
    key_environment = API_KEY_ENVIRONMENTS[provider]
    try:
        api_key = "" if args.dry_run else key_for_provider(provider)
    except RuntimeError as error:
        raise SystemExit(f"{error} (or use --dry-run)") from error
    selected = set(args.only) or None
    if selected:
        known = {line["id"] for line in catalog["lines"]}
        unknown = selected - known
        if unknown:
            raise SystemExit(f"unknown line ids: {', '.join(sorted(unknown))}")
    made = generate(
        catalog,
        args.output,
        args.manifest,
        api_key,
        selected=selected,
        force=args.force,
        dry_run=args.dry_run,
        api_url=args.api_url,
    )
    print(f"{made} clip(s) generated")
    if not args.dry_run:
        trusted_sources = manifest_source_hashes(
            args.manifest, output_dir=args.output
        )
        count = write_durations(
            build_manifest(
                catalog,
                args.output,
                trusted_sources=trusted_sources,
            ),
            args.durations,
        )
        print(f"wrote {count} durations to {args.durations}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
