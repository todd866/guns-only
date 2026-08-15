#!/usr/bin/env python3
"""Who is actually playing Guns Only, and how far do they get?

Reads the private telemetry store through the audited bounded client
(tools/telemetry/admin.mjs) — this module never talks to Blob directly, so the
transfer limits, ETag checks and fail-closed behaviour in that client still apply.

Two tiers:

  cheap (default)  one metadata list walk, then one small chunk per session to
                   recover its header row (build + user agent). Answers "how many
                   distinct people, on what devices, arriving from where".

  --deep           additionally downloads every chunk belonging to a visitor
                   session and replays the state rows. Answers "did they fly, did
                   they shoot, did they hit anything". Costs real Blob egress.

  --latest-owner   additionally replays only the most recent dev-Mac flight. This
                   is the bounded owner-debug path: it never widens to all owner
                   sessions and reports RTB/guidance and gun-assist evidence.

Everything is cached under tmp/telemetry-cache/, so a second run is nearly free.
"""

import argparse
import collections
import concurrent.futures
import datetime as dt
import glob
import gzip
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(REPO, "tmp", "telemetry-cache")
ADMIN = os.path.join(REPO, "tools", "telemetry", "admin.mjs")

# The dev machine. Sessions matching these are the author testing, not visitors.
OWNER_UA_MARKERS = (
    "Macintosh; Intel Mac OS X 10_15_7",
)

SESSION_RE = re.compile(r"telemetry/((?:web|shell)-(\d{13})-\d+)/(.+)\.jsonl\.gz$")


# ---------------------------------------------------------------- transport

def admin(args, output=None):
    """One bounded call through admin.mjs. Returns parsed JSON, or None on failure."""
    cmd = ["node", ADMIN] + args
    if output:
        cmd += ["--output", output]
    proc = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    if output:
        try:
            with open(output) as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return None
    return None


def fetch_chunk(url, size, etag, out):
    if os.path.exists(out):
        return True
    ok = subprocess.run(
        ["node", ADMIN, "get", "--url", url, "--expected-size", str(size),
         "--etag", etag.strip('"'), "--output", out],
        cwd=REPO, capture_output=True, text=True,
    ).returncode == 0
    return ok


def parallel(jobs, workers=12):
    """Run fetch jobs concurrently; returns how many succeeded."""
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for ok in pool.map(lambda j: fetch_chunk(*j), jobs):
            done += 1 if ok else 0
    return done


# ---------------------------------------------------------------- inventory

def window_prefixes(days):
    """Session ids embed epoch milliseconds, so a numeric prefix is a time filter.

    Four leading digits of the millisecond clock span ~11.6 days, which keeps the
    list walk proportional to the window asked for instead of the whole store.
    """
    now = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)
    cutoff = now - days * 86_400_000
    prefixes = set()
    for ms in (cutoff, now):
        stamp = str(ms)[:4]
        prefixes.add(f"telemetry/web-{stamp}")
        prefixes.add(f"telemetry/shell-{stamp}")
    return sorted(prefixes), cutoff


def list_inventory(days, refresh):
    """Walk one metadata page at a time. Metadata listing is cheap; bodies are not."""
    os.makedirs(os.path.join(CACHE, "list"), exist_ok=True)
    prefixes, cutoff = window_prefixes(days)
    blobs = []
    for prefix in prefixes:
        cursor, page = None, 0
        while True:
            path = os.path.join(CACHE, "list", f"{prefix.replace('/', '_')}-{page}.json")
            if refresh and os.path.exists(path):
                os.remove(path)
            data = json.load(open(path)) if os.path.exists(path) else None
            if data is None:
                args = ["list", "--prefix", prefix, "--limit", "100"]
                if cursor:
                    args += ["--cursor", cursor]
                data = admin(args, output=path)
                if data is None:
                    break
            blobs += data["blobs"]
            if not data.get("hasMore"):
                break
            cursor, page = data.get("cursor"), page + 1
            if cursor is None:
                break
    sessions = collections.defaultdict(list)
    for blob in blobs:
        match = SESSION_RE.match(blob["pathname"])
        if match and int(match.group(2)) >= cutoff:
            sessions[match.group(1)].append(blob)
    return sessions


