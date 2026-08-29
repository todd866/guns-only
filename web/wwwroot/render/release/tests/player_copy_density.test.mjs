import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const ROUTES = [
  "web/wwwroot/cobra-lab/index.html",
  "web/wwwroot/okanagan/index.html",
  "web/wwwroot/weekend-ride/index.html",
];

function plainText(markup) {
  return markup
    .replace(/<[^>]+>/gu, " ")
    .replace(/&[^;]+;/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function wordCount(value) {
  const text = plainText(value);
  return text ? text.split(" ").length : 0;
}

function classText(html, className) {
  const pattern = new RegExp(
    `<([a-z][a-z0-9-]*)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "giu",
  );
  return [...html.matchAll(pattern)].map((match) => plainText(match[2])).filter(Boolean);
}

test("standalone mission UI enforces terse player-facing copy", async () => {
  for (const route of ROUTES) {
    const html = await readFile(path.join(ROOT, route), "utf8");
    for (const summary of classText(html, "mission-summary")) {
      assert.ok(wordCount(summary) <= 24,
        `${route} summary is ${wordCount(summary)} words: ${summary}`);
    }
    for (const correction of classText(html, "mission-correction")) {
      assert.ok(wordCount(correction) <= 16,
        `${route} correction is ${wordCount(correction)} words: ${correction}`);
    }
    for (const action of classText(html, "mission-action")) {
      assert.ok(wordCount(action) <= 2,
        `${route} action is ${wordCount(action)} words: ${action}`);
    }
    const lifecycleCopy = [
      ...classText(html, "mission-kicker"),
      ...classText(html, "mission-action"),
    ].join(" | ");
    assert.doesNotMatch(lifecycleCopy, /Recorded (?:mission|sortie)|Return to aircraft|Fly again/iu,
      `${route} must not repeat lifecycle context in labels`);
  }
});
