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
SAMPLE_PERIOD_S = 0.05     # 20 Hz evidence cadence
REPLAY_WINDOW_S = 25.0


def finite(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def vec(state, ax, ay, az):
    x, y, z = finite(state.get(ax)), finite(state.get(ay)), finite(state.get(az))
    return None if None in (x, y, z) else (x, y, z)


def sortie_samples_from(sessions, owner, chunk_dir):
    """Replay every owner chunk into per-sortie sample lists, in tape order."""
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
                sortie = state.get("telemetry_sortie_id")
                if not sortie:
                    continue
                sorties.setdefault(sortie, {"session": name, "samples": []})
                sorties[sortie]["samples"].append(state)
    return sorties


def rounds_of(state):
    ledger = finite(state.get("sortie_rounds_fired"))
    return ledger if ledger is not None else finite(state.get("rounds_fired"))


def command_at(state):
    """The owner's actual stick and throttle on this tick, as a PilotCommand would carry it.

    THE REQUESTED FIELDS ARE THE PILOT'S ASK. `bank_target_deg` is an UNWRAPPED accumulator —
    measured range -737 to +1341 degrees, with 53% of samples beyond +/-180 — because the
    controller needs continuity across the seam. Reading it as a bank angle produced a
    behaviour-cloning label with a 7.7 rad standard deviation and a bank head that scored WORSE
    than predicting a constant. `requested_bank_target_deg` is the same quantity wrapped to
    +/-180, which is what the pilot actually asked for.
    """
    g = finite(state.get("requested_g_cmd"))
    if g is None:
        g = finite(state.get("g_cmd"))
    bank = finite(state.get("requested_bank_target_deg"))
    if bank is None:
        bank = finite(state.get("bank_target_deg"))
        if bank is not None:
            bank = (bank + 180.0) % 360.0 - 180.0
    throttle = finite(state.get("requested_throttle"))
    if throttle is None:
        throttle = finite(state.get("throttle"))
    if None in (g, bank, throttle) or abs(bank) > 180.0:
        return None
    return {"g_cmd": g, "bank_target_deg": bank, "throttle": throttle}


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
    for sortie, record in sortie_samples_from(sessions, owner, chunk_dir).items():
        samples = record["samples"]
        if len(samples) < MINIMUM_SAMPLES_PER_SORTIE:
            continue
        for index in range(1, len(samples)):
            state, previous = samples[index], samples[index - 1]
            player = vec(state, "px", "py", "pz")
            bandit = vec(state, "bx", "by", "bz")
            rng = finite(state.get("range_m"))
            closure = finite(state.get("closure_kts"))
            previousRange = finite(previous.get("range_m"))
            if None in (player, bandit) or rng is None or closure is None:
                continue
            if previousRange is None or not (previousRange > ENTRY_RANGE_M >= rng):
                continue
            if closure < MINIMUM_CLOSURE_KTS:
                continue
            # THE POSITIONS MUST DESCRIBE THE CONTACT range_m IS ABOUT. On 204 of 225 candidates
            # they agree to a median of 0.03 m, but a handful disagree by kilometres — a
            # multi-contact sortie where bx/by/bz is the selected bandit while range_m refers to
            # another. Those would stage a merge that never happened.
            if abs(math.dist(player, bandit) - rng) > POSITION_RANGE_TOLERANCE_M:
                continue

            previousBandit = vec(previous, "bx", "by", "bz")
            banditVelocity = None
            if previousBandit is not None:
                banditVelocity = [(bandit[i] - previousBandit[i]) * 20.0 for i in range(3)]

            # THE OWNER'S OWN INPUTS for the window after the merge. A replay is open-loop — it
            # diverges as soon as the opponent does something the tape did not contain — so it is
            # faithful early and decreasingly so after. The window is bounded for that reason.
            inputs = []
            for follow in range(index, len(samples)):
                command = command_at(samples[follow])
                if command is None:
                    continue
                command["t"] = (follow - index) * SAMPLE_PERIOD_S
                if command["t"] > REPLAY_WINDOW_S:
                    break
                # Trigger comes from the round ledger advancing, which is the only unambiguous
                # evidence in the tape that the owner actually fired on this tick.
                # sortie_rounds_fired is the monotone ledger where the build publishes it, but
                # these tapes carry only the engagement-local rounds_fired — reading the monotone
                # name alone silently reported that the owner never fires. Fall back, and treat a
                # DECREASE as the engagement-local counter resetting rather than as a shot.
                roundsNow = rounds_of(samples[follow])
                roundsBefore = rounds_of(samples[follow - 1]) if follow > 0 else None
                command["firing"] = bool(
                    roundsNow is not None and roundsBefore is not None
                    and roundsNow > roundsBefore)
                inputs.append(command)

            # Per-tick frames for behaviour cloning: the state the pilot saw and the controls he
            # used on that tick. Features are NOT computed here — HumanPilotFeatures owns that, in
            # one place, so the exporter and the flying clone cannot diverge.
            frames = []
            for follow in range(index, len(samples)):
                t = (follow - index) * SAMPLE_PERIOD_S
                if t > REPLAY_WINDOW_S:
                    break
                frame = samples[follow]
                framePlayer = vec(frame, "px", "py", "pz")
                frameBandit = vec(frame, "bx", "by", "bz")
                framePrevious = vec(samples[follow - 1], "bx", "by", "bz") if follow > 0 else None
                command = command_at(frame)
                if None in (framePlayer, frameBandit) or framePrevious is None or command is None:
                    continue
                frameRange = finite(frame.get("range_m"))
                if frameRange is None or abs(math.dist(framePlayer, frameBandit) - frameRange) \
                        > POSITION_RANGE_TOLERANCE_M:
                    continue
                speed = finite(frame.get("true_airspeed_kts"))
                heading = finite(frame.get("heading_deg"))
                gamma = finite(frame.get("gamma_deg"))
                bank = finite(frame.get("bank_deg"))
                if None in (speed, heading, gamma, bank):
                    continue
                roundsNow = rounds_of(frame)
                roundsBefore = rounds_of(samples[follow - 1]) if follow > 0 else None
                frames.append({
                    "t": t,
                    "player": {"x": framePlayer[0], "y": framePlayer[1], "z": framePlayer[2],
                               "true_airspeed_kts": speed, "heading_deg": heading,
                               "gamma_deg": gamma, "bank_deg": bank},
                    "bandit": {"x": frameBandit[0], "y": frameBandit[1], "z": frameBandit[2],
                               "velocity_mps": [(frameBandit[i] - framePrevious[i]) * 20.0
                                                for i in range(3)]},
                    "action": {"g_cmd": command["g_cmd"],
                               "bank_target_deg": command["bank_target_deg"],
                               "throttle": command["throttle"],
                               "firing": bool(roundsNow is not None and roundsBefore is not None
                                              and roundsNow > roundsBefore)},
                })

            engagements.append({
                "session": record["session"],
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
                "owner_inputs": inputs,
                "frames": frames,
            })
    return engagements


def main():
    parser = argparse.ArgumentParser(description="Owner engagement geometries")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--out", default="analysis/owner-engagements.jsonl")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--frames", default=None,
                        help="also write per-tick behaviour-cloning frames here")
    parser.add_argument("--i-know-this-is-billed", action="store_true")
    args = parser.parse_args()

    engagements = extract(args.days, args.refresh, args.i_know_this_is_billed)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    # Frames live beside the engagement file, not inside it, so the committed geometry set stays
    # small and reviewable while the behaviour-cloning dataset can be large.
    frameCount = 0
    framesByEngagement = [e.pop("frames", []) for e in engagements]
    with open(args.out, "w") as fh:
        for e in engagements:
            fh.write(json.dumps(e, sort_keys=True) + "\n")
    if args.frames:
        os.makedirs(os.path.dirname(args.frames) or ".", exist_ok=True)
        with open(args.frames, "w") as fh:
            for engagement, frames in zip(engagements, framesByEngagement):
                for frame in frames:
                    # The SORTIE is the split unit. Frames from one engagement are wildly
                    # correlated, so a random row split would put near-duplicates on both sides
                    # and report a validation score the clone has not earned.
                    frame["sortie"] = engagement["sortie"]
                    frameCount += 1
                    fh.write(json.dumps(frame, sort_keys=True) + "\n")
        print(f"frames written          {frameCount} -> {args.frames}")
    skills = {}
    for e in engagements:
        skills[e["bandit"]["skill"]] = skills.get(e["bandit"]["skill"], 0) + 1
    print(f"engagements extracted   {len(engagements)}")
    print(f"distinct sorties        {len({e['sortie'] for e in engagements})}")
    print(f"bandit skill            {sorted(skills.items(), key=lambda kv: -kv[1])}")
    withInputs = [e for e in engagements if len(e["owner_inputs"]) >= 40]
    print(f"with >=2 s of inputs    {len(withInputs)}")
    if withInputs:
        spans = sorted(e["owner_inputs"][-1]["t"] for e in withInputs)
        print(f"median input span       {spans[len(spans) // 2]:.1f} s")
    print(f"written to              {args.out}")


if __name__ == "__main__":
    main()
