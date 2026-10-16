"""Pathfinders beat report: hunt opportunities, decisions, and event timing.

The report deliberately treats these as controller-observable proxies.  It does
not turn a scripted pilot's outcome into a claim about human enjoyment.
"""
from __future__ import annotations

import html
import math
from collections import Counter, defaultdict

EVENT_KINDS = (
    "relay-in-view", "gun-window-open", "gun-window-closed", "envelope-hit",
    "gondola-kill", "drone-release", "drone-kill", "drone-release-rejected",
    "roe-decision", "roe-violation", "sector-denied", "pass-missed", "pass-ended", "bingo", "egress",
)
EVENT_COLOURS = {
    "relay-in-view": "#38bdf8", "gun-window-open": "#22c55e", "gun-window-closed": "#64748b",
    "envelope-hit": "#f59e0b", "gondola-kill": "#ef4444", "drone-release": "#a78bfa",
    "drone-kill": "#c084fc", "drone-release-rejected": "#f97316", "roe-violation": "#dc2626",
    "roe-decision": "#0ea5e9", "sector-denied": "#eab308", "pass-missed": "#fb7185", "pass-ended": "#94a3b8",
    "bingo": "#facc15", "egress": "#14b8a6",
}
TARGETS = {"firstGunWindowSeconds": 20.0, "longestGunWindowGapSeconds": 30.0,
           "huntSecondsLow": 240.0, "huntSecondsHigh": 360.0}


def data(run: dict) -> dict:
    """Return the optional Pathfinder payload without mutating a tape."""
    value = run.get("pathfinder")
    return value if isinstance(value, dict) else {}


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _events(run: dict) -> list[dict]:
    return [e for e in run.get("events", []) if str(e.get("kind", "")).removeprefix("pathfinder:") in EVENT_KINDS]


def _event_time(event: dict) -> float:
    for key in ("seconds", "second", "time", "timestamp", "t"):
        if event.get(key) is not None:
            return _num(event[key])
    return 0.0


def _kills(p: dict) -> float:
    """Physical kills; safeKills is reported separately because ROE matters."""
    return _num(p.get("gondolaKills")) + _num(p.get("droneKills"))


def aggregate(runs: list[dict]) -> dict:
    """Aggregate Pathfinder hunt counters with explicit missing-data denominators."""
    ps = [data(r) for r in runs]
    first = [_num(p["firstGunWindowSeconds"]) for p in ps if p.get("firstGunWindowSeconds") is not None]
    gaps = [_num(p.get("longestGunWindowGapSeconds")) for p in ps]
    complete = [p for p in ps if not bool(p.get("huntCensored", False))]
    # A censored sortie has no trustworthy hunt-length denominator, even when
    # the emergency bound happened to equal a plausible length.
    hunt = [_num(p.get("huntSeconds")) for p in complete if p.get("huntSeconds") is not None]
    passes = sum(_num(p.get("passes")) for p in ps)
    kills = sum(_kills(p) for p in ps)
    safe_kills = sum(_num(p.get("safeKills")) for p in ps)
    envelope = sum(_num(p.get("envelopeOnlyPasses")) for p in ps)
    envelope_pct = 100.0 * envelope / passes if passes else None
    windows = sum(_num(p.get("gunWindows")) for p in ps)
    window_seconds = sum(_num(p.get("gunWindowSeconds")) for p in ps)
    return {
        "runs": len(ps), "complete": len(complete), "censored": len(ps) - len(complete),
        "firstGunWindowSeconds": sum(first) / len(first) if first else None,
        "firstGunWindowSamples": len(first), "firstGunWindowTargetPct": 100 * sum(x <= 20 for x in first) / len(ps) if ps else None,
        "longestGunWindowGapSeconds": max(gaps, default=0.0),
        "longestGunWindowGapMean": sum(gaps) / len(gaps) if gaps else None,
        "gunWindows": windows, "gunWindowSeconds": window_seconds,
        "huntSecondsMean": sum(hunt) / len(hunt) if hunt else None,
        "huntSecondsSamples": len(hunt), "huntTargetPct": 100 * sum(240 <= x <= 360 for x in hunt) / len(hunt) if hunt else None,
        "passes": passes, "envelopeOnlyPasses": envelope, "envelopeOnlyPassPct": envelope_pct,
        "missedPasses": sum(_num(p.get("missedPasses")) for p in ps),
        "gondolaKills": sum(_num(p.get("gondolaKills")) for p in ps), "droneReleases": sum(_num(p.get("droneReleases")) for p in ps),
        "droneKills": sum(_num(p.get("droneKills")) for p in ps), "droneReleaseAttempts": sum(_num(p.get("droneReleaseAttempts")) for p in ps),
        "droneReleaseRejected": sum(_num(p.get("droneReleaseRejected")) for p in ps), "roeDecisions": sum(_num(p.get("roeDecisions")) for p in ps),
        "roeViolations": sum(_num(p.get("roeViolations")) for p in ps), "sectorsDenied": sum(_num(p.get("sectorsDenied")) for p in ps),
        "relayCount": sum(_num(p.get("relayCount")) for p in ps), "kills": kills, "safeKills": safe_kills,
        "killsPerRun": kills / len(ps) if ps else None,
        "denialRuns": sum(_num(p.get("sectorsDenied")) >= 1 for p in ps),
        "allRelayRuns": sum(_num(p.get("relayCount")) > 0 and _num(p.get("sectorsDenied")) >= _num(p.get("relayCount")) for p in ps),
        "killDistribution": dict(sorted(Counter(int(_kills(p)) for p in ps).items())),
        "huntEndReasons": dict(Counter(p.get("huntEndReason", "unknown") for p in ps)),
        "droneCapability": "structurally unobserved: Phase 1 has no player drone-release API",
    }


