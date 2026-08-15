// Ownship audio character from snapshot identity — presentation only.
// Prefer explicit audio_profile_id; fall back to player_aircraft_id.

const PROFILE_TO_CHARACTER = Object.freeze({
  "audio.rapier.turbo-ram.v1": "rapier",
  "audio.f22a.aged-twin-fan.v1": "f22",
  "audio.f14a.tf30-twin.v1": "f14",
  "audio.ah1g.t53-b540.v1": "cobra",
  "audio.fireboss.pt6a-67f.v1": "turboprop",
  "audio.fixed-wing.jet.v1": "jet",
});

export function resolvePropulsionCharacter(state) {
  const profile = String(state?.audio_profile_id ?? "").toLowerCase();
  if (PROFILE_TO_CHARACTER[profile]) return PROFILE_TO_CHARACTER[profile];

  const id = String(state?.player_aircraft_id ?? "").toLowerCase();
  if (id.includes("rapier")) return "rapier";
  if (id.includes("f22")) return "f22";
  if (id.includes("f14") || id.includes("f-14")) return "f14";
  if (id.includes("ah-1g") || id.includes("ah1g")) return "cobra";
  if (id.includes("at-802") || id.includes("fireboss")) return "turboprop";
  return "jet";
}

export function isAgedF22(state) {
  return resolvePropulsionCharacter(state) === "f22";
}
