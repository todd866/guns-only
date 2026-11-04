/** Synthetic Hold-the-Bridge authority slice for headless HUD renders. */
export function cobraHudBattleAuthority(overrides = {}) {
  const base = {
    mission_act: "engage",
    vehicle: {
      tick: 14_400,
      x_m: 0,
      y_m: 120,
      z_m: 0,
      yaw_rad: 0,
      ground_speed_mps: 4.1,
      true_airspeed_mps: 4.9,
      vertical_speed_mps: -0.4,
      rotorcraft: {
        regime: "Normal",
        main_rotor_rpm: 324,
        transmission_limit_fraction: 0.78,
        governor_saturated: false,
        vortex_ring_severity: 0,
        retreating_blade_stall_severity: 0,
        mast_bump_risk: 0,
        main_rotor_clearance_m: 22,
      },
    },
    gunner: {
      selected_target_id: "bridge.garrison",
      state: "tracking",
      reason: "ConsentReleased",
      fire_authorized: false,
    },
    ground_war: {
      combat_live: true,
      time_limit_s: 600,
      time_remaining_s: 597,
      ammo_remaining: 410,
      ammo_capacity: 750,
      ammo_bingo: false,
      ammo_dry: false,
      over_fob: false,
      fob_range_m: 1_840,
      air_mobile_eta_seconds: 8,
      tickets: { friendly: 297, hostile: 300 },
      ticket_bleed_per_second_per_point: 1,
      sites: [
        { id: "tip", label: "Tip", owner: "friendly", contested: false, capture_progress: 1,
          x_m: -200, y_m: 40, z_m: -400, capture_radius_m: 60 },
        { id: "bridge", label: "Cau Song Ma", owner: "hostile", contested: false, capture_progress: 0,
          x_m: 0, y_m: 40, z_m: 2_000, capture_radius_m: 60 },
        { id: "ford", label: "Ford", owner: "hostile", contested: true, capture_progress: 0.42,
          x_m: 400, y_m: 40, z_m: 800, capture_radius_m: 60 },
        { id: "ridge", label: "Ridge", owner: "hostile", contested: false, capture_progress: 0,
          x_m: 900, y_m: 80, z_m: 1_500, capture_radius_m: 60 },
      ],
      units: [
        { id: "bridge.garrison", faction: "hostile", role: "hard-point", fortified: true,
          objective_lock: true, alive: true, health: 22, max_health: 40,
          x_m: 0, y_m: 40, aim_y_m: 42, z_m: 2_000, home_site_id: "bridge" },
        { id: "observer.ridge", faction: "hostile", role: "dshk-site", alive: true,
          x_m: 500, y_m: 120, z_m: 1_200, home_site_id: "bridge" },
      ],
      events: [
        { tick: 14_388, kind: "gun-hit", unit_id: "bridge.garrison" },
      ],
    },
  };
  return {
    ...base,
    ...overrides,
    vehicle: { ...base.vehicle, ...(overrides.vehicle ?? {}) },
    ground_war: overrides.ground_war === undefined
      ? base.ground_war
      : { ...base.ground_war, ...overrides.ground_war },
  };
}