def load_headers(sessions, refresh):
    """One small chunk per session recovers its header row (build + user agent)."""
    hdr_dir = os.path.join(CACHE, "hdrs")
    chunk_dir = os.path.join(CACHE, "tmpchunks")
    os.makedirs(hdr_dir, exist_ok=True)
    os.makedirs(chunk_dir, exist_ok=True)
    jobs, pending = [], {}
    for name, blobs in sessions.items():
        target = os.path.join(hdr_dir, name + ".json")
        if os.path.exists(target) and not refresh:
            continue
        smallest = min(blobs, key=lambda b: b["size"])
        tmp = os.path.join(chunk_dir, name + ".jsonl.gz")
        jobs.append((smallest["url"], smallest["size"], smallest["etag"], tmp))
        pending[name] = (tmp, target)
    if jobs:
        print(f"  fetching {len(jobs)} session headers…", file=sys.stderr)
        parallel(jobs)
    for name, (tmp, target) in pending.items():
        try:
            with gzip.open(tmp, "rt") as fh:
                for line in fh:
                    row = json.loads(line)
                    if row.get("k") == "hdr":
                        json.dump(row, open(target, "w"))
                        break
        except (OSError, ValueError, EOFError):
            pass
        if os.path.exists(tmp):
            os.remove(tmp)
    headers = {}
    for name in sessions:
        path = os.path.join(hdr_dir, name + ".json")
        if os.path.exists(path):
            headers[name] = json.load(open(path))
    return headers


# ---------------------------------------------------------------- classify

def is_owner(ua):
    return any(marker in ua for marker in OWNER_UA_MARKERS)


def platform(ua):
    if "iPhone" in ua:
        return "iPhone"
    if "iPad" in ua:
        return "iPad"
    if "Android" in ua:
        return "Android"
    if "Macintosh" in ua:
        return "Mac"
    if "Windows" in ua:
        return "Windows"
    if "Linux" in ua or "X11" in ua:
        return "Linux"
    return "unknown"


def arrival(ua):
    """Meta's in-app browsers identify themselves, which is our only referrer signal."""
    if "Barcelona" in ua:
        return "Threads"
    if "FBAN/FBIOS" in ua or "FB_IAB" in ua:
        return "Facebook"
    if "Instagram" in ua:
        return "Instagram"
    if "; wv)" in ua:
        return "Android in-app"
    if "CriOS" in ua:
        return "Chrome (iOS)"
    if "FxiOS" in ua or "Firefox" in ua:
        return "Firefox"
    if "OPR/" in ua:
        return "Opera"
    if "Edg/" in ua:
        return "Edge"
    if "Chrome" in ua:
        return "Chrome"
    if "Safari" in ua:
        return "Safari"
    return "unknown"


def device_model(ua):
    match = re.search(r"\((iPhone\d+,\d+); iOS", ua)
    if match:
        return match.group(1)
    match = re.search(r"Android \d+; ([^;)]+?) Build/", ua)
    return match.group(1).strip() if match else None


# ---------------------------------------------------------------- gameplay

def replay_state(row, previous):
    keyframe = row.get("s")
    if isinstance(keyframe, dict):
        return dict(keyframe)
    delta = row.get("d")
    if previous is None or not isinstance(delta, dict):
        return None
    state = dict(previous)
    state.update(delta)
    for key in row.get("x") or []:
        state.pop(key, None)
    return state


