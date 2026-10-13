import assert from "node:assert/strict";
import test from "node:test";
import { fitCombatRow } from "../combat_row.js";
import { mobileTacticalReadout } from "../hud_readouts.js";

test("high-alpha cue reserves width and sheds optional readings before G, weapons or fuel", () => {
  const { combatParts } = mobileTacticalReadout({
    player_aircraft_id: "f-22a", high_alpha_recovery: true,
    mach: 0.39, g_actual: 3, assisted_flight: true,
    vertical_speed_fpm: -20000, ammo: 400, gun_heat: 0.3,
    fuel_lb: 12000, fuel_capacity_lb: 18000,
  }, {}, { fightActive: true });
  assert.deepEqual(combatParts.find((part) => part.reserved),
    { text: "→⊙←", optional: false, reserved: true });
  const fitted = fitCombatRow(combatParts, 250, (text) => text.length * 6.6);
  assert.equal(fitted.reservedText, "→⊙←");
  assert.ok(fitted.text.length * 6.6 + fitted.reservedWidth <= 250);
  for (const reading of ["3.0G", "GUN400", "T30%", "F12K"])
    assert.ok(fitted.text.includes(reading), fitted.text);
  assert.doesNotMatch(fitted.text, /↓20K/);
});

test("reserved cue survives even when required readings exceed the budget", () => {
  const fitted = fitCombatRow([
    { text: "GUN400", optional: false },
    { text: "↑2K", optional: true },
    { text: "→⊙←", optional: false, reserved: true },
  ], 40, (text) => text.length * 6);
  assert.equal(fitted.text, "GUN400");
  assert.equal(fitted.reservedText, "→⊙←");
  assert.equal(fitted.reservedWidth, 24);
});
