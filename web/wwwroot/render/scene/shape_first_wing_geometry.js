import * as THREE from "../../vendor/three.module.js";

// Fixed visual sampling, not an airfoil or an engineering derivation. Eight chord intervals
// resolve a thin curved section while the eight-station ceiling bounds the mesh at 480 triangles.
const CHORD_FRACTIONS = Object.freeze([0, 0.06, 0.15, 0.3, 0.5, 0.7, 0.85, 0.94, 1]);
const MAX_HALF_STATIONS = 8;

function validatedWing(wing) {
  if (!wing || !Number.isFinite(wing.installationYM)) {
    throw new TypeError("Shape-first wing installationYM must be finite.");
  }
  if (!Array.isArray(wing.halfStations) || wing.halfStations.length < 2
    || wing.halfStations.length > MAX_HALF_STATIONS) {
    throw new RangeError("Shape-first wing requires 2–8 halfStations.");
  }
  const stations = wing.halfStations.map((station, index) => {
    for (const key of ["xM", "leadingZM", "trailingZM", "thicknessM"]) {
      if (!Number.isFinite(station?.[key]) || !Number.isFinite(Math.fround(station[key]))) {
        throw new TypeError(`Shape-first wing halfStations[${index}].${key} must be finite.`);
      }
    }
    const { xM, leadingZM, trailingZM, thicknessM } = station;
    if ((index === 0 && xM !== 0)
      || (index > 0 && Math.fround(xM) <= Math.fround(wing.halfStations[index - 1].xM))) {
      throw new RangeError("Shape-first wing stations must start at xM=0 and increase outboard.");
    }
    const chord = trailingZM - leadingZM;
    if (chord < 0 || (chord === 0 && index !== wing.halfStations.length - 1)) {
      throw new RangeError("Shape-first wing needs positive chord except at its final sharp tip.");
    }
    if (thicknessM < 0 || (chord > 0 && thicknessM === 0)) {
      throw new RangeError("Shape-first wing needs positive thickness at every nonzero-chord station.");
    }
    if (chord > 0 && (Math.fround(leadingZM) === Math.fround(trailingZM)
      || Math.fround(wing.installationYM - thicknessM * 0.5)
        === Math.fround(wing.installationYM + thicknessM * 0.5))) {
      throw new RangeError("Shape-first wing section collapses at Float32 presentation precision.");
    }
    return { xM, leadingZM, trailingZM, thicknessM };
  });
  return stations;
}

/**
 * Build a closed full wing directly from canonical geometry.wing station coordinates.
 *
 * Each authored nonzero-chord station has exactly its stated maximum total thickness, centered
 * on installationYM. sin(pi * chordFraction) is presentation interpolation only: it closes the
 * leading/trailing edges without changing planform, station dimensions, aerodynamics or the
 * engineering source. A final zero-chord station collapses to its single planform point; its
 * nominal thickness cannot be expressed on a chord with no interior.
 *
 * Material 0 covers the upper surface; material 1 covers the lower surface and blunt tip caps.
 * Normal vertices are shared within each surface, but split at razor edges and tip caps. Every
 * call owns its geometry and buffers. installationYM is already baked into the returned mesh.
 */
export function createShapeFirstWingGeometry(wing) {
  const half = validatedWing(wing);
  const stations = [
    ...half.slice(1).reverse().map((station) => ({ ...station, xM: -station.xM })),
    ...half,
  ];
  const span = half.at(-1).xM;
  const minimumZ = Math.min(...half.map((station) => station.leadingZM));
  const maximumZ = Math.max(...half.map((station) => station.trailingZM));
  const positions = [];
  const uvs = [];
  const indices = [];
  const vertex = (x, y, z, uv = null) => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(...(uv ?? [(x / span + 1) * 0.5, (z - minimumZ) / (maximumZ - minimumZ)]));
    return index;
  };
  const heightAt = (station, fraction) => station.thicknessM * 0.5
    * (fraction === 0 || fraction === 1 ? 0 : Math.sin(Math.PI * fraction));
  const makeSurface = (side) => stations.map((station) => {
    const chord = station.trailingZM - station.leadingZM;
    if (chord === 0) {
      const tip = vertex(station.xM, wing.installationYM, station.leadingZM);
      return CHORD_FRACTIONS.map(() => tip);
    }
    return CHORD_FRACTIONS.map((fraction) => vertex(station.xM,
      wing.installationYM + side * heightAt(station, fraction),
      fraction === 1 ? station.trailingZM : station.leadingZM + chord * fraction));
  });
  const top = makeSurface(1);
  const bottom = makeSurface(-1);
  const triangle = (a, b, c, reverse = false) => {
    // A sharp tip has one shared vertex, so a quad becomes one fan triangle, never a zero-area
    // triangle whose normalized normal would be undefined.
    if (a === b || b === c || c === a) return;
    indices.push(a, reverse ? c : b, reverse ? b : c);
  };
  const stitch = (surface, reverse) => {
    for (let station = 0; station < stations.length - 1; station++) {
      for (let chord = 0; chord < CHORD_FRACTIONS.length - 1; chord++) {
        const a = surface[station][chord];
        const b = surface[station + 1][chord];
        const c = surface[station][chord + 1];
        const d = surface[station + 1][chord + 1];
        // Mirror the diagonal as well as the positions. This keeps interpolated shape and
        // area-weighted smooth normals symmetric on either side of the centerline.
        if (stations[station].xM < 0) {
          triangle(a, c, d, reverse);
          triangle(a, d, b, reverse);
        } else {
          triangle(a, c, b, reverse);
          triangle(b, c, d, reverse);
        }
      }
    }
  };
  stitch(top, false);
  const topIndexCount = indices.length;
  stitch(bottom, true);

  // Nonzero-chord tips are closed by separate, flat-normal cap vertices. Sharp tips need no cap.
  for (const station of [stations[0], stations.at(-1)]) {
    const chord = station.trailingZM - station.leadingZM;
    if (chord === 0) continue;
    const center = vertex(station.xM, wing.installationYM,
      (station.leadingZM + station.trailingZM) * 0.5, [0.5, 0.5]);
    const contour = [
      ...CHORD_FRACTIONS.map((fraction) => [fraction, 1]),
      ...CHORD_FRACTIONS.slice(1, -1).reverse().map((fraction) => [fraction, -1]),
    ].map(([fraction, side]) => vertex(station.xM,
      wing.installationYM + side * heightAt(station, fraction),
      fraction === 1 ? station.trailingZM : station.leadingZM + chord * fraction,
      [fraction, 0.5 + side * heightAt(station, fraction) / station.thicknessM]));
    for (let point = 0; point < contour.length; point++) {
      triangle(center, contour[point], contour[(point + 1) % contour.length], station.xM < 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "SHAPE_FIRST_WING_GEOMETRY";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, indices.length - topIndexCount, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.shapeFirstWing = {
    interpolation: "presentation-only-sine-thickness",
    halfStationCount: half.length,
    installationYM: wing.installationYM,
    sharpTip: half.at(-1).leadingZM === half.at(-1).trailingZM,
  };
  return geometry;
}
