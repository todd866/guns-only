#!/usr/bin/env python3
"""Build the deterministic playtest report from a lab manifest."""
from __future__ import annotations

import argparse, gzip, html, json, math
from collections import Counter, defaultdict
from pathlib import Path

PHASES = ("setup", "transit", "merge", "fight", "defensive", "RTB", "approach", "landing", "dead", "finished")
COLORS = {"setup":"#94a3b8", "transit":"#60a5fa", "merge":"#22d3ee", "fight":"#f59e0b", "defensive":"#ef4444", "RTB":"#a78bfa", "approach":"#c084fc", "landing":"#34d399", "dead":"#111827", "finished":"#64748b"}
OUTCOMES = ("win", "loss", "crash", "recovered", "draw")

def _number(value, default=0.0):
    try: return float(value)
    except (TypeError, ValueError): return default

def bin_duration(bin, perceived=True):
    """Return a bin duration in player or simulation seconds.

    Schema 1 only has sim-clock values, so it is deliberately treated as 1x.
    """
    key = "duration" if perceived else "simDuration"
    if perceived and "duration" in bin: return _number(bin["duration"], 1.0)
    return _number(bin.get(key, bin.get("duration", 1)), 1.0)

def perceived_duration(run):
    if "perceivedSeconds" in run: return _number(run["perceivedSeconds"])
    return sum(bin_duration(x) for x in run.get("timeline", []))

def simulated_duration(run):
    if "seconds" in run: return _number(run["seconds"])
    return sum(bin_duration(x, False) for x in run.get("timeline", []))

def run_duration(run):
    """Compatibility alias: report-facing duration is player wall-clock time."""
    return perceived_duration(run)

def timing(run, name, sim_name):
    value = run.get(name)
    if value is not None: return _number(value)
    return _number(run.get(sim_name, 0))

def load_runs(root: Path, manifest: dict) -> list[dict]:
    out = []
    for rel in manifest.get("runs", []):
        path = root / rel
        with gzip.open(path, "rt", encoding="utf-8") as f:
            run = json.load(f)
        run.setdefault("timeline", [])
        out.append(run)
    return out

def tension(run, engagement):
    # The runner's engagement summary is authoritative: it excludes transit/RTB
    # bins and already contains its own duration weighting.
    for x in run.get("engagementTensions", []):
        if x.get("engagement") == engagement:
            return float(x.get("mean", 0))
    bins = [x for x in run.get("timeline", []) if x.get("engagement") == engagement]
    if not bins:
        return None
    total = sum(float(x.get("duration", 1)) for x in bins)
    return sum(float(x.get("tension", 0)) * float(x.get("duration", 1)) for x in bins) / total if total else 0.0

def flags(runs: list[dict]) -> list[str]:
    found = []
    for r in runs:
        pilot, seed = r.get("pilot", "?"), r.get("seed", "?")
        longest = timing(r, "longestDeadAirSeconds", "simLongestDeadAirSeconds")
        if longest > 20:
            found.append(f"dead air >20s: {pilot} seed {seed} ({longest:.1f}s perceived)")
        t = r.get("timeToFirstAction", r.get("simTimeToFirstAction"))
        if t is None or float(t) > 30:
            found.append(f"first action >30s/missing: {pilot} seed {seed} ({'missing' if t is None else f'{float(t):.1f}s'})")
    by = defaultdict(list)
    for r in runs: by[r.get("pilot", "?")].append(r)
    for pilot, rs in by.items():
        eligible = [r for r in rs if r.get("outcome") != "incomplete"]
        if not eligible:
            found.append(f"all runs censored/no outcome evidence: {pilot}")
        if pilot == "novice" and eligible and not any(r.get("outcome") == "win" for r in eligible):
            found.append("novice win rate 0%")
        if pilot == "ace" and eligible and all(r.get("outcome") == "win" for r in eligible):
            found.append("ace win rate 100%")
    for r in runs:
        e1, e2 = tension(r, 1), tension(r, 2)
        if e1 is not None and e2 is not None and e2 <= e1:
            found.append(f"tension not rising: {r.get('pilot','?')} seed {r.get('seed','?')} ({e1:.2f}→{e2:.2f})")
        phases = r.get("phaseSeconds") or r.get("simPhaseSeconds") or {}
        fight = sum(float(phases.get(p, 0)) for p in ("fight", "defensive", "merge"))
        for p in ("RTB", "approach", "landing"):
            if float(phases.get(p, 0)) > fight:
                found.append(f"{p} longer than fight/defensive/merge: {r.get('pilot','?')} seed {r.get('seed','?')}")
        if r.get("outcome") == "incomplete":
            found.append(f"incomplete/censored: {r.get('pilot','?')} seed {r.get('seed','?')}")
    return found

