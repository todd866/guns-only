import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../../../../", import.meta.url);
const numberPattern = String.raw`(-?[\d_]+(?:\.\d+)?)`;

function numberFromCSharp(value) {
  return Number(value.replaceAll("_", ""));
}

function tripleFromMatch(match, offset) {
  return [
    numberFromCSharp(match[offset]),
    numberFromCSharp(match[offset + 1]),
    numberFromCSharp(match[offset + 2]),
  ];
}

async function authoritySources() {
  const [jsonText, csharp, campOperations] = await Promise.all([
    readFile(new URL(
      "web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
      repositoryRoot,
    ), "utf8"),
    readFile(new URL("sim/Cobra/CobraCanyonDefinition.cs", repositoryRoot), "utf8"),
    readFile(new URL("sim/Cobra/CampEmberOperations.cs", repositoryRoot), "utf8"),
  ]);
  return { world: JSON.parse(jsonText), csharp, campOperations };
}

function csharpRoutes(source) {
  const routes = new Map([
    ["river-gorge", []],
    ["ridge-shadow", []],
    ["road-plantation", []],
  ]);
  const expression = new RegExp(
    String.raw`new\("point\.([a-z-]+)\.\d+",\s*${numberPattern},\s*${numberPattern},\s*${numberPattern}`,
    "g",
  );
  for (const match of source.matchAll(expression)) routes.get(match[1])?.push(tripleFromMatch(match, 2));
  return routes;
}

function csharpConstant(source, name) {
  const match = source.match(new RegExp(`public const double ${name} = ${numberPattern}`));
  assert.ok(match, `missing C# Camp Ember authority constant ${name}`);
  return numberFromCSharp(match[1]);
}

function csharpLandmarks(source, campOperations) {
  const start = source.indexOf("static CobraCanyonLandmarkDefinition[] CreateLandmarks");
  const end = source.indexOf("static CobraCanyonObstacleDefinition[] CreateObstacles");
  assert.ok(start >= 0 && end > start, "C# landmark authority block must remain discoverable");
  const block = source.slice(start, end);
  const landmarks = new Map();
  for (const constructor of block.split("new CobraCanyonLandmarkDefinition(").slice(1)) {
    const id = constructor.match(/^\s*"([^"]+)"/)?.[1];
    assert.ok(id, "every C# landmark constructor must have a literal authority ID");
    if (id === "landmark.cobra-canyon.camp-ember.v1") continue;
    const position = constructor.match(new RegExp(
      String.raw`new Vec3D\(\s*${numberPattern},\s*${numberPattern},\s*${numberPattern}\)`,
    ));
    assert.ok(position, `${id} must have a literal C# position or an explicit shared-authority case`);
    landmarks.set(id, tripleFromMatch(position, 1));
  }
  assert.match(block,
    /"landmark\.cobra-canyon\.camp-ember\.v1"[\s\S]*?new Vec3D\(\s*CampEmberOperations\.CentreEastM,\s*CampEmberOperations\.PadElevationM,\s*CampEmberOperations\.CentreNorthM\s*\)/,
    "Camp Ember landmark must consume the shared operations authority instead of copying literals");
  landmarks.set("landmark.cobra-canyon.camp-ember.v1", [
    csharpConstant(campOperations, "CentreEastM"),
    csharpConstant(campOperations, "PadElevationM"),
    csharpConstant(campOperations, "CentreNorthM"),
  ]);
  return landmarks;
}

function csharpHazards(source) {
  const start = source.indexOf("static CobraCanyonObstacleDefinition[] CreateObstacles");
  const end = source.indexOf("static CobraCanyonThreatObserverDefinition[] CreateThreatObservers");
  assert.ok(start >= 0 && end > start, "C# hazard authority block must remain discoverable");
  const block = source.slice(start, end);
  const expression = new RegExp(
    String.raw`CobraCanyonObstacleDefinition\.(AxisAlignedBox|CapsuleSegment)\(\s*"([^"]+)",\s*new Vec3D\(\s*${numberPattern},\s*${numberPattern},\s*${numberPattern}\),\s*new Vec3D\(\s*${numberPattern},\s*${numberPattern},\s*${numberPattern}\)(?:,\s*${numberPattern})?\)`,
    "g",
  );
  return new Map([...block.matchAll(expression)].map((match) => [match[2], {
    shape: match[1] === "AxisAlignedBox" ? "aabb" : "capsuleSegment",
    first: tripleFromMatch(match, 3),
    second: tripleFromMatch(match, 6),
    radiusM: match[9] === undefined ? 0 : numberFromCSharp(match[9]),
  }]));
}

test("browser and C# authority share exact world IDs and route XYZ control points", async () => {
  const { world, csharp } = await authoritySources();
  assert.match(csharp, new RegExp(`WorldId = "${world.worldId.replaceAll(".", "\\.")}"`));
  const routeIds = [...csharp.matchAll(/public const string \w+RouteId = "([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(routeIds.sort(), world.routeLanes.map((route) => route.id).sort());

  const routeKeyById = new Map([
    ["route.cobra-canyon.river-gorge.v1", "river-gorge"],
    ["route.cobra-canyon.ridge-shadow.v1", "ridge-shadow"],
    ["route.cobra-canyon.road-plantation.v1", "road-plantation"],
  ]);
  const parsedRoutes = csharpRoutes(csharp);
  for (const route of world.routeLanes) {
    assert.deepEqual(
      parsedRoutes.get(routeKeyById.get(route.id)),
      route.pathLocalM,
      `${route.id} must describe the same physical corridor in C# and the browser`,
    );
  }
});

test("browser landmarks and C# landmarks occupy the same exact positions", async () => {
  const { world, csharp, campOperations } = await authoritySources();
  const parsed = csharpLandmarks(csharp, campOperations);
  assert.equal(parsed.size, world.landmarks.length);
  for (const landmark of world.landmarks) {
    assert.deepEqual(parsed.get(landmark.id), landmark.positionLocalM, landmark.id);
  }
});

test("browser hazard cues and C# collision authority use identical primitives", async () => {
  const { world, csharp } = await authoritySources();
  const parsed = csharpHazards(csharp);
  assert.equal(parsed.size, world.hazards.length);
  for (const hazard of world.hazards) {
    const csharpHazard = parsed.get(hazard.id);
    assert.ok(csharpHazard, `missing C# collision authority for ${hazard.id}`);
    assert.equal(csharpHazard.shape, hazard.collision.shape, hazard.id);
    if (hazard.collision.shape === "aabb") {
      assert.deepEqual(csharpHazard.first, hazard.collision.minimumLocalM, hazard.id);
      assert.deepEqual(csharpHazard.second, hazard.collision.maximumLocalM, hazard.id);
      assert.equal(csharpHazard.radiusM, 0, hazard.id);
    } else {
      assert.deepEqual(csharpHazard.first, hazard.collision.fromLocalM, hazard.id);
      assert.deepEqual(csharpHazard.second, hazard.collision.toLocalM, hazard.id);
      assert.equal(csharpHazard.radiusM, hazard.collision.radiusM, hazard.id);
    }
  }
});
