import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "../../web/wwwroot/vendor/three.module.js";
import {
  WEEKEND_TRACK_DAY_SCHEMA,
  createWeekendTrackDayPresentation,
} from "../../web/wwwroot/render/motorcycle/track_day_presentation.js";

const SCHEMA = "guns-only.weekend-track-day-scene.v1";
const SERIALIZATION = "canonical-json-v1";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTE_PROJECT = join(
  REPOSITORY_ROOT,
  "tools/weekend-circuit-parity/WeekendCircuitRouteExport.csproj",
);
const PRESENTATION_SOURCE = join(
  REPOSITORY_ROOT,
  "web/wwwroot/render/motorcycle/track_day_presentation.js",
);
const ASPHALT_SOURCE = join(
  REPOSITORY_ROOT,
  "content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp",
);
const GROUND_SOURCE = join(
  REPOSITORY_ROOT,
  "content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp",
);
const FIELD_SOURCE = join(
  REPOSITORY_ROOT,
  "content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp",
);
const ROADSIDE_ATLAS_SOURCE = join(
  REPOSITORY_ROOT,
  "content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png",
);
const OUTPUTS = [
  "content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json",
  "web/wwwroot/content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json",
  "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/weekend-track-day-presentation-v1.json",
].map((path) => join(REPOSITORY_ROOT, path));

function dotnetCli() {
  const candidates = [
    process.env.GUNS_DOTNET_CLI,
    process.env.HOME ? join(process.env.HOME, ".dotnet/dotnet") : "",
    "dotnet",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === "dotnet") return candidate;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the same fallbacks used by bin/dotnet-env.
    }
  }
  return "dotnet";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Weekend circuit manifest cannot contain a non-finite number.");
    }
    // Three's sRGB-to-linear conversion differs by a final ULP between V8 releases.
    // Unity consumes float precision, so retaining 14 significant decimal digits is both
    // lossless at the player boundary and makes the retained scene byte-reproducible across
    // the supported Node 20/24 exporter runtimes.
    return JSON.stringify(Number(value.toPrecision(14)));
  }
  return JSON.stringify(value);
}

function values(attribute) {
  if (!attribute) return [];
  if (attribute.isInterleavedBufferAttribute) {
    const result = [];
    for (let index = 0; index < attribute.count; index++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        result.push(attribute.data.array[index * attribute.data.stride + attribute.offset + component]);
      }
    }
    return result;
  }
  return Array.from(attribute.array);
}

function attribute(attribute) {
  if (!attribute) return null;
  return {
    item_size: attribute.itemSize,
    normalized: attribute.normalized === true,
    values: values(attribute),
  };
}

function textureIdentity(texture) {
  if (!texture) return null;
  if (!texture.name) throw new Error("Weekend circuit texture is missing its stable Web identity.");
  return {
    id: texture.name,
    color_space: texture.colorSpace,
    wrap_s: texture.wrapS,
    wrap_t: texture.wrapT,
    repeat: texture.repeat.toArray(),
    flip_y: texture.flipY === true,
  };
}

function materialSpec(material) {
  if (Array.isArray(material) || !material?.isMaterial) {
    throw new Error("Weekend circuit parity supports exactly one Three material per leaf.");
  }
  if (!material.isMeshStandardMaterial && !material.isMeshBasicMaterial) {
    throw new Error(`Unsupported Weekend material ${material.type}.`);
  }
  return {
    model: material.isMeshBasicMaterial ? "mesh-basic" : "mesh-standard",
    color_linear: material.color.toArray(),
    roughness: material.isMeshStandardMaterial ? material.roughness : 1,
    metalness: material.isMeshStandardMaterial ? material.metalness : 0,
    vertex_colors: material.vertexColors === true,
    side: material.side === THREE.DoubleSide
      ? "double"
      : material.side === THREE.BackSide ? "back" : "front",
    transparent: material.transparent === true,
    opacity: material.opacity,
    alpha_test: material.alphaTest,
    depth_write: material.depthWrite === true,
    fog: material.fog === true,
    polygon_offset: material.polygonOffset === true,
    polygon_offset_factor: material.polygonOffsetFactor,
    polygon_offset_units: material.polygonOffsetUnits,
    map: textureIdentity(material.map),
  };
}

function safeName(value) {
  return String(value || "leaf").replace(/[^A-Za-z0-9_.-]+/g, "-");
}