def aggregate(rs: list[dict]) -> dict:
    complete = [r for r in rs if r.get("outcome") != "incomplete"]
    outcomes = Counter(r.get("outcome", "incomplete") for r in complete)
    distribution = {o: outcomes.get(o, 0) for o in OUTCOMES}
    total = sum(outcomes.values())
    entropy = 0.0
    if total:
        entropy = -sum((n/total) * math.log(n/total) for n in outcomes.values() if n) / math.log(len(OUTCOMES))
    durations = [run_duration(r) for r in rs]
    def phase_value(r, p):
        supplied = r.get("phaseSeconds") or {}
        if p in supplied: return _number(supplied[p])
        return sum(bin_duration(x) for x in r.get("timeline", []) if x.get("phase") == p)
    def sim_phase_value(r, p):
        supplied = r.get("simPhaseSeconds") or r.get("phaseSeconds") or {}
        if p in supplied: return _number(supplied[p])
        return sum(bin_duration(x, False) for x in r.get("timeline", []) if x.get("phase") == p)
    phases = {p: sum(phase_value(r, p) for r in rs) for p in PHASES}
    sim_phases = {p: sum(sim_phase_value(r, p) for r in rs) for p in PHASES}
    ptotal = sum(phases.values()) or 1
    sim_first_actions = [float(r.get("simTimeToFirstAction", r["timeToFirstAction"])) for r in rs if r.get("timeToFirstAction") is not None]
    first_actions = [float(r["timeToFirstAction"]) for r in rs if r.get("timeToFirstAction") is not None]
    decisions = sum(len(r.get("decisions", [])) if isinstance(r.get("decisions"), list) else float(r.get("decisions", 0)) for r in rs)
    perceived = sum(durations) or 1
    dead = sum(timing(r, "deadAirSeconds", "simDeadAirSeconds") for r in rs)
    sim_dead = sum(_number(r.get("simDeadAirSeconds", r.get("deadAirSeconds", 0))) for r in rs)
    paired = [(tension(r, 1), tension(r, 2)) for r in rs]
    paired = [(a, b) for a, b in paired if a is not None and b is not None]
    rising = [b > a for a, b in paired]
    return {"runs": len(rs), "complete": len(complete), "censored": len(rs)-len(complete),
            "winRate": (sum(r.get("outcome") == "win" for r in complete)/total if total else None),
            "kills": sum(float(r.get("kills", 0)) for r in rs), "hitsGiven": sum(float(r.get("hitsGiven", 0)) for r in rs), "hitsTaken": sum(float(r.get("hitsTaken", 0)) for r in rs),
            "nearMisses": sum(float(r.get("nearMisses", 0)) for r in rs), "shotNearMisses": sum(float(r.get("shotNearMisses", 0)) for r in rs), "groundNearMisses": sum(float(r.get("groundNearMisses", 0)) for r in rs),
            "decisions": decisions, "decisionsPerMinute": 60*decisions/perceived,
            "escalationPaired": len(paired), "escalationRisingPct": (100*sum(rising)/len(rising) if rising else None), "escalationMeanDelta": (sum(b-a for a,b in paired)/len(paired) if paired else None),
            "meanFirstAction": sum(first_actions)/len(first_actions) if first_actions else None,
            "meanSimFirstAction": sum(sim_first_actions)/len(sim_first_actions) if sim_first_actions else None, "missingFirstAction": len(rs)-len(first_actions),
            "deadAirSeconds": dead, "simDeadAirSeconds": sim_dead,
            "longestDeadAirSeconds": max((timing(r, "longestDeadAirSeconds", "simLongestDeadAirSeconds") for r in rs), default=0),
            "simLongestDeadAirSeconds": max((_number(r.get("simLongestDeadAirSeconds", r.get("longestDeadAirSeconds", 0))) for r in rs), default=0),
            "meanLength": sum(durations)/len(durations) if durations else 0, "meanPerceivedLength": sum(durations)/len(durations) if durations else 0,
            "meanSimulatedLength": sum(simulated_duration(r) for r in rs)/len(rs) if rs else 0,
            "lengthSpread": (max(durations)-min(durations) if durations else 0),
            "phasePct": {p: 100*phases[p]/ptotal for p in PHASES},
            "simPhasePct": {p: 100*sim_phases[p]/(sum(sim_phases.values()) or 1) for p in PHASES},
            "combatShare": 100*sum(phases[p] for p in ("merge", "fight", "defensive"))/ptotal,
            "simCombatShare": 100*sum(sim_phases[p] for p in ("merge", "fight", "defensive"))/(sum(sim_phases.values()) or 1),
            "outcomes": distribution, "recovered": sum(r.get("outcome") == "recovered" for r in rs),
            "landed": sum(r.get("outcome") == "landed" or bool(r.get("landed", False)) for r in rs),
            "endedEarly": sum(bool(r.get("sortieEndedEarly", False)) for r in rs), "entropy": entropy}

