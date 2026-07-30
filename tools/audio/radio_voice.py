#!/usr/bin/env python3
"""Validate and build Guns Only mission-radio WAV assets with authored TTS providers."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import wave

DEFAULT_API_URLS = {
    "openai": "https://api.openai.com/v1/audio/speech",
    "elevenlabs": "https://api.elevenlabs.io/v1/text-to-speech",
}
API_KEY_ENVIRONMENTS = {
    "openai": "OPENAI_API_KEY",
    "elevenlabs": "ELEVENLABS_API_KEY",
}
VALID_FORMATS = {"mp3", "opus", "aac", "flac", "wav", "pcm"}
VALID_VOICES = {
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx",
    "sage", "shimmer", "verse", "marin", "cedar",
}


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
            raise ValueError(f"role {role!r} needs an ElevenLabs voice_id")
        if not str(spec.get("instructions", "")).strip():
            raise ValueError(f"role {role!r} has no instructions")
        if "voice_settings" in spec and not isinstance(spec["voice_settings"], dict):
            raise ValueError(f"role {role!r} voice_settings must be an object")
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
        takes = line.get("takes", 1)
        if not isinstance(takes, int) or not 1 <= takes <= 4:
            raise ValueError(f"line {line_id!r} takes must be an integer from 1 to 4")


def line_instructions(catalog: dict, line: dict, take: int = 1) -> str:
    """The character's standing register plus the moment's emotional direction."""
    role = catalog["roles"][line["role"]]
    parts = [str(role["instructions"]).strip()]
    direction = str(line.get("direction", "")).strip()
    if direction:
        parts.append(f"This moment: {direction}")
    if take > 1:
        parts.append(
            "Alternate take: same character, same register, naturally different "
            "micro-timing and emphasis.")
    return "\n\n".join(parts)


def take_filename(line_id: str, take: int) -> str:
    return f"{line_id}.wav" if take == 1 else f"{line_id}--t{take}.wav"


def source_hash(catalog: dict, line: dict, take: int = 1) -> str:
    role = catalog["roles"][line["role"]]
    source = {
        "provider": catalog.get("provider", "openai"),
        "model": catalog["model"],
        "response_format": catalog["response_format"],
        "voice": role.get("voice"),
        "voice_id": role.get("voice_id"),
        "voice_settings": role.get("voice_settings"),
        "speed": role.get("speed"),
        "instructions": line_instructions(catalog, line, take),
        "audio_tags": line.get("audio_tags"),
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
    if "speed" in role:
        request_body["speed"] = role["speed"]
    payload = json.dumps(request_body).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
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
        },
    )
    pcm = perform_request(request, urlopen)
    return pcm16_mono_wav(pcm, sample_rate)


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


def build_manifest(catalog: dict, output_dir: Path) -> dict:
    clips: dict[str, dict] = {}
    for line in catalog["lines"]:
        takes = []
        for take in range(1, line.get("takes", 1) + 1):
            wav_path = output_dir / take_filename(line["id"], take)
            if not wav_path.exists():
                continue
            wav = inspect_wav(wav_path)
            takes.append({
                "url": f"./{wav_path.name}",
                "source_sha256": source_hash(catalog, line, take),
                "file_sha256": hashlib.sha256(wav_path.read_bytes()).hexdigest(),
                **wav,
            })
        if not takes:
            continue
        role = catalog["roles"][line["role"]]
        clips[line["id"]] = {
            "url": takes[0]["url"],
            "role": line["role"],
            "voice": role.get("voice", role.get("voice_id")),
            "duration_s": max(take["duration_s"] for take in takes),
            "takes": takes,
        }
    return {
        "version": 2,
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


def write_manifest(catalog: dict, output_dir: Path, manifest_path: Path) -> None:
    manifest = build_manifest(catalog, output_dir)
    write_atomic(
        manifest_path,
        (json.dumps(manifest, indent=2, sort_keys=False) + "\n").encode("utf-8"),
    )


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
    for line in catalog["lines"]:
        if selected and line["id"] not in selected:
            continue
        for take in range(1, line.get("takes", 1) + 1):
            wav_path = output_dir / take_filename(line["id"], take)
            if wav_path.exists() and not force:
                inspect_wav(wav_path)
                continue
            if dry_run:
                print(f"would generate {line['id']} take {take} -> {wav_path}")
                continue
            audio = speech_request(catalog, line, api_key, take=take, api_url=api_url)
            write_atomic(wav_path, audio)
            try:
                normalize_wav(wav_path)
                inspect_wav(wav_path)
            except Exception:
                wav_path.unlink(missing_ok=True)
                raise
            made += 1
            print(f"generated {line['id']} take {take}")
    if not dry_run:
        write_manifest(catalog, output_dir, manifest_path)
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
        count = write_durations(build_manifest(catalog, args.output), args.durations)
        print(f"wrote {count} durations to {args.durations}")
        return 0
    provider = str(catalog.get("provider", "openai")).strip().lower()
    key_environment = API_KEY_ENVIRONMENTS[provider]
    api_key = os.environ.get(key_environment, "")
    if not api_key and not args.dry_run:
        raise SystemExit(f"{key_environment} is required for generate (or use --dry-run)")
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
        count = write_durations(build_manifest(catalog, args.output), args.durations)
        print(f"wrote {count} durations to {args.durations}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
