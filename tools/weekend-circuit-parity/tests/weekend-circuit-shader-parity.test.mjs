import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const file = (relative) => readFile(new URL(relative, root), "utf8");
const RECIPROCAL_PI = 0.3183098861837907;

const clamp = (value) => Math.max(0, Math.min(1, value));
const dot = (left, right) => left.reduce((sum, value, index) =>
  sum + value * right[index], 0);
const scale = (value, scalar) => value.map((component) => component * scalar);
const multiply = (left, right) => left.map((value, index) => value * right[index]);
const add = (...values) => values[0].map((_, index) =>
  values.reduce((sum, value) => sum + value[index], 0));
const mix = (left, right, amount) => left.map((value, index) =>
  value * (1 - amount) + right[index] * amount);
const normalize = (value) => {
  const length = Math.hypot(...value);
  return value.map((component) => component / length);
};

function linearChannel(srgb) {
  return srgb <= 0.04045
    ? srgb / 12.92
    : ((srgb + 0.055) / 1.055) ** 2.4;
}

function linearHex(hex) {
  return [0, 2, 4].map((offset) =>
    linearChannel(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255));
}

function displayHex(hex) {
  return [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function fSchlick(f0, dotVH) {
  const fresnel = 2 ** ((-5.55473 * dotVH - 6.98316) * dotVH);
  return f0.map((value) => value * (1 - fresnel) + fresnel);
}

function brdfGgx(light, view, normal, specularColor, roughness) {
  const alpha = roughness * roughness;
  const alpha2 = alpha * alpha;
  const half = normalize(add(light, view));
  const dotNL = clamp(dot(normal, light));
  const dotNV = clamp(dot(normal, view));
  const dotNH = clamp(dot(normal, half));
  const dotVH = clamp(dot(view, half));
  const gv = dotNL * Math.sqrt(alpha2 + (1 - alpha2) * dotNV * dotNV);
  const gl = dotNV * Math.sqrt(alpha2 + (1 - alpha2) * dotNL * dotNL);
  const visibility = 0.5 / Math.max(gv + gl, 1e-6);
  const denominator = dotNH * dotNH * (alpha2 - 1) + 1;
  const distribution = RECIPROCAL_PI * alpha2 / (denominator * denominator);
  return scale(fSchlick(specularColor, dotVH), visibility * distribution);
}

function physicalLighting(sample) {
  const normal = normalize(sample.normal);
  const view = normalize(sample.view);
  const light = normalize([-1_200, 2_400, 900]);
  const hemisphere = scale(mix(
    linearHex("67745f"),
    linearHex("f4f8f4"),
    dot(normal, [0, 1, 0]) * 0.5 + 0.5,
  ), 1.65);
  const sun = scale(linearHex("ffefd1"), 2.05);
  const dotNL = clamp(dot(normal, light));
  const diffuseColor = scale(sample.albedo, 1 - sample.metalness);
  const specularColor = mix([0.04, 0.04, 0.04], sample.albedo, sample.metalness);
  const roughness = Math.min(
    Math.max(sample.roughness, 0.0525) + sample.geometryRoughness,
    1,
  );
  const irradiance = scale(sun, dotNL);
  return add(
    scale(multiply(irradiance, diffuseColor), RECIPROCAL_PI),
    multiply(irradiance, brdfGgx(light, view, normal, specularColor, roughness)),
    scale(multiply(hemisphere, diffuseColor), RECIPROCAL_PI),
  );
}

function multiplyMatrix(matrix, value) {
  return matrix.map((row) => dot(row, value));
}

function acesFilmic(value, exposure = 1.04) {
  let color = scale(value, exposure / 0.6);
  color = multiplyMatrix([
    [0.59719, 0.35458, 0.04823],
    [0.07600, 0.90834, 0.01566],
    [0.02840, 0.13383, 0.83777],
  ], color);
  color = color.map((component) => {
    const numerator = component * (component + 0.0245786) - 0.000090537;
    const denominator = component * (0.983729 * component + 0.4329510) + 0.238081;
    return numerator / denominator;
  });
  return multiplyMatrix([
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
  ], color).map(clamp);
}

function linearToThreeSrgb(value) {
  return value.map((component) => component <= 0.0031308
    ? component * 12.92
    : component ** 0.41666 * 1.055 - 0.055);
}

function outputWithFog(linearScene, eyeDepthM) {
  const display = linearToThreeSrgb(acesFilmic(linearScene));
  const fogFactor = 1 - Math.exp(-(0.00016 ** 2) * eyeDepthM * eyeDepthM);
  return mix(display, displayHex("a8b8b7"), fogFactor);
}

function near(actual, expected, tolerance = 1e-12) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(
    Math.abs(value - expected[index]) <= tolerance,
    `component ${index}: expected ${expected[index]}, got ${value}`,
  ));
}

