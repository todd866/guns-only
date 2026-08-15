#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const sourceOutput = path.join(
  root,
  "content/packs/okanagan-fire/environment/okanagan-central.cdem.json",
);
const runtimeOutput = path.join(root,
  "web/wwwroot/content/packs/okanagan-fire/environment/okanagan-central.cdem.json");

const bounds = Object.freeze({
  south: 49.68,
  north: 50.08,
  west: -119.76,
  east: -119.24,
});
const rows = 33;
const columns = 33;
const endpoint = "https://geogratis.gc.ca/services/elevation/cdem/altitude";
const pending = [];

for (let row = 0; row < rows; row += 1) {
  const latitude = bounds.south + (bounds.north - bounds.south) * row / (rows - 1);
  for (let column = 0; column < columns; column += 1) {
    const longitude = bounds.west + (bounds.east - bounds.west) * column / (columns - 1);
    pending.push({ row, column, latitude, longitude });
  }
}

const elevations = Array.from({ length: rows }, () => Array(columns).fill(null));
let cursor = 0;

async function worker() {
  while (cursor < pending.length) {
    const sample = pending[cursor++];
    const url = new URL(endpoint);
    url.searchParams.set("lat", sample.latitude.toFixed(7));
    url.searchParams.set("lon", sample.longitude.toFixed(7));
    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(url, { headers: { "user-agent": "guns-only-terrain-authoring/1" } });
      if (response.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`CDEM ${response?.status ?? "network"} at ${url}`);
    const body = await response.json();
    if (!Number.isFinite(body.altitude)) throw new Error(`Missing altitude at ${url}`);
    elevations[sample.row][sample.column] = body.altitude;
  }
}

await Promise.all(Array.from({ length: 12 }, () => worker()));

const document = {
  schema: "guns-only.terrain.cdem-grid.v1",
  terrainId: "terrain.canada.okanagan-central.cdem.v1",
  source: {
    authority: "Natural Resources Canada",
    product: "Canadian Digital Elevation Model",
    service: endpoint,
    retrievedUtc: new Date().toISOString(),
    verticalUnit: "metre",
  },
  anchor: { latitude: 49.88, longitude: -119.50 },
  bounds,
  rows,
  columns,
  elevationsM: elevations,
};

const encoded = `${JSON.stringify(document)}\n`;
for (const output of [sourceOutput, runtimeOutput]) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, encoded, "utf8");
}
console.log(`${sourceOutput}: ${rows}x${columns} CDEM samples (runtime copy staged)`);
