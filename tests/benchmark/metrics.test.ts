import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, cropError } from "./metrics.ts";
import type { Annotation, Sample, Verification } from "./types.ts";
import type { Recognition } from "../../src/recognition.ts";
import { oracle } from "./test-oracles.ts";
const v = oracle().a.verification;

test("independent confusion-matrix oracle: unknown and draft cells never affect precision, recall or incorrect confidence", () => {
  const { sample, a, r } = oracle(),
    m = evaluate(sample, a, r);
  assert.deepEqual(m.occupancy, {
    status: "evaluated",
    value: { tp: 1, fp: 1, fn: 1, tn: 1, precision: 0.5, recall: 0.5 },
    denominator: 4,
  });
  assert.equal(m.occupiedColor.status, "evaluated");
  if (m.occupiedColor.status === "evaluated")
    assert.equal(m.occupiedColor.value.accuracy, 0.5);
  assert.deepEqual(m.uncertainty!.incorrectlyConfident, {
    status: "evaluated",
    value: 2,
    denominator: 4,
  });
  for (const i of [3, 4])
    assert.equal(m.differences[i].incorrectlyConfident, false);
  assert.equal(m.codeMapping.status, "not-evaluated");
});
test("wrong occupied color is separate from occupancy; a missed bead remains a color failure", () => {
  const { sample, a, r } = oracle();
  r.cells[2] = { ...r.cells[2], isEmpty: false, colorCode: "Color 1" };
  const m = evaluate(sample, a, r);
  assert.equal(m.differences[2].wrongColor, true);
  assert.equal(m.differences[2].occupancyError, null);
  assert.equal(m.occupiedColor.status, "evaluated");
  if (m.occupiedColor.status === "evaluated")
    assert.deepEqual(
      [m.occupiedColor.value.correct, m.occupiedColor.value.total],
      [1, 2],
    );
});
test("missing verification, absent mappings, dimension mismatch and missing predictions produce Not evaluated", () => {
  const { sample, a, r } = oracle();
  a.mappingPolicy!.verification = { status: "unreviewed" };
  assert.equal(evaluate(sample, a, r).occupiedColor.status, "not-evaluated");
  a.grid!.dimensions.verification = { status: "unreviewed" };
  assert.equal(evaluate(sample, a, r).occupancy.status, "not-evaluated");
  a.grid!.dimensions.verification = v;
  r.rows = 3;
  r.columns = 2;
  assert.equal(evaluate(sample, a, r).occupancy.status, "not-evaluated");
  assert.equal(evaluate(sample, a, null).occupiedColor.status, "not-evaluated");
});
test("ambiguous QA swatch mapping abstains, does not inject official codes, and suppresses quantity scoring", () => {
  const { sample, a, r } = oracle();
  a.palette.entries[1].swatch!.value = [240, 40, 60];
  const m = evaluate(sample, a, r);
  assert.ok(m.paletteMapping.groups.every((g) => g.referenceCode === null));
  assert.equal(m.perCodeQuantities.status, "not-evaluated");
  assert.equal(r.cells[0].colorCode, "Color 1");
  assert.equal(m.codeMapping.status, "not-evaluated");
});
test("geometry errors use intersection/union and edge distances, not inferred correctness", () => {
  const e = cropError(
    { x: 2, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: 10, height: 10 },
  );
  assert.equal(e.iou, 2 / 3);
  assert.equal(e.referenceCoverage, 0.8);
  assert.equal(e.edgeRMSErrorPx, Math.SQRT2);
});
test("native official-code accuracy is available only through an explicitly capable evaluator adapter", () => {
  const { sample, a, r } = oracle();
  r.cells[0].colorCode = "RED";
  const m = evaluate(sample, a, r, { officialCodesAvailable: true });
  assert.equal(m.codeMapping.status, "evaluated");
  if (m.codeMapping.status === "evaluated")
    assert.equal(m.codeMapping.value.accuracy, 0.5);
});
test("verified occupancy does not silently certify an unverified color", () => {
  const { sample, a, r } = oracle();
  a.cells[0].colorVerification = { status: "unreviewed" };
  const m = evaluate(sample, a, r);
  assert.equal(m.differences[0].truth, "verified");
  assert.equal(m.differences[0].colorTruth, "unverified");
  if (m.occupiedColor.status === "evaluated")
    assert.equal(m.occupiedColor.value.total, 1);
});
test("candidate selection checks dimensions as well as bounds and does not invent alternative rejection reasons", async () => {
  const { sample, a, r } = oracle(),
    { diagnostics } = await import("./diagnostics.ts");
  const actual = { rows: r.rows, columns: r.columns, crop: r.crop };
  const c = {
    score: 1,
    methods: ["unit"],
    phase: 1,
    agreement: 1,
    coverage: 1,
  };
  const d = diagnostics(
    { width: 80, height: 80 },
    sample,
    a,
    r,
    {
      method: "v2.0-b1-ranked",
      stage: "accepted",
      geometry: actual,
      candidates: [
        { ...c, geometry: actual },
        { ...c, geometry: { ...actual, rows: 1, columns: 6 } },
      ],
    },
    "automatic",
  );
  assert.deepEqual(
    d.grid.candidates.map((c) => c.disposition),
    ["selected", "alternative-not-selected"],
  );
  assert.equal(d.grid.candidates[1].rejectionReason, null);
  assert.match(d.grid.candidates[1].reasonAvailability, /does not expose/);
});
