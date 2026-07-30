import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// This is a doctrine lint for the not-yet-implemented force economy. It protects authority and
// design boundaries in prose; it does not claim to exercise runtime transactions, persistence, or
// the legacy PointsLedger. Those executable gates are explicitly listed in the design's Phase 0
// and acceptance sections.

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");

async function read(relativePath) {
  return readFile(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

const ECONOMY_DOCUMENT = "docs/air-war-economy-and-force-management.md";

test("force economy copies the institutional loop rather than a universal points wallet", async () => {
  const body = await read(ECONOMY_DOCUMENT);

  assert.match(body, /centralize fiduciary control[\s\S]*decentralize[\s\S]*product choice/i);
  assert.match(body, /There is no universal war currency/i);
  assert.match(body, /Combat points are one \*\*supplemental allocation instrument\*\*/i);
  assert.match(body, /They are not money, cost, inventory,\s*readiness, airworthiness, industrial capacity, or personal pilot income/i);
  assert.match(body, /baseline state procurement[\s\S]*direct unit allocations[\s\S]*innovation grants[\s\S]*partner-earmarked industrial finance/i);
  assert.match(body, /The seven ledgers/i);
  assert.match(body, /It is not an\s+implementation test/i);

  for (const ledger of [
    "Funding and obligation",
    "Physical stock and custody",
    "Airworthiness and work",
    "Production and repair capacity",
    "People and qualification",
    "Operational evidence and trust",
    "Time, access, and command authority",
  ]) {
    assert.match(body, new RegExp(ledger, "i"));
  }
});

test("campaign mutations use stable exact-once records outside sortie and browser authority", async () => {
  const economy = await read(ECONOMY_DOCUMENT);
  const systems = await read("docs/systems-simulation.md");
  const platform = await read("docs/platform-architecture.md");
  const lifecycle = await read(
    "docs/airframes/rapier/85-service-life-maintenance-and-telemetry.md",
  );

  assert.match(economy, /campaign reserves a stable `assignment_id` before launch/i);
  assert.match(economy, /same result identity and canonical hash twice is a no-op/i);
  assert.match(economy, /Submission handling is orthogonal to assignment state/i);
  assert.match(economy, /conflicting_hash_quarantined/i);
  assert.match(economy, /accepted canonical result stays accepted and is never displaced/i);
  assert.match(economy, /Abandonment closes the assignment, but does not restore assembly\s+availability/i);
  assert.match(economy, /canonical append—not a chain of materialized views—is the exactly-once boundary/i);
  assert.match(economy, /projection stores its last accepted journal sequence and model revision/i);
  assert.match(economy, /Cancellation or expiry is allowed only before launch/i);
  assert.match(economy, /signed \*\*provisional evidence\*\*, not authoritative physical or economic\s+state/i);
  assert.match(economy, /Browser local storage, presentation state, lossy telemetry[\s\S]*never author campaign truth/i);
  assert.match(economy, /Mission score, verified effect, financial cost, lifecycle exposure, and political allocation[\s\S]*separate projections/i);
  assert.match(economy, /`assignment_id` is the same stable value as Rapier lifecycle `ledger_sortie_id`/i);
  assert.match(systems, /persistent force economy is downstream of sortie and component truth/i);
  assert.match(systems, /one atomic canonical\s+`sortie_result_accepted` journal append/i);
  assert.match(platform, /One atomic accepted-result\s+journal append/i);
  assert.match(lifecycle, /same stable identity/i);
  assert.match(lifecycle, /Abandoned` closes the assignment reservation state, but does \*\*not\*\* restore the\s+assembly to availability/i);
  assert.match(lifecycle, /requires separate custody, configuration, and\s+serviceability reconciliation before another reservation can open/i);
});

test("scarcity remains causal, humane, and cannot remove sandbox practice", async () => {
  const economy = await read(ECONOMY_DOCUMENT);
  const governance = await read("docs/content-governance.md");

  assert.match(economy, /Minimum defensive supply, medical care, rescue, food, and required safety work do not depend on\s+effect points/i);
  assert.match(economy, /Safe abort, ROE compliance, civilian protection, rescue, and honest prototype failure do not\s+become financially irrational/i);
  assert.match(economy, /Every generated campaign state retains at least one launchable, repair, logistics, observation,\s+training, negotiation, or recovery action/i);
  assert.match(economy, /unrestricted current mission picker remains \*\*sandbox mode\*\*/i);
  assert.match(economy, /What is missing\? Who owns the next action\? What is the earliest credible completion\?/i);
  assert.match(economy, /maximum feasible matching and schedule/i);
  assert.match(economy, /minimum of raw counts is only an upper bound/i);
  assert.match(economy, /Campaign time is an explicit deterministic simulation clock/i);
  assert.match(economy, /null-threat` or `no-action/i);
  assert.match(governance, /Outcome-linked points are at most a capped supplemental\s+allocation channel/i);
  assert.match(governance, /derived run-scoped readiness projection/i);
});

test("existing points and arcade currencies are explicitly narrower than the force economy", async () => {
  const points = await read(
    "docs/superpowers/specs/2026-07-27-eastern-authority-points-design.md",
  );
  const pointsPlan = await read(
    "docs/superpowers/plans/2026-07-27-eastern-authority-points.md",
  );
  const roguelite = await read("docs/roguelite-loop-design.md");
  const northStar = await read("docs/product-north-star.md");

  assert.match(points, /superseded as campaign-economy authority/i);
  assert.match(points, /points slip is political\/institutional\s*>?\s*presentation, not money/i);
  assert.match(points, /cannot block sandbox flight/i);
  assert.doesNotMatch(pointsPlan, /hard lock is follow-on|soft clearance gate/i);
  assert.match(pointsPlan, /must not reuse this balance/i);
  assert.match(roguelite, /isolated arcade\/sandbox abstraction, not the persistent world's military\s+economy/i);
  assert.match(northStar, /multi-ledger[\s\S]*future air-war economy and force-management system/i);

  const economy = await read(ECONOMY_DOCUMENT);
  assert.match(economy, /No authoritative campaign economy is implemented yet/i);
  assert.match(economy, /mission\/outcome\/net tuple rather than a stable assignment identity/i);
  assert.match(economy, /emits the slip fields for finished missions generally/i);
  assert.match(economy, /Phase 0 must quarantine the slip/i);
  assert.match(economy, /must not attempt to migrate the existing point balance into money/i);
});

test("Rapier balloon economics reconcile physical facts without kill-to-cash or flat life", async () => {
  const economy = await read(ECONOMY_DOCUMENT);
  const cost = await read("docs/airframes/rapier/95-cost-ledger.md");

  assert.match(economy, /worked scenario: Rapier against the Ceiling/i);
  assert.match(economy, /protected effect is \*\*G-12 remains able to launch through the night window\*\*/i);
  assert.match(economy, /capped supplemental equipment envelope, not eleven\s+bounties/i);
  assert.match(economy, /without a kill-to-cash shortcut/i);
  assert.match(cost, /A completed\s+sortie receives no flat life charge/i);
});
