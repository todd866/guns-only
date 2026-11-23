import test from "node:test";
import assert from "node:assert/strict";
import {GAMES, columnsFor, moveSelection, selectionIndex, storedId, writeLast} from "./menu.mjs";

test("the launcher offers the TV games and their real entries", () => {
  assert.deepEqual(
    GAMES.map((game) => [game.id, game.name, game.href, game.datum]),
    [
      ["guns", "Guns Only", "/", "main"],
      ["rc", "RC Odyssey", "/rc/?telemetry=local", "base"],
      ["fight", "Toy dogfight", "/toy-fight/", "2P"],
    ],
    "main game first; the standalone toy chopper and gunship pages have no tile",
  );
});

test("tiles stay on two rows, and the highlight steps to the neighbour", () => {
  assert.equal(columnsFor(GAMES.length), 2);
  assert.equal(columnsFor(5), 3, "a fifth game adds a column, not a third row");
  assert.equal(moveSelection(3, 0, [1, 0]), 1);
  assert.equal(moveSelection(3, 0, [0, 1]), 2);
  assert.equal(moveSelection(3, 1, [0, 1]), 2);
  assert.equal(moveSelection(3, 0, [-1, 0]), 0);
  assert.equal(moveSelection(3, 2, [0, 1]), 2);
  assert.equal(moveSelection(3, 2, [0, -1]), 0);
});

test("the last game is the one highlighted next time", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
  };
  assert.equal(storedId(storage), "");
  assert.equal(selectionIndex(""), 0);
  writeLast(storage, "rc");
  assert.equal(storedId(storage), "rc");
  assert.equal(selectionIndex("rc"), 1);
  writeLast(storage, "gunship");
  assert.equal(storedId(storage), "rc", "a removed or unknown id does not erase the last real game");
  writeLast(storage, "fight");
  assert.equal(selectionIndex(storedId(storage)), 2);
});
