import assert from "node:assert/strict";
import test from "node:test";
import { AsyncTransitionQueue } from "../async_transition_queue.js";

test("renderer transitions never overlap and retain request order", async () => {
  const queue = new AsyncTransitionQueue();
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  let active = 0;

  const first = queue.enqueue(async () => {
    active += 1;
    assert.equal(active, 1);
    order.push("a:start");
    markFirstStarted();
    await firstGate;
    order.push("a:end");
    active -= 1;
  });
  const second = queue.enqueue(async () => {
    active += 1;
    assert.equal(active, 1);
    order.push("b:start");
    active -= 1;
  });

  await firstStarted;
  assert.deepEqual(order, ["a:start"]);
  releaseFirst();
  await Promise.all([first, second, queue.idle()]);
  assert.deepEqual(order, ["a:start", "a:end", "b:start"]);
});

test("a rejected transition does not poison later renderer work", async () => {
  const queue = new AsyncTransitionQueue();
  const failed = queue.enqueue(async () => { throw new Error("pack failed"); });
  const next = queue.enqueue(async () => "next pack");
  await assert.rejects(failed, /pack failed/);
  assert.equal(await next, "next pack");
  await queue.idle();
});
