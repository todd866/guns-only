#!/usr/bin/env node
/**
 * Pretty-print anca-audit JSONL: A/N/C/A rows via the real browser view model,
 * plus any R/T that fired since the previous sample.
 *
 *   ./bin/anca-audit -s rapier-launch | node tools/anca-audit/format.mjs
 *   node tools/anca-audit/format.mjs path/to/dump.jsonl
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { deriveAncaView } from "../../web/wwwroot/render/anca/anca_view_model.js";

const path = process.argv[2];
const input = path ? createReadStream(path, { encoding: "utf8" }) : process.stdin;

const rl = createInterface({ input, crlfDelay: Infinity });
let previousScenario = "";

for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let record;
  try {
    record = JSON.parse(trimmed);
  } catch (error) {
    console.error(`skip bad JSONL: ${error.message}`);
    continue;
  }

  if (record.scenario !== previousScenario) {
    if (previousScenario) console.log("");
    console.log(`══ ${record.scenario} ── ${record.title ?? ""}`.trimEnd());
    previousScenario = record.scenario;
  }

  const t = Number.isFinite(record.t) ? record.t.toFixed(1) : "?";
  console.log(`\n── ${record.sample} @ t=${t}s (beat ${record.beat_index})`);

  const radioLog = Array.isArray(record.radio_since_last_sample)
    ? record.radio_since_last_sample
    : [];
  if (radioLog.length > 0) {
    console.log("  R/T since last sample:");
    for (const call of radioLog) {
      const who = [call.speaker, call.callsign].filter(Boolean).join("/");
      console.log(
        `    [${Number(call.t).toFixed(1)}s] ${who} · ${call.id} · “${call.text}”`,
      );
    }
  }

  const state = record.state ?? {};
  const casevac = state.casevac_mission === true;
  // app.js passes null into the panel during casevac presentation.
  const view = casevac ? deriveAncaView(null) : deriveAncaView(state);
  if (record.timed_out) console.log("  ⚠ timed out waiting for a gate");
  console.log(`  panel visible: ${view.visible}${casevac ? " (casevac)" : ""}`);
  for (const row of view.rows) {
    const mark = row.tone === "quiet" ? "—" : row.tone.padEnd(10);
    console.log(`  ${row.letter}  ${mark}  ${row.line}`);
  }

  const phase = state.rapier_mission_phase_name;
  const checklist = state.checklist_active
    ? `${state.checklist_name} ${state.checklist_done}/${state.checklist_total}`
      + (state.checklist_next ? ` → ${state.checklist_next}` : "")
    : "—";
  const extras = [
    phase ? `phase=${phase}` : null,
    state.rapier_circuit_leg ? `leg=${state.rapier_circuit_leg}` : null,
    `checklist=${checklist}`,
    state.player_weapons_authorized === true ? "weapons=AUTH" : null,
    state.radio_active === true
      ? `live=${state.radio_speaker}: ${state.radio_text}`
      : null,
  ].filter(Boolean);
  if (extras.length) console.log(`  · ${extras.join(" · ")}`);
}
