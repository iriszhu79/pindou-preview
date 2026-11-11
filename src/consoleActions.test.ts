import test from "node:test";
import assert from "node:assert/strict";
import { createProject, stepCells, loadProjects } from "./model.ts";
import {
  confirmConsoleCompletion,
  consoleActionLabel,
} from "./consoleActions.ts";
import { PROJECT_STORAGE_KEY } from "./storage.ts";

test("A explicitly completes only the selected bead and is idempotent", () => {
  const p = createProject(),
    cell = stepCells(p)[0];
  const next = confirmConsoleCompletion(p, true, cell);
  assert.equal(next.grid.filter((c) => c.isCompleted).length, 1);
  assert.ok(
    next.grid.find((c) => c.row === cell.row && c.column === cell.column)
      ?.isCompleted,
  );
  assert.equal(p.grid.filter((c) => c.isCompleted).length, 0);
  assert.equal(confirmConsoleCompletion(next, true, cell), next);
  assert.match(consoleActionLabel(p, true, cell), /selected bead/);
});
test("A in Hand Mode completes current step, preserves unrelated progress, and never clears", () => {
  const p = createProject();
  p.grid.find((c) => !c.isEmpty && c.row !== 2)!.isCompleted = true;
  const next = confirmConsoleCompletion(p, false, stepCells(p)[0]);
  assert.equal(
    next.grid.filter((c) => c.isCompleted).length,
    stepCells(p).length + 1,
  );
  assert.equal(confirmConsoleCompletion(next, false, null), next);
  assert.match(consoleActionLabel(p, false, null), /Complete Row 3/);
});
test("preview storage loads only its own namespace without migrating production saves", () => {
  const requested: string[] = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => {
        requested.push(key);
        return key === "pindou.projects.v1"
          ? JSON.stringify([createProject()])
          : null;
      },
    },
  });
  assert.deepEqual(loadProjects(), []);
  assert.deepEqual(requested, [PROJECT_STORAGE_KEY]);
  assert.notEqual(PROJECT_STORAGE_KEY, "pindou.projects.v1");
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
