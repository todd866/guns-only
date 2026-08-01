#!/usr/bin/env python3
"""Turn cached production telemetry into a BFM regression corpus of REAL player tracks.

The bandit AI was tuned against hand-written synthetic players, and they were wrong in a way
that mattered: a scripted chaser holding altitude at full afterburner outruns a Flanker no
matter what the AI decides, so tests written around it graded the probe rather than the
opponent. Real sorties do not fly like that. They stall, they zoom to 79,000 ft, they lose
the bandit and wander, they reverse late.

This reads the LOCAL chunk cache only -- it never touches the network, and the production
retrieval rules in README.md continue to govern how that cache is filled. It emits one
compact, privacy-scrubbed JSON fixture that sim.Tests replays offline.

Usage:  python3 tools/telemetry/extract_bfm_fixtures.py [--out PATH] [--tracks N]

WHAT THE FIXTURE IS, AND IS NOT
-------------------------------
It is a set of real player flight paths. It is NOT a recording of a fight that can be
replayed to reproduce an outcome: the recorded human flew against the OLD bandit, so feeding
that path to a changed bandit is a counterfactual. Assert on the BANDIT's own behaviour
(containment, control health, whether it keeps its nose on the player) -- never on kills,
range histories, or anything that depends on the human reacting to what the bandit did.
"""
import argparse, gzip, hashlib, json, math, os, re, sys, collections

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHUNKS = os.path.join(REPO, "tmp", "telemetry-cache", "chunks")
DEFAULT_OUT = os.path.join(REPO, "sim.Tests", "fixtures", "real-player-tracks.json")

MERGE_MISSION = "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1"
SAMPLE_HZ = 10.0            # decimated from the native 20 Hz recorder cadence
MAX_TRACK_SECONDS = 40.0
MERGED_RANGE_M = 2000.0     # the authored 9 km run-in is not part of the fight
NM = 1852.0

CHUNK_NAME = re.compile(r"^telemetry_(.+?)_((?:batch|legacy)-.+)\.jsonl\.gz$")


def _rows(path):
    with gzip.open(path, "rt") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def session_states(chunk_paths):
    """Decode shallow-keyframe-delta-v1 into full states, in q order.

    A gap in the monotonic q sequence invalidates the delta chain: drop to the next
    keyframe rather than applying a delta to the wrong prior state (README.md).
    """
    samples = []
    for path in chunk_paths:
        state, last_q = None, None
        for row in _rows(path):
            if row.get("k") != "st":
                continue
            q = row.get("q")
            if "s" in row:
                state, last_q = dict(row["s"]), q
            elif "d" in row and state is not None:
                if last_q is not None and q is not None and q != last_q + 1:
                    state, last_q = None, None
                    continue
                state = dict(state)
                state.update(row["d"])
                for key in row.get("x", ()):
                    state.pop(key, None)
                last_q = q
            else:
                continue
            samples.append((q if q is not None else len(samples), state))
    samples.sort(key=lambda kv: kv[0])
    return [s for _, s in samples]


def _num(state, key):
    value = state.get(key)
    return value if isinstance(value, (int, float)) else None


def fight_samples(states):
    """The live, unpaused, post-merge portion of a modern-merge sortie."""
    if not states or states[0].get("mission_definition_id") != MERGE_MISSION:
        return []
    live = [s for s in states
            if s.get("session_phase") == "ACTIVE"
            and not s.get("paused")
            and s.get("bandit_alive")
            and _num(s, "range_m") is not None
            and _num(s, "px") is not None]
    first_merge = next((i for i, s in enumerate(live)
                        if _num(s, "range_m") < MERGED_RANGE_M), None)
    return live[first_merge:] if first_merge is not None else []


