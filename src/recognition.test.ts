import test from "node:test";
import assert from "node:assert/strict";
import {
  cellBounds,
  validateGeometry,
  sampleCell,
  isEmptySample,
  recognize,
  recognitionStats,
  toProject,
} from "./recognition.ts";
import { syntheticChart } from "../tests/recognition-fixtures.ts";
test("crop geometry and cell coordinates reject invalid and off-image inputs", () => {
  const { image, geometry } = syntheticChart(20, 20);
  assert.deepEqual(cellBounds(geometry, 2, 3), {
    x: 64,
    y: 56,
    width: 16,
    height: 16,
  });
  assert.throws(() => cellBounds(geometry, -1, 0));
  for (const invalid of [
    { ...geometry, rows: 0 },
    { ...geometry, rows: 1.5 },
    { ...geometry, crop: { ...geometry.crop, x: -1 } },
    { ...geometry, crop: { ...geometry.crop, width: 9999 } },
    { ...geometry, rows: 300 },
  ])
    assert.throws(() => validateGeometry(image, invalid));
});
test("robust sampling ignores dark center labels and distinguishes occupied white from empty white", () => {
  const { image, geometry } = syntheticChart(20, 20);
  assert.ok(isEmptySample([255, 255, 255], 0));
  assert.ok(!isEmptySample([255, 255, 255], 0.1));
  assert.ok(!isEmptySample([248, 244, 204], 0));
  const pink = sampleCell(image, cellBounds(geometry, 1, 1));
  assert.deepEqual(pink.rgb, [241, 212, 217]);
  const white = sampleCell(image, cellBounds(geometry, 1, 2));
  assert.ok(!isEmptySample(white.rgb, white.ink));
});
for (const [rows, columns] of [
  [20, 20],
  [51, 40],
  [100, 120],
])
  test(`synthetic ${columns}×${rows}: automatic grid, cell classification, palette, counts and conversion`, () => {
    const { image, geometry, expected, colors } = syntheticChart(rows, columns);
    const automatic = recognize(image);
    assert.equal(automatic.rows, rows);
    assert.equal(automatic.columns, columns);
    assert.deepEqual(automatic.crop, geometry.crop);
    const r = recognize(image, geometry),
      s = recognitionStats(r);
    assert.equal(s.total, expected.filter((c) => c !== null).length);
    assert.equal(s.counts.length, 4);
    r.cells.forEach((cell, i) => {
      assert.equal(cell.isEmpty, expected[i] === null, `occupancy ${i}`);
      if (expected[i] !== null) {
        const color = r.palette.find((p) => p.code === cell.colorCode)!;
        assert.equal(
          color.hex,
          "#" +
            colors[expected[i]!]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join(""),
        );
      }
    });
    const project = toProject(r, "Synthetic chart", "synthetic-test");
    assert.equal(project.grid.length, rows * columns);
    assert.ok(project.grid.every((c) => !c.isCompleted));
    assert.equal(project.id, "synthetic-test");
    assert.ok(!("confidence" in project.grid[0]));
  });
test("uncertainty is reported, corrections update statistics and malformed outputs cannot become projects", () => {
  const { image, geometry } = syntheticChart(20, 20);
  const r = recognize(image, geometry);
  r.cells[0].confidence = 0.2;
  assert.ok(recognitionStats(r).uncertain > 0);
  const previous = recognitionStats(r).total;
  r.cells[0] = {
    ...r.cells[0],
    isEmpty: false,
    colorCode: r.palette[0].code,
    corrected: true,
  };
  assert.equal(recognitionStats(r).total, previous + 1);
  assert.throws(() =>
    toProject({ ...r, cells: [...r.cells.slice(1), r.cells[1]] }, "Bad", "bad"),
  );
  assert.throws(() =>
    toProject({ ...r, palette: [...r.palette, r.palette[0]] }, "Bad", "bad"),
  );
});
test("blank images, low resolution and excessive palettes are rejected", () => {
  const { image, geometry } = syntheticChart(20, 20);
  // 27 separated backgrounds exceed the supported limited-palette chart scope.
  for (let r=0;r<20;r++) for(let c=0;c<20;c++) {
    const n=(r*20+c)%27;
    const rgb=[151+(n%3)*40,151+(Math.floor(n/3)%3)*40,151+Math.floor(n/9)*40];
    const b=cellBounds(geometry,r,c);
    for(let y=b.y;y<b.y+b.height;y++) for(let x=b.x;x<b.x+b.width;x++) image.data.set([...rgb,255],(y*image.width+x)*4);
  }
  assert.throws(() => recognize(image,geometry), /More than 24/);
  image.data.fill(255);
  assert.throws(() => recognize(image));
  assert.throws(() => recognize(image, geometry));
  assert.throws(() =>
    recognize({ width: 10, height: 10, data: new Uint8ClampedArray(400) }),
  );
});
