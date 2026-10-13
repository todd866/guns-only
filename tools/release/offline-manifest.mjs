import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Generated after release stamping. Digests let a new worker reuse downloaded terrain only
// when the bytes are identical; a shared pathname is never evidence of release compatibility.
export async function writeOfflineManifest(root, build, outputPath = path.join(root, 'offline-manifest.json')) {
  const assets = [];
  async function visit(relative = '') {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (/^(api|telemetry|telemetry-admin)(\/|$)/.test(name)
        || /(^|\/)(tests|node_modules|preview|ref|out)(\/|$)/.test(name)
        || /\.(br|gz|map|test\.m?js)$/.test(name)
        || ['service-worker.js', 'offline-manifest.json'].includes(name)) continue;
      if (entry.isDirectory()) { await visit(name); continue; }
      if (!entry.isFile()) continue;
      const size = (await stat(path.join(root, name))).size;
      if (size > 128 * 1024 * 1024) continue;
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(path.join(root, name))) hash.update(bytes);
      const core = /\.(html|js|mjs|css|wasm)$/.test(name)
        || name.startsWith('_framework/') || name === 'manifest.webmanifest';
      assets.push({ url: `/${name}`, sha256: hash.digest('hex'), size, core });
    }
  }
  await visit();
  assets.sort((a, b) => a.url.localeCompare(b.url));
  if (!assets.some(a => a.url === '/index.html')) throw new Error('Offline shell missing index.html');
  const coreBytes = assets.filter(a => a.core).reduce((total, a) => total + a.size, 0);
  if (coreBytes > 64 * 1024 * 1024 || assets.length > 10000) {
    throw new Error('Offline shell exceeds bounded installation budget');
  }
  await writeFile(outputPath, JSON.stringify({ build: String(build), assets }));
  return { assets: assets.length, coreBytes };
}