test("Weekend retained shader ports Three r160 Lambert and physical GGX without Blinn", async () => {
  const [shader, three] = await Promise.all([
    file("unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/WeekendCircuitParity.shader"),
    file("web/wwwroot/vendor/three.module.js"),
  ]);

  for (const reference of [
    "vec3 BRDF_Lambert", "vec3 F_Schlick", "float V_GGX_SmithCorrelated",
    "float D_GGX", "vec3 BRDF_GGX", "void RE_Direct_Physical",
  ]) assert.ok(three.includes(reference), `Three r160 reference lost ${reference}`);
  for (const retained of [
    "RECIPROCAL_PI = 0.3183098861837907", "float3 F_Schlick",
    "float V_GGX_SmithCorrelated", "float D_GGX", "float3 BRDF_GGX",
    "float3 diffuseColor = albedo * (1.0 - metalness)",
    "float3 specularColor = lerp(float3(0.04,0.04,0.04), albedo, metalness)",
    "float3 normalDerivative = max(abs(ddx(normal)), abs(ddy(normal)))",
    "sunIrradiance * diffuseColor * RECIPROCAL_PI",
    "hemisphere * diffuseColor * RECIPROCAL_PI",
  ]) assert.ok(shader.includes(retained), `Weekend shader lost ${retained}`);
  assert.equal(shader.includes("lerp(196.0, 2.0"), false);
  assert.equal(shader.includes("lerp(0.04, 0.72"), false);
  assert.ok(shader.includes("_FogDensity * _FogDensity * eyeDepth * eyeDepth"));
  assert.ok(shader.includes("-saturate(fogFactor)"));
  assert.ok(shader.includes("Tags { \"LightMode\"=\"ShadowCaster\" }"));
  assert.ok(shader.includes("TRANSFER_SHADOW_CASTER_NORMALOFFSET"));
});

test("ported Lambert GGX produces pinned Three r160 numeric probes", () => {
  near(physicalLighting({
    albedo: [0.18, 0.32, 0.07],
    metalness: 0.08,
    roughness: 0.72,
    normal: [0.2, 0.96, -0.12],
    view: [0.1, 0.2, 1],
    geometryRoughness: 0.015,
  }), [0.16403069423491398, 0.2706860837546188, 0.05463756820857074]);
  near(physicalLighting({
    albedo: [0.42, 0.16, 0.05],
    metalness: 0.18,
    roughness: 0.28,
    normal: [-0.52, 0.74, 0.42],
    view: [0.2, 0.15, 0.97],
    geometryRoughness: 0.002,
  }), [0.37036782722818473, 0.13234508365308623, 0.03494488759994953]);
});

