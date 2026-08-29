/**
 * A parked AH-1G read from OUTSIDE, for Camp Ember's ramp. `ah1g_presence` is the pilot's
 * office — canopy frame and blades for the eye inside — so a ramp bird needs its own
 * silhouette: slender fuselage, tail boom, fin, static rotor bar, skids. TF2-illustrative
 * flat tones at true AH-1G scale (13.6 m fuselage, 13.4 m rotor). One group, no per-frame
 * cost beyond a transform.
 */

const OLIVE = 0x4b5534;
const OLIVE_DARK = 0x2c3222;
const CANOPY = 0x264b55;
const BLADE = 0x23291f;
const SKID = 0x4a4f43;

function box(THREE, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createParkedCobra(THREE) {
  const group = new THREE.Group();
  group.name = "AH1G_PARKED";
  const body = new THREE.MeshLambertMaterial({ color: OLIVE });
  const dark = new THREE.MeshLambertMaterial({ color: OLIVE_DARK });
  const canopy = new THREE.MeshLambertMaterial({ color: CANOPY });
  const blade = new THREE.MeshLambertMaterial({ color: BLADE });
  const skid = new THREE.MeshLambertMaterial({ color: SKID });

  // +z is nose-forward; y is up from the skid plane.
  group.add(box(THREE, body, 0, 1.55, 1.2, 0.99, 1.5, 7.4));    // fuselage
  const canopyMass = box(THREE, canopy, 0, 1.95, 4.6, 0.9, 1.0, 1.9);
  canopyMass.name = "AH1G_PARKED_CANOPY";
  group.add(canopyMass);
  group.add(box(THREE, dark, 0, 1.75, -3.9, 0.5, 0.75, 5.4));   // tail boom
  group.add(box(THREE, body, 0, 2.75, -6.35, 0.22, 1.9, 1.15)); // fin
  group.add(box(THREE, blade, 0.9, 2.3, -6.55, 1.9, 0.18, 0.24)); // tail rotor bar
  const mainRotor = box(THREE, blade, 0, 3.32, 0.9, 0.6, 0.12, 13.4);
  mainRotor.name = "AH1G_PARKED_MAIN_ROTOR";
  mainRotor.rotation.y = Math.PI / 4;
  group.add(mainRotor);                                          // static, off-axis silhouette
  group.add(box(THREE, dark, 0, 3.05, 0.9, 0.5, 0.5, 0.6));     // rotor mast
  group.add(box(THREE, body, 0, 2.3, 1.4, 3.4, 0.3, 0.9));      // stub wings
  for (const side of [-1, 1]) {
    group.add(box(THREE, skid, side * 0.95, 0.25, 0.9, 0.12, 0.14, 4.4)); // skid tubes
    group.add(box(THREE, skid, side * 0.75, 0.7, 2.2, 0.1, 1.0, 0.12));   // struts
    group.add(box(THREE, skid, side * 0.75, 0.7, -0.6, 0.1, 1.0, 0.12));
  }
  for (const mesh of group.children) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return { group };
}

/** Place a parked bird from a pool slot pose; `listRad` tips a crippled airframe. */
export function placeParkedCobra(parked, slot, listRad = 0) {
  parked.group.position.set(slot.east_m, slot.up_m - 0.315, -slot.north_m);
  parked.group.rotation.set(0, slot.yaw_rad, listRad, "YXZ");
}
