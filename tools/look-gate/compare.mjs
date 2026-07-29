#!/usr/bin/env node
// Ukraine soft-world look gate — palette + structure vs fiction-tagged art-refs.
// Spec: docs/superpowers/specs/2026-07-29-soft-world-look-gate-design.md
//
//   node tools/look-gate/compare.mjs --shots tools/terrain-look/shots --corpus soft-world
//   GUNS_LOOK_GATE_ALLOW_MISSING=1 node tools/look-gate/compare.mjs ...

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CAPTURE_REFS, loadCorpus } from "./corpus.mjs";
import {
  extractFeaturesFromFile,
  paletteDistance,
  structureDistance,
} from "./features.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(`Usage: node tools/look-gate/compare.mjs --shots <dir> [--corpus soft-world] [--mode warn|fail] [--out report.json]
Exit: 0 pass/warn-only; 1 fail; 2 usage`);
}

function parseArgs(argv) {
  const args = {
    shots: null,
    corpus: "soft-world",
    mode: null,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--shots") args.shots = argv[++i];
    else if (a === "--corpus") args.corpus = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") return null;
    else {
      console.error(`Unknown arg: ${a}`);
      return null;
    }
  }
  if (!args.shots) return null;
  return args;
}

function thresholdsFor(thresholds, name) {
  return thresholds.captures[name] ?? thresholds.captures["*"];
}

function isDegraded(provenance, expected) {
  if (!provenance) return { degraded: false, reasons: ["missing-provenance"] };
  const reasons = [];
  const tier = provenance.qualityTier ?? provenance.diagnostics?.qualityTier;
  const gov = Number(
    provenance.governorLevel
      ?? provenance.diagnostics?.governorLevel
      ?? 0,
  );
  if (tier && expected.qualityTier && tier !== expected.qualityTier) {
    reasons.push(`qualityTier=${tier} (expected ${expected.qualityTier})`);
  }
  if (Number.isFinite(gov) && gov > (expected.maxGovernorLevel ?? 0)) {
    reasons.push(`governorLevel=${gov}`);
  }
  return { degraded: reasons.length > 0, reasons, tier, governorLevel: gov };
}

async function loadViews(shotsDir) {
  try {
    const raw = await readFile(join(shotsDir, "views.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listShotPngs(shotsDir) {
  const names = await readdir(shotsDir);
  return names.filter((n) => n.endsWith(".png")).sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exitCode = 2;
    return;
  }
  const shotsDir = resolve(args.shots);
  const thresholds = JSON.parse(
    await readFile(join(SCRIPT_DIR, "thresholds.json"), "utf8"),
  );
  const mode = args.mode ?? thresholds.mode ?? "warn";
  const allowMissing = process.env.GUNS_LOOK_GATE_ALLOW_MISSING === "1";

  const corpus = await loadCorpus(args.corpus, { allowMissing });
  const views = await loadViews(shotsDir);
  const captureMeta = new Map();
  for (const cap of views?.captures ?? []) {
    captureMeta.set(cap.name, cap);
  }

  const pngs = await listShotPngs(shotsDir);
  const scoredNames = new Set([
    ...Object.keys(DEFAULT_CAPTURE_REFS),
    ...[...captureMeta.keys()],
  ]);
  const rows = [];
  let hardFail = false;
  let warnCount = 0;

  for (const file of pngs) {
    const name = basename(file, ".png");
    if (!scoredNames.has(name) && !DEFAULT_CAPTURE_REFS[name]) {
      // Skip legacy/extra stills unless mapped.
      if (!["steppe-low", "corridor-mid", "high-oblique"].includes(name)) continue;
    }
    const meta = captureMeta.get(name) ?? {};
    const provenance = {
      qualityTier: meta.qualityTier
        ?? meta.diagnostics?.qualityTier
        ?? meta.provenance?.qualityTier,
      governorLevel: meta.governorLevel
        ?? meta.diagnostics?.governorLevel
        ?? meta.provenance?.governorLevel
        ?? 0,
      softWorld: meta.softWorld ?? meta.provenance?.softWorld ?? true,
      terrainId: meta.diagnostics?.terrainId ?? meta.terrainId,
      diagnostics: meta.diagnostics,
    };
    const degrade = isDegraded(provenance, thresholds.expectedProfile);
    const refIds = DEFAULT_CAPTURE_REFS[name] ?? ["no-mans-land-mood-v1"];
    const caps = thresholdsFor(thresholds, name);
    const features = await extractFeaturesFromFile(join(shotsDir, file));

    let best = null;
    for (const id of refIds) {
      const ref = corpus.byId[id];
      if (!ref) continue;
      const palette = paletteDistance(features, ref.features);
      const structure = structureDistance(features, ref.features);
      const candidate = { refId: id, palette, structure };
      if (!best
        || candidate.palette + candidate.structure < best.palette + best.structure) {
        best = candidate;
      }
    }

    const issues = [];
    if (!best) {
      issues.push("no-corpus-ref");
      hardFail = true;
    } else {
      if (best.palette > caps.maxPaletteDistance) {
        issues.push(`palette ${best.palette.toFixed(3)} > ${caps.maxPaletteDistance}`);
      }
      if (best.structure > caps.maxStructureDistance) {
        issues.push(`structure ${best.structure.toFixed(3)} > ${caps.maxStructureDistance}`);
      }
      if (features.groundEdgeEnergy < caps.minGroundEdgeEnergy) {
        issues.push(
          `groundEdgeEnergy ${features.groundEdgeEnergy.toFixed(2)} < ${caps.minGroundEdgeEnergy}`,
        );
      }
    }

    const lookFail = issues.length > 0;
    // Degraded captures never hard-fail the desktop Ukraine profile.
    const countsAsFail = lookFail && !degrade.degraded;
    if (countsAsFail) {
      if (mode === "fail") hardFail = true;
      else warnCount += 1;
    } else if (lookFail && degrade.degraded) {
      warnCount += 1;
      issues.push(`degradedCapture:${degrade.reasons.join(",")}`);
    }

    const row = {
      name,
      file,
      size: (await stat(join(shotsDir, file))).size,
      provenance,
      degradedCapture: degrade.degraded,
      degradeReasons: degrade.reasons,
      refId: best?.refId ?? null,
      paletteDistance: best?.palette ?? null,
      structureDistance: best?.structure ?? null,
      groundEdgeEnergy: features.groundEdgeEnergy,
      thresholds: caps,
      issues,
      status: !lookFail
        ? "pass"
        : degrade.degraded
          ? "degraded-warn"
          : mode === "fail"
            ? "fail"
            : "warn",
    };
    rows.push(row);
    const tag = row.status.toUpperCase();
    console.log(
      `${tag.padEnd(14)} ${name}  palette=${best?.palette?.toFixed(3) ?? "—"}  `
      + `structure=${best?.structure?.toFixed(3) ?? "—"}  `
      + `edge=${features.groundEdgeEnergy.toFixed(2)}`
      + (issues.length ? `  · ${issues.join("; ")}` : ""),
    );
  }

  const report = {
    mode,
    corpus: args.corpus,
    shotsDir,
    missingCorpus: corpus.missing,
    viewport: views?.viewport ?? null,
    rows,
    warnCount,
    hardFail,
  };

  const outPath = args.out
    ? resolve(args.out)
    : join(shotsDir, "look-gate-report.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report ${outPath}`);

  if (hardFail) process.exitCode = 1;
  else process.exitCode = 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
