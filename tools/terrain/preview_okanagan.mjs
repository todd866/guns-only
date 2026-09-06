#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";

const root = path.resolve(import.meta.dirname, "../../web/wwwroot");
const port = Number(process.env.SCENERY_PORT ?? 8035);
const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    const preview = pathname === "/" || pathname === "/scenery";
    const file = preview ? path.join(import.meta.dirname, "okanagan-preview.html") : path.resolve(root, `.${pathname}`);
    if (!preview && !file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch { res.writeHead(404).end("Not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`Silent scenery review: http://127.0.0.1:${port}/scenery?audioQa=silent`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
