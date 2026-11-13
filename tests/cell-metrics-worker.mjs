// Isolated Node process: timing/memory numbers exclude browser image decoding.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [modulePath, rasterPath, fixtureText, annotationText] =
  process.argv.slice(2);
const { recognize, recognitionStats } = await import(pathToFileURL(modulePath));
const { toOKLab, perceptualDistance } = await import(
  "../src/cellClassification.ts"
);
const f = JSON.parse(fixtureText),
  a = JSON.parse(annotationText),
  raw = JSON.parse(readFileSync(rasterPath, "utf8"));
const image = {
  width: raw.width,
  height: raw.height,
  data: new Uint8ClampedArray(Buffer.from(raw.data, "base64")),
};
function evaluate(result) {
  const rgb = (hex) =>
    hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
  const mapped = new Map(
    result.palette.map((p) => {
      const ranked = Object.entries(a.swatches)
        .map(([code, hex]) => [
          code,
          perceptualDistance(toOKLab(rgb(p.hex)), toOKLab(rgb(hex))),
        ])
        .sort((x, y) => x[1] - y[1]);
      return [p.code, ranked[0][1] < 0.06 ? ranked[0][0] : "unmatched"];
    }),
  );
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0,
    colorCorrect = 0,
    occupied = 0,
    uncertain = 0;
  const disagreements = [];
  for (const t of a.cells) {
    const c = result.cells[t.row * result.columns + t.column],
      actual = c.isEmpty ? null : mapped.get(c.colorCode),
      positive = t.code !== null;
    if (positive) occupied++;
    if (positive && !c.isEmpty) tp++;
    else if (positive) fn++;
    else if (!c.isEmpty) fp++;
    else tn++;
    if (positive && actual === t.code) colorCorrect++;
    if (c.confidence < 0.7) uncertain++;
    if (actual !== t.code)
      disagreements.push({ ...t, actual, confidence: c.confidence });
  }
  return {
    annotated: a.cells.length,
    tp,
    fp,
    fn,
    tn,
    precision: tp / Math.max(1, tp + fp),
    recall: tp / Math.max(1, tp + fn),
    colorCorrect,
    occupied,
    colorAccuracyIncludingMissed: colorCorrect / occupied,
    uncertain,
    disagreements,
  };
}
function summarize(r) {
  return {
    ...recognitionStats(r),
    empty: r.cells.filter((c) => c.isEmpty).length,
    occupancyUncertain: r.cells.filter((c) => c.occupancy === "uncertain")
      .length,
    colorUncertain: r.cells.filter((c) => !c.isEmpty && c.colorConfidence < 0.7)
      .length,
    uncertainEmpty: r.cells.filter((c) => c.isEmpty && c.confidence < 0.7)
      .length,
  };
}
const autoStart = performance.now();
let automatic;
try {
  const r = recognize(image);
  automatic = {
    geometry: { crop: r.crop, rows: r.rows, columns: r.columns },
    stats: summarize(r),
    annotation: evaluate(r),
  };
} catch (e) {
  automatic = { error: e.message };
}
const automaticMs = performance.now() - autoStart;
const manual = recognize(image, f.manual);
const perturbations = [
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
].map(([dx, dy]) => {
  const g = {
    ...f.manual,
    crop: {
      ...f.manual.crop,
      x: f.manual.crop.x + dx,
      y: f.manual.crop.y + dy,
    },
  };
  const r = recognize(image, g);
  return { dx, dy, stats: summarize(r), annotation: evaluate(r) };
});
global.gc();
const before = process.memoryUsage();
const times = [];
let retained;
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  retained = recognize(image, f.manual);
  times.push(performance.now() - start);
}
global.gc();
const after = process.memoryUsage();
console.log(
  JSON.stringify({
    id: f.id,
    automatic,
    automaticMs,
    manual: { stats: summarize(manual), annotation: evaluate(manual) },
    perturbations,
    performance: {
      classificationMs: times,
      medianMs: [...times].sort((a, b) => a - b)[1],
      retainedHeapDeltaBytes: after.heapUsed - before.heapUsed,
      peakProcessRssKiB: process.resourceUsage().maxRSS,
      rasterBytes: image.data.byteLength,
    },
    retainedCells: retained.cells.length,
  }),
);
