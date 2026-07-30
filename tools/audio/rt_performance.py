#!/usr/bin/env python3
"""Measure dry R/T takes against reusable operational-cadence profiles."""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import wave


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROFILES = ROOT / "audio/rt/performance-profiles.json"
WORD = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.IGNORECASE)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def write_json_atomic(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
    with tempfile.NamedTemporaryFile(
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)
        temporary.write(payload)
        temporary.flush()
        os.fsync(temporary.fileno())
    try:
        temporary_path.replace(path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def word_count(text: str) -> int:
    return len(WORD.findall(text))


def stable_hash(value: object) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def analyze_timed_packet(packet: dict) -> dict:
    """Quantify relative pace across hand-aligned semantic units in a real R/T packet."""
    packet_id = str(packet.get("id", "")).strip()
    if not packet_id:
        raise ValueError("timed R/T packet requires an id")
    units = packet.get("units")
    if not isinstance(units, list) or len(units) < 2:
        raise ValueError(
            f"timed R/T packet {packet_id!r} requires at least two units"
        )

    measured_units = []
    previous_end = None
    total_words = 0
    for index, unit in enumerate(units):
        if not isinstance(unit, dict):
            raise ValueError(
                f"timed R/T packet {packet_id!r} unit {index} must be an object"
            )
        label = str(unit.get("label", "")).strip()
        text = str(unit.get("text", "")).strip()
        start = unit.get("startSeconds")
        end = unit.get("endSeconds")
        if not label or not text:
            raise ValueError(
                f"timed R/T packet {packet_id!r} unit {index} needs label and text"
            )
        if (
            not isinstance(start, (int, float))
            or not isinstance(end, (int, float))
            or start < 0
            or end <= start
        ):
            raise ValueError(
                f"timed R/T packet {packet_id!r} unit {index} has invalid timing"
            )
        if previous_end is not None and start < previous_end:
            raise ValueError(
                f"timed R/T packet {packet_id!r} units overlap or run backward"
            )
        words = word_count(text)
        if words == 0:
            raise ValueError(
                f"timed R/T packet {packet_id!r} unit {index} has no words"
            )
        duration = float(end) - float(start)
        unit_wpm = words * 60.0 / duration
        pause_before = 0.0 if previous_end is None else float(start) - previous_end
        measured_units.append({
            "label": label,
            "text": text,
            "focus": str(unit.get("focus", "")).strip(),
            "startSeconds": round(float(start), 4),
            "endSeconds": round(float(end), 4),
            "durationSeconds": round(duration, 4),
            "wordCount": words,
            "wordsPerMinute": round(unit_wpm, 1),
            "pauseBeforeSeconds": round(pause_before, 4),
        })
        total_words += words
        previous_end = float(end)

    packet_start = measured_units[0]["startSeconds"]
    packet_end = measured_units[-1]["endSeconds"]
    packet_duration = packet_end - packet_start
    packet_wpm = total_words * 60.0 / packet_duration
    for index, unit in enumerate(measured_units):
        unit["paceRatioToPacket"] = round(
            unit["wordsPerMinute"] / packet_wpm, 3
        )
        if index > 0:
            previous_wpm = measured_units[index - 1]["wordsPerMinute"]
            unit["paceChangeFromPreviousPercent"] = round(
                (unit["wordsPerMinute"] / previous_wpm - 1.0) * 100.0,
                1,
            )

    return {
        "id": packet_id,
        "source": packet.get("source"),
        "timingBasis": packet.get("timingBasis"),
        "confidence": packet.get("confidence"),
        "wordCount": total_words,
        "durationSeconds": round(packet_duration, 4),
        "wholePacketWordsPerMinute": round(packet_wpm, 1),
        "maximumPauseSeconds": round(
            max(unit["pauseBeforeSeconds"] for unit in measured_units),
            4,
        ),
        "units": measured_units,
    }


def analyze_timed_spec(spec_path: Path) -> dict:
    spec = load_json(spec_path)
    packets = spec.get("packets")
    if not isinstance(packets, list) or not packets:
        raise ValueError("timed R/T evidence requires a packets array")
    results = [analyze_timed_packet(packet) for packet in packets]
    ids = [result["id"] for result in results]
    if len(ids) != len(set(ids)):
        raise ValueError("timed R/T evidence has duplicate packet ids")
    return {
        "schemaVersion": "1.0.0",
        "sourceSpec": str(spec_path.resolve()),
        "method": spec.get("method"),
        "limitations": spec.get("limitations"),
        "packetCount": len(results),
        "packets": results,
    }


def validate_profiles(document: dict) -> None:
    measurement = document.get("measurement")
    profiles = document.get("profiles")
    if not isinstance(measurement, dict):
        raise ValueError("R/T profiles require measurement settings")
    if not isinstance(profiles, dict) or not profiles:
        raise ValueError("R/T profiles require at least one profile")

    positive_measurements = (
        "frameMilliseconds",
        "minimumPauseMilliseconds",
        "clippingAmplitude",
    )
    for key in positive_measurements:
        if not isinstance(measurement.get(key), (int, float)) or measurement[key] <= 0:
            raise ValueError(f"measurement {key} must be positive")
    threshold = measurement.get("silenceThresholdDbfs")
    if not isinstance(threshold, (int, float)) or threshold >= 0:
        raise ValueError("measurement silenceThresholdDbfs must be negative")
    if measurement["clippingAmplitude"] > 32767:
        raise ValueError("measurement clippingAmplitude cannot exceed 32767")

    numeric_keys = {
        "minimumWordsForRate",
        "minimumWordsPerMinute",
        "targetMinimumWordsPerMinute",
        "maximumWordsPerMinute",
        "targetMaximumWordsPerMinute",
        "maximumInternalPauseMilliseconds",
        "targetMaximumInternalPauseMilliseconds",
        "maximumInternalSilenceRatio",
        "targetMaximumInternalSilenceRatio",
        "maximumLeadingSilenceMilliseconds",
        "maximumTrailingSilenceMilliseconds",
        "maximumClippedSampleRatio",
        "maximumDurationSeconds",
    }
    for profile_id, profile in profiles.items():
        if not isinstance(profile_id, str) or not profile_id:
            raise ValueError("R/T profile IDs must be non-empty strings")
        if not isinstance(profile, dict):
            raise ValueError(f"profile {profile_id!r} must be an object")
        if not str(profile.get("description", "")).strip():
            raise ValueError(f"profile {profile_id!r} requires a description")
        for key, value in profile.items():
            if key in numeric_keys and (
                not isinstance(value, (int, float)) or value < 0
            ):
                raise ValueError(f"profile {profile_id!r} {key} must be non-negative")
        minimum = profile.get("minimumWordsPerMinute")
        maximum = profile.get("maximumWordsPerMinute")
        if minimum is not None and maximum is not None and minimum > maximum:
            raise ValueError(
                f"profile {profile_id!r} minimumWordsPerMinute exceeds maximum"
            )
        target_minimum = profile.get("targetMinimumWordsPerMinute")
        target_maximum = profile.get("targetMaximumWordsPerMinute")
        if (
            target_minimum is not None
            and minimum is not None
            and target_minimum < minimum
        ):
            raise ValueError(
                f"profile {profile_id!r} target minimum is below hard minimum"
            )
        if (
            target_maximum is not None
            and maximum is not None
            and target_maximum > maximum
        ):
            raise ValueError(
                f"profile {profile_id!r} target maximum exceeds hard maximum"
            )
        target_pause = profile.get("targetMaximumInternalPauseMilliseconds")
        maximum_pause = profile.get("maximumInternalPauseMilliseconds")
        if (
            target_pause is not None
            and maximum_pause is not None
            and target_pause > maximum_pause
        ):
            raise ValueError(
                f"profile {profile_id!r} target pause exceeds hard maximum"
            )
        target_ratio = profile.get("targetMaximumInternalSilenceRatio")
        maximum_ratio = profile.get("maximumInternalSilenceRatio")
        if (
            target_ratio is not None
            and maximum_ratio is not None
            and target_ratio > maximum_ratio
        ):
            raise ValueError(
                f"profile {profile_id!r} target silence ratio exceeds hard maximum"
            )


def load_profiles(path: Path = DEFAULT_PROFILES) -> dict:
    document = load_json(path)
    validate_profiles(document)
    return document


def read_pcm16_wav(path: Path) -> tuple[int, int, array]:
    try:
        with wave.open(str(path), "rb") as audio:
            channels = audio.getnchannels()
            width = audio.getsampwidth()
            rate = audio.getframerate()
            frames = audio.readframes(audio.getnframes())
    except (EOFError, wave.Error) as error:
        raise ValueError(f"{path} is not a readable PCM WAV: {error}") from error
    if channels <= 0 or rate <= 0 or width != 2 or not frames:
        raise ValueError(f"{path} must be a non-empty 16-bit PCM WAV")
    samples = array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    if len(samples) % channels:
        raise ValueError(f"{path} has an incomplete audio frame")
    return rate, channels, samples


def block_rms(
    samples: array,
    *,
    channels: int,
    frames_per_block: int,
) -> list[float]:
    total_frames = len(samples) // channels
    values = []
    for frame_start in range(0, total_frames, frames_per_block):
        frame_end = min(total_frames, frame_start + frames_per_block)
        sample_start = frame_start * channels
        sample_end = frame_end * channels
        block = samples[sample_start:sample_end]
        if not block:
            continue
        square_sum = sum(sample * sample for sample in block)
        values.append(math.sqrt(square_sum / len(block)))
    return values


def contiguous_false_ranges(
    values: list[bool],
    *,
    start: int,
    end: int,
) -> list[tuple[int, int]]:
    ranges = []
    cursor = start
    while cursor < end:
        if values[cursor]:
            cursor += 1
            continue
        range_start = cursor
        while cursor < end and not values[cursor]:
            cursor += 1
        ranges.append((range_start, cursor))
    return ranges


def issue(
    severity: str,
    code: str,
    message: str,
    actual: float,
    limit: float,
) -> dict:
    return {
        "severity": severity,
        "code": code,
        "message": message,
        "actual": round(actual, 4),
        "limit": round(limit, 4),
    }


def analyze_wav(
    path: Path,
    text: str,
    profile_id: str,
    profiles_document: dict,
) -> dict:
    profiles = profiles_document["profiles"]
    if profile_id not in profiles:
        raise ValueError(f"unknown R/T profile {profile_id!r}")
    profile = profiles[profile_id]
    settings = profiles_document["measurement"]
    rate, channels, samples = read_pcm16_wav(path)
    total_frames = len(samples) // channels
    duration = total_frames / rate
    words = word_count(text)

    frame_ms = float(settings["frameMilliseconds"])
    frames_per_block = max(1, round(rate * frame_ms / 1000.0))
    rms_values = block_rms(
        samples,
        channels=channels,
        frames_per_block=frames_per_block,
    )
    threshold = 32767.0 * math.pow(
        10.0, float(settings["silenceThresholdDbfs"]) / 20.0
    )
    audible = [value >= threshold for value in rms_values]
    audible_indexes = [index for index, value in enumerate(audible) if value]
    problems = []

    if not audible_indexes:
        return {
            "status": "fail",
            "path": str(path.resolve()),
            "profile": profile_id,
            "profileDescription": profile["description"],
            "profileThresholds": profile,
            "text": text,
            "wordCount": words,
            "durationSeconds": round(duration, 4),
            "sampleRateHz": rate,
            "channels": channels,
            "errorCount": 1,
            "warningCount": 0,
            "issues": [{
                "severity": "error",
                "code": "no-audible-speech",
                "message": "No audio exceeded the configured speech threshold.",
            }],
        }

    first = audible_indexes[0]
    last_exclusive = audible_indexes[-1] + 1
    block_seconds = frames_per_block / rate
    speech_start = first * block_seconds
    speech_end = min(duration, last_exclusive * block_seconds)
    speech_span = max(block_seconds, speech_end - speech_start)
    minimum_pause = float(settings["minimumPauseMilliseconds"]) / 1000.0
    pause_ranges = contiguous_false_ranges(
        audible,
        start=first + 1,
        end=last_exclusive,
    )
    internal_pauses = []
    for start, end in pause_ranges:
        pause_duration = (end - start) * block_seconds
        if pause_duration + 1e-9 < minimum_pause:
            continue
        internal_pauses.append({
            "startSeconds": round(start * block_seconds, 4),
            "endSeconds": round(min(duration, end * block_seconds), 4),
            "durationSeconds": round(pause_duration, 4),
        })

    internal_silence = sum(
        pause["durationSeconds"] for pause in internal_pauses
    )
    leading_silence = speech_start
    trailing_silence = max(0.0, duration - speech_end)
    total_wpm = 0.0 if duration <= 0 else words * 60.0 / duration
    articulation_time = max(
        block_seconds,
        speech_span - internal_silence,
    )
    articulation_wpm = words * 60.0 / articulation_time
    internal_ratio = internal_silence / speech_span
    clipping_amplitude = int(settings["clippingAmplitude"])
    clipped_samples = sum(
        1 for sample in samples if abs(sample) >= clipping_amplitude
    )
    clipped_ratio = clipped_samples / len(samples)

    minimum_rate_words = int(profile.get("minimumWordsForRate", 0))
    if words >= minimum_rate_words:
        minimum_wpm = profile.get("minimumWordsPerMinute")
        maximum_wpm = profile.get("maximumWordsPerMinute")
        if minimum_wpm is not None and total_wpm < minimum_wpm:
            problems.append(issue(
                "error",
                "cadence-slow",
                "Whole-packet cadence is below the profile minimum.",
                total_wpm,
                float(minimum_wpm),
            ))
        if maximum_wpm is not None and total_wpm > maximum_wpm:
            problems.append(issue(
                "error",
                "cadence-fast",
                "Whole-packet cadence exceeds the profile maximum.",
                total_wpm,
                float(maximum_wpm),
            ))
        target_minimum_wpm = profile.get("targetMinimumWordsPerMinute")
        target_maximum_wpm = profile.get("targetMaximumWordsPerMinute")
        if (
            target_minimum_wpm is not None
            and total_wpm >= float(profile.get("minimumWordsPerMinute", 0))
            and total_wpm < target_minimum_wpm
        ):
            problems.append(issue(
                "warning",
                "cadence-below-target",
                "Whole-packet cadence is below the preferred target.",
                total_wpm,
                float(target_minimum_wpm),
            ))
        if (
            target_maximum_wpm is not None
            and total_wpm <= float(profile.get("maximumWordsPerMinute", math.inf))
            and total_wpm > target_maximum_wpm
        ):
            problems.append(issue(
                "warning",
                "cadence-above-target",
                "Whole-packet cadence exceeds the preferred target.",
                total_wpm,
                float(target_maximum_wpm),
            ))

    maximum_duration = profile.get("maximumDurationSeconds")
    if maximum_duration is not None and duration > maximum_duration:
        problems.append(issue(
            "error",
            "duration-long",
            "Clip duration exceeds the profile maximum.",
            duration,
            float(maximum_duration),
        ))

    longest_pause = max(
        (pause["durationSeconds"] for pause in internal_pauses),
        default=0.0,
    )
    max_pause_s = float(profile["maximumInternalPauseMilliseconds"]) / 1000.0
    if longest_pause > max_pause_s:
        problems.append(issue(
            "error",
            "internal-pause-long",
            "An internal pause exceeds the profile maximum.",
            longest_pause,
            max_pause_s,
        ))
    max_internal_ratio = float(profile["maximumInternalSilenceRatio"])
    if internal_ratio > max_internal_ratio:
        problems.append(issue(
            "error",
            "internal-silence-high",
            "Too much of the speech span is internal silence.",
            internal_ratio,
            max_internal_ratio,
        ))
    target_pause = profile.get("targetMaximumInternalPauseMilliseconds")
    if (
        target_pause is not None
        and longest_pause <= max_pause_s
        and longest_pause > float(target_pause) / 1000.0
    ):
        problems.append(issue(
            "warning",
            "internal-pause-above-target",
            "An internal pause exceeds the preferred target.",
            longest_pause,
            float(target_pause) / 1000.0,
        ))
    target_internal_ratio = profile.get("targetMaximumInternalSilenceRatio")
    if (
        target_internal_ratio is not None
        and internal_ratio <= max_internal_ratio
        and internal_ratio > target_internal_ratio
    ):
        problems.append(issue(
            "warning",
            "internal-silence-above-target",
            "Internal silence exceeds the preferred target.",
            internal_ratio,
            float(target_internal_ratio),
        ))

    max_leading = float(profile["maximumLeadingSilenceMilliseconds"]) / 1000.0
    if leading_silence > max_leading:
        problems.append(issue(
            "error",
            "leading-silence-long",
            "Provider padding before speech exceeds the profile maximum.",
            leading_silence,
            max_leading,
        ))
    max_trailing = float(profile["maximumTrailingSilenceMilliseconds"]) / 1000.0
    if trailing_silence > max_trailing:
        problems.append(issue(
            "error",
            "trailing-silence-long",
            "Provider padding after speech exceeds the profile maximum.",
            trailing_silence,
            max_trailing,
        ))
    max_clipped = float(profile["maximumClippedSampleRatio"])
    if clipped_ratio > max_clipped:
        problems.append(issue(
            "error",
            "clipping-high",
            "Clipped-sample ratio exceeds the profile maximum.",
            clipped_ratio,
            max_clipped,
        ))

    error_count = sum(problem["severity"] == "error" for problem in problems)
    warning_count = sum(problem["severity"] == "warning" for problem in problems)
    status = "fail" if error_count else "review" if warning_count else "pass"
    return {
        "status": status,
        "path": str(path.resolve()),
        "profile": profile_id,
        "profileDescription": profile["description"],
        "profileThresholds": profile,
        "text": text,
        "wordCount": words,
        "durationSeconds": round(duration, 4),
        "wholePacketWordsPerMinute": round(total_wpm, 1),
        "articulationWordsPerMinute": round(articulation_wpm, 1),
        "speechStartSeconds": round(speech_start, 4),
        "speechEndSeconds": round(speech_end, 4),
        "leadingSilenceSeconds": round(leading_silence, 4),
        "trailingSilenceSeconds": round(trailing_silence, 4),
        "internalSilenceSeconds": round(internal_silence, 4),
        "internalSilenceRatio": round(internal_ratio, 4),
        "longestInternalPauseSeconds": round(longest_pause, 4),
        "internalPauses": internal_pauses,
        "clippedSampleRatio": round(clipped_ratio, 6),
        "sampleRateHz": rate,
        "channels": channels,
        "errorCount": error_count,
        "warningCount": warning_count,
        "issues": problems,
    }


def validate_audit_spec(spec: dict, profiles_document: dict) -> None:
    items = spec.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("R/T audit spec requires an items array")
    known_profiles = set(profiles_document["profiles"])
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("every R/T audit item must be an object")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id:
            raise ValueError("every R/T audit item requires a non-empty id")
        if item_id in seen:
            raise ValueError(f"duplicate R/T audit item id {item_id!r}")
        seen.add(item_id)
        if not str(item.get("path", "")).strip():
            raise ValueError(f"R/T audit item {item_id!r} requires path")
        if not str(item.get("text", "")).strip():
            raise ValueError(f"R/T audit item {item_id!r} requires text")
        if item.get("profile") not in known_profiles:
            raise ValueError(
                f"R/T audit item {item_id!r} has unknown profile "
                f"{item.get('profile')!r}"
            )


def audit_spec(
    spec_path: Path,
    profiles_document: dict,
    *,
    profiles_path: Path | None = None,
) -> dict:
    spec = load_json(spec_path)
    validate_audit_spec(spec, profiles_document)
    results = []
    for item in spec["items"]:
        path = Path(item["path"])
        if not path.is_absolute():
            path = (spec_path.parent / path).resolve()
        result = analyze_wav(
            path,
            item["text"],
            item["profile"],
            profiles_document,
        )
        result["id"] = item["id"]
        if "role" in item:
            result["role"] = item["role"]
        results.append(result)
    failed = sum(result["status"] == "fail" for result in results)
    review = sum(result["status"] == "review" for result in results)
    return {
        "schemaVersion": "1.0.0",
        "status": "fail" if failed else "review" if review else "pass",
        "sourceSpec": str(spec_path.resolve()),
        "profilesSource": (
            str(profiles_path.resolve()) if profiles_path is not None else None
        ),
        "profilesSha256": stable_hash(profiles_document),
        "measurement": profiles_document["measurement"],
        "itemCount": len(results),
        "passedCount": len(results) - failed - review,
        "reviewCount": review,
        "failedCount": failed,
        "items": results,
    }


def print_result(result: dict) -> None:
    marker = {
        "pass": "PASS",
        "review": "REVIEW",
        "fail": "FAIL",
    }[result["status"]]
    print(
        f"{marker} {result.get('id', Path(result['path']).name)}"
        f" · {result['durationSeconds']:.2f}s"
        f" · {result.get('wholePacketWordsPerMinute', 0):.0f} WPM"
        f" · max pause {result.get('longestInternalPauseSeconds', 0) * 1000:.0f}ms"
    )
    for problem in result.get("issues", []):
        print(f"  {problem['code']}: {problem['message']}")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--profiles", type=Path, default=DEFAULT_PROFILES)
    commands = result.add_subparsers(dest="command", required=True)

    inspect = commands.add_parser("inspect")
    inspect.add_argument("wav", type=Path)
    inspect.add_argument("--text", required=True)
    inspect.add_argument("--profile", required=True)
    inspect.add_argument("--json", action="store_true")

    audit = commands.add_parser("audit")
    audit.add_argument("--spec", type=Path, required=True)
    audit.add_argument("--output", type=Path)
    audit.add_argument(
        "--report-only",
        action="store_true",
        help="Return success even when clips fail; useful for baseline inventories.",
    )

    timed_audit = commands.add_parser("timed-audit")
    timed_audit.add_argument("--spec", type=Path, required=True)
    timed_audit.add_argument("--output", type=Path)
    return result


def main() -> int:
    arguments = parser().parse_args()
    if arguments.command == "timed-audit":
        report = analyze_timed_spec(arguments.spec.resolve())
        for packet in report["packets"]:
            print(
                f"TIMED {packet['id']} · {packet['durationSeconds']:.2f}s"
                f" · {packet['wholePacketWordsPerMinute']:.0f} WPM"
            )
            for unit in packet["units"]:
                change = unit.get("paceChangeFromPreviousPercent")
                suffix = "" if change is None else f" · {change:+.0f}% vs prior"
                print(
                    f"  {unit['label']}: {unit['wordsPerMinute']:.0f} WPM"
                    f"{suffix}"
                )
        if arguments.output:
            write_json_atomic(arguments.output.resolve(), report)
            print(f"wrote {arguments.output.resolve()}")
        return 0

    profiles = load_profiles(arguments.profiles)
    if arguments.command == "inspect":
        result = analyze_wav(
            arguments.wav.resolve(),
            arguments.text,
            arguments.profile,
            profiles,
        )
        if arguments.json:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print_result(result)
        return 1 if result["status"] == "fail" else 0

    report = audit_spec(
        arguments.spec.resolve(),
        profiles,
        profiles_path=arguments.profiles,
    )
    for item in report["items"]:
        print_result(item)
    print(
        f"R/T audit: {report['passedCount']} passed,"
        f" {report['reviewCount']} review,"
        f" {report['failedCount']} failed"
    )
    if arguments.output:
        write_json_atomic(arguments.output.resolve(), report)
        print(f"wrote {arguments.output.resolve()}")
    if arguments.report_only:
        return 0
    return 1 if report["status"] == "fail" else 0


if __name__ == "__main__":
    raise SystemExit(main())
