#!/usr/bin/env python3
"""Condition the cleared OA-1K engine recording for the Fire Boss presentation.

Only DVIDS-derived PCM is accepted. The five broad spectral targets describe a
cockpit presentation informed by an AT-802 pilot-view reference; they contain no
reference PCM, phases, narrow tones, or music. This is an authored surrogate,
not a measured cockpit transfer function or a measured flight-power recording.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

SOURCE_SHA256 = 'bc9aafb9ee39d17105b7ac9bfcb9adc681e4b6599da20c1c8c350a4c834ff480'
BANDS = [(20, 80), (80, 250), (250, 800), (800, 2500), (2500, 8000)]
TARGET = np.array([0.27, 0.50, 0.17, 0.04, 0.02])


def fractions(x, rate):
    f, p = welch(x, rate, nperseg=rate)
    energy = np.array([p[(f >= low) & (f < high)].sum() for low, high in BANDS])
    return energy / energy.sum()


def condition(source, output):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError('Expected the reviewed DVIDS 640–665s native PCM; do not substitute reference audio')
    rate, raw = wavfile.read(source)
    if rate != 48000 or raw.shape != (1200000, 2) or raw.dtype != np.int32:
        raise ValueError('Expected 25 seconds of 48kHz stereo PCM24 decoded into int32')
    x = raw.astype(np.float64).mean(axis=1) / 2147483648
    x -= x.mean()
    before = fractions(x, rate)
    f = np.fft.rfftfreq(len(x), 1 / rate)
    spectrum = np.fft.rfft(x)
    centres = np.sqrt(np.prod(np.array(BANDS), axis=1))
    gain_db = np.zeros(len(BANDS))
    # Broad, smooth EQ retains the donor's actual timing and pressure fluctuations.
    # No synthesized oscillators or phase data from the reference enter this asset.
    for _ in range(5):
        response_db = np.interp(np.log(np.maximum(f, 1)), np.log(centres), gain_db)
        response = 10 ** (response_db / 20)
        response *= 1 / np.sqrt(1 + (24 / np.maximum(f, 0.01)) ** 8)
        response *= 1 / np.sqrt(1 + (f / 6500) ** 8)
        y = np.fft.irfft(spectrum * response, n=len(x))
        gain_db = np.clip(gain_db + 0.7 * 10 * np.log10(TARGET / fractions(y, rate)), -15, 15)
    # Join a full-energy tail to the head, never fade the loop to silence.
    overlap = rate
    theta = np.linspace(0, np.pi / 2, overlap, endpoint=False)
    seam = y[-overlap:] * np.cos(theta) + y[:overlap] * np.sin(theta)
    loop = np.concatenate((y[overlap:-overlap], seam))
    loop -= loop.mean()
    scale = min(10 ** (-19 / 20) / np.sqrt(np.mean(loop ** 2)), 10 ** (-4 / 20) / np.max(abs(loop)))
    pcm = np.rint(loop * scale * 32767).astype(np.int16)
    output.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(output, rate, pcm)
    final = pcm.astype(float) / 32768
    metadata = {
        'source_id': 'dvids.991792', 'source_interval_seconds': [640, 665],
        'source_pcm_sha256': digest, 'aircraft': 'OA-1K / AT-802 family',
        'source_perspective': 'exterior, stationary engine running',
        'presentation': 'authored Fire Boss cabin surrogate; not a cockpit recording',
        'sample_rate': rate, 'frames': len(pcm), 'seconds': len(pcm) / rate,
        'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'rms_dbfs': float(20 * np.log10(np.sqrt(np.mean(final ** 2)))),
        'peak_dbfs': float(20 * np.log10(np.max(abs(final)))),
        'bands_hz': BANDS, 'source_band_fractions': before.tolist(),
        'authored_target_band_fractions': TARGET.tolist(), 'output_band_fractions': fractions(final, rate).tolist(),
        'crossfade_seconds': 1, 'method': 'mono, broad smooth EQ, equal-power wrap, RMS/peak trim; no pitch shift',
    }
    output.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    condition(args.source, args.output)
