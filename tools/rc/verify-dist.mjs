import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function walk(dir, files = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, files); else files.push(file);
  }
  return files;
}
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export async function verifyDist(distArg, baseArg, concurrency = 4) {
  const dist = path.resolve(distArg), base = new URL(baseArg.endsWith('/') ? baseArg : `${baseArg}/`);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('verify-dist: concurrency must be 1–8');
  const files = await walk(path.join(dist, 'rc')); let next = 0, failures = 0;
  if (!files.length) throw new Error('verify-dist: empty package');
  async function worker() {
    for (;;) {
      const i = next++; if (i >= files.length) return;
      const file = files[i], rel = path.relative(dist, file).split(path.sep).join('/');
      try {
        const response = await fetch(new URL(rel, base), {signal: AbortSignal.timeout(30_000)});
        const remote = Buffer.from(await response.arrayBuffer());
        if (!response.ok || digest(await fs.readFile(file)) !== digest(remote)) throw new Error(`HTTP ${response.status} or SHA-256 mismatch`);
      } catch (error) { failures++; console.error(`verify-dist: ${rel}: ${error.message}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  if (failures) throw new Error(`verify-dist: ${failures} file(s) failed`);
  return files.length;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [dist, base] = process.argv.slice(2);
  if (!dist || !base) throw new Error('usage: node tools/rc/verify-dist.mjs DIST_DIR BASE_URL');
  verifyDist(dist, base).then(n => console.log(`verify-dist: ${n} files match ${new URL(base).origin}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
