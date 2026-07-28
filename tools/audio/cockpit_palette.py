#!/usr/bin/env python3
"""Measure cockpit references and synthesize original, seamless jet beds.

This tool deliberately separates reference analysis from production assets:

* ``analyze`` stores only aggregate spectral statistics. It never copies PCM.
* ``synthesize`` creates new periodic noise/tone beds from those statistics.

The runtime can blend the generated alternates against the hand-authored primary
beds, adding dense cockpit body without redistributing a reference recording.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
from typing import Any

import numpy as np
from scipy.io import wavfile


PROFILE_VERSION = 1
DEFAULT_MODULATION_DEPTH = 0.012
BANDS_HZ = (
    (20.0, 80.0),
    (80.0, 250.0),
    (250.0, 800.0),
    (800.0, 2500.0),
    (2500.0, 8000.0),
)
REGIME_QUANTILES = {
    "idle": (0.10, 0.34),
    "mil": (0.40, 0.70),
    "grit": (0.76, 0.96),
}


def _float_mono(data: np.ndarray) -> np.ndarray:
    if np.issubdtype(data.dtype, np.integer):
        scale = float(max(abs(np.iinfo(data.dtype).min), np.iinfo(data.dtype).max))
        normalized = data.astype(np.float64) / scale
    else:
        normalized = data.astype(np.float64)
    if normalized.ndim == 2:
        normalized = np.mean(normalized, axis=1)
    return normalized


def _db(value: float, floor: float = -120.0) -> float:
    if value <= 0.0 or not math.isfinite(value):
        return floor
    return max(floor, 10.0 * math.log10(value))


def _frame_features(samples: np.ndarray, sample_rate: int) -> dict[str, Any]:
    frame_size = max(256, int(round(sample_rate * 0.25)))
    hop = max(128, int(round(sample_rate * 0.125)))
    fft_size = 1 << int(math.ceil(math.log2(frame_size)))
    window = np.hanning(frame_size)
    window_power = float(np.sum(window * window))
    frequencies = np.fft.rfftfreq(fft_size, 1.0 / sample_rate)
    band_masks = [
        (frequencies >= low) & (frequencies < min(high, sample_rate / 2.0))
        for low, high in BANDS_HZ
    ]

    rms_dbfs: list[float] = []
    band_fractions: list[list[float]] = []
    centroids: list[float] = []
    rolloffs: list[float] = []
    spectra: list[np.ndarray] = []

    for start in range(0, max(1, samples.size - frame_size + 1), hop):
        frame = samples[start : start + frame_size]
        if frame.size != frame_size:
            break
        rms = math.sqrt(float(np.mean(frame * frame)) + 1e-20)
        spectrum = np.abs(np.fft.rfft(frame * window, fft_size)) ** 2
        spectrum /= max(window_power, 1e-20)
        audible = (frequencies >= 20.0) & (frequencies <= min(8000.0, sample_rate / 2.0))
        audible_power = float(np.sum(spectrum[audible])) + 1e-20
        fractions = [float(np.sum(spectrum[mask])) / audible_power for mask in band_masks]
        weighted = spectrum[audible]
        audible_frequencies = frequencies[audible]
        centroid = float(np.sum(audible_frequencies * weighted) / max(np.sum(weighted), 1e-20))
        cumulative = np.cumsum(weighted)
        rolloff_index = int(np.searchsorted(cumulative, cumulative[-1] * 0.85))

        rms_dbfs.append(20.0 * math.log10(max(rms, 1e-12)))
        band_fractions.append(fractions)
        centroids.append(centroid)
        rolloffs.append(float(audible_frequencies[min(rolloff_index, audible_frequencies.size - 1)]))
        spectra.append(spectrum)

    if not rms_dbfs:
        raise ValueError("reference is too short for a 250 ms analysis frame")
    return {
        "frequencies": frequencies,
        "rms_dbfs": np.asarray(rms_dbfs),
        "band_fractions": np.asarray(band_fractions),
        "centroids": np.asarray(centroids),
        "rolloffs": np.asarray(rolloffs),
        "spectra": np.asarray(spectra),
        "frame_seconds": frame_size / sample_rate,
        "hop_seconds": hop / sample_rate,
    }


def _dominant_low_peaks(
    spectra: np.ndarray,
    frequencies: np.ndarray,
    selected: np.ndarray,
) -> list[float]:
    spectrum = np.median(spectra[selected], axis=0)
    mask = (frequencies >= 30.0) & (frequencies <= 520.0)
    candidates = np.flatnonzero(mask)
    ranked = candidates[np.argsort(spectrum[candidates])[::-1]]
    peaks: list[float] = []
    for index in ranked:
        hz = float(frequencies[index])
        if all(abs(hz - existing) >= 18.0 for existing in peaks):
            peaks.append(round(hz, 1))
        if len(peaks) == 4:
            break
    return peaks


def analyze(args: argparse.Namespace) -> None:
    sample_rate, raw = wavfile.read(args.input)
    samples = _float_mono(raw)
    reference_rms = math.sqrt(float(np.mean(samples * samples)) + 1e-20)
    if reference_rms < 1e-5:
        raise ValueError(
            f"reference is effectively silent ({20.0 * math.log10(reference_rms):.1f} dBFS)"
        )
    features = _frame_features(samples, sample_rate)
    rms = features["rms_dbfs"]
    valid = np.isfinite(rms) & (rms > max(-72.0, float(np.quantile(rms, 0.02))))
    if int(np.sum(valid)) < 12:
        valid = np.isfinite(rms)
    valid_rms = rms[valid]

    regimes: dict[str, Any] = {}
    for name, (low_q, high_q) in REGIME_QUANTILES.items():
        low = float(np.quantile(valid_rms, low_q))
        high = float(np.quantile(valid_rms, high_q))
        selected = valid & (rms >= low) & (rms <= high)
        if int(np.sum(selected)) < 3:
            selected = valid
        fractions = np.median(features["band_fractions"][selected], axis=0)
        fractions /= max(float(np.sum(fractions)), 1e-20)
        regimes[name] = {
            "rms_dbfs": round(float(np.median(rms[selected])), 3),
            "spectral_centroid_hz": round(
                float(np.median(features["centroids"][selected])), 2
            ),
            "rolloff_85_hz": round(float(np.median(features["rolloffs"][selected])), 2),
            "band_energy_fraction": [round(float(value), 7) for value in fractions],
            "band_energy_db": [round(_db(float(value)), 3) for value in fractions],
            "dominant_low_peaks_hz": _dominant_low_peaks(
                features["spectra"], features["frequencies"], selected
            ),
            "frame_count": int(np.sum(selected)),
        }

    profile = {
        "version": PROFILE_VERSION,
        "kind": "aggregate-cockpit-spectral-profile",
        "source": {
            "id": args.source_id,
            "url": args.source_url,
            "usage": "aggregate spectral reference only; no source PCM is shipped",
            "production_pcm_contains_source_audio": False,
        },
        "analysis": {
            "sample_rate_hz": int(sample_rate),
            "duration_seconds": round(samples.size / sample_rate, 3),
            "frame_seconds": round(float(features["frame_seconds"]), 6),
            "hop_seconds": round(float(features["hop_seconds"]), 6),
            "rms_dbfs_quantiles": {
                str(q): round(float(np.quantile(valid_rms, q)), 3)
                for q in (0.1, 0.25, 0.5, 0.75, 0.9)
            },
        },
        "bands_hz": [[low, high] for low, high in BANDS_HZ],
        "regimes": regimes,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    print(f"wrote aggregate profile: {args.output}")
    for name, regime in regimes.items():
        bands = ", ".join(f"{value:.3f}" for value in regime["band_energy_fraction"])
        print(
            f"{name:>4}: {regime['rms_dbfs']:>7.2f} dBFS, "
            f"centroid {regime['spectral_centroid_hz']:>7.1f} Hz, bands [{bands}]"
        )


def _periodic_frequency(frequency_hz: float, seconds: float) -> float:
    return max(1.0 / seconds, round(frequency_hz * seconds) / seconds)


def _target_psd(
    frequencies: np.ndarray,
    bands: list[list[float]],
    fractions: list[float],
) -> np.ndarray:
    centers = np.asarray([math.sqrt(low * high) for low, high in bands], dtype=np.float64)
    widths = np.asarray([high - low for low, high in bands], dtype=np.float64)
    density = np.asarray(fractions, dtype=np.float64) / np.maximum(widths, 1.0)
    log_centers = np.log(np.maximum(centers, 1.0))
    log_density = np.log(np.maximum(density, 1e-14))
    safe_hz = np.maximum(frequencies, 1.0)
    interpolated = np.exp(
        np.interp(np.log(safe_hz), log_centers, log_density, left=log_density[0], right=log_density[-1])
    )
    interpolated[frequencies < bands[0][0]] *= np.square(
        np.clip(frequencies[frequencies < bands[0][0]] / bands[0][0], 0.0, 1.0)
    )
    interpolated[frequencies > bands[-1][1]] *= np.exp(
        -(frequencies[frequencies > bands[-1][1]] - bands[-1][1]) / 900.0
    )
    return interpolated


def _synthesize_regime(
    profile: dict[str, Any],
    regime_name: str,
    sample_rate: int,
    seconds: float,
    seed: int,
    target_rms_dbfs: float,
    modulation_depth: float = DEFAULT_MODULATION_DEPTH,
) -> np.ndarray:
    regime = profile["regimes"][regime_name]
    frames = int(round(sample_rate * seconds))
    frequencies = np.fft.rfftfreq(frames, 1.0 / sample_rate)
    psd = _target_psd(
        frequencies,
        profile["bands_hz"],
        regime["band_energy_fraction"],
    )
    rng = np.random.default_rng(seed)
    phase = rng.uniform(0.0, 2.0 * math.pi, frequencies.size)
    spectrum = np.sqrt(psd) * np.exp(1j * phase)
    spectrum[0] = 0.0
    if frames % 2 == 0:
        spectrum[-1] = complex(float(np.real(spectrum[-1])), 0.0)
    signal = np.fft.irfft(spectrum, n=frames)

    # Authored cockpit mechanics. Frequencies are quantized to whole loop cycles so every
    # generated bed remains seamless. These tones are not copied from the reference.
    time = np.arange(frames, dtype=np.float64) / sample_rate
    power = {"idle": 0.3, "mil": 0.68, "grit": 1.0}[regime_name]
    mechanics = np.zeros(frames, dtype=np.float64)
    for index, base_hz in enumerate((48.0, 63.5, 96.0)):
        hz = _periodic_frequency(base_hz + power * (6.0 + index * 4.0), seconds)
        tone_phase = rng.uniform(0.0, 2.0 * math.pi)
        mechanics += (0.12 / (index + 1)) * np.sin(2.0 * math.pi * hz * time + tone_phase)
    electrical_hz = _periodic_frequency(400.0, seconds)
    mechanics += (0.006 + power * 0.006) * np.sin(
        2.0 * math.pi * electrical_hz * time + rng.uniform(0.0, 2.0 * math.pi)
    )

    # Keep the bed stationary at a fixed operating point. Strong loop-synchronous AM reads as
    # an engine surging every few seconds once the buffer repeats; a restrained multi-rate field
    # retains microscopic life without becoming a false power cue.
    modulation = np.ones(frames, dtype=np.float64)
    for cycles, depth_ratio in ((1, 1.0), (3, 0.5), (7, 0.25)):
        modulation += modulation_depth * depth_ratio * (0.55 + 0.45 * power) * np.sin(
            2.0 * math.pi * cycles * time / seconds + rng.uniform(0.0, 2.0 * math.pi)
        )
    signal = signal / max(float(np.std(signal)), 1e-12)
    signal = signal * modulation + mechanics

    # Gentle saturation gives the body density of a camera mounted to a vibrating cockpit.
    drive = 0.95 + power * 0.85
    signal = np.tanh(signal * drive) / math.tanh(drive)
    target_rms = 10.0 ** (target_rms_dbfs / 20.0)
    signal *= target_rms / max(math.sqrt(float(np.mean(signal * signal))), 1e-12)
    peak = float(np.max(np.abs(signal)))
    if peak > 0.92:
        signal *= 0.92 / peak
    return signal


def synthesize(args: argparse.Namespace) -> None:
    profile = json.loads(args.profile.read_text(encoding="utf-8"))
    if profile.get("version") != PROFILE_VERSION:
        raise ValueError(f"unsupported profile version: {profile.get('version')}")
    target_levels = [float(value) for value in args.target_rms_dbfs.split(",")]
    if len(target_levels) != 3 or not all(math.isfinite(value) for value in target_levels):
        raise ValueError("--target-rms-dbfs requires idle,mil,grit values")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for index, regime in enumerate(("idle", "mil", "grit")):
        signal = _synthesize_regime(
            profile,
            regime,
            args.sample_rate,
            args.seconds,
            args.seed + index * 1009,
            target_levels[index],
            getattr(args, "modulation_depth", DEFAULT_MODULATION_DEPTH),
        )
        pcm = np.int16(np.clip(signal, -1.0, 1.0) * 32767.0)
        name = f"{args.prefix}_{regime}_{args.suffix}_loop.wav"
        path = args.output_dir / name
        wavfile.write(path, args.sample_rate, pcm)
        rms = 20.0 * math.log10(max(math.sqrt(float(np.mean(signal * signal))), 1e-12))
        print(f"wrote {path} ({args.seconds:.2f}s, {rms:.2f} dBFS RMS)")


def _float_pcm(data: np.ndarray) -> np.ndarray:
    if np.issubdtype(data.dtype, np.integer):
        scale = float(max(abs(np.iinfo(data.dtype).min), np.iinfo(data.dtype).max))
        return data.astype(np.float64) / scale
    return data.astype(np.float64)


def _seam_discontinuity(samples: np.ndarray) -> tuple[float, float]:
    audio = _float_pcm(samples)
    if audio.shape[0] < 2:
        return 0.0, 0.0
    if audio.ndim == 1:
        audio = audio[:, np.newaxis]
    seam = float(np.max(np.abs(audio[-1] - audio[0])))
    internal_p999 = float(np.quantile(np.abs(np.diff(audio, axis=0)), 0.999))
    return seam, internal_p999


def _encode_like(samples: np.ndarray, dtype: np.dtype[Any]) -> np.ndarray:
    if np.issubdtype(dtype, np.integer):
        info = np.iinfo(dtype)
        scale = float(max(abs(info.min), info.max))
        quantized = np.rint(np.clip(samples, -1.0, info.max / scale) * scale)
        return np.clip(quantized, info.min, info.max).astype(dtype)
    return samples.astype(dtype)


def condition_loop(args: argparse.Namespace) -> None:
    """Remove a hard WAV wrap with a deterministic equal-power overlap."""
    sample_rate, raw = wavfile.read(args.input)
    seam, internal_p999 = _seam_discontinuity(raw)
    threshold = max(args.min_jump, internal_p999 * args.seam_ratio)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if seam <= threshold:
        if args.input.resolve() != args.output.resolve():
            shutil.copyfile(args.input, args.output)
        print(
            f"already seamless {args.input} "
            f"(wrap {seam:.6f}, internal p99.9 {internal_p999:.6f})"
        )
        return

    audio = _float_pcm(raw)
    frames = audio.shape[0]
    crossfade_frames = int(round(sample_rate * args.crossfade_ms / 1000.0))
    crossfade_frames = max(32, min(crossfade_frames, frames // 4))
    if frames <= crossfade_frames * 2:
        raise ValueError("loop is too short for the requested wrap crossfade")

    # Overlap the tail with the original head, then drop that consumed head. The final output
    # sample follows immediately into its first sample in the source waveform, so Web Audio's
    # loop wrap has the same local continuity as an ordinary adjacent-sample boundary.
    conditioned = np.array(audio[crossfade_frames:], copy=True)
    phase = (
        np.arange(1, crossfade_frames + 1, dtype=np.float64)
        * (math.pi / 2.0)
        / crossfade_frames
    )
    tail_weight = np.cos(phase)
    head_weight = np.sin(phase)
    if audio.ndim > 1:
        tail_weight = tail_weight[:, np.newaxis]
        head_weight = head_weight[:, np.newaxis]
    conditioned[-crossfade_frames:] = (
        audio[-crossfade_frames:] * tail_weight
        + audio[:crossfade_frames] * head_weight
    )
    wavfile.write(args.output, sample_rate, _encode_like(conditioned, raw.dtype))
    next_seam, next_p999 = _seam_discontinuity(_encode_like(conditioned, raw.dtype))
    print(
        f"conditioned {args.output} ({args.crossfade_ms:.1f} ms overlap; "
        f"wrap {seam:.6f} -> {next_seam:.6f}, internal p99.9 {next_p999:.6f})"
    )


def self_test(_args: argparse.Namespace) -> None:
    """Exercise deterministic synthesis without requiring reference media."""
    profile = {
        "version": PROFILE_VERSION,
        "bands_hz": [[low, high] for low, high in BANDS_HZ],
        "regimes": {
            regime: {
                "band_energy_fraction": [0.24, 0.28, 0.25, 0.15, 0.08],
                "dominant_low_peaks_hz": [48.0, 96.0, 224.0],
            }
            for regime in REGIME_QUANTILES
        },
    }
    digest = hashlib.sha256()
    target_levels = (-24.0, -20.5, -18.5)
    for index, regime in enumerate(("idle", "mil", "grit")):
        seed = 20260728 + index * 1009
        first = _synthesize_regime(
            profile, regime, 8_000, 1.0, seed, target_levels[index]
        )
        repeated = _synthesize_regime(
            profile, regime, 8_000, 1.0, seed, target_levels[index]
        )
        if not np.array_equal(first, repeated):
            raise RuntimeError(f"{regime} synthesis is not deterministic")
        if first.size != 8_000 or not np.all(np.isfinite(first)):
            raise RuntimeError(f"{regime} synthesis produced an invalid buffer")
        digest.update(np.asarray(first, dtype="<f8").tobytes())
    print(f"self-test passed: sha256={digest.hexdigest()}")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    analyze_parser = commands.add_parser("analyze", help="write aggregate spectral profile JSON")
    analyze_parser.add_argument("--input", type=Path, required=True)
    analyze_parser.add_argument("--output", type=Path, required=True)
    analyze_parser.add_argument("--source-id", default="local-reference")
    analyze_parser.add_argument("--source-url", default="")
    analyze_parser.set_defaults(handler=analyze)

    synth_parser = commands.add_parser(
        "synthesize", help="create original seamless alternate beds from a profile"
    )
    synth_parser.add_argument("--profile", type=Path, required=True)
    synth_parser.add_argument("--output-dir", type=Path, required=True)
    synth_parser.add_argument("--prefix", default="f22")
    synth_parser.add_argument("--suffix", default="alt")
    synth_parser.add_argument("--sample-rate", type=int, default=44100)
    synth_parser.add_argument("--seconds", type=float, default=6.0)
    synth_parser.add_argument("--seed", type=int, default=20260728)
    synth_parser.add_argument(
        "--modulation-depth",
        type=float,
        default=DEFAULT_MODULATION_DEPTH,
        help="base loop-synchronous AM depth (default: 0.012; keep restrained for steady power)",
    )
    synth_parser.add_argument(
        "--target-rms-dbfs",
        default="-24,-20.5,-18.5",
        help="comma-separated idle,mil,grit production levels",
    )
    synth_parser.set_defaults(handler=synthesize)

    condition_parser = commands.add_parser(
        "condition-loop",
        help="remove a hard PCM loop boundary with an idempotent equal-power overlap",
    )
    condition_parser.add_argument("--input", type=Path, required=True)
    condition_parser.add_argument("--output", type=Path, required=True)
    condition_parser.add_argument("--crossfade-ms", type=float, default=80.0)
    condition_parser.add_argument("--seam-ratio", type=float, default=1.5)
    condition_parser.add_argument("--min-jump", type=float, default=0.02)
    condition_parser.set_defaults(handler=condition_loop)

    self_test_parser = commands.add_parser(
        "self-test",
        help="verify deterministic synthesis without downloading reference media",
    )
    self_test_parser.set_defaults(handler=self_test)
    return root


def main() -> None:
    args = parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
