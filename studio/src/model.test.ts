import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  changeGeometry,
  signGrid,
  editDraft,
  reviewCells,
  quality,
  undo,
  cellAtPoint,
  rectangleSelection,
  quantities,
  commit,
  emptySignoff,
  uid,
  now,
  auditProblems,
} from "./model.ts";
import {
  importCandidates,
  benchmark,
  validateProject,
  candidateInfo,
  sha,
} from "./io.ts";
const source = {
  filename: "test.png",
  mime: "image/png",
  sha256: "a".repeat(64),
  width: 100,
  height: 100,
  bytes: 100,
};
function project() {
  let p = changeGeometry(createProject(source), {
    rows: 2,
    columns: 2,
    crop: { x: 10, y: 10, width: 80, height: 80 },
  });
  p.meta = {
    ...p.meta,
    reviewer: "Independent tester",
    provenance: "derived",
    provenanceNotes: "Synthetic test image",
  };
  return p;
}
test("coordinate mapping and rectangular selection preserve precision", () => {
  const p = project();
  assert.equal(cellAtPoint(49, 49, p.grid.geometry), 0);
  assert.equal(cellAtPoint(50, 50, p.grid.geometry), 3);
  assert.equal(cellAtPoint(90, 90, p.grid.geometry), null);
  assert.deepEqual(rectangleSelection(0, 3, 2), [0, 1, 2, 3]);
});
test("candidate quantities cannot qualify as truth; omitted cells remain unknown", () => {
  let p = project();
  p = importCandidates(
    p,
    {
      rows: 2,
      columns: 2,
      cells: [
        {
          row: 1,
          column: 1,
          occupancy: "occupied",
          official_code: "A1",
          human_verified: true,
        },
      ],
    },
    1,
    true,
  );
  assert.equal(p.cells[0].candidate?.code, "A1");
  assert.equal(p.cells[0].review.status, "candidate-generated");
  assert.equal(p.cells[1].draft.occupancy, "unknown");
  assert.equal(quality(p).gold, false);
  assert.equal(benchmark(p).cells[0].occupancy, "unknown");
});
test("candidate import rejects duplicate, mismatched hash and dimensions atomically", () => {
  const p = project();
  for (const raw of [
    { rows: 3, columns: 2, cells: [] },
    { rows: 2, columns: 2, source_sha256: "b".repeat(64), cells: [] },
    {
      rows: 2,
      columns: 2,
      cells: [
        { row: 0, column: 0 },
        { row: 0, column: 0 },
      ],
    },
  ])
    assert.throws(() => importCandidates(p, raw, 0, true));
  assert.equal(p.audit.length, 1);
});
test("explicit geometry and review sign-offs are required; draft edits invalidate review", () => {
  let p = project();
  assert.throws(() => signGrid(p, "lines", false));
  p = signGrid(p, "First, middle, last aligned", true);
  assert.throws(() => reviewCells(p, [0], "confirmed", "", "source", true));
  p = editDraft(p, [0], { occupancy: "occupied", code: "A1" });
  assert.throws(() => reviewCells(p, [0], "confirmed", "", "source", false));
  p = reviewCells(p, [0], "corrected", "transcribed", "original cell", true);
  assert.equal(quality(p).verified, 1);
  assert.equal(benchmark(p).cells[0].colorCode, "A1");
  p = editDraft(p, [0], { code: "A2" });
  assert.equal(quality(p).verified, 0);
  assert.equal(undo(p).cells[0].review.code, "A1");
  assert.equal(auditProblems(undo(p)).length, 0);
});
test("geometry edits archive rather than transfer reviews; undo/redo retains audit", () => {
  let p = signGrid(project(), "Aligned", true);
  p = editDraft(p, [0], { occupancy: "empty" });
  p = reviewCells(p, [0], "confirmed", "", "source", true);
  const n = changeGeometry(p, {
    rows: 3,
    columns: 3,
    crop: { x: 0, y: 0, width: 90, height: 90 },
  });
  assert.equal(n.archives.length, 2);
  assert.equal(quality(n).verified, 0);
  const restored = undo(n);
  assert.equal(quality(restored).verified, 1);
  assert.equal(restored.audit.length, n.audit.length + 1);
  assert.equal(undo(restored, true).cells.length, 9);
});
test("Gold requires complete independent cells and legend; practice never yields truth", () => {
  let p = signGrid(project(), "Aligned", true);
  p = editDraft(p, [0, 1, 2, 3], { occupancy: "occupied", code: "A1" });
  p = reviewCells(p, [0, 1, 2, 3], "confirmed", "", "source cell", true);
  assert.equal(quality(p).gold, false);
  const id = uid();
  p = commit(
    p,
    "legend.recorded",
    {
      legend: {
        before: [],
        after: [
          {
            id: uid(),
            brand: "test",
            code: "A1",
            rgb: [10, 20, 30],
            quantity: 4,
            location: "legend",
            verification: {
              ...emptySignoff(),
              status: "verified",
              independent: true,
              reviewer: p.meta.reviewer,
              at: now(),
              notes: "source legend",
              eventId: id,
            },
            resolution: null,
          },
        ],
      },
    },
    [],
    id,
  );
  assert.equal(quality(p).gold, true);
  assert.equal(quantities(p)[0].status, "matching");
  p = { ...p, meta: { ...p.meta, purpose: "practice" } };
  assert.equal(quality(p).gold, false);
  assert.equal(quality(p).silver, false);
});
test("ambiguous cells remain explicit unknown; forged reviews rejected", () => {
  let p = signGrid(project(), "Aligned", true);
  p = reviewCells(p, [0], "ambiguous", "Obscured", "source", false);
  assert.equal(benchmark(p).cells[0].occupancy, "unknown");
  assert.throws(() =>
    validateProject({
      ...p,
      cells: p.cells.map((c, i) =>
        i
          ? c
          : {
              ...c,
              review: { ...c.review, status: "confirmed", occupancy: "empty" },
            },
      ),
    }),
  );
});
test("original byte SHA-256 is deterministic", async () => {
  assert.equal(
    await sha(new Blob(["abc"])),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
test("legacy geometry is only a hint; base is explicit", () => {
  const info = candidateInfo({
    grid: {
      rows: 80,
      columns: 57,
      crop_pixel_bounds_xyxy: [77, 168, 1362, 1970],
    },
  });
  assert.equal(info.base, 1);
  assert.equal(info.geometry?.crop.width, 1285);
});
test("practice mode suppresses previously independent annotation exports", () => {
  let p = signGrid(project(), "Aligned", true);
  p = editDraft(p, [0], { occupancy: "empty" });
  p = reviewCells(p, [0], "confirmed", "", "source", true);
  p = { ...p, meta: { ...p.meta, purpose: "practice" } };
  assert.equal(benchmark(p).cells[0].verification.status, "unreviewed");
  assert.equal(benchmark(p).cells[0].occupancy, "unknown");
});
test("native schema validates full backup, rejects malformed review and coordinates", () => {
  let p = project();
  assert.equal(validateProject(p), p);
  assert.throws(() =>
    validateProject({
      ...p,
      cells: p.cells.map((c, i) => (i ? c : { ...c, row: 9 })),
    }),
  );
  assert.throws(() =>
    validateProject({ ...p, meta: { ...p.meta, purpose: "fake" } }),
  );
});
test("Pindou recognition uncertain occupancy abstains and cluster labels are not official codes", () => {
  const p = importCandidates(
    project(),
    {
      recognition: {
        rows: 2,
        columns: 2,
        cells: [
          {
            row: 0,
            column: 0,
            occupancy: "uncertain",
            colorCode: "Color 1",
            detectedColor: "#123456",
          },
        ],
      },
    },
    0,
    true,
  );
  assert.equal(p.cells[0].candidate?.occupancy, "unknown");
  assert.equal(p.cells[0].candidate?.group, "Color 1");
  assert.equal(p.cells[0].candidate?.code, null);
  assert.deepEqual(p.cells[0].candidate?.rgb, [18, 52, 86]);
});
test("benchmark exports conform to the existing annotation schema", async () => {
  const { default: Ajv } = await import("ajv/dist/2020.js");
  const fs = await import("node:fs/promises");
  const schema = JSON.parse(
    await fs.readFile(
      new URL("../../tests/benchmark/schema.json", import.meta.url),
      "utf8",
    ),
  );
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  ajv.addSchema(schema);
  const check = ajv.compile({ $ref: schema.$id + "#/$defs/annotation" });
  assert.equal(check(benchmark(project())), true, JSON.stringify(check.errors));
});
