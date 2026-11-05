import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SHELL_THEMES,
  SHELL_THEME_CLASSES,
  applyShellTheme,
  resolveShellTheme,
} from "../shell_theme.js";

const [indexHtml, appJs, themesCss] = await Promise.all([
  readFile(new URL("../../../index.html", import.meta.url), "utf8"),
  readFile(new URL("../../../app.js", import.meta.url), "utf8"),
  readFile(new URL("../shell_themes.css", import.meta.url), "utf8"),
]);

function createFakeRoot(initialClasses = ["run-paused"], initialAttrs = { lang: "en", "data-launch": "booting" }) {
  const classes = new Set(initialClasses);
  const attrs = new Map(Object.entries(initialAttrs));
  let mutations = 0;
  const classList = {
    contains(name) { return classes.has(name); },
    add(...names) {
      for (const name of names) {
        mutations += 1;
        classes.add(name);
      }
    },
    remove(...names) {
      for (const name of names) {
        mutations += 1;
        classes.delete(name);
      }
    },
  };
  const serialize = () => {
    const classAttr = [...classes].join(" ");
    const attrString = [...attrs.entries()]
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    return `<html ${attrString} class="${classAttr}">`;
  };
  return {
    classList,
    classes,
    serialize,
    get mutations() { return mutations; },
  };
}

test("theme switch applies only the chosen class and leaves default DOM byte-identical without the query", () => {
  assert.deepEqual(SHELL_THEMES, ["glass", "canopy", "ink", "bezel"]);
  assert.deepEqual(SHELL_THEME_CLASSES, [
    "shell-theme-glass",
    "shell-theme-canopy",
    "shell-theme-ink",
    "shell-theme-bezel",
  ]);

  // Default without ?shellTheme=<name>: zero DOM mutations, byte-identical serialization
  for (const url of [
    "https://guns-only.com/",
    "https://guns-only.com/?program=first-merge",
    "https://guns-only.com/?shellTheme=",
    "https://guns-only.com/?shellTheme=unknown",
  ]) {
    const root = createFakeRoot();
    const before = root.serialize();
    const resolved = applyShellTheme(root, { href: url });
    assert.equal(resolved, null);
    assert.equal(root.mutations, 0, `unexpected DOM mutation for ${url}`);
    assert.equal(root.serialize(), before, `default DOM must stay byte-identical for ${url}`);
    for (const themeClass of SHELL_THEME_CLASSES) {
      assert.equal(root.classList.contains(themeClass), false);
    }
  }

  // Each valid variant applies only its own class and strips any prior variant class
  const root = createFakeRoot();
  for (const theme of SHELL_THEMES) {
    const resolved = applyShellTheme(root, {
      href: `https://guns-only.com/?shellTheme=${theme.toUpperCase()}`,
    });
    assert.equal(resolved, theme);
    const activeThemeClasses = SHELL_THEME_CLASSES.filter((c) => root.classList.contains(c));
    assert.deepEqual(activeThemeClasses, [`shell-theme-${theme}`]);
    assert.equal(root.classList.contains("run-paused"), true, "existing classes on <html> remain untouched");
  }

  // Navigating back to a URL without ?shellTheme removes the previously applied theme class
  // and restores the exact initial DOM serialization
  const initialRoot = createFakeRoot();
  assert.equal(applyShellTheme(root, { href: "https://guns-only.com/" }), null);
  assert.equal(root.serialize(), initialRoot.serialize());
});

test("shell_themes.css is loaded from index.html and every rule is scoped to a shell-theme class", () => {
  assert.match(
    indexHtml,
    /<link rel="stylesheet" href="\.\/render\/shell\/shell_themes\.css">/,
  );
  assert.match(
    indexHtml,
    /^<!doctype html>\n<html lang="en" class="run-paused" data-launch="booting">/,
    "authored <html> tag in index.html must remain unchanged by default",
  );
  assert.match(appJs, /applyShellTheme\(document\.documentElement,\s*window\.location\)/);
  for (const theme of SHELL_THEMES) {
    assert.match(themesCss, new RegExp(`\\.shell-theme-${theme}\\b`), `missing .shell-theme-${theme} in CSS`);
  }
});
