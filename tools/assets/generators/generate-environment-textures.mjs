#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodePngRgba } from "./png.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DEFAULT_OUTPUT = path.join(ROOT, "content/packs/korea-1950s/environment/textures");

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function smoothstep(low, high, value) {
  const amount = clamp((value - low) / (high - low));
  return amount * amount * (3 - 2 * amount);
}

function hash(x, y, seed) {
  let value = Math.imul(x + seed * 1013, 0x1f123bb5) ^ Math.imul(y - seed * 313, 0x5f356495);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
}

function periodicValueNoise(u, v, cells, seed) {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x) % cells;
  const y0 = Math.floor(y) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const tx0 = x - Math.floor(x);
  const ty0 = y - Math.floor(y);
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const top = hash(x0, y0, seed) * (1 - tx) + hash(x1, y0, seed) * tx;
  const bottom = hash(x0, y1, seed) * (1 - tx) + hash(x1, y1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

function fbm(u, v, seed, octaves = 6) {
  let sum = 0;
  let weight = 0;
  let amplitude = 0.55;
  for (let octave = 0; octave < octaves; octave++) {
    const cells = 4 << octave;
    sum += periodicValueNoise(u, v, cells, seed + octave * 19) * amplitude;
    weight += amplitude;
    amplitude *= 0.52;
  }
  return sum / weight;
}

function buildPixels(size, sample) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const value = sample(x / size, y / size, x, y);
      pixels[index] = value[0];
      pixels[index + 1] = value[1];
      pixels[index + 2] = value[2];
      pixels[index + 3] = value[3] ?? 255;
    }
  }
  return pixels;
}

function cloudShape(size) {
  return buildPixels(size, (u, v) => {
    const broad = fbm(u, v, 17, 6);
    const cellular = Math.abs(fbm(u, v, 91, 5) * 2 - 1);
    const density = smoothstep(0.43, 0.72, broad + (0.5 - cellular) * 0.12);
    const erosion = smoothstep(0.2, 0.82, fbm(u, v, 173, 6));
    const shaped = clamp(density * (0.72 + erosion * 0.36));
    const byte = Math.round(shaped * 255);
    return [byte, Math.round(erosion * 255), Math.round(broad * 255), byte];
  });
}

function foamNoise(size) {
  return buildPixels(size, (u, v) => {
    const base = fbm(u, v, 43, 6);
    const ridge = 1 - Math.abs(fbm(u, v, 211, 6) * 2 - 1);
    const foam = smoothstep(0.62, 0.9, base * 0.58 + ridge * 0.42);
    const byte = Math.round(foam * 255);
    return [byte, byte, byte, 255];
  });
}

function oceanNormal(size) {
  const height = (u, v) => {
    let value = 0;
    const waves = [
      [2, 5, 0.48, 0.2],
      [7, -3, 0.24, 1.7],
      [11, 8, 0.14, 3.1],
      [-17, 13, 0.08, 0.8],
      [29, 19, 0.04, 2.4],
    ];
    for (const [x, y, amplitude, phase] of waves) value += Math.sin((u * x + v * y) * Math.PI * 2 + phase) * amplitude;
    return value;
  };
  const step = 1 / size;
  return buildPixels(size, (u, v) => {
    const dx = height((u + step) % 1, v) - height((u - step + 1) % 1, v);
    const dy = height(u, (v + step) % 1) - height(u, (v - step + 1) % 1);
    let nx = -dx * 3.2;
    let ny = -dy * 3.2;
    let nz = 1;
    const length = Math.hypot(nx, ny, nz);
    nx /= length; ny /= length; nz /= length;
    return [Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255), 255];
  });
}

async function install(file, bytes, force) {
  const prior = await readFile(file).catch(() => null);
  if (prior?.equals(bytes)) return "unchanged";
  if (prior && !force) throw new Error(`${path.relative(ROOT, file)} differs; pass --force to replace it`);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  try { await rename(temporary, file); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return prior ? "replaced" : "created";
}

export async function generateEnvironmentTextures(options = {}) {
  const output = path.resolve(options.output ?? DEFAULT_OUTPUT);
  const size = options.size ?? 256;
  const sources = [
    ["cloud-shape.png", cloudShape(size)],
    ["ocean-normal.png", oceanNormal(size)],
    ["foam-noise.png", foamNoise(size)],
  ];
  const report = [];
  for (const [name, pixels] of sources) {
    const bytes = encodePngRgba(size, size, pixels);
    report.push({
      file: path.posix.join("environment/textures", name),
      action: options.dryRun ? "dry-run" : await install(path.join(output, name), bytes, options.force),
      width: size,
      height: size,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return report;
}

async function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--output") options.output = argv[++index];
    else if (token === "--size") options.size = Number(argv[++index]);
    else if (token === "--force") options.force = true;
    else if (token === "--dry-run") options.dryRun = true;
    else if (token === "--help" || token === "-h") {
      process.stdout.write("Usage: node tools/assets/generators/generate-environment-textures.mjs [--output dir] [--size 256] [--force] [--dry-run]\n");
      return 0;
    } else throw new Error(`Unknown option '${token}'`);
  }
  if (!Number.isInteger(options.size ?? 256) || (options.size ?? 256) < 32 || (options.size ?? 256) > 2048) {
    throw new Error("--size must be an integer from 32 to 2048");
  }
  process.stdout.write(`${JSON.stringify(await generateEnvironmentTextures(options), null, 2)}\n`);
  return 0;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`environment-textures: ${error.message}\n`); process.exitCode = 1; }
}
