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


def deep_funnel(sessions, visitors, refresh):
    """Download every visitor chunk and replay it. This is the billed path."""
    chunk_dir = os.path.join(CACHE, "chunks")
    os.makedirs(chunk_dir, exist_ok=True)
    jobs = []
    for name in visitors:
        for blob in sessions[name]:
            out = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(out) or refresh:
                jobs.append((blob["url"], blob["size"], blob["etag"], out))
    if jobs:
        print(f"  downloading {len(jobs)} visitor chunks…", file=sys.stderr)
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
        for blob in sessions[name]:
            path = os.path.join(chunk_dir, blob["pathname"].replace("/", "_"))
            if not os.path.exists(path):
                continue
            try:
                with gzip.open(path, "rt") as fh:
                    rows = [json.loads(line) for line in fh if line.strip()]
            except (OSError, ValueError, EOFError):
                continue
            entry, state = stats[name], None
            # rounds_fired and hits belong to the CURRENT engagement's weapon graph: continuous
            # combat stages a fresh gun for each successor opponent, so both counters RESET at
            # every engagement boundary and a plain max() over the tape understates the chunk
            # total. The projection publishes monotone sortie ledgers (sortie_rounds_fired,
            # sortie_hits); prefer them, and reconstruct across resets for older tapes.
            reconstructed = {"rounds": 0.0, "hits": 0.0}
            previous = {"rounds": None, "hits": None}
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
                    for field, ledger_field, key in (
                            ("rounds_fired", "sortie_rounds_fired", "rounds"),
                            ("hits", "sortie_hits", "hits")):
                        ledger = non_negative(state.get(ledger_field))
                        if ledger is not None:
                            reconstructed[key] = max(reconstructed[key], ledger)
                            continue
                        value = non_negative(state.get(field))
                        if value is None:
                            continue
                        last = previous[key]
                        # A drop is a new weapon graph, which starts its own count at zero.
                        reconstructed[key] += value if last is None or value < last \
                            else value - last
                        previous[key] = value
            for key in ("rounds", "hits"):
                entry[key] = max(entry[key], reconstructed[key])
    return stats


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

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(payload, fh, indent=2)
        print(f"\nwrote {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
