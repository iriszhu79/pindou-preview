import test from "node:test";
import assert from "node:assert/strict";
import {
  recognize,
  recognitionStats,
  toProject,
  type Raster,
} from "./recognition.ts";
import { toOKLab, perceptualDistance } from "./cellClassification.ts";

function chart() {
  const image: Raster = {
    width: 240,
    height: 240,
    data: new Uint8ClampedArray(240 * 240 * 4).fill(255),
  };
  const colors = [
    [15, 35, 18],
    [240, 90, 20],
    [20, 180, 180],
    [245, 250, 159],
    [253, 253, 239],
    [255, 255, 255],
    [210, 50, 140],
    [220, 205, 60],
  ];
  const expected = new Map<number, number>();
  for (let k = 0; k < colors.length; k++)
    for (const row of [3, 5]) {
      const column = k + 1;
      expected.set(row * 10 + column, k);
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++) {
          const ink = x >= 9 && x < 15 && y >= 8 && y < 16;
          const watermark = y === x && x < 9;
          const rgb = ink
            ? k === 0
              ? [245, 245, 245]
              : [55, 55, 55]
            : colors[k];
          const noisy = rgb.map((v, ch) =>
            Math.max(
              0,
              Math.min(
                255,
                v + ((x * 7 + y * 11 + ch) % 3) - 1 + (watermark ? 5 : 0),
              ),
            ),
          );
          image.data.set(
            [...noisy, 255],
            ((row * 24 + y) * 240 + column * 24 + x) * 4,
          );
        }
    }
  return {
    image,
    colors,
    expected,
    geometry: {
      rows: 10,
      columns: 10,
      crop: { x: 0, y: 0, width: 240, height: 240 },
    },
  };
}
test("perceptual multi-region classification retains dark, saturated, pale and printed white beads under crop perturbation", () => {
  const { image, geometry, expected, colors } = chart();
  for (const shift of [-1, 0, 1]) {
    // Valid interior crop alignment changes without including external pixels.
    const g = {
      ...geometry,
      crop: { x: 1 + shift, y: 1 - shift, width: 238, height: 238 },
    };
    const result = recognize(image, g),
      stats = recognitionStats(result);
    assert.equal(stats.total, expected.size);
    assert.equal(
      stats.counts.length,
      colors.length,
      JSON.stringify(stats.counts),
    );
    result.cells.forEach((cell, i) => {
      assert.equal(
        !cell.isEmpty,
        expected.has(i),
        `occupancy ${i} at shift ${shift}`,
      );
      if (!cell.isEmpty) {
        const rgb = result.palette
          .find((p) => p.code === cell.colorCode)!
          .hex.match(/\w\w/g)!
          .map((v) => parseInt(v, 16));
        assert.ok(
          perceptualDistance(toOKLab(rgb), toOKLab(colors[expected.get(i)!])) <
            0.02,
          `color ${i}`,
        );
      }
    });
    const project = toProject(
      result,
      "classification regression",
      "local-test",
    );
    assert.equal(
      new Set(project.grid.filter((c) => !c.isEmpty).map((c) => c.colorCode))
        .size,
      colors.length,
    );
    assert.equal(project.grid.filter((c) => !c.isEmpty).length, expected.size);
  }
});
test("unlabelled white between colored beads stays explicitly uncertain instead of silently certain empty", () => {
  const { image, geometry } = chart();
  // row4,column4 lies between row3 and row5 beads and is visually indistinguishable from a hole.
  const cell = recognize(image, geometry).cells[44];
  assert.equal(cell.isEmpty, true);
  assert.equal(cell.occupancy, "uncertain");
  assert.ok(cell.confidence < 0.7);
  assert.match(cell.occupancyReason!, /white/);
});

test("a chart filled with pale cream does not teach the classifier that cream is empty paper", () => {
  const { image, geometry } = chart();
  for (let i = 0; i < image.data.length; i += 4)
    image.data.set([253, 253, 239, 255], i);
  const result = recognize(image, geometry);
  assert.equal(recognitionStats(result).total, 100);
  assert.equal(result.palette.length, 1);
});
