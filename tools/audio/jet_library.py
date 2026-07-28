#!/usr/bin/env python3
"""Manage the synchronized local jet-audio research vault.

The tracked catalogue lives in ``audio/jet-library/catalog.json``. Raw video,
provider metadata, extracted analysis WAVs, thumbnails, and local hashes live in
``analysis/jet-audio-library`` and are gitignored.

The tool keeps video and audio together because throttle position, HUD state,
manoeuvre, camera mounting, edits, and microphone overload are often the only
evidence for what a waveform means. New analysis is segment-first: it never
infers idle/MIL/afterburner merely from loudness.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any

import numpy as np
from scipy.io import wavfile

import cockpit_palette


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = REPO_ROOT / "audio/jet-library/catalog.json"
DEFAULT_VAULT = REPO_ROOT / "analysis/jet-audio-library"
DEFAULT_PROFILE_DIR = REPO_ROOT / "audio/jet-library/profiles"
CATALOG_VERSION = "guns-only.jet-audio-catalog.v1"
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$")
PERSPECTIVES = {
    "cockpit_airframe",
    "helmet_mask",
    "chase_aircraft",
    "external_near",
    "external_far",
    "test_cell",
    "mechanism_close",
    "collection",
}
TIERS = {
    "reference_local",
    "redistributable_source",
    "original_render",
    "collection_index",
}
MEDIA_SUFFIXES = {
    ".mp4", ".webm", ".mkv", ".mov", ".m4v", ".avi", ".ogv",
    ".wav", ".flac", ".ogg", ".m4a", ".aac", ".mp3", ".opus",
}


def load_catalog(path: Path = DEFAULT_CATALOG) -> dict[str, Any]:
    catalog = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_catalog(catalog)
    if errors:
        raise ValueError("\n".join(errors))
    return catalog


def validate_catalog(catalog: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if catalog.get("schema_version") != CATALOG_VERSION:
        errors.append(f"schema_version must be {CATALOG_VERSION}")
    sources = catalog.get("sources")
    if not isinstance(sources, list) or not sources:
        return errors + ["sources must be a non-empty array"]

    seen: set[str] = set()
    for index, source in enumerate(sources):
        prefix = f"sources[{index}]"
        if not isinstance(source, dict):
            errors.append(f"{prefix} must be an object")
            continue
        source_id = source.get("id")
        if not isinstance(source_id, str) or not SAFE_ID.fullmatch(source_id):
            errors.append(f"{prefix}.id is not a safe stable identifier")
        elif source_id in seen:
            errors.append(f"{prefix}.id duplicates {source_id}")
        else:
            seen.add(source_id)
        if not isinstance(source.get("title"), str) or not source["title"].strip():
            errors.append(f"{prefix}.title is required")
        if not isinstance(source.get("url"), str) or not source["url"].startswith(("http://", "https://")):
            errors.append(f"{prefix}.url must be http(s)")
        distribution = source.get("distribution")
        if not isinstance(distribution, dict):
            errors.append(f"{prefix}.distribution is required")
        elif distribution.get("tier") not in TIERS:
            errors.append(f"{prefix}.distribution.tier is invalid")
        subject = source.get("subject")
        if not isinstance(subject, dict):
            errors.append(f"{prefix}.subject is required")
        elif subject.get("perspective") not in PERSPECTIVES:
            errors.append(f"{prefix}.subject.perspective is invalid")
        tags = source.get("tags")
        if not isinstance(tags, list) or not all(isinstance(tag, str) and tag for tag in tags):
            errors.append(f"{prefix}.tags must be a string array")
        segments = source.get("segments", [])
        if not isinstance(segments, list):
            errors.append(f"{prefix}.segments must be an array")
            continue
        segment_ids: set[str] = set()
        for segment_index, segment in enumerate(segments):
            segment_prefix = f"{prefix}.segments[{segment_index}]"
            if not isinstance(segment, dict):
                errors.append(f"{segment_prefix} must be an object")
                continue
            segment_id = segment.get("id")
            if not isinstance(segment_id, str) or not SAFE_ID.fullmatch(segment_id):
                errors.append(f"{segment_prefix}.id is invalid")
            elif segment_id in segment_ids:
                errors.append(f"{segment_prefix}.id duplicates {segment_id}")
            else:
                segment_ids.add(segment_id)
            start = _finite(segment.get("start_s"))
            end = _finite(segment.get("end_s"))
            if start is None or end is None or start < 0 or end <= start:
                errors.append(f"{segment_prefix} requires 0 <= start_s < end_s")
            evidence = segment.get("evidence", {})
            confidence = _finite(evidence.get("confidence")) if isinstance(evidence, dict) else None
            if confidence is not None and not 0 <= confidence <= 1:
                errors.append(f"{segment_prefix}.evidence.confidence must be 0..1")
    return errors


def source_by_id(catalog: dict[str, Any], source_id: str) -> dict[str, Any]:
    for source in catalog["sources"]:
        if source["id"] == source_id:
            return source
    raise KeyError(f"unknown source id: {source_id}")


def source_slug(source_id: str) -> str:
    if not SAFE_ID.fullmatch(source_id):
        raise ValueError(f"unsafe source id: {source_id!r}")
    return source_id


def run_checked(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, check=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def vault_paths(vault: Path, source_id: str) -> dict[str, Path]:
    slug = source_slug(source_id)
    return {
        "media": vault / "media",
        "audio": vault / "audio",
        "metadata": vault / "metadata",
        "inventory": vault / "inventory" / f"{slug}.json",
        "audio_file": vault / "audio" / f"{slug}.wav",
        "output_template": vault / "media" / f"{slug}.%(ext)s",
    }


def ensure_vault(vault: Path) -> None:
    for name in ("media", "audio", "metadata", "inventory"):
        (vault / name).mkdir(parents=True, exist_ok=True)


def find_media(vault: Path, source_id: str) -> Path | None:
    slug = source_slug(source_id)
    media_dir = vault / "media"
    if not media_dir.exists():
        return None
    candidates = [
        path for path in media_dir.glob(f"{slug}.*")
        if path.suffix.lower() in MEDIA_SUFFIXES and not path.name.endswith(".part")
    ]
    candidates.sort(key=lambda path: (path.stat().st_size, path.suffix == ".mp4"), reverse=True)
    return candidates[0] if candidates else None


def ffprobe(path: Path) -> dict[str, Any]:
    command = [
        shutil.which("ffprobe") or "ffprobe",
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        str(path),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def maximum_video_height(probe: dict[str, Any]) -> int:
    heights = [
        int(stream["height"])
        for stream in probe.get("streams", [])
        if stream.get("codec_type") == "video"
        and _finite(stream.get("height")) is not None
    ]
    return max(heights, default=0)


def normalize_fetched_video_height(
    media: Path,
    maximum_height: int,
) -> Path:
    """Bound fetched review video even when provider format metadata omitted its height."""
    if maximum_height <= 0:
        return media
    probe = ffprobe(media)
    if maximum_video_height(probe) <= maximum_height:
        return media

    target = media if media.suffix.lower() == ".mp4" else media.with_suffix(".mp4")
    temporary = media.parent / f".{media.stem}.height-{maximum_height}.mp4"
    base_command = [
        shutil.which("ffmpeg") or "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(media),
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-map_metadata", "0",
        "-vf", f"scale=-2:{maximum_height}:flags=lanczos",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
    ]
    try:
        run_checked([
            *base_command,
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(temporary),
        ])
    except subprocess.CalledProcessError:
        temporary.unlink(missing_ok=True)
        run_checked([
            *base_command,
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(temporary),
        ])
    if target != media:
        media.unlink()
    temporary.replace(target)
    return target


def write_inventory(
    source: dict[str, Any],
    vault: Path,
    media: Path,
    audio: Path | None,
) -> dict[str, Any]:
    paths = vault_paths(vault, source["id"])
    inventory = {
        "schema_version": "guns-only.jet-audio-local-inventory.v1",
        "source_id": source["id"],
        "source_url": source["url"],
        "media": {
            "path": str(media.relative_to(REPO_ROOT)),
            "sha256": sha256_file(media),
            "bytes": media.stat().st_size,
            "probe": ffprobe(media),
        },
        "analysis_audio": None,
    }
    if audio is not None and audio.exists():
        inventory["analysis_audio"] = {
            "path": str(audio.relative_to(REPO_ROOT)),
            "sha256": sha256_file(audio),
            "bytes": audio.stat().st_size,
            "probe": ffprobe(audio),
        }
    paths["inventory"].parent.mkdir(parents=True, exist_ok=True)
    paths["inventory"].write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    return inventory


def extract_analysis_audio(media: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run_checked([
        shutil.which("ffmpeg") or "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(media),
        "-map", "0:a:0",
        "-vn",
        "-ac", "1",
        "-ar", "48000",
        "-c:a", "pcm_s16le",
        str(output),
    ])


def fetch_source(
    source: dict[str, Any],
    vault: Path,
    *,
    force: bool = False,
    maximum_video_height: int = 480,
) -> dict[str, Any]:
    tier = source["distribution"]["tier"]
    if tier == "collection_index":
        raise ValueError(f"{source['id']} is a collection index, not a single fetchable recording")
    if source["provider"] == "article":
        raise ValueError(f"{source['id']} requires manual acquisition of its embedded media")
    ensure_vault(vault)
    paths = vault_paths(vault, source["id"])
    media = find_media(vault, source["id"])
    if media is None or force:
        command = [
            shutil.which("yt-dlp") or "yt-dlp",
            "--no-playlist",
            "--no-part",
            "--write-info-json",
            "--write-thumbnail",
            "--convert-thumbnails", "jpg",
            "--format", "bv*[height<=480]+ba/b[height<=480]/b",
            "--merge-output-format", "mp4",
            "--output", str(paths["output_template"]),
        ]
        if not force:
            command.append("--no-overwrites")
        command.append(source["url"])
        run_checked(command)
        media = find_media(vault, source["id"])
    if media is None:
        raise RuntimeError(f"fetch completed but no media object was found for {source['id']}")

    # yt-dlp writes sidecar files next to media. Keep all local provider output together.
    for sidecar in paths["media"].glob(f"{source['id']}.*"):
        if sidecar == media or sidecar.suffix.lower() in MEDIA_SUFFIXES:
            continue
        destination = paths["metadata"] / sidecar.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            destination.unlink()
        sidecar.replace(destination)

    media = normalize_fetched_video_height(media, maximum_video_height)
    try:
        extract_analysis_audio(media, paths["audio_file"])
        audio: Path | None = paths["audio_file"]
    except subprocess.CalledProcessError:
        # Silent/no-audio video is still valuable visual evidence and belongs in the vault.
        paths["audio_file"].unlink(missing_ok=True)
        audio = None
        print(f"warning: {source['id']} has no decodable audio stream", file=sys.stderr)
    return write_inventory(source, vault, media, audio)


def import_existing(
    source: dict[str, Any],
    vault: Path,
    media_path: Path,
    *,
    force: bool = False,
) -> dict[str, Any]:
    if not media_path.is_file():
        raise FileNotFoundError(media_path)
    ensure_vault(vault)
    suffix = media_path.suffix.lower() or ".bin"
    destination = vault / "media" / f"{source_slug(source['id'])}{suffix}"
    if destination.exists() and not force:
        media = destination
    else:
        shutil.copy2(media_path, destination)
        media = destination
    paths = vault_paths(vault, source["id"])
    try:
        extract_analysis_audio(media, paths["audio_file"])
        audio: Path | None = paths["audio_file"]
    except subprocess.CalledProcessError:
        paths["audio_file"].unlink(missing_ok=True)
        audio = None
    return write_inventory(source, vault, media, audio)


def profile_segment(
    source: dict[str, Any],
    audio_path: Path,
    segment: dict[str, Any] | None,
) -> dict[str, Any]:
    sample_rate, raw = wavfile.read(audio_path)
    samples = cockpit_palette._float_mono(raw)
    duration = samples.size / sample_rate
    if segment:
        start = float(segment["start_s"])
        end = float(segment["end_s"])
        segment_id = segment["id"]
        if end > duration + 1 / sample_rate:
            raise ValueError(
                f"{segment_id} ends at {end:.3f}s, beyond media duration {duration:.3f}s"
            )
        samples = samples[int(round(start * sample_rate)) : int(round(end * sample_rate))]
    else:
        start, end = 0.0, duration
        segment_id = f"{source['id']}.full"

    rms = math.sqrt(float(np.mean(samples * samples)) + 1e-20)
    if rms < 1e-5:
        raise ValueError(f"{segment_id} is effectively silent ({20 * math.log10(rms):.1f} dBFS)")
    features = cockpit_palette._frame_features(samples, sample_rate)
    selected = np.isfinite(features["rms_dbfs"])
    band_fractions = np.median(features["band_fractions"][selected], axis=0)
    band_fractions /= max(float(np.sum(band_fractions)), 1e-20)
    result = {
        "schema_version": "guns-only.jet-audio-segment-profile.v1",
        "source_id": source["id"],
        "segment_id": segment_id,
        "time": {
            "start_s": round(start, 6),
            "end_s": round(end, 6),
            "duration_s": round(end - start, 6),
        },
        "annotations": {
            "states": (segment or {}).get("states", {
                "engine_power": "unknown",
                "dynamic_pressure": "unknown",
                "g_load": "unknown",
            }),
            "events": (segment or {}).get("events", []),
            "evidence": (segment or {}).get("evidence", {
                "kind": "unannotated",
                "confidence": 0.0,
            }),
            "contaminants": (segment or {}).get("contaminants", []),
        },
        "measurement": {
            "calibration": "relative_only",
            "sample_rate_hz": int(sample_rate),
            "frame_seconds": round(float(features["frame_seconds"]), 6),
            "hop_seconds": round(float(features["hop_seconds"]), 6),
            "frame_count": int(np.sum(selected)),
            "rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
            "rms_dbfs_quantiles": {
                str(q): round(float(np.quantile(features["rms_dbfs"][selected], q)), 3)
                for q in (0.1, 0.25, 0.5, 0.75, 0.9)
            },
            "spectral_centroid_hz": round(
                float(np.median(features["centroids"][selected])), 2
            ),
            "rolloff_85_hz": round(
                float(np.median(features["rolloffs"][selected])), 2
            ),
            "bands_hz": [[low, high] for low, high in cockpit_palette.BANDS_HZ],
            "band_energy_fraction": [
                round(float(value), 7) for value in band_fractions
            ],
            "dominant_low_peaks_hz": cockpit_palette._dominant_low_peaks(
                features["spectra"], features["frequencies"], selected
            ),
        },
        "source_pcm_embedded": False,
    }
    return result


def inventory_for(vault: Path, source_id: str) -> dict[str, Any]:
    path = vault_paths(vault, source_id)["inventory"]
    if not path.exists():
        raise FileNotFoundError(f"no local inventory for {source_id}; run fetch first")
    return json.loads(path.read_text(encoding="utf-8"))


def analysis_audio_for(vault: Path, source_id: str) -> Path:
    inventory = inventory_for(vault, source_id)
    entry = inventory.get("analysis_audio")
    if not isinstance(entry, dict) or not entry.get("path"):
        raise ValueError(f"{source_id} has no analysis audio")
    return REPO_ROOT / entry["path"]


def command_validate(args: argparse.Namespace) -> None:
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    errors = validate_catalog(catalog)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        raise SystemExit(1)
    print(f"{args.catalog}: {len(catalog['sources'])} sources valid")


def command_list(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    for source in catalog["sources"]:
        if args.tag and args.tag not in source["tags"]:
            continue
        if args.perspective and source["subject"]["perspective"] != args.perspective:
            continue
        if args.tier and source["distribution"]["tier"] != args.tier:
            continue
        print(
            f"{source['id']}\t{source['distribution']['tier']}\t"
            f"{source['subject']['perspective']}\t{source['title']}"
        )


def command_fetch(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    source = source_by_id(catalog, args.id)
    inventory = fetch_source(
        source,
        args.vault,
        force=args.force,
        maximum_video_height=args.max_video_height,
    )
    print(json.dumps({
        "source_id": source["id"],
        "media_sha256": inventory["media"]["sha256"],
        "analysis_audio": inventory["analysis_audio"] is not None,
    }, indent=2))


def command_import(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    source = source_by_id(catalog, args.id)
    inventory = import_existing(
        source,
        args.vault,
        args.media,
        force=args.force,
    )
    print(json.dumps({
        "source_id": source["id"],
        "media_sha256": inventory["media"]["sha256"],
        "analysis_audio": inventory["analysis_audio"] is not None,
    }, indent=2))


def command_probe(args: argparse.Namespace) -> None:
    print(json.dumps(inventory_for(args.vault, args.id), indent=2))


def command_analyze(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    source = source_by_id(catalog, args.id)
    audio_path = analysis_audio_for(args.vault, args.id)
    segments = source.get("segments") or [None]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for segment in segments:
        profile = profile_segment(source, audio_path, segment)
        output = args.output_dir / f"{profile['segment_id']}.json"
        output.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {output}")


def generate_review_index(
    catalog: dict[str, Any],
    vault: Path,
    output: Path,
) -> dict[str, int]:
    """Write a local-only media review page; never embeds source bytes."""
    cards: list[str] = []
    fetched = 0
    with_audio = 0
    for source in catalog["sources"]:
        inventory_path = vault_paths(vault, source["id"])["inventory"]
        inventory: dict[str, Any] | None = None
        if inventory_path.exists():
            inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
            fetched += 1
            if inventory.get("analysis_audio"):
                with_audio += 1

        title = html.escape(source["title"])
        source_id = html.escape(source["id"])
        url = html.escape(source["url"], quote=True)
        tier = html.escape(source["distribution"]["tier"])
        perspective = html.escape(source["subject"]["perspective"])
        tags = " ".join(html.escape(tag) for tag in source.get("tags", []))
        notes = html.escape(source.get("notes", ""))
        search = html.escape(
            " ".join([
                source["id"],
                source["title"],
                source["distribution"]["tier"],
                source["subject"]["perspective"],
                *source.get("tags", []),
            ]).lower(),
            quote=True,
        )
        media_markup = '<div class="missing">Not fetched locally</div>'
        if inventory and isinstance(inventory.get("media"), dict):
            media_path = REPO_ROOT / inventory["media"]["path"]
            relative = Path(os.path.relpath(media_path, output.parent)).as_posix()
            relative_url = html.escape(relative, quote=True)
            if media_path.suffix.lower() in {
                ".mp4", ".webm", ".mkv", ".mov", ".m4v", ".avi", ".ogv",
            }:
                media_markup = (
                    f'<video controls preload="metadata" src="{relative_url}"></video>'
                )
            else:
                media_markup = (
                    f'<audio controls preload="metadata" src="{relative_url}"></audio>'
                )
        cards.append(
            f"""
            <article class="card" data-search="{search}" data-perspective="{perspective}"
              data-tier="{tier}" data-fetched="{"yes" if inventory else "no"}">
              {media_markup}
              <div class="body">
                <div class="eyebrow">{perspective} · {tier}</div>
                <h2>{title}</h2>
                <code>{source_id}</code>
                <p class="tags">{tags}</p>
                <p>{notes}</p>
                <a href="{url}" target="_blank" rel="noreferrer">Open original source</a>
              </div>
            </article>
            """
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Guns Only · Jet audio reference review</title>
  <style>
    :root {{ color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }}
    body {{ margin: 0; background: #10161a; color: #e8eee8; }}
    header {{ position: sticky; top: 0; z-index: 2; padding: 20px clamp(18px, 4vw, 56px);
      background: color-mix(in srgb, #10161a 92%, transparent); backdrop-filter: blur(12px);
      border-bottom: 1px solid #32403b; }}
    h1 {{ margin: 0 0 6px; font: 600 clamp(22px, 3vw, 34px) Georgia, serif; }}
    header p {{ max-width: 78ch; margin: 5px 0 14px; color: #b8c7bf; }}
    .controls {{ display: flex; flex-wrap: wrap; gap: 8px; }}
    input, select {{ border: 1px solid #40524b; border-radius: 7px; padding: 9px 11px;
      background: #18231f; color: inherit; }}
    input {{ min-width: min(430px, 75vw); }}
    main {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 18px; padding: 24px clamp(18px, 4vw, 56px) 60px; }}
    .card {{ overflow: hidden; border: 1px solid #33433d; border-radius: 12px;
      background: #17211e; box-shadow: 0 10px 35px #0004; }}
    video, audio {{ display: block; width: 100%; background: #090d0c; }}
    video {{ aspect-ratio: 16 / 9; object-fit: contain; }}
    audio {{ margin-top: 18px; width: calc(100% - 24px); margin-inline: 12px; }}
    .missing {{ display: grid; place-items: center; aspect-ratio: 16 / 9; color: #819087;
      background: repeating-linear-gradient(135deg, #121a17, #121a17 12px, #151f1b 12px,
      #151f1b 24px); }}
    .body {{ padding: 16px; }}
    .eyebrow, .tags {{ color: #9fb7aa; font-size: 12px; text-transform: uppercase;
      letter-spacing: .06em; }}
    h2 {{ margin: 7px 0; font: 600 20px Georgia, serif; }}
    code {{ color: #b8d7c5; }}
    a {{ color: #f1c77b; }}
    .hidden {{ display: none; }}
  </style>
</head>
<body>
  <header>
    <h1>Jet audio reference review</h1>
    <p>{fetched} of {len(catalog["sources"])} sources fetched; {with_audio} have analysis audio.
      Raw media is local reference evidence, not a production-asset pool.</p>
    <div class="controls">
      <input id="query" type="search" placeholder="Search aircraft, event, perspective, tag…">
      <select id="fetched">
        <option value="">All sources</option>
        <option value="yes">Fetched only</option>
        <option value="no">Pending only</option>
      </select>
    </div>
  </header>
  <main>{"".join(cards)}</main>
  <script>
    const query = document.querySelector("#query");
    const fetched = document.querySelector("#fetched");
    const cards = [...document.querySelectorAll(".card")];
    function filter() {{
      const text = query.value.trim().toLowerCase();
      cards.forEach(card => card.classList.toggle("hidden",
        (text && !card.dataset.search.includes(text))
        || (fetched.value && card.dataset.fetched !== fetched.value)));
    }}
    query.addEventListener("input", filter);
    fetched.addEventListener("change", filter);
  </script>
</body>
</html>
"""
    output.write_text(document, encoding="utf-8")
    return {
        "sources": len(catalog["sources"]),
        "fetched": fetched,
        "with_audio": with_audio,
    }


