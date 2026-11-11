import test from "node:test";
import assert from "node:assert/strict";
import { stepPanDelta } from "./viewport.ts";
const viewport = { left: 0, top: 0, right: 400, bottom: 300 };
test("navigation leaves clearly visible rows and columns at the existing pan", () => {
  assert.deepEqual(
    stepPanDelta(
      { left: -200, top: 80, right: 600, bottom: 100 },
      viewport,
      "row",
    ),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    stepPanDelta(
      { left: 100, top: -200, right: 120, bottom: 500 },
      viewport,
      "column",
    ),
    { x: 0, y: 0 },
  );
});
test("offscreen navigation moves only enough to reveal the active step", () => {
  assert.deepEqual(
    stepPanDelta(
      { left: 0, top: 340, right: 800, bottom: 360 },
      viewport,
      "row",
    ),
    { x: 0, y: -72 },
  );
  assert.deepEqual(
    stepPanDelta(
      { left: -30, top: 0, right: -10, bottom: 600 },
      viewport,
      "column",
    ),
    { x: 42, y: 0 },
  );
});
test("manual focus centers using rendered bounds, independent of grid dimensions", () => {
  assert.deepEqual(
    stepPanDelta(
      { left: -120, top: 340, right: 680, bottom: 360 },
      viewport,
      "row",
      true,
    ),
    { x: -80, y: -200 },
  );
});
test("huge steps and perpendicular offscreen pans remain reachable without changing zoom", () => {
  assert.deepEqual(
    stepPanDelta(
      { left: 600, top: 50, right: 1400, bottom: 70 },
      viewport,
      "row",
    ),
    { x: -800, y: 0 },
  );
  assert.deepEqual(
    stepPanDelta(
      { left: 50, top: -100, right: 550, bottom: 400 },
      viewport,
      "column",
    ),
    { x: -100, y: 0 },
  );
});
