"""How often does the opponent actually threaten the owner?

`report.py` answers "who is playing and how far do they get". It has no notion of
the player being SHOT, so it cannot answer the only question that grades the
opponent: does it ever kill you. This does.

BILLED, and deliberately so. `report.py --latest-owner` is bounded to one flight
on purpose; this widens to every owner session in the window, which on a 30-day
window is ~11,000 chunk reads. It therefore requires an explicit --i-know-this-is-billed.

    python3 tools/telemetry/opponent_pressure.py --days 30 --i-know-this-is-billed

Counts a sortie only when it carries real flight data (>= MINIMUM_SAMPLES), and
keeps "it shot me down" (DESTROYED_AIRBORNE) separate from "I flew into the
ground" (IMPACTED). Conflating those flatters the opponent.
"""
import argparse, collections, gzip, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import report as R

MINIMUM_SAMPLES = 20


def owner_sortie_stats(days, refresh):
    sessions = R.list_inventory(days, refresh)
    headers = R.load_headers(sessions, refresh)
    flight = [n for n in sessions if n.startswith("web-")]
    owner = [n for n in flight if R.is_owner((headers.get(n) or {}).get("ua", ""))]
    print(f"  owner sessions in {days}d: {len(owner)}", file=sys.stderr)
    R.deep_funnel(sessions, owner, refresh, label="owner")

    chunk_dir = os.path.join(R.CACHE, "chunks")
    sorties = {}
    for name in owner:
        state = None
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
                sortie_id = state.get("telemetry_sortie_id")
                if not sortie_id:
                    continue
                s = sorties.setdefault(sortie_id, {
                    "samples": 0, "opponent_hits": 0.0, "my_hits": 0.0,
                    "my_kills": 0.0, "terminal": None, "skill": None})
                s["samples"] += 1
                for field, key in (("opponent_hits", "opponent_hits"),
                                   ("sortie_hits", "my_hits"),
                                   ("kill_count", "my_kills")):
                    value = R.non_negative(state.get(field))
                    if value is not None:
                        s[key] = max(s[key], value)
                terminal = state.get("player_terminal_state")
                if terminal and terminal != "FLYING":
                    s["terminal"] = terminal
                if state.get("bandit_skill"):
                    s["skill"] = state.get("bandit_skill")
    return {k: v for k, v in sorties.items() if v["samples"] >= MINIMUM_SAMPLES}


def main():
    parser = argparse.ArgumentParser(description="Opponent pressure on the owner")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--i-know-this-is-billed", action="store_true",
                        help="required: this replays every owner session in the window")
    args = parser.parse_args()
    if not args.i_know_this_is_billed:
        sys.exit("refusing to run without --i-know-this-is-billed (see module docstring)")

    real = owner_sortie_stats(args.days, args.refresh)
    shot_down = [v for v in real.values()
                 if str(v["terminal"] or "").upper() == "DESTROYED_AIRBORNE"]
    impacted = [v for v in real.values()
                if str(v["terminal"] or "").upper() == "IMPACTED"]
    touched = [v for v in real.values() if v["opponent_hits"] > 0]
    killed = [v for v in real.values() if v["my_kills"] > 0]

    print("=" * 62)
    print(f"OPPONENT PRESSURE ON THE OWNER  ({args.days}d, "
          f"{len(real)} sorties with >= {MINIMUM_SAMPLES} samples)")
    print("=" * 62)
    print(f"  it landed any hit on you        {len(touched):>4}"
          f"   ({100.0 * len(touched) / max(1, len(real)):.0f}% of sorties)")
    print(f"  it SHOT YOU DOWN                {len(shot_down):>4}")
    print(f"  you flew into the ground        {len(impacted):>4}   (not its doing)")
    print(f"  you killed it                   {len(killed):>4}")
    print(f"  rounds it hit you with          {sum(v['opponent_hits'] for v in real.values()):>6.0f}")
    print(f"  rounds you hit it with          {sum(v['my_hits'] for v in real.values()):>6.0f}")
    print(f"  skill flown: {collections.Counter(v['skill'] for v in real.values()).most_common()}")


if __name__ == "__main__":
    main()
