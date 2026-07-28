#!/usr/bin/env node
// Serve audio modules + accept POST /write {name, wavBase64} so a browser can dump WAVs.
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const audioRoot = path.resolve(__dirname, "..");
const outDir = path.resolve(__dirname, "out");
await mkdir(outDir, { recursive: true });

const written = [];

function contentType(filePath) {
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript";
  if (filePath.endsWith(".html")) return "text/html";
  return "application/octet-stream";
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === "/write") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const name = String(body.name || "clip").replace(/[^a-z0-9_-]/gi, "");
    const file = path.join(outDir, `jet-${name}.wav`);
    await writeFile(file, Buffer.from(body.wavBase64, "base64"));
    written.push({ name, file, peak: body.peak, rms: body.rms });
    console.log(`wrote ${file} peak=${body.peak} rms=${body.rms}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, file }));
    return;
  }
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ written }));
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = urlPath === "/" ? "/preview/jet_wav_export.html" : urlPath;
  const filePath = path.normalize(path.join(audioRoot, rel.replace(/^\//, "")));
  if (!filePath.startsWith(audioRoot) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("missing " + filePath);
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath).pipe(res);
});

const port = Number(process.env.PORT || 8879);
server.listen(port, "127.0.0.1", () => {
  console.log(`listening http://127.0.0.1:${port}/preview/jet_wav_export.html`);
});