def flags(runs: list[dict]) -> list[str]:
    found = []
    for r in runs:
        p = data(r); who, seed = r.get("pilot", "?"), r.get("seed", "?")
        first = p.get("firstGunWindowSeconds")
        if first is None or _num(first) > TARGETS["firstGunWindowSeconds"]:
            found.append(f"first gun window >20s/missing: {who} seed {seed} ({'missing' if first is None else f'{_num(first):.1f}s'})")
        if _num(p.get("longestGunWindowGapSeconds")) > TARGETS["longestGunWindowGapSeconds"]:
            found.append(f"gun-window drought >30s: {who} seed {seed} ({_num(p.get('longestGunWindowGapSeconds')):.1f}s)")
        if not p.get("huntCensored", False) and p.get("huntSeconds") is not None and not 240 <= _num(p["huntSeconds"]) <= 360:
            found.append(f"hunt outside 4–6min: {who} seed {seed} ({_num(p['huntSeconds']):.1f}s)")
        if _num(p.get("passes")) and p.get("envelopeOnlyPassPct") is not None:
            pct = _num(p["envelopeOnlyPassPct"])
            if pct > 50: found.append(f"envelope-only passes dominate: {who} seed {seed} ({pct:.0f}%)")
            elif pct == 0: found.append(f"no envelope-only teaching moment: {who} seed {seed}")
    by = defaultdict(list)
    for r in runs: by[r.get("pilot", "?")].append(data(r))
    novice = by.get("hunter-novice", by.get("novice", []))
    if novice and not any(_num(p.get("sectorsDenied")) >= 1 for p in novice):
        found.append(f"novice denied no relay in {len(novice)}-run sample")
    ace = by.get("hunter-ace", by.get("ace", []))
    eligible_ace = [p for p in ace if not p.get("huntCensored", False)]
    if eligible_ace and all(_num(p.get("sectorsDenied")) >= _num(p.get("relayCount")) and _num(p.get("relayCount")) > 0 for p in eligible_ace):
        found.append("ace cleared every observed relay (outcome spread may be too narrow)")
    return found


