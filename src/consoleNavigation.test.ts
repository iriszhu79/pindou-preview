import test from "node:test";
import assert from "node:assert/strict";
import { createProject, coordinate, switchStrategy } from "./model.ts";
import { directionalStep, shortcutAction } from "./consoleNavigation.ts";
test("arrows and D-pad share physical row/column navigation and preserve all cells", () => {
  const p = createProject();
  p.grid[46].isCompleted = true;
  assert.equal(directionalStep(p, "up"), null);
  const down = directionalStep(p, "down")!;
  assert.equal(coordinate(down), 3);
  assert.equal(down.grid, p.grid);
  assert.equal(directionalStep(p, "left"), null);
  const reverse = switchStrategy(p, "row", true);
  const up = directionalStep(reverse, "up")!;
  assert.ok(coordinate(up) < coordinate(reverse));
  assert.equal(up.grid, p.grid);
  const col = switchStrategy(p, "column");
  assert.equal(directionalStep(col, "up"), null);
  assert.ok(coordinate(directionalStep(col, "right")!) > coordinate(col));
  const backwards = switchStrategy(p, "column", true);
  assert.ok(
    coordinate(directionalStep(backwards, "left")!) < coordinate(backwards),
  );
});
test("shortcut mapping accepts A/B case, only recognizes navigation and completion keys", () => {
  assert.equal(shortcutAction("A"), "complete");
  assert.equal(shortcutAction("b"), "undo");
  assert.equal(shortcutAction("ArrowDown"), "down");
  assert.equal(shortcutAction("x"), null);
  assert.equal(shortcutAction("Enter"), null);
});
