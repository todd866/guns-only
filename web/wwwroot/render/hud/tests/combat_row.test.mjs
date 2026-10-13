import assert from "node:assert/strict";
import test from "node:test";
import { fitCombatRow } from "../combat_row.js";
import { mobileTacticalReadout } from "../hud_readouts.js";

test("high-alpha cue reserves width without dropping automation, vertical speed or ammunition", () => {
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
  for (const reading of ["AUTO COR", "↓20K", "GUN400", "T30%", "F12K"])
    assert.ok(fitted.text.includes(reading), fitted.text);
  assert.doesNotMatch(fitted.text, /M.39/);
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

for (const highAlpha of [false, true]) {
  test(`320px large-text row preserves combined flight/weapon truth (recovery=${highAlpha})`, () => {
    const { combatParts } = mobileTacticalReadout({
      player_aircraft_id: "f-22a", high_alpha_recovery: highAlpha,
      assisted_flight: true, assisted_speed_bias_kts: 30,
      mach: 0.39, g_actual: 3, vertical_speed_fpm: -20000,
      ammo: 480, gun_heat: 1, gun_overheat: true, fuel_lb: 1900,
    }, {}, { fightActive: true, condensed: true });
    const measure = (text) => text.length * 6.8;
    const fitted = fitCombatRow(combatParts, 220, measure);
    for (const reading of ["AUTO+30", "↓20K", "GUN480", "OVERHEAT"])
      assert.ok(fitted.text.split("·").includes(reading), fitted.text);
    assert.equal(fitted.reservedText, highAlpha ? "→⊙←" : "");
    assert.ok(measure(fitted.text) + fitted.reservedWidth <= 220, JSON.stringify(fitted));
  });
}
