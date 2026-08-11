export const DEVELOPMENT_KOREA_TERRAIN_ID = "terrain.korea.central-front.v2";

/// Pure snapshot-to-loader routing contract used by FlightView and release tests. Terrain profile
/// identity selects the atlas; scenery profile remains an independently authored presentation
/// choice but must be supplied by the snapshot for the shared Ukraine product.
export function resolveTerrainPresentationRoute({
  state,
  ukraineTerrainId,
  terrainPackId = "korea-1950s",
  selectedBeat = 0,
} = {}) {
  if (typeof ukraineTerrainId !== "string" || !ukraineTerrainId) {
    throw new TypeError("Ukraine terrain identity is required");
  }
  const ukraineTheatre = state?.terrain_profile_id === ukraineTerrainId;
  const sceneryEra = ukraineTheatre
    ? (state?.terrain_scenery_profile || "ukraine-modern")
    : (state?.terrain_scenery_profile
      || (terrainPackId.includes("modern") || [7, 9, 10, 12].includes(Number(selectedBeat))
        ? "modern" : "1950s"));
  return Object.freeze({
    ukraineTheatre,
    loader: ukraineTheatre ? "ukraine-atlas" : "korea-atlas",
    terrainId: ukraineTheatre ? ukraineTerrainId : DEVELOPMENT_KOREA_TERRAIN_ID,
    sceneryEra,
  });
}
