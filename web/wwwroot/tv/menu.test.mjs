import test from "node:test";
import assert from "node:assert/strict";
import {GAMES, columnsFor, moveSelection, selectionIndex, storedId, writeLast} from "./menu.mjs";

test("the launcher offers the TV games and their real entries", () => {
  assert.deepEqual(
    GAMES.map((game) => [game.id, game.name, game.href, game.datum]),
    [
      ["rc", "RC Odyssey", "/rc/?telemetry=local", "base"],
      ["chopper", "Toy Chopper", "/toy-chopper/", "co-op"],
      ["gunship", "Toy Gunship", "/toy-gunship/", "yard"],
      ["fight", "Toy dogfight", "/toy-fight/", "2P"],
    ],
  );
});

test("tiles stay on two rows, and the highlight steps to the neighbour", () => {
  assert.equal(columnsFor(GAMES.length), 2);
  assert.equal(columnsFor(5), 3, "a fifth game adds a column, not a third row");
  assert.equal(moveSelection(4, 0, [1, 0]), 1);
  assert.equal(moveSelection(4, 0, [0, 1]), 2);
  assert.equal(moveSelection(4, 1, [0, 1]), 3);
  assert.equal(moveSelection(4, 0, [-1, 0]), 0);
  assert.equal(moveSelection(4, 2, [0, 1]), 2);
  assert.equal(moveSelection(4, 3, [1, 0]), 3);
});

test("the last game is the one highlighted next time", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
  };
  assert.equal(storedId(storage), "");
  assert.equal(selectionIndex(""), 0);
  writeLast(storage, "gunship");
  assert.equal(storedId(storage), "gunship");
  assert.equal(selectionIndex("gunship"), 2);
  writeLast(storage, "not-a-game");
  assert.equal(storedId(storage), "gunship", "an unknown id does not erase the last real game");
  writeLast(storage, "fight");
  assert.equal(selectionIndex(storedId(storage)), 3);
});
