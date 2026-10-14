// Presentation surrogate, not measured lamp photometry: retain the authored near-field
// glare cap, then shrink with angular range. Reference is a 1 km light at a 600 px focal
// length (~720 px high / 62 degree vertical FOV). No sim or runway geometry is changed.
const REFERENCE_RANGE_M = 1000;
const REFERENCE_FOCAL_PX = 600;

// CPU reference for deterministic optics tests. Runtime attenuation is per vertex on the
// GPU, so lights at opposite ends of a 3 km runway use their own range without CPU walks.
export function runwayLightFootprint(sizePx, rangeM, focalPx = REFERENCE_FOCAL_PX, pixelRatio = 1) {
  const diameterPx = sizePx * pixelRatio * Math.min(1,
    REFERENCE_RANGE_M / Math.max(rangeM, 1) * focalPx / REFERENCE_FOCAL_PX);
  return {
    diameterPx: Math.max(1, diameterPx),
    coverage: Math.min(1, diameterPx * diameterPx),
  };
}

export function attenuateRunwayLights(material) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader) => {
    previousCompile(shader);
    shader.vertexShader = `varying float vRunwayLightCoverage;\n${shader.vertexShader}`
      .replace('gl_PointSize = size;', `
        float runwayLightDiameter = size * min(1.0,
          ${REFERENCE_RANGE_M.toFixed(1)} / max(length(mvPosition.xyz), 1.0)
          * (scale * projectionMatrix[1][1]) / ${REFERENCE_FOCAL_PX.toFixed(1)});
        gl_PointSize = max(1.0, runwayLightDiameter);
        vRunwayLightCoverage = min(1.0, runwayLightDiameter * runwayLightDiameter);
      `);
    // WebGL clamps subpixel points to at least one physical pixel. Carry their projected
    // area into alpha instead: energy falls as 1/range², and overlapping distant lamps
    // aggregate faintly rather than forming an opaque strip. Haze still applies normally.
    shader.fragmentShader = `varying float vRunwayLightCoverage;\n${shader.fragmentShader}`
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * vRunwayLightCoverage );');
  };
  material.customProgramCacheKey = () => `${previousKey}|runway-light-angular-v1`;
  return material;
}
