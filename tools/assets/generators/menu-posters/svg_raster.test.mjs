import assert from "node:assert/strict";
import test from "node:test";

import { renderSvgRgba } from "./svg_raster.mjs";

const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`;

test("poster SVG subset renders supported straight geometry", () => {
  const rgba = renderSvgRgba(wrap(
    '<rect width="10" height="10" fill="#112233"/>'), 20, 20);
  assert.equal(rgba.length, 20 * 20 * 4);
  assert.ok(rgba.some((value) => value !== 0));
});

test("poster SVG subset fails closed on unsupported or malformed syntax", () => {
  assert.throws(() => renderSvgRgba(wrap(
    '<image href="third-party.png" width="10" height="10"/>'), 20, 20),
  /unsupported SVG element: image/);
  assert.throws(() => renderSvgRgba(wrap(
    '<g transform="skewX(20)"><path d="M0 0 L10 0 L0 10 Z" fill="#112233"/></g>'),
  20, 20), /unsupported SVG transform syntax/);
  assert.throws(() => renderSvgRgba(wrap(
    '<rect width="10" height="10" fill="#112233" filter="url(#glow)"/>'),
  20, 20), /unsupported rect attribute/);
  assert.throws(() => renderSvgRgba(wrap(
    '<rect width="oops" height="10" fill="#112233"/>'), 20, 20),
  /invalid SVG number/);
  assert.throws(() => renderSvgRgba(wrap(
    "<rect width='10' height=\"10\" fill=\"#112233\"/>"), 20, 20),
  /unsupported SVG attribute syntax/);
  assert.throws(() => renderSvgRgba(wrap(
    '<path d="M0 0 L10 0 L0 10 Z L99 99" fill="#112233"/>'), 20, 20),
  /path data after close/);
  assert.throws(() => renderSvgRgba(wrap(
    '<path d="M0 0 L10 0 @ L0 10 Z" fill="#112233"/>'), 20, 20),
  /unsupported SVG path syntax/);
  assert.throws(() => renderSvgRgba(wrap(
    '<path d="M0 0 L10 0 H" fill="#112233"/>'), 20, 20),
  /incomplete SVG path coordinate/);
  assert.throws(() => renderSvgRgba(wrap(
    '<defs><filter id="ignored"/></defs><rect width="10" height="10" fill="#112233"/>'),
  20, 20), /unsupported SVG defs element/);
  for (const transform of ["translate()", "translate(1 2 999)", "scale(1 2 999)"]) {
    assert.throws(() => renderSvgRgba(wrap(
      `<g transform="${transform}"><path d="M0 0 L10 0 L0 10 Z" fill="#112233"/></g>`),
    20, 20), /requires one or two operands/);
  }
  assert.throws(() => renderSvgRgba(wrap(
    '<g><path d="M0 0 L10 0 L0 10 Z" fill="#112233"/></g ignored>'),
  20, 20), /unsupported SVG group close/);
});
