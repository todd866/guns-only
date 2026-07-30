import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");

async function read(relativePath) {
  return readFile(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const AUTHORITATIVE_RAPIER_FILES = [
  "docs/systems-simulation.md",
  "docs/airframes/rapier/README.md",
  "docs/airframes/rapier/13-directional-stability-and-tail-trade.md",
  "docs/airframes/rapier/16-manufacturing-and-industrial-basis.md",
  "docs/airframes/rapier/17-signatures-and-survivability.md",
  "docs/airframes/rapier/20-thermal-and-materials.md",
  "docs/airframes/rapier/84-industrial-network-and-supply-chain.md",
  "docs/airframes/rapier/85-service-life-maintenance-and-telemetry.md",
  "docs/airframes/rapier/90-failure-modes.md",
  "docs/airframes/rapier/95-cost-ledger.md",
  "docs/superpowers/specs/2026-07-27-rapier-airframe-se-and-jet-kit-design.md",
];

test("authoritative Rapier doctrine rejects the stale fixed-sortie life claims", async () => {
  const documents = await Promise.all(AUTHORITATIVE_RAPIER_FILES.map(async (relativePath) => ({
    relativePath,
    body: await read(relativePath),
  })));
  const forbidden = [
    /\b50-sortie(?:-shell)?\b/i,
    /\b50 sorties per structural shell\b/i,
    /\b2%\s+structural life per sortie\b/i,
    /\b2%-of-flyaway\b/i,
    /\baircraft is its ammunition\b/i,
    /\b500[- ]severe-mission(?:s)?\b/i,
  ];

  for (const { relativePath, body } of documents) {
    for (const phrase of forbidden) {
      assert.doesNotMatch(body, phrase, `${relativePath} contains retired doctrine ${phrase}`);
    }
  }
});

test("Rapier chapter 85 closes the component ledger and keeps life targets provisional", async () => {
  const body = await read(
    "docs/airframes/rapier/85-service-life-maintenance-and-telemetry.md",
  );

  assert.match(body, /not\s+a fifty-sortie round/i);
  assert.match(body, /first Block-0 forensic teardown gate/i);
  assert.match(body, /\|\s*\*\*50\*\*\s*\|[\s\S]{0,180}inactive qualification-gate placeholder/i);
  assert.match(body, /first Block-0 forensic teardown gate[\s\S]{0,80}not a scrap/i);
  assert.match(body, /\|\s*\*\*250\*\*\s*\|/);
  assert.match(body, /\|\s*\*\*500\*\*\s*\|/);
  assert.match(body, /\|\s*\*\*1,000\*\*\s*\|/);
  assert.match(body, /numerical life bands are \*\*inactive provisional[\s\S]{0,40}placeholders\*\*/i);
  assert.match(body, /physical sortie is not a unit of damage/i);
  assert.match(body, /“One sortie = one SME” is prohibited/i);
  assert.match(body, /Moving an engine[\s\S]*does not create a new component or reset any counter/i);
  assert.match(body, /Until an approved `SME-v0`[\s\S]*may not size production/i);
  assert.match(body, /Every component-family band in the table is inactive/i);
  assert.match(body, /Every numerical life\s+band in §4 is an \*\*inactive provisional placeholder\*\*/i);
});

test("service-life contracts preserve evidence, authority, idempotence, and frame budget", async () => {
  const lifecycle = await read(
    "docs/airframes/rapier/85-service-life-maintenance-and-telemetry.md",
  );
  const systems = await read("docs/systems-simulation.md");

  for (const contract of [
    "guns-only.installed-assembly.v1",
    "guns-only.service-life-sortie.v1",
    "guns-only.component-ledger-event.v1",
    "guns-only.service-life-cost-projection.v1",
  ]) {
    assert.match(lifecycle, new RegExp(contract.replaceAll(".", "\\.")));
  }
  assert.match(lifecycle, /same ID plus the same `record_sha256` is a no-op/i);
  assert.match(lifecycle, /same ID plus a\s+different hash is a quarantined conflict/i);
  assert.match(lifecycle, /unsupported channel with zero/i);
  assert.match(lifecycle, /Browser telemetry transports records but never authors fleet truth/i);
  assert.match(lifecycle, /supported 60 fps budget/i);
  assert.match(lifecycle, /256 total bin counters, 64 discrete-event slots/i);
  assert.match(lifecycle, /32 KiB canonical encoded sortie record/i);
  assert.doesNotMatch(lifecycle, /component_exposure_deltas\[\]/);
  assert.match(lifecycle, /first schema therefore contains no\s+per-component damage or exposure delta/i);
  assert.match(lifecycle, /Each airframe\/installed-manifest pair may\s+have at most one open reservation/i);
  assert.match(systems, /`SimulationSession` owns only one sortie/i);
  assert.match(systems, /reserves one stable sortie identity in its ledger before flight/i);
  assert.match(systems, /Applying each immutable\s+sortie record atomically consumes its reservation/i);
  assert.match(systems, /Browser telemetry transports[\s\S]*never their author/i);
});

test("industrial and cost documents consume the component doctrine", async () => {
  const industrial = await read(
    "docs/airframes/rapier/84-industrial-network-and-supply-chain.md",
  );
  const cost = await read("docs/airframes/rapier/95-cost-ledger.md");
  const readme = await read("docs/airframes/rapier/README.md");

  assert.match(industrial, /\*\*Accepted programme doctrine:\*\*/);
  assert.match(industrial, /50 severe-mission equivalents[\s\S]*not\s+retirement/i);
  assert.match(industrial, /\*\*250\*\*[\s\S]*\*\*500\*\*[\s\S]*\*\*1,000\*\*/);
  assert.match(industrial, /unknown\s+history is never interpreted as zero damage/i);
  assert.match(cost, /A completed\s+sortie receives no flat life charge/i);
  assert.match(cost, /confirmed repair, replacement, and combat loss/i);
  assert.match(cost, /never booked as actual sortie cost/i);
  assert.match(readme, /\[85\]\(85-service-life-maintenance-and-telemetry\.md\)/);
});

test("inactive SME labels cannot leak into cost or dispatch as usable quantities", async () => {
  const lifecycle = await read(
    "docs/airframes/rapier/85-service-life-maintenance-and-telemetry.md",
  );
  const industrial = await read(
    "docs/airframes/rapier/84-industrial-network-and-supply-chain.md",
  );
  const cost = await read("docs/airframes/rapier/95-cost-ledger.md");
  const failureModes = await read("docs/airframes/rapier/90-failure-modes.md");

  assert.match(lifecycle, /every SME number below is an inactive\s+programme label/i);
  assert.match(industrial, /labels remain inactive until chapter 85's `SME-v0`/i);
  assert.match(cost, /No valid per-sortie life amortisation can yet be calculated/i);
  assert.match(failureModes, /measure-only phase emits evidence\/exceedance flags/i);
  assert.match(lifecycle, /Measure-only instrumentation emits[\s\S]*cannot change any of these states/i);
});
