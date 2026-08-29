#!/usr/bin/env python3
"""Clone the OWNER'S flying from his own recorded engagements.

The opponent has always been tuned and graded against a scripted probe. This
learns a policy from the pilot instead, so the fight can be trained and graded
against a model of the human who actually flies it.

Inputs are produced by sim.Tests PilotCloneDatasetTests.ExportTrainingRows,
which computes features through HumanPilotFeatures — the same code the flying
clone evaluates. This trainer never computes a feature itself; if it did, the
clone could learn one function and fly another.

SPLIT BY SORTIE. Frames inside one engagement are near-duplicates at 20 Hz, so
a random row split puts the same moment on both sides and reports a validation
score the clone has not earned.

    python3 tools/ai/train_pilot_clone.py \
        --rows analysis/owner-pilot-rows.jsonl \
        --out analysis/owner-pilot-clone.json
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

FEATURE_VERSION = 1
HEADS = ("g", "bank", "throttle")


def load(path):
    xs, ys, firing, sorties = [], [], [], []
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("v") != FEATURE_VERSION:
            raise SystemExit(
                f"row carries feature version {row.get('v')}, trainer expects {FEATURE_VERSION}; "
                "re-export the rows")
        xs.append(row["x"])
        ys.append([row["g"], row["bank"], row["throttle"]])
        firing.append(1.0 if row["firing"] else 0.0)
        sorties.append(row["sortie"])
    return (np.asarray(xs, dtype=np.float64), np.asarray(ys, dtype=np.float64),
            np.asarray(firing, dtype=np.float64), np.asarray(sorties))


def split_by_sortie(sorties, holdout_fraction, seed):
    unique = np.array(sorted(set(sorties.tolist())))
    rng = np.random.default_rng(seed)
    rng.shuffle(unique)
    cut = max(1, int(round(len(unique) * holdout_fraction)))
    validation = set(unique[:cut].tolist())
    mask = np.array([s in validation for s in sorties])
    return ~mask, mask, sorted(validation)


def standardise(train, full):
    mean = train.mean(axis=0)
    scale = train.std(axis=0)
    scale[scale < 1e-8] = 1.0
    return (full - mean) / scale, mean, scale


def init_layer(rng, fan_in, fan_out):
    limit = math.sqrt(6.0 / (fan_in + fan_out))
    return rng.uniform(-limit, limit, size=(fan_in, fan_out)), np.zeros(fan_out)


def forward(params, x):
    h1 = np.tanh(x @ params["w1"] + params["b1"])
    h2 = np.tanh(h1 @ params["w2"] + params["b2"])
    out = h2 @ params["w3"] + params["b3"]
    return h1, h2, out


def train(x, y, firing, train_mask, hidden, epochs, batch, learning_rate, seed, verbose=True):
    rng = np.random.default_rng(seed)
    positives = float(firing[train_mask].mean())
    firing_weight = (1.0 - positives) / positives if positives > 1e-6 else 1.0
    if verbose:
        print(f"  firing base rate {positives * 100:.2f}%  ->  positive weight {firing_weight:.1f}")
    xt, mean, scale = standardise(x[train_mask], x)
    yt, ymean, yscale = standardise(y[train_mask], y)
    targets = np.hstack([yt, firing[:, None]])

    features = x.shape[1]
    params = {}
    params["w1"], params["b1"] = init_layer(rng, features, hidden)
    params["w2"], params["b2"] = init_layer(rng, hidden, hidden)
    params["w3"], params["b3"] = init_layer(rng, hidden, 4)
    state = {k: (np.zeros_like(v), np.zeros_like(v)) for k, v in params.items()}

    indices = np.flatnonzero(train_mask)
    step = 0
    for epoch in range(epochs):
        rng.shuffle(indices)
        for start in range(0, len(indices), batch):
            take = indices[start:start + batch]
            xb, tb = xt[take], targets[take]
            h1, h2, out = forward(params, xb)
            # Regression heads on the three controls; the firing head is a logit.
            error = np.zeros_like(out)
            error[:, :3] = (out[:, :3] - tb[:, :3]) / len(take)
            # THE PILOT FIRES ON 0.6% OF TICKS. Unweighted, the head's best move is to never fire,
            # which scores 99.4% "accuracy" and has precision and recall of exactly zero — measured.
            # Weight the positives back to parity so the gradient is about when he shoots rather
            # than about how rarely he does.
            probability = 1.0 / (1.0 + np.exp(-out[:, 3]))
            weight = np.where(tb[:, 3] > 0.5, firing_weight, 1.0)
            error[:, 3] = weight * (probability - tb[:, 3]) / len(take)

            grads = {}
            grads["w3"] = h2.T @ error
            grads["b3"] = error.sum(axis=0)
            d2 = (error @ params["w3"].T) * (1.0 - h2 ** 2)
            grads["w2"] = h1.T @ d2
            grads["b2"] = d2.sum(axis=0)
            d1 = (d2 @ params["w2"].T) * (1.0 - h1 ** 2)
            grads["w1"] = xb.T @ d1
            grads["b1"] = d1.sum(axis=0)

            step += 1
            for key in params:
                m, v = state[key]
                m = 0.9 * m + 0.1 * grads[key]
                v = 0.999 * v + 0.001 * (grads[key] ** 2)
                state[key] = (m, v)
                mhat = m / (1.0 - 0.9 ** step)
                vhat = v / (1.0 - 0.999 ** step)
                params[key] = params[key] - learning_rate * mhat / (np.sqrt(vhat) + 1e-8)
        if verbose and (epoch + 1) % max(1, epochs // 5) == 0:
            print(f"  epoch {epoch + 1:3d}/{epochs}", flush=True)
    return params, (mean, scale, ymean, yscale), xt, targets


def evaluate(params, xt, targets, mask, ymean, yscale):
    _, _, out = forward(params, xt[mask])
    predicted = out[:, :3] * yscale + ymean
    actual = targets[mask, :3] * yscale + ymean
    result = {}
    for i, head in enumerate(HEADS):
        residual = predicted[:, i] - actual[:, i]
        spread = actual[:, i].std()
        result[head] = {
            "mae": float(np.abs(residual).mean()),
            "rmse": float(np.sqrt((residual ** 2).mean())),
            # Against predicting the pilot's own mean. Above 1.0 is worse than a constant.
            "rmse_over_constant": float(np.sqrt((residual ** 2).mean()) / spread)
            if spread > 1e-9 else float("nan"),
        }
    # ACCURACY IS MEANINGLESS HERE. The pilot fires on about 0.6% of ticks, so "never fire"
    # scores 99.4% and looks excellent. Report what a rare-event head is actually worth.
    probability = 1.0 / (1.0 + np.exp(-out[:, 3]))
    label = targets[mask, 3] > 0.5
    predicted = probability > 0.5
    truePositive = float((predicted & label).sum())
    falsePositive = float((predicted & ~label).sum())
    falseNegative = float((~predicted & label).sum())
    result["firing"] = {
        "base_rate": float(label.mean()),
        "accuracy_do_not_trust_this": float((predicted == label).mean()),
        "precision": truePositive / (truePositive + falsePositive)
        if truePositive + falsePositive > 0 else 0.0,
        "recall": truePositive / (truePositive + falseNegative)
        if truePositive + falseNegative > 0 else 0.0,
        "predicted_positive": int(predicted.sum()),
    }
    # Throttle is a DETENT, not a continuum: the pilot sits at idle or in burner, so an RMSE
    # against its own mean cannot tell a useful clone from a useless one. Score the choice.
    throttleActual = targets[mask, 2] * yscale[2] + ymean[2]
    throttlePredicted = out[:, 2] * yscale[2] + ymean[2]
    midpoint = 0.5 * (float(np.percentile(throttleActual, 5))
                      + float(np.percentile(throttleActual, 95)))
    result["throttle"]["detent_midpoint"] = midpoint
    result["throttle"]["detent_agreement"] = float(
        ((throttlePredicted > midpoint) == (throttleActual > midpoint)).mean())
    return result


def reference_cases(params, x, ymean, yscale, mean, scale, count=8):
    """A few raw feature vectors and the exact outputs this trainer produces for them."""
    step = max(1, len(x) // count)
    cases = []
    for i in range(0, min(len(x), step * count), step):
        raw = x[i]
        standardised = ((raw - mean) / scale)[None, :]
        _, _, out = forward(params, standardised)
        controls = out[0, :3] * yscale + ymean
        cases.append({
            "x": raw.tolist(),
            "g": float(controls[0]),
            "bank": float(controls[1]),
            "throttle": float(controls[2]),
            "firing_logit": float(out[0, 3]),
        })
    return cases


def main():
    parser = argparse.ArgumentParser(description="Behaviour-clone the owner's flying")
    parser.add_argument("--rows", default="analysis/owner-pilot-rows.jsonl")
    parser.add_argument("--out", default="analysis/owner-pilot-clone.json")
    parser.add_argument("--hidden", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=3e-3)
    parser.add_argument("--holdout", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=20260829)
    args = parser.parse_args()

    x, y, firing, sorties = load(args.rows)
    train_mask, validation_mask, heldout = split_by_sortie(sorties, args.holdout, args.seed)
    print(f"rows {len(x)}  train {int(train_mask.sum())}  validation {int(validation_mask.sum())}")
    print(f"sorties held out: {len(heldout)} of {len(set(sorties.tolist()))}")

    params, (mean, scale, ymean, yscale), xt, targets = train(
        x, y, firing, train_mask, args.hidden, args.epochs, args.batch,
        args.learning_rate, args.seed)

    metrics = {
        "train": evaluate(params, xt, targets, train_mask, ymean, yscale),
        "validation": evaluate(params, xt, targets, validation_mask, ymean, yscale),
    }
    print(json.dumps(metrics["validation"], indent=2))

    manifest = {
        "kind": "pilot-clone",
        "feature_version": FEATURE_VERSION,
        "hidden": args.hidden,
        "input_mean": mean.tolist(),
        "input_scale": scale.tolist(),
        "output_mean": ymean.tolist(),
        "output_scale": yscale.tolist(),
        "w1": params["w1"].tolist(), "b1": params["b1"].tolist(),
        "w2": params["w2"].tolist(), "b2": params["b2"].tolist(),
        "w3": params["w3"].tolist(), "b3": params["b3"].tolist(),
        "heads": list(HEADS) + ["firing_logit"],
        "metrics": metrics,
        "held_out_sorties": heldout,
        # SELF-CHECK. The C# policy recomputes these from the raw feature vectors and refuses the
        # manifest if it disagrees. Without it, a change to either forward pass would let the clone
        # fly a different function from the one that was trained, and nothing would report it.
        "reference_cases": reference_cases(params, x, ymean, yscale, mean, scale),
    }
    Path(args.out).write_text(json.dumps(manifest, sort_keys=True) + "\n")
    print(f"manifest -> {args.out}")


if __name__ == "__main__":
    main()