def non_negative(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def deep_funnel(sessions, visitors, refresh, label="visitor"):
    """Download every selected session chunk and replay it. This is the billed path."""
    chunk_dir = os.path.join(CACHE, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)
    jobs = []
    for name in visitors:
        for blob in sorted(sessions[name], key=lambda item: item["uploadedAt"]):
            out = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(out) or refresh:
                jobs.append((blob["url"], blob["size"], blob["etag"], out))
    if jobs:
        print(f"  downloading {len(jobs)} {label} chunks…", file=sys.stderr)
        parallel(jobs)

    stats = collections.defaultdict(
        lambda: {
            "flew": False,
            "rounds": 0.0,
            "hits": 0.0,
            "kills": 0.0,
            "sorties": set(),
            "sparred": False,
            "graduated": False,
            "touch_ready": False,
            "frame_governor": 0,
            "max_phase": None,
        })
    phase_rank = {"READY": 1, "ACTIVE": 2, "PAUSED": 2, "FINISHED": 3}
    for name in visitors:
        # SEMANTICS, identical on both wire vintages: rounds / hits / kills are the visitor's BEST
        # SINGLE SORTIE, never a lifetime sum. That is what max(kill_count) has always meant here,
        # and all three underlying counters are cleared when a sortie is staged.
        #
        # rounds_fired needs no repair and gets none: continuous combat re-stages the player's gun
        # through GunKill.CreateReplacementTarget, which carries RoundsFired FORWARD precisely so
        # cumulative fire evidence stays continuous, so the raw field is already the running sortie
        # total and max() over it is already the honest answer.
        #
        # `hits` is the one that genuinely resets — the staged successor's damage ledger starts
        # clean — so a plain max() reported only the LAST engagement of each sortie. Build 265+
        # tapes carry the monotone sortie_hits ledger. Older tapes are reconstructed by summing
        # each engagement's contribution, and the running total is kept per sortie id so the sum
        # never crosses a sortie boundary (which would silently switch this metric to a lifetime
        # sum) and never restarts at a chunk boundary mid-sortie (which would double-count).
        hits_recon = collections.defaultdict(lambda: {"total": 0.0, "last": None})
        entry, state = stats[name], None
        for blob in sorted(sessions[name], key=lambda item: item["uploadedAt"]):
            path = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(path):
                continue
            try:
                with gzip.open(path, "rt") as fh:
                    rows = [json.loads(line) for line in fh if line.strip()]
            except (OSError, ValueError, EOFError):
                continue
            for row in rows:
                kind = row.get("k")
                if kind == "in" and row.get("type") == "lifecycle" \
                        and row.get("code") == "sortie_started":
                    entry["flew"] = True
                elif kind == "in" and row.get("type") == "mobile_control" \
                        and row.get("code") == "touch_ready":
                    entry["touch_ready"] = True
                elif kind == "in" and row.get("type") == "perf" \
                        and row.get("code") == "FrameGovernor":
                    entry["frame_governor"] += 1
                elif kind == "st":
                    state = replay_state(row, state)
                    if not state:
                        continue
                    presenting = state.get("bandit_presenting")
                    if presenting is True:
                        entry["sparred"] = True
                    elif presenting is False and entry["sparred"]:
                        entry["graduated"] = True
                    phase = state.get("session_phase")
                    if isinstance(phase, str):
                        current = entry["max_phase"]
                        if current is None or phase_rank.get(phase, 0) >= phase_rank.get(current, 0):
                            entry["max_phase"] = phase
                    sortie = state.get("telemetry_sortie_id")
                    if sortie:
                        entry["sorties"].add(sortie)
                    value = non_negative(state.get("kill_count"))
                    if value is not None:
                        entry["kills"] = max(entry["kills"], value)
                    value = non_negative(state.get("rounds_fired"))
                    if value is not None:
                        entry["rounds"] = max(entry["rounds"], value)
                    ledger = non_negative(state.get("sortie_hits"))
                    if ledger is not None:
                        entry["hits"] = max(entry["hits"], ledger)
                    else:
                        value = non_negative(state.get("hits"))
                        if value is not None:
                            recon = hits_recon[sortie]
                            last = recon["last"]
                            # A drop is a new weapon graph, whose damage ledger
                            # starts at zero.
                            recon["total"] += value \
                                if last is None or value < last else value - last
                            recon["last"] = value
                            entry["hits"] = max(entry["hits"], recon["total"])
    return stats


def latest_owner_diagnostics(sessions, name, refresh):
    """Replay one owner flight and retain enough evidence to explain a bad sortie."""
    deep_funnel(sessions, [name], refresh, label="latest-owner")
    chunk_dir = os.path.join(CACHE, "chunks")
    result = {
        "session": name,
        "samples": 0,
        "mission_numbers": set(),
        "airframes": set(),
        "rounds": 0.0,
        "hits": 0.0,
        "assist_active_samples": 0,
        "assist_status": collections.Counter(),
        "assist_lead_error_sum": 0.0,
        "assist_lead_error_samples": 0,
        "assist_lead_error_max": 0.0,
        "rtb_intent_samples": 0,
        "approach_active_samples": 0,
        "approach_with_gates_samples": 0,
        "approach_gate_distance_min_m": None,
        "approach_gate_distance_max_m": None,
        "recovery_known_samples": 0,
        "mesh_home_samples": 0,
        "guidance_mode": collections.Counter(),
        "guidance_suppression": collections.Counter(),
    }
    state = None
    sortie_stats = {}
    sortie_order = []
    for blob in sorted(sessions[name], key=lambda item: item["uploadedAt"]):
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
            state = replay_state(row, state)
            if not state:
                continue
            result["samples"] += 1
            sortie_id = state.get("telemetry_sortie_id")
            sortie = None
            if sortie_id:
                if sortie_id not in sortie_stats:
                    sortie_order.append(sortie_id)
                    sortie_stats[sortie_id] = {
                        "id": sortie_id, "airframe": None, "samples": 0,
                        "rounds": 0.0, "hits": 0.0, "assist_active_samples": 0,
                        "rtb_intent_samples": 0, "approach_active_samples": 0,
                    }
                sortie = sortie_stats[sortie_id]
                sortie["samples"] += 1
            mission = state.get("mission_number")
            if mission is not None:
                result["mission_numbers"].add(str(mission))
            airframe = state.get("player_aircraft_name") or state.get("player_aircraft_id")
            if airframe:
                result["airframes"].add(str(airframe))
                if sortie is not None:
                    sortie["airframe"] = str(airframe)
            for key in ("rounds_fired", "sortie_hits"):
                value = non_negative(state.get(key))
                if value is not None:
                    target = "rounds" if key == "rounds_fired" else "hits"
                    result[target] = max(result[target], value)
                    if sortie is not None:
                        sortie[target] = max(sortie[target], value)
            assist_active = state.get("gunnery_pitch_assist") is True
            if assist_active:
                result["assist_active_samples"] += 1
                if sortie is not None:
                    sortie["assist_active_samples"] += 1
            status_code = state.get("gunnery_assist_status_code")
            status = status_code if status_code is not None \
                else state.get("gunnery_assist_status")
            if status is not None:
                result["assist_status"][str(status)] += 1
            lead = non_negative(state.get("gunnery_total_lead_error_deg"))
            if assist_active and lead is not None:
                result["assist_lead_error_sum"] += lead
                result["assist_lead_error_samples"] += 1
                result["assist_lead_error_max"] = max(result["assist_lead_error_max"], lead)
            rtb = state.get("player_rtb_active") is True \
                or state.get("rtb_steer") is True \
                or state.get("carrier_sortie_route_rtb_requested") is True
            if rtb:
                result["rtb_intent_samples"] += 1
                if sortie is not None:
                    sortie["rtb_intent_samples"] += 1
            if state.get("approach_guidance_active") is True:
                result["approach_active_samples"] += 1
                if sortie is not None:
                    sortie["approach_active_samples"] += 1
                gates = state.get("approach_gates")
                gate_count = int(non_negative(state.get("approach_gate_count")) or 0)
                valid_gates = gates[:gate_count] if isinstance(gates, list) else []
                if valid_gates:
                    result["approach_with_gates_samples"] += 1
                    px, pz = state.get("px"), state.get("pz")
                    if isinstance(px, (int, float)) and isinstance(pz, (int, float)):
                        for gate in valid_gates:
                            east, north = gate.get("east_m"), gate.get("north_m")
                            if isinstance(east, (int, float)) and isinstance(north, (int, float)):
                                distance = ((east - px) ** 2 + (north - pz) ** 2) ** 0.5
                                lo = result["approach_gate_distance_min_m"]
                                hi = result["approach_gate_distance_max_m"]
                                result["approach_gate_distance_min_m"] = distance \
                                    if lo is None else min(lo, distance)
                                result["approach_gate_distance_max_m"] = distance \
                                    if hi is None else max(hi, distance)
            if state.get("recovery_point_known") is True:
                result["recovery_known_samples"] += 1
            if isinstance(state.get("mesh_home_east_m"), (int, float)) \
                    and isinstance(state.get("mesh_home_north_m"), (int, float)):
                result["mesh_home_samples"] += 1
            mode = state.get("presentation_guidance_mode")
            if mode:
                result["guidance_mode"][str(mode)] += 1
            suppression = state.get("presentation_guidance_suppression")
            if suppression:
                result["guidance_suppression"][str(suppression)] += 1
    result["mission_numbers"] = sorted(result["mission_numbers"])
    result["airframes"] = sorted(result["airframes"])
    result["assist_status"] = dict(result["assist_status"])
    result["guidance_mode"] = dict(result["guidance_mode"])
    result["guidance_suppression"] = dict(result["guidance_suppression"])
    samples = result.pop("assist_lead_error_samples")
    total = result.pop("assist_lead_error_sum")
    result["assist_lead_error_avg"] = total / samples if samples else None
    result["sorties"] = [sortie_stats[sortie_id] for sortie_id in sortie_order]
    result["latest_sortie"] = result["sorties"][-1] if result["sorties"] else None
    return result


def shell_health_summary(sessions, shell_names, refresh):
    """Aggregate always-on shell-health milestones and fatals."""
    chunk_dir = os.path.join(CACHE, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)
    jobs = []
    for name in shell_names:
        for blob in sessions[name]:
            out = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(out) or refresh:
                jobs.append((blob["url"], blob["size"], blob["etag"], out))
    if jobs:
        print(f"  downloading {len(jobs)} shell-health chunks…", file=sys.stderr)
        parallel(jobs)

    milestones = collections.Counter()
    fatals = collections.Counter()
    platforms = collections.Counter()
    arrivals = collections.Counter()
    farthest = collections.Counter()
    order = ["script_load", "bridge_ready", "webgl_ok", "ready", "active"]
    for name in shell_names:
        reached = set()
        platform_name = "unknown"
        arrival_name = "unknown"
        for blob in sessions[name]:
            path = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(path):
                continue
            try:
                with gzip.open(path, "rt") as fh:
                    rows = [json.loads(line) for line in fh if line.strip()]
            except (OSError, ValueError, EOFError):
                continue
            for row in rows:
                if row.get("k") == "hdr":
                    platform_name = row.get("platform") or platform_name
                    arrival_name = row.get("arrival") or arrival_name
                elif row.get("k") == "in" and row.get("type") == "shell_health":
                    if row.get("code") == "milestone" and row.get("milestone"):
                        reached.add(row["milestone"])
                        milestones[row["milestone"]] += 1
                    elif row.get("code") == "fatal":
                        fatals[row.get("reason") or "unknown"] += 1
        platforms[platform_name] += 1
        arrivals[arrival_name] += 1
        last = "none"
        for milestone in order:
            if milestone in reached:
                last = milestone
        farthest[last] += 1
    return {
        "sessions": len(shell_names),
        "platforms": dict(platforms),
        "arrivals": dict(arrivals),
        "milestones": dict(milestones),
        "fatals": dict(fatals),
        "farthest": dict(farthest),
    }


# ---------------------------------------------------------------- report

def main():
    parser = argparse.ArgumentParser(description="Guns Only player report")
    parser.add_argument("--days", type=int, default=7, help="window to report on (default 7)")
    parser.add_argument("--deep", action="store_true",
                        help="also replay visitor sessions for the combat funnel (billed)")
    parser.add_argument("--latest-owner", action="store_true",
                        help="replay only the latest dev-Mac flight for diagnostics (billed)")
    parser.add_argument("--refresh", action="store_true", help="ignore cached data")
    parser.add_argument("--json", help="also write the raw result to this path")
    args = parser.parse_args()

    if not os.environ.get("TELEMETRY_ADMIN_TOKEN"):
        sys.exit("TELEMETRY_ADMIN_TOKEN is unset — run this through bin/telemetry-report")

    print(f"Guns Only · last {args.days} days", file=sys.stderr)
    sessions = list_inventory(args.days, args.refresh)
    if not sessions:
        sys.exit("no telemetry sessions in that window")
    headers = load_headers(sessions, args.refresh)

    flight_names = [name for name in sessions if name.startswith("web-")]
    shell_names = [name for name in sessions if name.startswith("shell-")]

    visitors, owner, unknown = [], [], []
    for name in flight_names:
        hdr = headers.get(name, {})
        ua = hdr.get("ua", "")
        if not ua:
            unknown.append(name)
        elif is_owner(ua):
            owner.append(name)
        else:
            visitors.append(name)

    models = collections.Counter()
    arrivals = collections.Counter()
    platforms = collections.Counter()
    per_day = collections.Counter()
    for name in visitors:
        ua = headers[name]["ua"]
        arrivals[arrival(ua)] += 1
        platforms[platform(ua)] += 1
        model = device_model(ua)
        if model:
            models[model] += 1
        first = min(b["uploadedAt"] for b in sessions[name])
        per_day[first[:10]] += 1

    line = "─" * 62
    print(line)
    print(f"{'FLIGHT SESSIONS (opt-in)':<28}{len(visitors):>6}")
    print(f"{'  distinct phone models':<28}{len(models):>6}")
    print(f"{'your dev Mac':<28}{len(owner):>6}")
    print(f"{'unidentified':<28}{len(unknown):>6}")
    print(f"{'SHELL-HEALTH SESSIONS':<28}{len(shell_names):>6}")
    print(line)

    print("\narriving via (opt-in flight)")
    for source, count in arrivals.most_common():
        print(f"  {source:<24}{count:>5}")
    print("\non (opt-in flight)")
    for name, count in platforms.most_common():
        print(f"  {name:<24}{count:>5}")
    print("\nvisitor sessions per day")
    for day in sorted(per_day):
        print(f"  {day}  {per_day[day]:>4}")

    payload = {
        "window_days": args.days,
        "visitors": len(visitors),
        "owner": len(owner),
        "unidentified": len(unknown),
        "distinct_models": len(models),
        "arrivals": dict(arrivals),
        "platforms": dict(platforms),
        "per_day": dict(per_day),
        "shell_sessions": len(shell_names),
    }

    if shell_names:
        print("\n" + line)
        print("SHELL HEALTH (always-on boot / fatal)")
        print(line)
        shell = shell_health_summary(sessions, shell_names, args.refresh)
        payload["shell_health"] = shell
        print(f"  sessions                {shell['sessions']:>6}")
        print("  farthest milestone")
        for milestone, count in sorted(
                shell["farthest"].items(),
                key=lambda item: (
                    ["none", "script_load", "bridge_ready", "webgl_ok", "ready", "active"]
                    .index(item[0]) if item[0] in {
                        "none", "script_load", "bridge_ready", "webgl_ok", "ready", "active"
                    } else 99)):
            print(f"    {milestone:<22}{count:>5}")
        if shell["fatals"]:
            print("  fatals")
            for reason, count in sorted(shell["fatals"].items(), key=lambda item: -item[1]):
                print(f"    {reason:<22}{count:>5}")
        else:
            print("  fatals                       0")
        print("  platforms")
        for name, count in sorted(shell["platforms"].items(), key=lambda item: -item[1]):
            print(f"    {name:<22}{count:>5}")
        print("  arrivals")
        for name, count in sorted(shell["arrivals"].items(), key=lambda item: -item[1]):
            print(f"    {name:<22}{count:>5}")

    if args.deep:
        print("\n" + line)
        stats = deep_funnel(sessions, visitors, args.refresh)
        flew = [n for n in visitors if stats[n]["flew"]]
        fired = [n for n in visitors if stats[n]["rounds"] > 0]
        scored = [n for n in visitors if stats[n]["hits"] > 0]
        killed = [n for n in visitors if stats[n]["kills"] > 0]
        rounds = int(sum(stats[n]["rounds"] for n in visitors))
        hits = int(sum(stats[n]["hits"] for n in visitors))
        kills = int(sum(stats[n]["kills"] for n in visitors))
        print("COMBAT FUNNEL (opt-in flight visitors)")
        print(line)
        sparred = [n for n in visitors if stats[n]["sparred"]]
        graduated = [n for n in visitors if stats[n]["graduated"]]
        print(f"  loaded the sim          {len(visitors):>6}")
        print(f"  met a sparring partner  {len(sparred):>6}")
        print(f"  graduated it            {len(graduated):>6}")
        print(f"  started a sortie        {len(flew):>6}")
        print(f"  fired the guns          {len(fired):>6}")
        print(f"  landed a hit            {len(scored):>6}")
        print(f"  killed something        {len(killed):>6}")
        print(f"\n  rounds {rounds:,}   hits {hits}   kills {kills}"
              + (f"   hit rate {hits / rounds:.2%}" if rounds else ""))

        print("\n" + line)
        print("MOBILE FUNNEL (opt-in flight, by platform)")
        print(line)
        by_platform = collections.defaultdict(list)
        for name in visitors:
            by_platform[platform(headers[name]["ua"])].append(name)
        mobile_payload = {}
        for plat_name, names in sorted(by_platform.items(), key=lambda item: -len(item[1])):
            plat_flew = sum(1 for n in names if stats[n]["flew"])
            touch = sum(1 for n in names if stats[n]["touch_ready"])
            gov = sum(stats[n]["frame_governor"] for n in names)
            phases = collections.Counter(stats[n]["max_phase"] or "none" for n in names)
            print(f"  {plat_name}")
            print(f"    sessions              {len(names):>6}")
            print(f"    started a sortie      {plat_flew:>6}")
            print(f"    touch_ready           {touch:>6}")
            print(f"    FrameGovernor events  {gov:>6}")
            print(f"    max phase             {dict(phases)}")
            mobile_payload[plat_name] = {
                "sessions": len(names),
                "flew": plat_flew,
                "touch_ready": touch,
                "frame_governor_events": gov,
                "max_phase": dict(phases),
            }

        payload["funnel"] = {
            "loaded": len(visitors), "flew": len(flew), "fired": len(fired),
            "hit": len(scored), "killed": len(killed),
            "rounds": rounds, "hits": hits, "kills": kills,
        }
        payload["mobile_funnel"] = mobile_payload

    if args.latest_owner and owner:
        latest = max(owner, key=lambda name: int(name.split("-")[1]))
        diag = latest_owner_diagnostics(sessions, latest, args.refresh)
        payload["latest_owner"] = diag
        print("\n" + line)
        print("LATEST OWNER FLIGHT (bounded diagnostic replay)")
        print(line)
        print(f"  session                 {diag['session']}")
        print(f"  samples                 {diag['samples']:>6}")
        print(f"  missions                {', '.join(diag['mission_numbers']) or 'unknown'}")
        print(f"  airframes               {', '.join(diag['airframes']) or 'unknown'}")
        print(f"  rounds / hits           {int(diag['rounds'])} / {int(diag['hits'])}")
        print(f"  assist active samples   {diag['assist_active_samples']:>6}")
        print(f"  lead error avg / max    {diag['assist_lead_error_avg']} / "
              f"{diag['assist_lead_error_max']}")
        print(f"  assist status           {diag['assist_status']}")
        print(f"  RTB intent samples      {diag['rtb_intent_samples']:>6}")
        print(f"  approach active/gated   {diag['approach_active_samples']} / "
              f"{diag['approach_with_gates_samples']}")
        print(f"  approach gate distance  {diag['approach_gate_distance_min_m']} / "
              f"{diag['approach_gate_distance_max_m']} m")
        print(f"  recovery known/home     {diag['recovery_known_samples']} / "
              f"{diag['mesh_home_samples']}")
        print(f"  rendered guidance       {diag['guidance_mode']}")
        print(f"  guidance suppression    {diag['guidance_suppression']}")
        if diag["latest_sortie"]:
            sortie = diag["latest_sortie"]
            print("  latest sortie")
            print(f"    id / airframe         {sortie['id']} / {sortie['airframe']}")
            print(f"    samples               {sortie['samples']}")
            print(f"    rounds / hits         {int(sortie['rounds'])} / {int(sortie['hits'])}")
            print(f"    assist active         {sortie['assist_active_samples']}")
            print(f"    RTB / approach        {sortie['rtb_intent_samples']} / "
                  f"{sortie['approach_active_samples']}")

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(payload, fh, indent=2)
        print(f"\nwrote {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
