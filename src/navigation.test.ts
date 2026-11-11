import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  routeCoordinates,
  startRoute,
  switchStrategy,
  coordinate,
  stepLabel,
  adjacentStep,
  markCell,
  cellAt,
  markStep,
  loadProjects,
  type Project,
} from "./model.ts";
const sparse = (): Project => ({
  ...createProject(),
  id: "sparse",
  rows: 6,
  columns: 7,
  step: 0,
  grid: Array.from({ length: 42 }, (_, i) => {
    const row = Math.floor(i / 7),
      column = i % 7,
      bead = (row === 2 || row === 4) && (column === 1 || column === 5);
    return {
      row,
      column,
      colorCode: bead ? "P1" : null,
      isEmpty: !bead,
      isCompleted: false,
    };
  }),
});
test("new routes distinguish meaningful task numbers from chart coordinates", () => {
  const p = createProject();
  assert.equal(coordinate(p), 2);
  assert.equal(stepLabel(p), "Step 1 / 16 · Row 3");
  assert.deepEqual(routeCoordinates(sparse()), [2, 4]);
  assert.equal(coordinate(startRoute(sparse())), 2);
  const next = adjacentStep(startRoute(sparse()), 1)!;
  assert.equal(coordinate(next), 4);
  assert.equal(adjacentStep(next, 1), null);
  assert.equal(coordinate(adjacentStep(next, -1)!), 2);
  assert.equal(stepLabel(next), "Step 2 / 2 · Row 5");
  assert.deepEqual(routeCoordinates(sparse(), true), [0, 1, 2, 3, 4, 5]);
  assert.match(stepLabel(sparse(), true), /^Grid coordinate 1 \/ 6/);
});
test("reverse/direction changes choose the correct nonempty unfinished boundary", () => {
  const p = sparse();
  assert.equal(coordinate(startRoute({ ...p, reverse: true })), 4);
  assert.equal(coordinate(switchStrategy(p, "column", false)), 1);
  assert.equal(coordinate(switchStrategy(p, "column", true)), 5);
  const firstDone = markStep(startRoute(p), true);
  assert.equal(coordinate(startRoute(firstDone)), 4);
  const switched = switchStrategy(firstDone, "column");
  assert.equal(coordinate(switched), 1);
  assert.equal(switched.grid, firstDone.grid);
  const all = firstDone.grid.map((c) =>
    c.isEmpty ? c : { ...c, isCompleted: true },
  );
  assert.equal(coordinate(startRoute({ ...p, grid: all })), 2);
});
test("cell completion edits only one valid nonempty address and preserves unrelated cells", () => {
  const p = sparse();
  const address = { row: 2, column: 1 };
  const marked = markCell(p, address, true);
  assert.equal(marked.grid.filter((c) => c.isCompleted).length, 1);
  assert.equal(cellAt(marked, address)?.isCompleted, true);
  assert.equal(marked.grid[2 * 7 + 5], p.grid[2 * 7 + 5]);
  assert.equal(markCell(marked, { row: 0, column: 0 }, true), marked);
  assert.equal(markCell(marked, { row: 2, column: 7 }, true), marked);
  assert.deepEqual(markCell(marked, address, false).grid, p.grid);
  for (const invalid of [
    { row: -1, column: 0 },
    { row: 0, column: 8 },
    { row: 1.5, column: 1 },
  ])
    assert.equal(cellAt(p, invalid), null);
});
test("row/column routes and storage retain exactly the same completed cells and raw saved step", () => {
  let p = sparse();
  p = markCell(p, { row: 2, column: 1 }, true);
  p = markCell(p, { row: 4, column: 5 }, true);
  const original = p.grid;
  const column = switchStrategy(p, "column");
  const row = switchStrategy(column, "row", true);
  assert.equal(column.grid, original);
  assert.equal(row.grid, original);
  assert.equal(row.grid.filter((c) => c.isCompleted).length, 2);
  const raw = JSON.stringify([{ ...p, step: 0 }, column, row]);
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => raw, setItem: () => writes++ },
  });
  try {
    assert.deepEqual(loadProjects(), JSON.parse(raw));
    assert.equal(writes, 0);
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});
test("malformed storage safely fails without writes or invented projects", () => {
  for (const value of ["{bad", "null", "{}", '[null,{}, {"grid":[]}]']) {
    let writes = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => value, setItem: () => writes++ },
    });
    try {
      assert.deepEqual(loadProjects(), []);
      assert.equal(writes, 0);
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
test("empty-pattern strategy changes stay within valid saved coordinate bounds", () => {
  const p = {
    ...sparse(),
    strategy: "column" as const,
    step: 6,
    grid: sparse().grid.map((c) => ({ ...c, isEmpty: true, colorCode: null })),
  };
  const switched = switchStrategy(p, "row");
  assert.equal(switched.step, 5);
  assert.equal(routeCoordinates(switched).length, 0);
  assert.equal(adjacentStep(switched, 1), null);
  assert.equal(stepLabel(switched), "No beads in this pattern");
});