def to_track(states):
    """Decimate to SAMPLE_HZ and keep only what drives an ActorObservation.

    Velocity is DERIVED FROM POSITION, not from the reported gamma/heading fields. Those are
    a mix of nose attitude (heading_deg matches atan2(pfx,pfz) exactly) and air-mass-relative
    flight path, and with a 24 kt wind in the recording they do not reconcile with ground
    track. Position is unambiguous and is in the same world metres the sim stages from --
    verified: recorded merge starts read (1280, 3048, -4500), exactly Beats.cs.
    """
    stride = max(1, int(round(20.0 / SAMPLE_HZ)))
    picked = states[::stride][:int(MAX_TRACK_SECONDS * SAMPLE_HZ)]
    track = []
    for s in picked:
        track.append([round(_num(s, "px"), 1), round(_num(s, "py"), 1),
                      round(_num(s, "pz"), 1), round(_num(s, "bank_deg") or 0.0, 1)])
    return track


def label(session):
    """Stable pseudonym. Session ids and user agents never enter the fixture."""
    return "trk-" + hashlib.sha256(session.encode()).hexdigest()[:8]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--tracks", type=int, default=12)
    args = ap.parse_args()

    by_session = collections.defaultdict(list)
    for path in sorted(glob_chunks()):
        m = CHUNK_NAME.match(os.path.basename(path))
        if m:
            by_session[m.group(1)].append(path)

    candidates = []
    for session in sorted(by_session):
        fight = fight_samples(session_states(sorted(by_session[session])))
        if len(fight) < 200:                       # at least 10 s of real fight
            continue
        ranges = [_num(s, "range_m") for s in fight]
        alts = [_num(s, "alt_ft") or 0.0 for s in fight]
        candidates.append({
            "label": label(session),
            "seconds": round(len(fight) / 20.0, 1),
            "max_range_nm": round(max(ranges) / NM, 2),
            "max_alt_ft": round(max(alts)),
            "track": to_track(fight),
        })

    # Deterministic, behaviour-spanning selection: the widest-separating sorties (the reported
    # failure), the highest climbers (they arm the anti-camp ceiling guard), then the tightest
    # fights. Sorted by a stable key throughout so the fixture is reproducible.
    by_range = sorted(candidates, key=lambda c: (-c["max_range_nm"], c["label"]))
    by_alt = sorted(candidates, key=lambda c: (-c["max_alt_ft"], c["label"]))
    by_tight = sorted(candidates, key=lambda c: (c["max_range_nm"], c["label"]))
    chosen, seen = [], set()
    for bucket in (by_range, by_alt, by_tight):
        for c in bucket:
            if c["label"] not in seen and len(chosen) < args.tracks:
                seen.add(c["label"])
                chosen.append(c)
            if len(chosen) >= args.tracks:
                break
    chosen.sort(key=lambda c: c["label"])

    payload = {
        "schema": "guns-only.bfm-player-tracks.v1",
        "source": "local production telemetry chunk cache (no network read)",
        "mission": MERGE_MISSION,
        "sample_hz": SAMPLE_HZ,
        "frame": "sim world metres; sample = [px, py, pz, bank_deg]",
        "caveat": ("Recorded against the bandit of the day. Replaying a track against a "
                   "changed bandit is a counterfactual: assert on bandit behaviour, never "
                   "on outcomes that depend on the human reacting."),
        "population": {
            "sessions_considered": len(candidates),
            "exceeded_3nm": sum(1 for c in candidates if c["max_range_nm"] > 3.0),
            "exceeded_7nm": sum(1 for c in candidates if c["max_range_nm"] > 7.0),
            "climbed_above_19550ft": sum(1 for c in candidates if c["max_alt_ft"] > 19550),
        },
        "tracks": chosen,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{len(chosen)} tracks from {len(candidates)} sorties -> {args.out} "
          f"({os.path.getsize(args.out)/1024:.0f} KB)")
    for c in chosen:
        print(f"  {c['label']}  {c['seconds']:6.1f}s  max {c['max_range_nm']:5.2f} NM  "
              f"{c['max_alt_ft']:6.0f} ft  {len(c['track'])} samples")


def glob_chunks():
    import glob
    return glob.glob(os.path.join(CHUNKS, "*.gz"))


if __name__ == "__main__":
    sys.exit(main())