def command_review_index(args: argparse.Namespace) -> None:
    catalog = load_catalog(args.catalog)
    stats = generate_review_index(catalog, args.vault, args.output)
    print(f"wrote {args.output} ({stats['fetched']}/{stats['sources']} fetched)")


def _finite(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    root.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    commands = root.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate", help="validate the tracked catalogue")
    validate.set_defaults(func=command_validate)

    listing = commands.add_parser("list", help="list catalogue entries")
    listing.add_argument("--tag")
    listing.add_argument("--perspective", choices=sorted(PERSPECTIVES))
    listing.add_argument("--tier", choices=sorted(TIERS))
    listing.set_defaults(func=command_list)

    fetch = commands.add_parser("fetch", help="download synchronized media into the local vault")
    fetch.add_argument("--id", required=True)
    fetch.add_argument("--force", action="store_true")
    fetch.add_argument(
        "--max-video-height",
        type=int,
        default=480,
        help="post-download video ceiling; 0 disables normalization (default: 480)",
    )
    fetch.set_defaults(func=command_fetch)

    existing = commands.add_parser("import", help="copy an existing local video/audio into the vault")
    existing.add_argument("--id", required=True)
    existing.add_argument("--media", type=Path, required=True)
    existing.add_argument("--force", action="store_true")
    existing.set_defaults(func=command_import)

    probe = commands.add_parser("probe", help="print local hashes and ffprobe metadata")
    probe.add_argument("--id", required=True)
    probe.set_defaults(func=command_probe)

    analyze = commands.add_parser("analyze", help="measure annotated source segments")
    analyze.add_argument("--id", required=True)
    analyze.add_argument("--output-dir", type=Path, default=DEFAULT_PROFILE_DIR)
    analyze.set_defaults(func=command_analyze)

    review = commands.add_parser(
        "review-index",
        help="generate a local HTML gallery for synchronized source review",
    )
    review.add_argument("--output", type=Path, default=DEFAULT_VAULT / "review.html")
    review.set_defaults(func=command_review_index)
    return root


def main() -> None:
    args = parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
