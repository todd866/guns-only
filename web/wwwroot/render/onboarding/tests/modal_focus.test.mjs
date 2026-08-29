import assert from "node:assert/strict";
import test from "node:test";

import {
  dialogTabDestination,
  renderedDialogControl,
} from "../modal_focus.js";

function control({ hiddenAncestor = false, rects = 1 } = {}) {
  return {
    closest: (selector) => selector === "[hidden]" && hiddenAncestor ? {} : null,
    getClientRects: () => Array.from({ length: rects }, () => ({})),
  };
}

test("CSS-hidden responsive hints never become phantom dialog endpoints", () => {
  assert.equal(renderedDialogControl(control(), { display: "block", visibility: "visible" }), true);
  assert.equal(renderedDialogControl(control(), { display: "none", visibility: "visible" }), false);
  assert.equal(renderedDialogControl(control(), { display: "block", visibility: "hidden" }), false);
  assert.equal(renderedDialogControl(control({ rects: 0 }), {
    display: "block",
    visibility: "visible",
  }), false);
  assert.equal(renderedDialogControl(control({ hiddenAncestor: true }), {
    display: "block",
    visibility: "visible",
  }), false);
});

for (const mode of ["intro", "debrief", "pause"]) {
  test(`${mode}: Tab wraps and recovers focus from outside the active dialog`, () => {
    const first = { id: `${mode}-first` };
    const middle = { id: `${mode}-middle` };
    const last = { id: `${mode}-last` };
    const focusables = [first, middle, last];
    assert.equal(dialogTabDestination({ focusables, activeElement: last }), first);
    assert.equal(dialogTabDestination({ focusables, activeElement: first, shiftKey: true }), last);
    assert.equal(dialogTabDestination({ focusables, activeElement: middle }), null);
    assert.equal(dialogTabDestination({ focusables, activeElement: {}, shiftKey: false }), first);
    assert.equal(dialogTabDestination({ focusables, activeElement: {}, shiftKey: true }), last);
  });
}
