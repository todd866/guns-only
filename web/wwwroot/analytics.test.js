const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

test("static shell loads the Vercel Web Analytics script once", async () => {
  const html = await readFile(path.join(__dirname, "index.html"), "utf8");
  const matches = html.match(/<script\s+defer\s+src=["']\/_vercel\/insights\/script\.js["']><\/script>/g) || [];
  assert.equal(matches.length, 1);
});
