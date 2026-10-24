import os from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

export function cpuTotals(cpus) {
  if (!Array.isArray(cpus) || cpus.length === 0) throw new Error("CPU counters unavailable");
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    const times = Object.values(cpu.times ?? {});
    if (!times.length || !times.every(value => Number.isFinite(value) && value >= 0)
      || !Number.isFinite(cpu.times.idle)) throw new Error("Invalid CPU counters");
    idle += cpu.times.idle;
    total += times.reduce((sum, value) => sum + value, 0);
  }
  return { idle, total, cores: cpus.length };
}

export function hasHeadroom(previous, current) {
  const elapsed = current.total - previous.total;
  const idle = current.idle - previous.idle;
  return current.cores === previous.cores && current.cores > 0
    && Number.isFinite(elapsed) && elapsed > 0 && idle >= 0 && idle <= elapsed
    && idle / elapsed >= 0.30
    && Number.isFinite(current.load) && current.load >= 0 && current.load <= current.cores;
}

export async function waitForHostHeadroom({
  readSnapshot = () => ({ ...cpuTotals(os.cpus()), load: os.loadavg()[0] }),
  now = () => performance.now(), pause = sleep,
  stableMs = 15_000, timeoutMs = 300_000, onStatus = () => {},
} = {}) {
  const started = now();
  let previous = readSnapshot(), quietSince = null, lastStatus = -Infinity;
  while (now() - started < timeoutMs) {
    await pause(1000);
    const current = readSnapshot(), at = now();
    if (hasHeadroom(previous, current)) quietSince ??= at;
    else quietSince = null;
    if (at - started >= timeoutMs) break;
    if (at - lastStatus >= 30_000) {
      onStatus({ load: current.load, cores: current.cores,
        idlePercent: 100 * (current.idle - previous.idle) / (current.total - previous.total) });
      lastStatus = at;
    }
    if (quietSince !== null && at - quietSince >= stableMs) return;
    previous = current;
  }
  throw new Error("Host remained busy; hardware frame test was not started. Retry when other work settles.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log("Waiting for host headroom after publishing (15s stable, up to 5min).");
  try {
    await waitForHostHeadroom({ onStatus: ({load, cores, idlePercent}) =>
      console.log(`Host load ${load.toFixed(1)}/${cores}; CPU idle ${idlePercent.toFixed(0)}%`) });
    console.log("Host headroom ready; starting the unchanged hardware frame test.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
