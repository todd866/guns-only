import {ALLEY_SCENERY_BOUNDS} from './bowling-alley.mjs';
import {RESIDENTIAL_BOUNDS} from './residential-frame.mjs';
// Existing authored district meshes keep native metre scale. The public entrance anchors
// match catalog.mjs; a six-metre forecourt keeps the perimeter off public roads.
// These these footprints replace generic OSM extrusion only in the play space.
export const DISTRICT_ZONES = {
  housing: {anchor: [-1285, 0, -1132], entry: [3, 0, 86], bounds: [-108, -80, 108, 80]},
  bx: {anchor: [-546, 0, 791], entry: [3, 0, 49.3], bounds: [-52.3, -33.3, 52.3, 43.3]},
  school: {anchor: [-1228, 0, 718], entry: [10.9, 0, 52.06], bounds: [-54.06, -74.3, 30.06, 46.06]}
};
export const districtOffset = id => DISTRICT_ZONES[id].anchor.map((v, i) => v - DISTRICT_ZONES[id].entry[i]);
export const districtBounds = id => {
  const b = DISTRICT_ZONES[id].bounds,
    [x, , z] = districtOffset(id);
  return [b[0] + x, b[1] + z, b[2] + x, b[3] + z];
};
export const DISTRICT_BOUNDS = Object.keys(DISTRICT_ZONES).map(districtBounds);
export const TERRAIN_BOUNDS = [...DISTRICT_BOUNDS, RESIDENTIAL_BOUNDS];
// Strike reuses its mapped shell. Suppress the generic tile copy and all scenery,
// including the roads crossing it, but leave the ground under its entrances.
export const SCENERY_BOUNDS = [...TERRAIN_BOUNDS, ALLEY_SCENERY_BOUNDS];
export const overlapsDistrict = b =>
  SCENERY_BOUNDS.some(d => b[0] <= d[2] && b[2] >= d[0] && b[1] <= d[3] && b[3] >= d[1]);
