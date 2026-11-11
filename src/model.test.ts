import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  stats,
  markStep,
  coordinate,
  stepCells,
  recommendation,
} from "./model.ts";
test("demo grid has unique coordinates and deterministic counts", () => {
  const p = createProject();
  assert.equal(p.grid.length, 400);
  assert.equal(new Set(p.grid.map((c) => `${c.row},${c.column}`)).size, 400);
  assert.deepEqual(
    stats(p.grid).map((c) => [c.code, c.count]),
    [
      ["P1", 38],
      ["G1", 16],
      ["Y1", 17],
      ["I1", 7],
      ["W1", 13],
    ],
  );
});
test("completion is shared between row and column views; clearing and reverse are consistent", () => {
  let p = createProject();
  p.step = 3;
  const expected = stepCells(p).length;
  p = markStep(p, true);
  assert.equal(p.grid.filter((c) => c.isCompleted).length, expected);
  const column = { ...p, strategy: "column" as const, step: 6 };
  assert.ok(stepCells(column).some((c) => c.isCompleted));
  assert.equal(markStep(p, false).grid.filter((c) => c.isCompleted).length, 0);
  assert.equal(coordinate({ ...p, reverse: true, step: 0 }), 19);
  assert.equal(
    markStep({ ...p, step: 0 }, true).grid.filter((c) => c.isCompleted).length,
    expected,
  );
});
test("recommendation uses structural run counts", () => {
  const r = recommendation(createProject());
  assert.ok(r.row > 0 && r.column > 0);
  assert.equal(r.strategy, r.row <= r.column ? "row" : "column");
});

import {
  isProject,
  loadProjects,
  stepCount,
  stepLine,
  type Project,
} from "./model.ts";
const rectangle = (): Project => {
  const base = createProject();
  return {
    ...base,
    id: "rectangle",
    name: "Rectangular demo",
    rows: 3,
    columns: 5,
    palette: [{ code: "B1", name: "Blue", hex: "#336699" }],
    grid: Array.from({ length: 15 }, (_, i) => ({
      row: Math.floor(i / 5),
      column: i % 5,
      colorCode: i === 7 ? null : "B1",
      isEmpty: i === 7,
      isCompleted: i === 0,
    })),
    step: 2,
  };
};
test("rectangular projects use axis-specific limits, palette counts, positions and completion", () => {
  const p = rectangle();
  assert.ok(isProject(p));
  assert.equal(stepCount(p), 3);
  assert.equal(coordinate(p), 2);
  assert.equal(stepLine(p).length, 5);
  const column = { ...p, strategy: "column" as const, reverse: true, step: 4 };
  assert.equal(stepCount(column), 5);
  assert.equal(coordinate(column), 0);
  assert.equal(stepLine(column).length, 3);
  assert.deepEqual(
    stats(p.grid, p.palette).map((c) => [c.code, c.count, c.done]),
    [["B1", 14, 1]],
  );
  assert.equal(
    markStep(column, true).grid.filter((c) => c.isCompleted).length,
    3,
  );
  assert.equal(isProject({ ...p, step: 3 }), false);
  assert.equal(isProject({ ...column, step: 5 }), false);
  assert.equal(isProject({ ...p, grid: p.grid.slice(1) }), false);
  assert.equal(isProject({ ...p, rows: 0 }), false);
  assert.equal(
    isProject({
      ...p,
      grid: p.grid.map((c, i) =>
        i === 1 ? { ...c, colorCode: "unknown" } : c,
      ),
    }),
    false,
  );
});
test("legacy progress and rectangular projects load without modifying stored data", () => {
  const legacy = createProject();
  legacy.step = 3;
  legacy.grid[46].isCompleted = true;
  const raw = JSON.stringify([legacy, rectangle()]);
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => raw, setItem: () => writes++ },
  });
  try {
    const loaded = loadProjects();
    assert.deepEqual(loaded, JSON.parse(raw));
    assert.equal(loaded[0].grid[46].isCompleted, true);
    assert.equal(writes, 0);
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});