test("Weekend atlas cutout, auxiliary fog factor, and camera chirality remain exact", async () => {
  const [shader, renderer, camera, bootstrap] = await Promise.all([
    file("unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/WeekendCircuitParity.shader"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendRideCircuitRenderer.cs"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendParityCamera.cs"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendRideBootstrap.cs"),
  ]);
  assert.ok(shader.includes("clip(sampledAlpha - _AlphaTest)"));
  assert.ok(shader.includes("1.0 - input.uv.y"));
  assert.equal((shader.match(/clip\(sampledAlpha - _AlphaTest\)/g) ?? []).length, 2);
  assert.ok(renderer.includes("web.map.flip_y ? 0f : 1f"));
  assert.ok(renderer.includes("RenderQueue.AlphaTest"));
  assert.ok(camera.includes("UnityProjectionXSign = -1f"));
  assert.ok(camera.includes("GL.invertCulling = true"));
  assert.ok(camera.includes("GL.invertCulling = _previousInvertCulling"));
  assert.ok(bootstrap.includes("WeekendParityCamera.Attach(_camera)"));
});

test("Weekend output pins Three ACES to sRGB to fog ordering and raw fog domain", async () => {
  const [shader, skyShader, component, bootstrap, resource, circuit, openRoad, webMain]
    = await Promise.all([
    file("unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/WeekendCircuitOutput.shader"),
    file("unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/WeekendCircuitSky.shader"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendOutputTransform.cs"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendRideBootstrap.cs"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendCircuitPresentationResource.cs"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendRideCircuitRenderer.cs"),
    file("unity/GunsOnly.Unity/Assets/Scripts/WeekendHinterlandRoadRenderer.cs"),
    file("web/wwwroot/weekend-ride/main.js"),
  ]);
  const aces = shader.indexOf("LinearTosRGB(AcesFilmic");
  const fog = shader.indexOf("display = lerp(display, _FogColor.rgb");
  assert.ok(aces >= 0 && fog > aces, "fog must follow Three tone mapping and output OETF");
  assert.ok(shader.includes("float fogFactor = saturate(-source.a)"));
  assert.equal(shader.includes("_CameraDepthTexture"), false,
    "Weekend fog must not depend on a camera-global depth texture");
  assert.ok(shader.includes("sRGBToLinear(max(display, 0.0))"));
  assert.ok(component.includes("DisplaySrgbHexVector(profile.fog.srgb_hex)"));
  assert.ok(component.includes("SetVector(\"_FogColor\", _fogDisplaySrgb)"));
  assert.ok(component.includes("public void Apply(RenderTexture source, RenderTexture destination)"));
  assert.ok(component.includes("OnRenderImage(RenderTexture source, RenderTexture destination)"));
  assert.ok(component.includes("Apply(source, destination)"));
  assert.ok(component.includes("void EnsureMaterial()"));
  assert.ok(component.includes("EnsureMaterial();"));
  assert.ok(component.includes("Graphics.Blit(source, destination, _material)"));
  assert.equal(component.includes("else Graphics.Blit(source, destination)"), false,
    "missing Weekend output material must fail closed instead of raw-blitting");
  assert.equal(component.includes("SetColor(\"_FogColor\""), false);
  assert.ok(resource.includes("((value >> 16) & 0xff) / 255f"));
  assert.ok(bootstrap.includes("RenderSettings.fog = false"));
  assert.ok(circuit.includes("renderer.shadowCastingMode = ShadowCastingMode.On"));
  assert.ok(openRoad.includes("meshRenderer.shadowCastingMode = ShadowCastingMode.On"));
  assert.ok(circuit.includes("SetFloat(\"_FogDensity\", (float)profile.fog.density)"));
  assert.ok(openRoad.includes("SetFloat(\"_FogDensity\", (float)profile.fog.density)"));
  assert.ok(bootstrap.includes("_camera.allowHDR = true"));
  assert.ok(openRoad.includes("GunsOnly/WeekendRide/Circuit/WeekendCircuitParity"));
  assert.ok(openRoad.includes("BuildRoadMaterial(profile)"));
  assert.ok(openRoad.includes("BuildRoadsideMaterial(profile"));
  assert.ok(openRoad.includes("profile.hemisphere.intensity"));
  assert.ok(openRoad.includes("profile.sun.intensity"));
  assert.equal(openRoad.includes("Shader.Find(\"GunsOnly/WeekendOpenRoad\")"), false,
    "open-road runtime surface must use the shared Three physical parity shader");
  const webSkyOutput = webMain.indexOf("#include <tonemapping_fragment>");
  const webSkyColorSpace = webMain.indexOf("#include <colorspace_fragment>");
  assert.ok(webSkyOutput >= 0 && webSkyColorSpace > webSkyOutput,
    "Web ShaderMaterial sky must use the same ACES then sRGB output path as Unity");
  assert.ok(skyShader.includes("float height = input.direction.y"));
  assert.equal(skyShader.includes("float height = normalize(input.direction).y"), false,
    "Unity must preserve Web's perspective-interpolated sky varying");
  near(displayHex("a8b8b7"), [168 / 255, 184 / 255, 183 / 255], 0);
  near(outputWithFog([0.25, 0.5, 1.8], 80), [
    0.6955652415271851, 0.7841357560978219, 0.9462056472033727,
  ]);
  near(outputWithFog([0.04, 0.12, 0.03], 2_200), [
    0.22284634076004883, 0.4284265107298972, 0.21353149699697554,
  ]);
});
