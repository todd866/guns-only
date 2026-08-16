import test from "node:test";
import assert from "node:assert/strict";
import { resolvePropulsionCharacter } from "../audio_character.js";
import { flightPropulsionGraphGates } from "../flight_audio.js";

test("Fire Boss selects the shared turboprop graph exclusively", () => {
  const state = { audio_profile_id: "audio.fireboss.pt6a-67f.v1" };
  assert.equal(resolvePropulsionCharacter(state), "turboprop");
  assert.deepEqual(flightPropulsionGraphGates(state, true), {
    propulsionCharacter: "turboprop",
    cobraActive: false,
    f14Active: false,
    turbopropActive: true,
    jetMuted: true,
    cobraMuted: true,
    f14Muted: true,
    turbopropMuted: false,
    radioEngine: "turboprop",
  });
  assert.equal(flightPropulsionGraphGates(state, false).turbopropMuted, true);
});

test("Fire Boss identity fallback selects turboprop without an explicit profile", () => {
  assert.equal(resolvePropulsionCharacter({ player_aircraft_id: "aircraft.at-802f-fireboss" }),
    "turboprop");
});