function collectLeaves(root) {
  root.updateMatrixWorld(true);
  const leaves = [];
  function visit(object, path) {
    if (object.isMesh) {
      const position = object.geometry?.getAttribute?.("position");
      if (!position) throw new Error(`Weekend leaf ${path} has no position attribute.`);
      const instances = object.isInstancedMesh
        ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16))
        : [];
      const instanceColors = object.isInstancedMesh && object.instanceColor
        ? Array.from(object.instanceColor.array.slice(0, object.count * 3))
        : [];
      leaves.push({
        path,
        name: object.name || "",
        kind: object.isInstancedMesh ? "instanced-mesh" : "mesh",
        world_matrix: Array.from(object.matrixWorld.elements),
        geometry: {
          type: object.geometry.type,
          vertex_count: position.count,
          position: attribute(position),
          normal: attribute(object.geometry.getAttribute("normal")),
          uv: attribute(object.geometry.getAttribute("uv")),
          color: attribute(object.geometry.getAttribute("color")),
          indices: object.geometry.index ? Array.from(object.geometry.index.array) : [],
        },
        instances: {
          count: object.isInstancedMesh ? object.count : 0,
          matrices: instances,
          colors_linear: instanceColors,
        },
        material: materialSpec(object.material),
        render: {
          visible: object.visible === true,
          frustum_culled: object.frustumCulled === true,
          render_order: object.renderOrder,
          cast_shadow: object.castShadow === true,
          receive_shadow: object.receiveShadow === true,
        },
      });
    }
    object.children.forEach((child, index) => {
      const label = safeName(child.name || child.type);
      visit(child, `${path}/${String(index).padStart(3, "0")}-${label}`);
    });
  }
  visit(root, safeName(root.name));
  return leaves;
}

