import assert from "node:assert/strict";
import test from "node:test";
import { cpuTotals, hasHeadroom, waitForHostHeadroom } from "./host_headroom.mjs";

const before = { idle: 100, total: 200, cores: 10, load: 1 };
const after = { idle: 140, total: 300, cores: 10, load: 8 };
test("headroom uses interval CPU usage and runnable load, not lifetime idle", () => {
  assert.equal(hasHeadroom(before, after), true);
  assert.equal(hasHeadroom(before, { ...after, idle: 120 }), false);
  assert.equal(hasHeadroom(before, { ...after, load: 11 }), false);
});
test("unavailable or discontinuous measurements cannot admit a test", () => {
  for (const patch of [{ total: 200 }, { idle: 90 }, { idle: 300 }, { load: NaN },
    { cores: 8 }, { total: NaN }, { load: -1 }]) {
    assert.equal(hasHeadroom(before, { ...after, ...patch }), false);
  }
  assert.throws(() => cpuTotals([]));
  assert.throws(() => cpuTotals([{times:{idle:NaN,user:20}}]));
  assert.deepEqual(cpuTotals([{times:{idle:10,user:20,sys:5,irq:0,nice:0}}]),
    {idle:10,total:35,cores:1});
});
function clock(loads) {
  let time = 0, index = 0;
  return {
    now: () => time,
    pause: async ms => { time += ms; index++; },
    readSnapshot: () => ({total: time, idle: time * .5, cores: 10,
      load: loads[Math.min(index, loads.length - 1)]}),
    elapsed: () => time,
  };
}
test("busy samples reset the full quiet interval before browser admission", async () => {
  const c = clock([2,2,2,20,2,2,2,2]);
  await waitForHostHeadroom({...c, stableMs:3000, timeoutMs:10000});
  assert.equal(c.elapsed(), 7000);
});
test("a busy host fails closed at its deadline", async () => {
  const c = clock([20]);
  await assert.rejects(waitForHostHeadroom({...c, stableMs:3000, timeoutMs:5000}), /not started/);
  assert.equal(c.elapsed(), 5000);
});
test("headroom arriving at the deadline does not bypass the bounded wait", async () => {
  const c = clock([2]);
  await assert.rejects(waitForHostHeadroom({...c, stableMs:3000, timeoutMs:4000}), /not started/);
});
