// Minimal static file server shared by every harness runner (screenshot.mjs, assertions.mjs) and
// by web/smoke/smoke.test.mjs. This is the ONE server implementation — the smoke test used to
// carry its own fork that ignored Range, which made TerrainBundleReader fall back to downloading
// whole bundles and stalled the boot smoke past 30 s. Do not re-fork it; production serves 206.
// Test instrument only — excluded from publish (see wwwroot/render/**/tests/** in the csproj).

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
      const body = await readFile(filePath);
      const headers = {
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      };
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start > end || start < 0 || end >= body.length) {
          response.writeHead(416, {
            ...headers,
            "content-range": `bytes */${body.length}`,
          }).end();
          return;
        }
        const slice = body.subarray(start, end + 1);
        response.writeHead(206, {
          ...headers,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${body.length}`,
          "content-length": slice.length,
        });
        response.end(slice);
        return;
      }
      response.writeHead(200, headers);
      response.end(body);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => rejectPromise(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolvePromise();
    });
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}