async function readAuthoritativeRoute() {
  const directory = await mkdtemp(join(tmpdir(), "guns-only-weekend-circuit-"));
  const routePath = join(directory, "route.json");
  try {
    execFileSync(
      dotnetCli(),
      ["run", "--project", ROUTE_PROJECT, "--configuration", "Release", "-v:q", "--", "--output", routePath],
      { cwd: REPOSITORY_ROOT, stdio: ["ignore", "pipe", "inherit"] },
    );
    const bytes = await readFile(routePath);
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function buildManifest() {
  const [route, sourceBytes, asphaltBytes, groundBytes, fieldBytes, roadsideAtlasBytes] = await Promise.all([
    readAuthoritativeRoute(),
    readFile(PRESENTATION_SOURCE),
    readFile(ASPHALT_SOURCE),
    readFile(GROUND_SOURCE),
    readFile(FIELD_SOURCE),
    readFile(ROADSIDE_ATLAS_SOURCE),
  ]);
  const asphalt = new THREE.Texture();
  asphalt.name = "TEX_WEEKEND_TRACK_ASPHALT_V1";
  asphalt.colorSpace = THREE.SRGBColorSpace;
  asphalt.wrapS = THREE.MirroredRepeatWrapping;
  asphalt.wrapT = THREE.MirroredRepeatWrapping;
  const ground = new THREE.Texture();
  ground.name = "TEX_WEEKEND_HINTERLAND_GROUND_V1";
  ground.colorSpace = THREE.SRGBColorSpace;
  ground.wrapS = THREE.MirroredRepeatWrapping;
  ground.wrapT = THREE.MirroredRepeatWrapping;
  const field = new THREE.Texture();
  field.name = "TEX_WEEKEND_FIELD_LANDCOVER_V1";
  field.colorSpace = THREE.SRGBColorSpace;
  field.wrapS = THREE.MirroredRepeatWrapping;
  field.wrapT = THREE.MirroredRepeatWrapping;
  const roadsideAtlas = new THREE.Texture();
  roadsideAtlas.name = "TEX_WEEKEND_ROADSIDE_ATLAS_V1";
  roadsideAtlas.colorSpace = THREE.SRGBColorSpace;
  roadsideAtlas.flipY = false;
  roadsideAtlas.wrapS = THREE.ClampToEdgeWrapping;
  roadsideAtlas.wrapT = THREE.ClampToEdgeWrapping;

  const presentation = createWeekendTrackDayPresentation(THREE, route.value, {
    surfaceTexture: asphalt,
    groundTexture: ground,
    fieldTexture: field,
    roadsideAtlas,
  });
  try {
    if (presentation.plan.schema !== WEEKEND_TRACK_DAY_SCHEMA) {
      throw new Error("Web presentation returned the wrong Weekend plan schema.");
    }
    const leaves = collectLeaves(presentation.object3d);
    const payload = {
      schema: SCHEMA,
      serialization: SERIALIZATION,
      source: {
        module: "web/wwwroot/render/motorcycle/track_day_presentation.js",
        export_name: "createWeekendTrackDayPresentation",
        source_sha256: sha256(sourceBytes),
        plan_schema: presentation.plan.schema,
      },
      authority_route_sha256: sha256(route.bytes),
      route_authority: route.value,
      coordinate_system: {
        handedness: "right",
        units: "metres",
        right: "+x/east",
        up: "+y/up",
        forward: "-z/north",
        unity_conversion: "same-numeric-xyz-reverse-triangle-winding",
        matrix_layout: "three-column-major",
      },
      render_profile: {
        output_color_space: "srgb",
        tone_mapping: "three-r160-aces-filmic",
        tone_mapping_exposure: 1.04,
        camera: { vertical_fov_deg: 68, near_m: 0.25, far_m: 24000 },
        background_srgb_hex: "96adb3",
        fog: { model: "exp2", srgb_hex: "a8b8b7", density: 0.00016 },
        hemisphere: {
          sky_srgb_hex: "f4f8f4",
          ground_srgb_hex: "67745f",
          intensity: 1.65,
        },
        sun: {
          srgb_hex: "ffefd1",
          intensity: 2.05,
          position: [-1200, 2400, 900],
          casts_shadow: false,
        },
        sky: {
          radius_m: 8000,
          width_segments: 24,
          height_segments: 12,
          top_srgb_hex: "5791ad",
          horizon_srgb_hex: "c5d5d5",
          lower_haze_srgb_hex: "8aa6aa",
          depth_write: false,
          fog: false,
          side: "back",
        },
      },
      textures: [
        {
          id: "TEX_WEEKEND_TRACK_ASPHALT_V1",
          source: "content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp",
          unity_resource: "GunsOnly/WeekendRide/OpenRoad/track-asphalt-v1",
          sha256: sha256(asphaltBytes),
          color_space: "srgb",
          wrap: "mirrored-repeat",
          min_filter: "linear-mipmap-linear",
          mag_filter: "linear",
          anisotropy_max: 8,
        },
        {
          id: "TEX_WEEKEND_HINTERLAND_GROUND_V1",
          source: "content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp",
          unity_resource: "GunsOnly/WeekendRide/OpenRoad/weekend-hinterland-ground-v1",
          sha256: sha256(groundBytes),
          color_space: "srgb",
          wrap: "mirrored-repeat",
          min_filter: "linear-mipmap-linear",
          mag_filter: "linear",
          anisotropy_max: 8,
        },
        {
          id: "TEX_WEEKEND_FIELD_LANDCOVER_V1",
          source: "content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp",
          unity_resource: "GunsOnly/WeekendRide/OpenRoad/weekend-field-landcover-v1",
          sha256: sha256(fieldBytes),
          color_space: "srgb",
          wrap: "mirrored-repeat",
          min_filter: "linear-mipmap-linear",
          mag_filter: "linear",
          anisotropy_max: 8,
        },
        {
          id: "TEX_WEEKEND_ROADSIDE_ATLAS_V1",
          source: "content/packs/weekend-ride/environment/foliage/weekend-roadside-atlas-v1.png",
          unity_resource: "GunsOnly/WeekendRide/OpenRoad/weekend-roadside-atlas-v1",
          sha256: sha256(roadsideAtlasBytes),
          color_space: "srgb",
          wrap: "clamp",
          min_filter: "linear-mipmap-linear",
          mag_filter: "linear",
          anisotropy_max: 8,
        },
      ],
      scene: {
        root_name: presentation.object3d.name,
        leaf_count: leaves.length,
        leaves,
      },
    };
    const semanticSha256 = sha256(canonicalJson(payload));
    return `${canonicalJson({ ...payload, semantic_sha256: semanticSha256 })}\n`;
  } finally {
    presentation.dispose();
  }
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: node export-weekend-circuit.mjs (--write|--check)");
}
const rendered = await buildManifest();
for (const output of OUTPUTS) {
  if (mode === "--write") {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, rendered, "utf8");
    process.stdout.write(`wrote ${relative(REPOSITORY_ROOT, output)}\n`);
  } else {
    const existing = await readFile(output, "utf8").catch(() => "");
    if (existing !== rendered) {
      throw new Error(`stale ${relative(REPOSITORY_ROOT, output)}`);
    }
  }
}
process.stdout.write(
  `sha256=${sha256(rendered)} bytes=${Buffer.byteLength(rendered)} outputs=${OUTPUTS.length}\n`,
);
