import test from "node:test";
import assert from "node:assert/strict";
import { gridVariant } from "../tests/grid-variants.ts";
import { diagnoseGrid, recognize, recognitionStats } from "./recognition.ts";
for (const options of [
  { fine: 250, major: 5 },
  { fine: 252, major: 10 },
  { fine: 248, missing: [7, 8], header: true },
  { rows: 29, columns: 41, fine: 250, major: 10, header: true },
])
  test(`mixed-line synthetic ${JSON.stringify(options)}: full lattice instead of major-line alias`, () => {
    const f = gridVariant(options),
      d = diagnoseGrid(f.image);
    assert.ok(d.geometry, d.rejection);
    assert.equal(d.geometry.rows, f.geometry.rows);
    assert.equal(d.geometry.columns, f.geometry.columns);
    for (const k of ["x", "y", "width", "height"] as const)
      assert.ok(Math.abs(d.geometry.crop[k] - f.geometry.crop[k]) < 1.5);
    assert.equal(
      recognitionStats(recognize(f.image, f.geometry)).total,
      f.beads,
    );
    assert.ok((d.candidates?.length ?? 0) > 1);
  });
test("cropping outer page margins does not change inferred grid size or phase", () => {
  const f = gridVariant({ fine: 250, header: true }),
    x = 5,
    y = 3,
    w = f.image.width - 9,
    h = f.image.height - 7,
    data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++)
    data.set(
      f.image.data.subarray(
        ((row + y) * f.image.width + x) * 4,
        ((row + y) * f.image.width + x + w) * 4,
      ),
      row * w * 4,
    );
  const d = diagnoseGrid({ width: w, height: h, data });
  assert.ok(d.geometry, d.rejection);
  assert.equal(d.geometry.rows, f.geometry.rows);
  assert.equal(d.geometry.columns, f.geometry.columns);
  assert.ok(Math.abs(d.geometry.crop.x - (f.geometry.crop.x - x)) < 1.5);
});
test("color blocks without outer grid/axis evidence cannot certify missing empty margins", () => {
  const image = {
    width: 400,
    height: 400,
    data: new Uint8ClampedArray(400 * 400 * 4).fill(255),
  };
  for (let r = 10; r < 20; r++)
    for (let c = 10; c < 20; c++) {
      const color = (r + c) % 2 ? [230, 150, 180] : [150, 200, 230];
      for (let y = r * 10; y < (r + 1) * 10; y++)
        for (let x = c * 10; x < (c + 1) * 10; x++)
          image.data.set([...color, 255], (y * 400 + x) * 4);
    }
  const d = diagnoseGrid(image);
  assert.equal(
    d.geometry,
    undefined,
    "Color-block extent alone must not invent the full chart bounds",
  );
  assert.ok(d.evidence?.colorLatticeX.length);
});
