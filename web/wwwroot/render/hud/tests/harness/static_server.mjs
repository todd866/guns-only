// Minimal static file server shared by the harness runners (screenshot.mjs, assertions.mjs).
// Mirrors web/smoke/smoke.test.mjs. Test instrument only — excluded from publish.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export async function serveStatic(root) {
  const rootNormal = normalize(root);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = normalize(join(rootNormal, pathname));
      if (filePath !== rootNormal && !filePath.startsWith(rootNormal)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(filePath).catch(() => null);
      if (!info || !info.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}