def svg_strip(runs: list[dict]) -> str:
    width, row_h, left = 1100, 24, 170
    maximum = max((perceived_duration(r) for r in runs), default=1)
    scale = (width-left-20) / max(1, maximum)
    h = 70 + row_h * len(runs)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{h}" viewBox="0 0 {width} {h}">', f'<rect x="0" y="0" width="{width}" height="{h}" fill="#f8fafc"/>']
    lx = 4
    for phase in PHASES:
        # AppKit's SVG renderer ignores tspan fill in inherited text styles;
        # explicit swatches keep the phase legend legible there.
        parts.append(f'<rect x="{lx}" y="22" width="8" height="8" fill="{COLORS[phase]}"/>')
        parts.append(f'<text x="{lx+11}" y="30" font-family="sans-serif" font-size="11" fill="#0f172a">{phase}</text>')
        lx += 32 + len(phase) * 6
    parts.append('<text x="4" y="47" font-family="sans-serif" font-size="11" fill="#0f172a">Player seconds; markers = bin counts: ● kill · | hit · ! taken · ◆ near miss · shaded = dead air · dark trace = tension</text>')
    for i, r in enumerate(runs):
        y = 60 + i*row_h; label = html.escape(f"{r.get('pilot','?')} · {r.get('seed','?')}")
        parts.append(f'<text x="4" y="{y+14}" font-family="sans-serif" font-size="11" fill="#0f172a">{label}</text>')
        t = 0.0
        for x in r.get("timeline", []):
            d = max(0.001, bin_duration(x)); w=d*scale
            parts.append(f'<rect x="{left+t*scale:.2f}" y="{y}" width="{w:.2f}" height="16" fill="{COLORS.get(x.get("phase"), "#94a3b8")}"/>')
            if float(x.get("deadAirSeconds", 0)) > 0:
                parts.append(f'<rect x="{left+t*scale:.2f}" y="{y}" width="{w:.2f}" height="16" fill="#000" opacity=".22"/>')
            # A thin tension trace makes the emotional arc visible without adding another row.
            tx = left + (t + d / 2) * scale
            ty = y + 15 - max(0.0, min(1.0, float(x.get("tension", 0)))) * 14
            if t == 0:
                tension_points = [(tx, ty)]
            else:
                tension_points.append((tx, ty))
            for key, shape, color in (("kills", "circle", "#7f1d1d"), ("hitsGiven", "line", "#fff"), ("hitsTaken", "taken", "#111"), ("shotNearMisses", "diamond", "#111"), ("groundNearMisses", "diamond", "#facc15")):
                n = int(x.get(key, 0) or 0)
                for j in range(n):
                    ex = left + (t + d*(j+1)/(n+1))*scale
                    if shape == "circle": parts.append(f'<circle cx="{ex:.2f}" cy="{y+8}" r="3" fill="{color}"/>')
                    elif shape == "line": parts.append(f'<path d="M{ex:.2f},{y+2}v12" stroke="{color}" stroke-width="2"/>')
                    elif shape == "taken": parts.append(f'<path d="M{ex:.2f},{y+2}v12" stroke="{color}" stroke-width="2"/><path d="M{ex-2:.2f},{y+8}h4" stroke="{color}"/>')
                    else: parts.append(f'<path d="M{ex:.2f},{y+3}l4,5-4,5-4-5z" fill="{color}"/>')
            t += d
        if 'tension_points' in locals() and tension_points:
            pts = " ".join(f"{x:.2f},{yy:.2f}" for x, yy in tension_points)
            parts.append(f'<polyline points="{pts}" fill="none" stroke="#0f172a" stroke-width="1.5"/>')
            del tension_points
    for sec in range(0, int(maximum)+1, max(1, int(maximum/10))):
        x = left + sec*scale; anchor = ' text-anchor="end"' if sec + max(1, int(maximum/10)) > maximum else ''
        parts.append(f'<path d="M{x:.2f},60v{h-60}" stroke="#cbd5e1" stroke-width=".5" fill="none"/><text x="{x-2 if anchor else x+2:.2f}" y="56" font-family="sans-serif" font-size="10" fill="#475569"{anchor}>{sec}s</text>')
    parts.append('</svg>')
    return "".join(parts)

