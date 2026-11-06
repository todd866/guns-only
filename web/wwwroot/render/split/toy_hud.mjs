// One row per instrument: symbol, gauge, value, short datum.
// Explanations stay in `title` (tooltip / aria), not a second line.

import {CAST, castAt} from "./toy_cast.mjs";
import {POPS_TO_WIN} from "./toy_score.mjs";

export function pips(score, total = POPS_TO_WIN) {
  const n = Math.max(0, Math.min(total, Math.trunc(Number(score) || 0)));
  return "●".repeat(n) + "○".repeat(total - n);
}

export function hudRows(session, seat) {
  const craft = session.crafts?.find((c) => c.seat === seat);
  const coop = session.mode === "coop";
  const score = coop ? session.pops?.team ?? 0 : session.pops?.[seat] ?? 0;
  const foe = coop ? castAt(session.castIndex) : null;
  const kind = craft?.kind === "chopper" ? "chopper" : "jet";
  const dartReady = (craft?.coolDart ?? 0) <= 0;
  const balloonReady = (craft?.coolBalloon ?? 0) <= 0;
  return [
    {
      symbol: kind === "chopper" ? "🚁" : "✈",
      pips: pips(score),
      value: String(Math.trunc(score)),
      datum: "pops",
      title: foe ? `${foe.name}. ${foe.beat}` : "pops",
    },
    {
      symbol: "✦",
      fill: dartReady ? 1 : Math.max(0, 1 - (craft?.coolDart ?? 0) / 0.22),
      value: "dart",
      datum: dartReady ? "ready" : "wait",
      title: "A foam dart",
    },
    {
      symbol: "💧",
      fill: balloonReady ? 1 : Math.max(0, 1 - (craft?.coolBalloon ?? 0) / 0.8),
      value: "balloon",
      datum: balloonReady ? "ready" : "wait",
      title: "B water balloon",
    },
    {
      symbol: "▐",
      fill: Math.max(0, Math.min(1, Number(craft?.lever) || 0)),
      value: String(Math.round((Number(craft?.lever) || 0) * 100)),
      datum: "thr",
      title: "triggers",
    },
  ];
}

export function menuRows(session) {
  const coop = session.mode === "coop";
  const chopper = session.craft === "chopper";
  return [
    {
      act: "mode",
      symbol: "⚔",
      value: coop ? "CO-OP" : "DOGFIGHT",
      datum: "mode",
      title: coop ? "Both versus the toys" : "Left versus right, first to 5",
    },
    {
      act: "craft",
      symbol: chopper ? "🚁" : "✈",
      value: chopper ? "CHOPPER" : "JET",
      datum: "toy",
      title: "Same toy for both players",
    },
    {act: "fly", symbol: "▶", value: "FLY", datum: "", title: "Fly"},
  ];
}

export function pauseRows(playersLabel) {
  const rows = [
    {act: "resume", symbol: "▶", value: "RESUME", datum: "", title: "Resume"},
  ];
  if (playersLabel) {
    rows.push({
      act: "players",
      symbol: "▸",
      value: playersLabel,
      datum: "pads",
      title: playersLabel,
    });
  }
  rows.push({act: "tomenu", symbol: "✈", value: "TOYS", datum: "menu", title: "Pick mode"});
  return rows;
}

export function resultRows(session) {
  if (session.mode === "dogfight") {
    return [
      {symbol: "✈", pips: pips(session.pops?.p1 ?? 0), value: String(session.pops?.p1 ?? 0), datum: "pops", title: "left"},
      {symbol: "✈", pips: pips(session.pops?.p2 ?? 0), value: String(session.pops?.p2 ?? 0), datum: "pops", title: "right"},
      {act: "again", symbol: "▶", value: "AGAIN", datum: "", title: "Fly again"},
    ];
  }
  const last = CAST[CAST.length - 1];
  return [
    {symbol: "✈", pips: pips(POPS_TO_WIN), value: String(POPS_TO_WIN), datum: "pops", title: last?.name ?? "pops"},
    {act: "again", symbol: "▶", value: "AGAIN", datum: "", title: "Fly again"},
  ];
}
