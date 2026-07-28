#!/usr/bin/env python3
"""Validate and build Guns Only mission-radio WAV assets with the OpenAI speech API."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request
import wave

DEFAULT_API_URL = "https://api.openai.com/v1/audio/speech"
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
        if spec.get("voice") not in VALID_VOICES:
            raise ValueError(f"role {role!r} has unsupported voice {spec.get('voice')!r}")
        if not str(spec.get("instructions", "")).strip():
            raise ValueError(f"role {role!r} has no instructions")
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


def source_hash(catalog: dict, line: dict) -> str:
    role = catalog["roles"][line["role"]]
    source = {
        "model": catalog["model"],
        "response_format": catalog["response_format"],
        "voice": role["voice"],
        "instructions": role["instructions"],
        "text": line["text"],
    }
    canonical = json.dumps(source, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def speech_request(
    catalog: dict,
    line: dict,
    api_key: str,
    *,
    api_url: str = DEFAULT_API_URL,
    urlopen=urllib.request.urlopen,
) -> bytes:
    role = catalog["roles"][line["role"]]
    payload = json.dumps({
        "model": catalog["model"],
        "input": line["text"],
        "voice": role["voice"],
        "instructions": role["instructions"],
        "response_format": catalog["response_format"],
    }).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"speech API returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"speech API request failed: {error.reason}") from error


def inspect_wav(path: Path) -> dict:
    with wave.open(str(path), "rb") as audio:
        frames = audio.getnframes()
        rate = audio.getframerate()
        channels = audio.getnchannels()
        width = audio.getsampwidth()
    if frames <= 0 or rate <= 0 or channels <= 0 or width <= 0:
        raise ValueError(f"invalid WAV data in {path}")
    return {
        "duration_s": round(frames / rate, 3),
        "sample_rate_hz": rate,
        "channels": channels,
        "sample_width_bytes": width,
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


def build_manifest(catalog: dict, output_dir: Path) -> dict:
    clips: dict[str, dict] = {}
    for line in catalog["lines"]:
        wav_path = output_dir / f"{line['id']}.wav"
        if not wav_path.exists():
            continue
        wav = inspect_wav(wav_path)
        role = catalog["roles"][line["role"]]
        clips[line["id"]] = {
            "url": f"./render/audio/samples/radio/{wav_path.name}",
            "role": line["role"],
            "voice": role["voice"],
            "source_sha256": source_hash(catalog, line),
            "file_sha256": hashlib.sha256(wav_path.read_bytes()).hexdigest(),
            **wav,
        }
    return {
        "version": 1,
        "catalog_version": catalog["version"],
        "model": catalog["model"],
        "disclosure": catalog.get(
            "disclosure", "Radio speech may use AI-generated training voices."
        ),
        "clips": clips,
    }


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
    api_url: str = DEFAULT_API_URL,
) -> int:
    made = 0
    for line in catalog["lines"]:
        if selected and line["id"] not in selected:
            continue
        wav_path = output_dir / f"{line['id']}.wav"
        if wav_path.exists() and not force:
            inspect_wav(wav_path)
            continue
        if dry_run:
            print(f"would generate {line['id']} -> {wav_path}")
            continue
        audio = speech_request(catalog, line, api_key, api_url=api_url)
        write_atomic(wav_path, audio)
        try:
            inspect_wav(wav_path)
        except Exception:
            wav_path.unlink(missing_ok=True)
            raise
        made += 1
        print(f"generated {line['id']}")
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
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    commands.add_parser("manifest")
    generate_command = commands.add_parser("generate")
    generate_command.add_argument("--only", action="append", default=[])
    generate_command.add_argument("--force", action="store_true")
    generate_command.add_argument("--dry-run", action="store_true")
    generate_command.add_argument("--api-url", default=DEFAULT_API_URL)
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
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key and not args.dry_run:
        raise SystemExit("OPENAI_API_KEY is required for generate (or use --dry-run)")
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