def make_report(root: Path) -> tuple[dict, str]:
    with (root / "manifest.json").open(encoding="utf-8") as f: manifest = json.load(f)
    runs = load_runs(root, manifest); by = defaultdict(list)
    for r in runs: by[r.get("pilot", "?")].append(r)
    fs = flags(runs)
    summaries = {}
    for pilot in sorted(by):
        summaries[pilot] = aggregate(by[pilot])
    simulated_total = sum(simulated_duration(r) for r in runs)
    perceived_total = sum(perceived_duration(r) for r in runs)
    wall = float(manifest.get("wallSeconds") or 0)
    speed = "N/A" if wall <= 0 else f"{simulated_total/wall:.1f}×"
    lines = [f"# Playtest Lab — beat {manifest.get('beat','?')}", "", f"Generated {manifest.get('date','?')} · {len(runs)} runs · seed {manifest.get('startSeed','?')} · {perceived_total:.1f}s perceived / {simulated_total:.1f}s simulated · {speed}× wall speed", "", "## At a glance", "", "| pilot | runs | complete | censored | win rate | mean perceived | mean simulated | flags |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for pilot, a in summaries.items():
        wr = "N/A" if a["winRate"] is None else f"{100*a['winRate']:.0f}%"
        lines.append(f"| {pilot} | {a['runs']} | {a['complete']} | {a['censored']} | {wr} | {a['meanPerceivedLength']:.1f}s | {a['meanSimulatedLength']:.1f}s | {sum(1 for x in fs if pilot in x)} |")
    lines += ["", f"Flag count: **{len(fs)}**", "", "## Reproduction", "", f"- Command: `{manifest.get('command','(not recorded)')}`", f"- Source commit: `{manifest.get('sourceCommit','(unknown)')}`", f"- Clone SHA-256: `{manifest.get('cloneSha256','(unknown)')}`", f"- Wall time: {manifest.get('wallSeconds','?')}s", f"- Configured max seconds: {manifest.get('maxSeconds','?')}", "", "## Notes", ""]
    lines += [f"- {x}" for x in manifest.get("notes", [])] or ["- No notes recorded"]
    lines += ["", "## Pilot metrics", "", "Timing pairs are perceived / simulated; rates use perceived minutes.", "", "| pilot | kills | hits given/taken | near misses | decisions/min | first action | dead air perceived/sim (max) | perceived/sim sortie | combat share perceived/sim | outcome distribution | entropy | paired e1→e2 | rising | mean Δ |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|"]
    for pilot, a in summaries.items():
        fa = "—" if a["meanFirstAction"] is None else f"{a['meanFirstAction']:.1f}s / {a['meanSimFirstAction']:.1f}s ({a['missingFirstAction']} missing)"
        dist = ", ".join(f"{o}:{a['outcomes'][o]}" for o in OUTCOMES)
        rising = "—" if a["escalationRisingPct"] is None else f"{a['escalationRisingPct']:.0f}%"
        delta = "—" if a["escalationMeanDelta"] is None else f"{a['escalationMeanDelta']:+.2f}"
        lines.append(f"| {pilot} | {a['kills']:.0f} | {a['hitsGiven']:.0f}/{a['hitsTaken']:.0f} | {a['nearMisses']:.0f} | {a['decisionsPerMinute']:.2f} | {fa} | {a['deadAirSeconds']:.1f}s / {a['simDeadAirSeconds']:.1f}s (max {a['longestDeadAirSeconds']:.1f}s / {a['simLongestDeadAirSeconds']:.1f}s) | {a['meanPerceivedLength']:.1f}s / {a['meanSimulatedLength']:.1f}s | {a['combatShare']:.1f}% / {a['simCombatShare']:.1f}% | {dist} | {a['entropy']:.2f} | {a['escalationPaired']} | {rising} | {delta} |")
    lines += ["", "## Flags", ""]
    lines += [f"- {x}" for x in fs] if fs else ["- None"]
    lines += ["", "## Phase share", "", "Each cell is perceived / simulated.", "", "| pilot | " + " | ".join(PHASES) + " |", "|---|" + "---:|"*len(PHASES)]
    for p, a in summaries.items(): lines.append("| " + p + " | " + " | ".join(f"{a['phasePct'][x]:.1f}% / {a['simPhasePct'][x]:.1f}%" for x in PHASES) + " |")
    lines += ["", "## Runs by pilot", "", "Timing pairs are perceived / simulated."]
    for pilot in sorted(by):
        lines += ["", f"### {pilot}", "", "| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |", "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
        for r in by[pilot]:
            length = perceived_duration(r); sim_length = simulated_duration(r); first = r.get("timeToFirstAction", r.get("simTimeToFirstAction")); first = "—" if first is None else f"{float(first):.1f}s / {float(r.get('simTimeToFirstAction',first)):.1f}s"
            ds = len(r.get("decisions", [])) if isinstance(r.get("decisions"), list) else float(r.get("decisions", 0)); dpm = 60*ds/(length or 1)
            e1, e2 = tension(r, 1), tension(r, 2); e = f"{e1:.2f} / {e2:.2f}" if e1 is not None and e2 is not None else "—"
            lines.append(f"| {r.get('seed','?')} | {r.get('outcome','incomplete')} | {length:.1f}s / {sim_length:.1f}s | {first} | {timing(r,'deadAirSeconds','simDeadAirSeconds'):.1f}s / {_number(r.get('simDeadAirSeconds',r.get('deadAirSeconds',0))):.1f}s | {timing(r,'longestDeadAirSeconds','simLongestDeadAirSeconds'):.1f}s / {_number(r.get('simLongestDeadAirSeconds',r.get('longestDeadAirSeconds',0))):.1f}s | {dpm:.2f} | {e} | {r.get('kills',0)} | {r.get('roundsFired',0)} | {r.get('hitsGiven',0)}/{r.get('hitsTaken',0)} | {r.get('shotNearMisses',0)}/{r.get('groundNearMisses',0)} |")
    lines += ["", "## Timeline strip", "", "![Per-run timeline strip](timeline.svg)", "", "The strip uses one row per run; phase colour, dead-air shading, event symbols, and the tension trace are defined in the SVG legend.", ""]
    return {"schemaVersion": 2, "manifest": manifest, "runs": len(runs), "flags": fs, "pilots": summaries}, "\n".join(lines)

def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument("output_dir", type=Path); args = ap.parse_args()
    summary, report = make_report(args.output_dir); (args.output_dir / "report.md").write_text(report, encoding="utf-8")
    (args.output_dir / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True)+"\n", encoding="utf-8")
    manifest = summary["manifest"]; runs = load_runs(args.output_dir, manifest); (args.output_dir / "timeline.svg").write_text(svg_strip(runs), encoding="utf-8")
    print(f"wrote {args.output_dir / 'report.md'} ({len(runs)} runs, {len(summary['flags'])} flags)")

if __name__ == "__main__": main()
