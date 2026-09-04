import test from "node:test";
import assert from "node:assert/strict";
import {
  meshNavPresentation,
  parseMeshPlaceCatalog,
  resolveGuidanceGates,
} from "../mesh_nav_presentation.js";
import {
  canvasToWorld,
  hitTestPlace,
  worldToCanvas,
} from "../mesh_nav_map.js";

test("meshNavPresentation returns null without active dest", () => {
  assert.equal(meshNavPresentation({ fuel_lb: 1000 }), null);
});

test("meshNavPresentation binds ActiveDest solution fields", () => {
  const view = meshNavPresentation({
    mesh_active_known: true,
    mesh_active_display_name: "Crimea coast survey",
    mesh_active_is_place: true,
    mesh_active_place_id: "place.ukraine.crimea-coast-survey.v1",
    mesh_transit_mode: "open_segment",
    mesh_dest_range_nm: 42.5,
    mesh_dest_bearing_deg: 210,
    mesh_dest_turn_deg: -15,
    mesh_dest_closure_kts: 40,
    mesh_dest_eta_min: 12,
    mesh_fuel_to_dest_lb: 800,
    mesh_fuel_on_arrival_dest_lb: 3200,
    mesh_fuel_dest_to_home_lb: 900,
    mesh_reserve_margin_via_dest_lb: 200,
    fuel_reserve_target_lb: 600,
    fuel_lb: 4000,
    ground_speed_kts: 480,
    fuel_flow_pph: 6000,
  });
  assert.equal(view.displayName, "Crimea coast survey");
  assert.equal(view.rangeNm, 42.5);
  assert.equal(view.fuelToDestLb, 800);
  assert.equal(view.reserveMarginViaDestLb, 200);
  assert.equal(view.travelState, "inbound");
  assert.ok(view.lbPerNm > 0);
});

test("parseMeshPlaceCatalog reads escaped JSON array string", () => {
  const places = parseMeshPlaceCatalog({
    mesh_place_catalog_json: JSON.stringify([
      {
        id: "place.ukraine.crimea-coast-survey.v1",
        name: "Crimea coast survey",
        east_m: -320000,
        north_m: -390000,
        role: "destination",
        selectable: true,
      },
    ]),
  });
  assert.equal(places.length, 1);
  assert.equal(places[0].id, "place.ukraine.crimea-coast-survey.v1");
  assert.equal(places[0].selectable, true);
});

test("world/canvas transforms round-trip at centre", () => {
  const centre = worldToCanvas(10, 20, 10, 20, 200, 100, 1852 * 120);
  assert.ok(Math.abs(centre.x - 100) < 1e-9);
  assert.ok(Math.abs(centre.y - 50) < 1e-9);
  const world = canvasToWorld(100, 50, 10, 20, 200, 100, 1852 * 120);
  assert.ok(Math.abs(world.eastM - 10) < 1e-6);
  assert.ok(Math.abs(world.northM - 20) < 1e-6);
});

test("hitTestPlace prefers nearest selectable place", () => {
  const places = [
    { id: "a", eastM: 0, northM: 0, selectable: true },
    { id: "b", eastM: 5000, northM: 0, selectable: false },
  ];
  const point = worldToCanvas(0, 0, 0, 0, 200, 200, 20_000);
  const hit = hitTestPlace(places, point.x, point.y, 0, 0, 200, 200, 20_000, 12);
  assert.equal(hit.id, "a");
});

test("approach gates keep directional chevron flags", () => {
  const gates = resolveGuidanceGates({
    approach_guidance_active: true,
    approach_gate_count: 1,
    approach_gates: [{
      id: "follow",
      east_m: 10,
      north_m: 20,
      up_m: 30,
      half_m: 24,
      rtb: true,
      active: true,
    }],
  });
  assert.equal(gates.length, 1);
  assert.equal(gates[0].rtb, true);
  assert.equal(gates[0].ingress, false);
  assert.equal(gates[0].join, false);
});
