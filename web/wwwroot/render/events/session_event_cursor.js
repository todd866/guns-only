// Presentation consumes a rolling event window, not a destructive queue. Keep the cursor outside
// the snapshot so repeated renders and telemetry sampling cannot replay one-shot effects.
export function consumeRecentEvents(events, afterSequence, visit) {
  let cursor = Number.isSafeInteger(afterSequence) && afterSequence >= 0
    ? afterSequence
    : 0;
  if (!Array.isArray(events) || typeof visit !== "function") return cursor;

  for (const event of events) {
    const sequence = Number(event?.sequence);
    if (!Number.isSafeInteger(sequence) || sequence <= cursor) continue;
    // The simulation contract guarantees ascending sequence order. Advance before dispatch so an
    // unknown presentation-only event cannot be retried forever by every subsequent snapshot.
    cursor = sequence;
    visit(event);
  }
  return cursor;
}
