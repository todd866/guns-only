// Minimal static file server shared by every harness runner (screenshot.mjs, assertions.mjs) and
// by web/smoke/smoke.test.mjs. This is the ONE server implementation — the smoke test used to
// carry its own fork that ignored Range, which made TerrainBundleReader fall back to downloading
// whole bundles and stalled the boot smoke past 30 s. Do not re-fork it; production serves 206.
// Test instrument only — excluded from publish (see wwwroot/render/**/tests/** in the csproj).

import http from "node:http";
import { open, readFile, stat } from "node:fs/promises";
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

/**
 * @param {string} root published wwwroot to serve
 * @param {{ port?: number }} [options] fixed port for harnesses that must not collide with
 *   another agent's server; 0 (the default) keeps the ephemeral-port behaviour every existing
 *   caller relies on.
 */
export async function serveStatic(root, options = {}) {
  const rootNormal = normalize(root);
  const listenPort = Number.isInteger(options.port) ? options.port : 0;
  const diagnostics = {
    fullFileBytesRead: 0,
    rangeBytesRead: 0,
    rangeRequests: 0,
    largestReadAllocation: 0,
    telemetryRequests: 0,
    telemetryBytes: 0,
    telemetryRows: 0,
    telemetryHeaderRows: 0,
    telemetryStateRows: 0,
    telemetryCobraStateRows: 0,
    telemetryMinimumCobraAuthorityTick: null,
    telemetryMaximumCobraAuthorityTick: null,
    telemetrySessions: new Set(),
    telemetryCobraSessions: new Set(),
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (request.method === "POST" && pathname === "/api/telemetry") {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) {
            response.writeHead(413).end("telemetry batch too large");
            return;
          }
          chunks.push(chunk);
        }
        let batch;
        try {
          batch = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
        } catch {
          response.writeHead(400).end("invalid telemetry JSON");
          return;
        }
        if (typeof batch?.session !== "string" || !Array.isArray(batch?.rows)) {
          response.writeHead(400).end("invalid telemetry batch");
          return;
        }
        diagnostics.telemetryRequests++;
        diagnostics.telemetryBytes += bytes;
        diagnostics.telemetryRows += batch.rows.length;
        diagnostics.telemetrySessions.add(batch.session);
        for (const row of batch.rows) {
          if (row?.k === "hdr") diagnostics.telemetryHeaderRows++;
          if (row?.k !== "st" || !row.s || typeof row.s !== "object") continue;
          diagnostics.telemetryStateRows++;
          const authorityTick = Number(row.s.cobra_authority_tick);
          if (!Number.isFinite(authorityTick)) continue;
          diagnostics.telemetryCobraStateRows++;
          diagnostics.telemetryCobraSessions.add(batch.session);
          diagnostics.telemetryMinimumCobraAuthorityTick =
            diagnostics.telemetryMinimumCobraAuthorityTick === null
              ? authorityTick
              : Math.min(diagnostics.telemetryMinimumCobraAuthorityTick, authorityTick);
          diagnostics.telemetryMaximumCobraAuthorityTick =
            diagnostics.telemetryMaximumCobraAuthorityTick === null
              ? authorityTick
              : Math.max(diagnostics.telemetryMaximumCobraAuthorityTick, authorityTick);
        }
        response.writeHead(202, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        }).end('{"accepted":true}');
        return;
      }
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
      const headers = {
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      };
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start > end || start < 0 || end >= info.size) {
          response.writeHead(416, {
            ...headers,
            "content-range": `bytes */${info.size}`,
          }).end();
          return;
        }
        const length = end - start + 1;
        const slice = Buffer.allocUnsafe(length);
        diagnostics.rangeRequests++;
        diagnostics.rangeBytesRead += length;
        diagnostics.largestReadAllocation = Math.max(
          diagnostics.largestReadAllocation,
          length,
        );
        const handle = await open(filePath, "r");
        try {
          let offset = 0;
          while (offset < length) {
            const { bytesRead } = await handle.read(
              slice,
              offset,
              length - offset,
              start + offset,
            );
            if (bytesRead === 0) {
              throw new Error(`Unexpected EOF while reading ${filePath}`);
            }
            offset += bytesRead;
          }
        } finally {
          await handle.close();
        }
        response.writeHead(206, {
          ...headers,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${info.size}`,
          "content-length": slice.length,
        });
        response.end(slice);
        return;
      }
      const body = await readFile(filePath);
      diagnostics.fullFileBytesRead += body.length;
      diagnostics.largestReadAllocation = Math.max(
        diagnostics.largestReadAllocation,
        body.length,
      );
      response.writeHead(200, headers);
      response.end(body);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => rejectPromise(error);
    server.once("error", onError);
    server.listen(listenPort, "127.0.0.1", () => {
      server.off("error", onError);
      resolvePromise();
    });
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
    diagnostics: () => Object.freeze({
      ...diagnostics,
      telemetrySessions: diagnostics.telemetrySessions.size,
      telemetryCobraSessions: diagnostics.telemetryCobraSessions.size,
    }),
  };
}
