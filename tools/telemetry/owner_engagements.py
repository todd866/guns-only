"""Extract REAL engagement geometries from the owner's own flights.

Why this exists: the gun-conversion contracts grade the Ace against a scripted
probe, and a bandit that passes them lands a hit in 5% of the owner's sorties.
Passing them is therefore not evidence of a credible opponent. This turns the
owner's actual flights into the evaluation set — the geometries a competent
pilot really presents, rather than the ones a script does.

An ENGAGEMENT ENTRY is the tick where range crosses inbound through
ENTRY_RANGE_M while genuinely closing. Both aircraft's states at that tick
become one scenario. The bandit carries no published attitude of its own, so
its velocity is finite-differenced from position — honest, and the only thing
the scenario needs.

    python3 tools/telemetry/owner_engagements.py --days 30 --out analysis/owner-engagements.jsonl

Reads the same cache report.py fills, so it is free after opponent_pressure.py
has run; pass --i-know-this-is-billed only if chunks still need downloading.
"""
import argparse, gzip, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import report as R

ENTRY_RANGE_M = 2500.0
MINIMUM_CLOSURE_KTS = 40.0
MINIMUM_SAMPLES_PER_SORTIE = 20
POSITION_RANGE_TOLERANCE_M = 50.0


def finite(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def vec(state, ax, ay, az):
    x, y, z = finite(state.get(ax)), finite(state.get(ay)), finite(state.get(az))
    return None if None in (x, y, z) else (x, y, z)


def extract(days, refresh, allow_download):
    sessions = R.list_inventory(days, refresh)
    headers = R.load_headers(sessions, refresh)
    flight = [n for n in sessions if n.startswith("web-")]
    owner = [n for n in flight if R.is_owner((headers.get(n) or {}).get("ua", ""))]
    chunk_dir = os.path.join(R.CACHE, "chunks")
    missing = sum(
        1 for name in owner for blob in sessions[name]
        if not os.path.exists(os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))))
    if missing and not allow_download:
        sys.exit(f"{missing} owner chunks are not cached; re-run with --i-know-this-is-billed")
    if missing:
        R.deep_funnel(sessions, owner, refresh, label="owner")

    engagements = []
    sortie_samples = {}
    for name in owner:
        state, previous = None, None
        for blob in sorted(sessions[name], key=lambda i: i["uploadedAt"]):
            path = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(path):
                continue
            try:
                with gzip.open(path, "rt") as fh:
                    rows = [json.loads(line) for line in fh if line.strip()]
            except (OSError, ValueError, EOFError):
                continue
            for row in rows:
                if row.get("k") != "st":
                    continue
                state = R.replay_state(row, state)
                if not state:
                    continue
                sortie = state.get("telemetry_sortie_id")
                if not sortie:
                    continue
                sortie_samples[sortie] = sortie_samples.get(sortie, 0) + 1

                player = vec(state, "px", "py", "pz")
                bandit = vec(state, "bx", "by", "bz")
                rng = finite(state.get("range_m"))
                closure = finite(state.get("closure_kts"))
                if None in (player, bandit) or rng is None or closure is None:
                    previous = state
                    continue

                previousRange = finite((previous or {}).get("range_m"))
                crossedInbound = (previousRange is not None
                                  and previousRange > ENTRY_RANGE_M >= rng)
                # THE POSITIONS MUST DESCRIBE THE CONTACT range_m IS ABOUT. On 204 of 225
                # candidates they agree to a median of 0.03 m, but a handful disagree by
                # kilometres — a multi-contact sortie where bx/by/bz is the selected bandit while
                # range_m refers to another, or a target switch across the sample boundary. Those
                # would stage a merge that never happened, so reject them rather than trust them.
                positionRangeM = math.dist(player, bandit)
                consistent = abs(positionRangeM - rng) <= POSITION_RANGE_TOLERANCE_M
                if crossedInbound and closure >= MINIMUM_CLOSURE_KTS and consistent:
                    previousBandit = vec(previous, "bx", "by", "bz") if previous else None
                    banditVelocity = None
                    if previousBandit is not None:
                        # 20 Hz evidence cadence; a one-sample difference is the best available
                        # estimate of the bandit's velocity and is all the scenario needs.
                        banditVelocity = [(bandit[i] - previousBandit[i]) * 20.0 for i in range(3)]
                    engagements.append({
                        "session": name,
                        "sortie": sortie,
                        "range_m": rng,
                        "closure_kts": closure,
                        "player": {
                            "x": player[0], "y": player[1], "z": player[2],
                            "true_airspeed_kts": finite(state.get("true_airspeed_kts")),
                            "heading_deg": finite(state.get("heading_deg")),
                            "gamma_deg": finite(state.get("gamma_deg")),
                            "bank_deg": finite(state.get("bank_deg")),
                            "g_actual": finite(state.get("g_actual")),
                        },
                        "bandit": {
                            "x": bandit[0], "y": bandit[1], "z": bandit[2],
                            "velocity_mps": banditVelocity,
                            "skill": state.get("bandit_skill"),
                            "health": finite(state.get("bandit_health")),
                        },
                    })
                previous = state
    # Drop engagements from sorties that never carried real flight data.
    return [e for e in engagements
            if sortie_samples.get(e["sortie"], 0) >= MINIMUM_SAMPLES_PER_SORTIE]


def main():
    parser = argparse.ArgumentParser(description="Owner engagement geometries")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--out", default="analysis/owner-engagements.jsonl")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--i-know-this-is-billed", action="store_true")
    args = parser.parse_args()

    engagements = extract(args.days, args.refresh, args.i_know_this_is_billed)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as fh:
        for e in engagements:
            fh.write(json.dumps(e, sort_keys=True) + "\n")
    skills = {}
    for e in engagements:
        skills[e["bandit"]["skill"]] = skills.get(e["bandit"]["skill"], 0) + 1
    print(f"engagements extracted   {len(engagements)}")
    print(f"distinct sorties        {len({e['sortie'] for e in engagements})}")
    print(f"bandit skill            {sorted(skills.items(), key=lambda kv: -kv[1])}")
    print(f"written to              {args.out}")


if __name__ == "__main__":
    main()