def top_problems(runs: list[dict]) -> list[str]:
    """Rank three evidence-backed friction points, with controller limits stated."""
    evidence = []
    attempts = sum(_num(data(r).get("droneReleaseAttempts")) for r in runs)
    releases = sum(_num(data(r).get("droneReleases")) for r in runs)
    rejected = sum(_num(data(r).get("droneReleaseRejected")) for r in runs)
    if attempts and releases == 0:
        evidence.append((attempts, f"Blocked drone choices: {attempts:.0f} policy attempts produced 0 releases ({rejected:.0f} capability rejections). The current Phase 1 controller/API has not made a drone action available; resolve that before treating hard geometry as a design problem."))
    drought = sum(max(0.0, _num(data(r).get("longestGunWindowGapSeconds")) - 30) for r in runs)
    if drought:
        evidence.append((drought, f"Gun-window opportunity drought: {sum(_num(data(r).get('longestGunWindowGapSeconds')) > 30 for r in runs)} of {len(runs)} runs exceeded 30s, with {drought:.1f}s total excess gap."))
    zero = sum(_kills(data(r)) == 0 for r in runs if not data(r).get("huntCensored", False))
    if zero:
        evidence.append((zero, f"Zero-kill/failure runs: {zero} hunts ending in egress/loss recorded no physical gondola/drone kill; inspect pass geometry and controller failure before assigning blame to mission pacing."))
    envelope = [data(r) for r in runs if _num(data(r).get("passes"))]
    dominant = sum(_num(p.get("envelopeOnlyPassPct")) > 50 for p in envelope)
    if dominant: evidence.append((dominant, f"Wrong-shot teaching moment dominates: {dominant} of {len(envelope)} runs exceeded 50% envelope-only passes."))
    if not evidence: evidence.append((0, "No top-three friction signal crossed the configured evidence thresholds in this sample."))
    evidence.sort(key=lambda x: (-x[0], x[1]))
    return [x[1] for x in evidence[:3]]


