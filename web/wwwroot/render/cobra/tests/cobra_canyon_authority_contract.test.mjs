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
  const [jsonText, csharp] = await Promise.all([
    readFile(new URL(
      "web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
      repositoryRoot,
    ), "utf8"),
    readFile(new URL("sim/Cobra/CobraCanyonDefinition.cs", repositoryRoot), "utf8"),
  ]);
  return { world: JSON.parse(jsonText), csharp };
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

function csharpLandmarks(source) {
  const start = source.indexOf("static CobraCanyonLandmarkDefinition[] CreateLandmarks");
  const end = source.indexOf("static CobraCanyonObstacleDefinition[] CreateObstacles");
  assert.ok(start >= 0 && end > start, "C# landmark authority block must remain discoverable");
  const block = source.slice(start, end);
  const expression = new RegExp(
    String.raw`new CobraCanyonLandmarkDefinition\(\s*"([^"]+)"[\s\S]*?new Vec3D\(\s*${numberPattern},\s*${numberPattern},\s*${numberPattern}\)\)`,
    "g",
  );
  return new Map([...block.matchAll(expression)].map((match) => [match[1], tripleFromMatch(match, 2)]));
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
  const { world, csharp } = await authoritySources();
  const parsed = csharpLandmarks(csharp);
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
