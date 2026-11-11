import test from "node:test";
import assert from "node:assert/strict";
import { addressFromBounds, sameCell } from "./hitTest.ts";
test("rendered rectangles map centers and fractional boundaries at any zoom/pan", () => {
  for (const zoom of [1, 2, 3])
    for (const [left, top] of [
      [168.67, 263.9],
      [-120.3, 57.8],
      [77.2, -332.1],
    ]) {
      const origin = {
        left,
        top,
        width: 4.707692 * zoom,
        height: 4.707692 * zoom,
      };
      for (const [row, column] of [
        [0, 0],
        [2, 6],
        [50, 39],
      ])
        for (const f of [0.01, 0.1, 0.5, 0.9, 0.99]) {
          const point = {
            x: left + (column + f) * origin.width,
            y: top + (row + f) * origin.height,
          };
          assert.deepEqual(addressFromBounds(point, origin, 51, 40), {
            row,
            column,
          });
        }
    }
});
test("off-grid, nonfinite and collapsed geometry never aliases another cell", () => {
  const origin = { left: 10, top: 20, width: 5, height: 5 };
  for (const point of [
    { x: 9.99, y: 22 },
    { x: 210, y: 22 },
    { x: 12, y: 275 },
    { x: NaN, y: 22 },
  ])
    assert.equal(addressFromBounds(point, origin, 51, 40), null);
  assert.equal(
    addressFromBounds({ x: 12, y: 22 }, { ...origin, width: 0 }, 51, 40),
    null,
  );
});
test("a short boundary-crossing gesture is not treated as the release neighbor", () => {
  assert.equal(sameCell({ row: 2, column: 6 }, { row: 2, column: 7 }), false);
  assert.equal(sameCell(null, { row: 2, column: 7 }), false);
  assert.equal(sameCell({ row: 2, column: 6 }, { row: 2, column: 6 }), true);
});