def minute_events(runs: list[dict]) -> list[dict]:
    """Return every hunt minute/pilot, including quiet minutes."""
    rows = defaultdict(Counter)
    for r in runs:
        pilot = r.get("pilot", "?"); p = data(r)
        limit = max(0.0, _num(p.get("huntSeconds")))
        for minute in range(int(math.ceil(limit / 60.0))):
            rows[(pilot, minute)]["opportunitySeconds"] += sum(
                _num(x.get("gunEnvelopeSeconds", x.get("duration", 1))) for x in r.get("timeline", [])
                if int(_num(x.get("second", x.get("secondIndex", 0)))) // 60 == minute
                and bool(x.get("targetInGunEnvelope", False)))
        opened = {}
        for e in sorted(_events(r), key=_event_time):
            kind = str(e.get("kind", "")).removeprefix("pathfinder:"); t = _event_time(e); key = (pilot, int(t // 60)); count = int(_num(e.get("count"), 1))
            rows[key][kind] += count
            if kind == "gun-window-open": opened.setdefault(e.get("target", ""), t)
            elif kind == "gun-window-closed":
                start = opened.pop(e.get("target", ""), None)
                if start is not None:
                    # Allocate a window across minute boundaries rather than charging
                    # its entire duration to the minute containing the close event.
                    cursor = start
                    while cursor < t - 1e-9:
                        minute = int(cursor // 60)
                        end = min(t, (minute + 1) * 60)
                        rows[(pilot, minute)]["gunWindowSeconds"] += end - cursor
                        cursor = end
    out = []
    for (pilot, minute), c in sorted(rows.items(), key=lambda item: (item[0][1], item[0][0])):
        out.append({"pilot": pilot, "minute": minute, "opportunitySeconds": round(c.pop("opportunitySeconds", 0.0), 3), "gunWindowSeconds": round(c.pop("gunWindowSeconds", 0.0), 3), **dict(sorted(c.items()))})
    return out


def svg_timeline(runs: list[dict]) -> str:
    width, left, row = 1240, 190, 25
    maximum = max((_num(data(r).get("huntSeconds")) for r in runs), default=1.0)
    maximum = max(1.0, maximum)
    scale = (width - left - 20) / maximum
    height = 63 + row * len(runs)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">', f'<rect width="{width}" height="{height}" fill="#f8fafc"/>']
    x, legend_y = 4, 18
    for kind in EVENT_KINDS:
        label = kind.replace("-", " ")
        item_width = 27 + len(label) * 5.2
        if x + item_width > width - 20:
            x, legend_y = 4, 34
        out += [f'<rect x="{x}" y="{legend_y-8}" width="8" height="8" fill="{EVENT_COLOURS[kind]}"/>', f'<text x="{x+11}" y="{legend_y}" font-family="sans-serif" font-size="10" fill="#0f172a">{html.escape(label)}</text>']
        x += item_width
    out.append('<text x="4" y="53" font-family="sans-serif" font-size="10" fill="#475569">one row/run · exact event seconds in tooltips · ● event marker · ◆ decision/kill · green band = gun window · vertical grid = minute</text>')
    for i, r in enumerate(runs):
        y = 60 + i * row; p = data(r); label = html.escape(f"{r.get('pilot','?')} · {r.get('seed','?')}")
        out.append(f'<text x="4" y="{y+13}" font-family="sans-serif" font-size="10" fill="#0f172a">{label}</text><rect x="{left}" y="{y}" width="{maximum*scale:.2f}" height="15" fill="#e2e8f0"/>')
        events = sorted(_events(r), key=_event_time)
        opened = {}
        for e in events:
            kind = str(e.get("kind", "")).removeprefix("pathfinder:")
            if kind == "gun-window-open": opened.setdefault(e.get("target", ""), _event_time(e))
            elif kind == "gun-window-closed":
                start = opened.pop(e.get("target", ""), None)
                if start is not None and _event_time(e) > start:
                    out.append(f'<rect x="{left + start * scale:.2f}" y="{y+2}" width="{(_event_time(e)-start)*scale:.2f}" height="11" fill="#22c55e" opacity=".30"><title>gun window {start:.3f}s–{_event_time(e):.3f}s · target={html.escape(str(e.get("target", "")))}</title></rect>')
        for e in events:
            kind = str(e.get("kind", "")).removeprefix("pathfinder:"); t = _event_time(e); ex = left + t * scale
            title = html.escape(f"t={t:.3f}s · {kind} · target={e.get('target','')} · source={e.get('source','')} · count={e.get('count',1)}")
            if kind in {"gondola-kill", "drone-kill", "drone-release", "drone-release-rejected", "roe-violation", "sector-denied"}:
                marker = f'<path d="M{ex:.2f},{y+3.5}l4,4-4,4-4-4z" fill="{EVENT_COLOURS.get(kind, "#0f172a")}"/>'
            else:
                marker = f'<circle cx="{ex:.2f}" cy="{y+7.5}" r="3.5" fill="{EVENT_COLOURS.get(kind, "#0f172a")}"/>'
            out.append(f'<g><title>{title}</title>{marker}</g>')
        out.append(f'<text x="{width-4}" y="{y+12}" text-anchor="end" font-family="sans-serif" font-size="9" fill="#475569">{_num(p.get("huntSeconds")):.0f}s</text>')
    for sec in range(0, int(maximum) + 1, 60):
        ex = left + sec * scale
        out.append(f'<path d="M{ex:.2f},55v{height-55}" stroke="#cbd5e1" stroke-width=".5"/><text x="{ex+2:.2f}" y="54" font-family="sans-serif" font-size="9" fill="#475569">{sec}s</text>')
    out.append('</svg>')
    return ''.join(out)


def markdown(runs: list[dict], manifest: dict | None = None) -> str:
    by = defaultdict(list)
    for r in runs: by[r.get("pilot", "?")].append(r)
    lines = ["## Pathfinder hunt", "", "These are observable hunt and controller proxies; they do not measure human emotion.", "Gun-window drought is the longest no-window stretch, including leading and trailing edges up to actual RTB/death or observation censor.", "Drone releases and drone kills are structurally unobserved in Phase 1 because no player release API exists; rejected policy choices are reported separately.", "", "### Headline metrics vs targets", "", "| pilot | first sight window mean (samples/missing) | ≤20s | longest gap | ≤30s | hunt mean (ended/censored) | 4–6min | passes/physical kill | envelope-only | ROE decisions | physical/safe kills |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for pilot, rs in sorted(by.items()):
        a = aggregate(rs); first = f"— (0/{a['runs']} miss)" if a["firstGunWindowSeconds"] is None else f"{a['firstGunWindowSeconds']:.1f}s ({a['firstGunWindowSamples']}/{a['runs']-a['firstGunWindowSamples']} miss)"; gap = f"{a['longestGunWindowGapSeconds']:.1f}s"; hunt = f"— ({a['complete']}/{a['censored']})" if a["huntSecondsMean"] is None else f"{a['huntSecondsMean']:.1f}s ({a['complete']}/{a['censored']})"; pk = a["passes"] / a["kills"] if a["kills"] else "N/A"; ep = "N/A" if a["envelopeOnlyPassPct"] is None else f"{a['envelopeOnlyPassPct']:.0f}%"; first_target = "—" if a["firstGunWindowTargetPct"] is None else f"{a['firstGunWindowTargetPct']:.0f}%"; hunt_target = "—" if a["huntTargetPct"] is None else f"{a['huntTargetPct']:.0f}%"
        lines.append(f"| {pilot} | {first} | {first_target} | {gap} | {'yes' if a['longestGunWindowGapSeconds'] <= 30 else 'no'} | {hunt} | {hunt_target} | {pk if isinstance(pk,str) else f'{pk:.2f}'} | {ep} | {a['roeDecisions']:.0f} | {a['kills']:.0f}/{a['safeKills']:.0f} |" )
    lines += ["", "Gun window = instantaneous ballistic sight cue at ≤900 m, with a live selected gondola and an authorized loaded gun. This conservative cue is distinct from proximity, the dwell-qualified HUD cue and actual dispersed rounds hitting the gondola box.", "", "### Fun verdict", "", "Top three evidence-backed problems:", ""] + [f"{i}. {x}" for i, x in enumerate(top_problems(runs), 1)]
    lines += ["", "### Outcome spread", "", "| pilot | ≥1 denied / runs | all relays denied / runs | physical kills: runs | hunt end reasons |", "|---|---:|---:|---|---|"]
    for pilot, rs in sorted(by.items()):
        a = aggregate(rs)
        dist = ", ".join(f"{k}: {v}" for k, v in a["killDistribution"].items())
        reasons = ", ".join(f"{k}: {v}" for k, v in a["huntEndReasons"].items())
        lines.append(f"| {pilot} | {a['denialRuns']}/{a['runs']} | {a['allRelayRuns']}/{a['runs']} | {dist} | {reasons} |")
    lines += ["", "### Flags", ""] + [f"- {x}" for x in flags(runs)]
    lines += ["", "### Proximity, cue and hit cross-check", "", "| pilot | first ≤900 m mean / missing | instantaneous cue seconds | qualified HUD cue seconds | physical kills |", "|---|---:|---:|---:|---:|"]
    for pilot, rs in sorted(by.items()):
        first_range = [data(r)["firstRangeWindowSeconds"] for r in rs if data(r).get("firstRangeWindowSeconds") is not None]
        range_text = f"{sum(first_range)/len(first_range):.1f}s / {len(rs)-len(first_range)}" if first_range else f"— / {len(rs)}"
        lines.append(f"| {pilot} | {range_text} | {sum(_num(data(r).get('gunWindowSeconds')) for r in rs):.3f} | {sum(_num(data(r).get('qualifiedGunWindowSeconds')) for r in rs):.3f} | {sum(_kills(data(r)) for r in rs):.0f} |")
    lines += ["", "### Opportunities/events by minute", "", "| pilot | minute | opportunity s | gun window s | relay | opens/closes | envelope | kills | ROE decisions | ROE violations | denied/missed |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for b in minute_events(runs):
        lines.append(f"| {b['pilot']} | {b['minute']} | {b.get('opportunitySeconds', 0):.1f} | {b.get('gunWindowSeconds', 0):.1f} | {b.get('relay-in-view', 0)} | {b.get('gun-window-open', 0)}/{b.get('gun-window-closed', 0)} | {b.get('envelope-hit', 0)} | {b.get('gondola-kill', 0) + b.get('drone-kill', 0)} | {b.get('roe-decision', 0)} | {b.get('roe-violation', 0)} | {b.get('sector-denied', 0)}/{b.get('pass-missed', 0)} |")
    lines += ["", "### Per-run Pathfinder metrics", "", "| pilot | seed | first window | longest gap | hunt s | censored | passes | envelope-only | physical/safe kills | drone attempts/releases/rejected | ROE decisions/violations |", "|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|"]
    for r in runs:
        p = data(r); first = "—" if p.get("firstGunWindowSeconds") is None else f"{_num(p['firstGunWindowSeconds']):.1f}"; lines.append(f"| {r.get('pilot','?')} | {r.get('seed','?')} | {first} | {_num(p.get('longestGunWindowGapSeconds')):.1f} | {_num(p.get('huntSeconds')):.1f} | {'yes' if p.get('huntCensored', False) else 'no'} | {_num(p.get('passes')):.0f} | {_num(p.get('envelopeOnlyPasses')):.0f} | {_kills(p):.0f}/{_num(p.get('safeKills')):.0f} | {_num(p.get('droneReleaseAttempts')):.0f}/{_num(p.get('droneReleases')):.0f}/{_num(p.get('droneReleaseRejected')):.0f} | {_num(p.get('roeDecisions')):.0f}/{_num(p.get('roeViolations')):.0f} |")
    lines += ["", "![Pathfinder hunt timeline](timeline.svg)", "", "The SVG has one row per run; hover an event marker for its exact tick-derived time, kind, target and count."]
    return "\n".join(lines)
