import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateDataset, sha256, repositoryRoot } from "./validate.mjs";
import { encodePNG } from "./make-synthetic.mjs";
import { escapeHTML } from "./report.mjs";
async function fixture(fn: (root: string, d: any, a: any) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pindou-benchmark-"));
  try {
    const d = JSON.parse(
      await readFile(
        path.join(repositoryRoot, "tests/benchmark/manifests/smoke-v1.json"),
        "utf8",
      ),
    );
    const sample = d.samples[3];
    const a = JSON.parse(
      await readFile(path.join(repositoryRoot, sample.annotation), "utf8"),
    );
    const bytes = await readFile(path.join(repositoryRoot, sample.image.file));
    sample.image.file = "image.png";
    sample.annotation = "annotation.json";
    d.samples = [sample];
    await writeFile(path.join(root, "image.png"), bytes);
    await fn(root, d, a);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function check(root: string, d: any, a: any) {
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(d));
  await writeFile(path.join(root, "annotation.json"), JSON.stringify(a));
  return validateDataset("manifest.json", { root });
}
const errors = (r: any) =>
  r.issues
    .filter((i: any) => i.level === "error")
    .map((i: any) => i.message)
    .join("\n");
test("sample dataset permits partial unreviewed real annotations but never certifies their cells", async () => {
  const r = await validateDataset("tests/benchmark/manifests/smoke-v1.json");
  assert.equal(errors(r), "");
  assert.equal(r.samples.length, 4);
  assert.ok(r.issues.some((i: any) => /Not evaluated/.test(i.message)));
});
test("validator catches duplicate IDs, image hash mismatch and missing files", () =>
  fixture(async (root, d, a) => {
    d.samples.push(structuredClone(d.samples[0]));
    d.samples[1].image.sha256 = "0".repeat(64);
    d.samples[1].image.file = "missing.png";
    const r = await check(root, d, a);
    assert.match(errors(r), /Duplicate pattern ID/);
    assert.match(errors(r), /ENOENT/);
    d.samples.pop();
    d.samples[0].image.sha256 = "0".repeat(64);
    assert.match(errors(await check(root, d, a)), /SHA-256 mismatch/);
  }));
test("validator rejects out-of-range cells, duplicate addresses, invalid palette references and contradictory status", () =>
  fixture(async (root, d, a) => {
    a.cells[0].row = 999;
    a.cells[1] = { ...a.cells[2] };
    a.cells[3].colorCode = "UNKNOWN";
    a.cells[3].occupancy = "empty";
    a.cells[4].verification = {
      status: "verified",
      reviewerKind: "recognizer",
    };
    const e = errors(await check(root, d, a));
    assert.match(e, /out of range/);
    assert.match(e, /Duplicate cell/);
    assert.match(e, /unknown palette/);
    assert.match(e, /cannot have a color/);
    assert.match(e, /independent human/);
  }));
test("complete verified quantities must agree with cell truth; partial counts are not forced to match totals", () =>
  fixture(async (root, d, a) => {
    a.palette.entries[0].quantity.value = 999;
    assert.match(
      errors(await check(root, d, a)),
      /Complete verified cell count/,
    );
    a.cellCoverage = "partial";
    a.cells = a.cells.slice(0, 3);
    assert.equal(errors(await check(root, d, a)), "");
  }));
test("held-out family/hash leakage and missing split-history evidence are errors", () =>
  fixture(async (root, d, a) => {
    const held = structuredClone(d.samples[0]);
    held.id = "second";
    held.split = "held-out";
    d.samples.push(held);
    const e = errors(await check(root, d, a));
    assert.match(e, /leakage/);
    assert.match(e, /family crosses/);
    assert.match(e, /split-history/);
  }));
test("valid 20-image dataset ingests without code changes and can contain dimensions-only/unknown truth", () =>
  fixture(async (root, d, a) => {
    d.samples = [];
    for (let i = 0; i < 20; i++) {
      const image = {
        width: 80,
        height: 80,
        data: new Uint8ClampedArray(80 * 80 * 4).fill(255),
      };
      image.data[0] = i;
      const bytes = encodePNG(image),
        id = "chart-" + i;
      await writeFile(path.join(root, id + ".png"), bytes);
      const annotation = {
        ...a,
        patternId: id,
        verification: { status: "unreviewed" },
        grid: null,
        palette: {
          completeness: "partial",
          verification: { status: "unreviewed" },
          entries: [],
        },
        cellCoverage: "partial",
        cells: [],
      };
      await writeFile(
        path.join(root, id + ".json"),
        JSON.stringify(annotation),
      );
      d.samples.push({
        id,
        familyId: id,
        kind: "synthetic",
        split: "development",
        splitHistory: [
          {
            split: "development",
            at: "2026-11-13T00:00:00Z",
            reason: "Ingestion capacity fixture",
          },
        ],
        image: {
          file: id + ".png",
          width: 80,
          height: 80,
          sha256: sha256(bytes),
          provenance: {
            status: "synthetic",
            source: "ingestion test",
            transformations: [],
            byteIdentity: "not-applicable",
          },
        },
        chart: { brand: null, type: "ingestion only" },
        annotation: id + ".json",
      });
    }
    const r = await check(root, d, a);
    assert.equal(errors(r), "");
    assert.equal(r.samples.length, 20);
  }));
test("HTML escapes annotation text and never needs executable prediction/ground-truth scripts", () => {
  assert.equal(escapeHTML("<script>\"&'"), "&lt;script&gt;&quot;&amp;&#39;");
});
test("previous-manifest comparison detects erased held-out membership and permits explicit versioned moves", () =>
  fixture(async (root, d, a) => {
    d.samples[0].split = "held-out";
    d.samples[0].splitHistory[0].split = "held-out";
    await writeFile(path.join(root, "previous.json"), JSON.stringify(d));
    d.version = "1.1.0";
    d.samples[0].split = "development";
    d.samples[0].splitHistory = [
      {
        split: "development",
        at: "2026-11-14T00:00:00Z",
        reason: "erased history",
      },
    ];
    await check(root, d, a);
    const bad = await validateDataset("manifest.json", {
      root,
      previous: "previous.json",
    });
    assert.match(errors(bad), /rewritten/);
    assert.match(errors(bad), /Previously held-out/);
    const prior = JSON.parse(
      await readFile(path.join(root, "previous.json"), "utf8"),
    );
    d.samples[0].splitHistory = [
      ...prior.samples[0].splitHistory,
      {
        split: "development",
        at: "2026-11-14T00:00:00Z",
        reason:
          "Explicitly retired from held-out set before any tuning; see review record",
      },
    ];
    await check(root, d, a);
    assert.equal(
      errors(
        await validateDataset("manifest.json", {
          root,
          previous: "previous.json",
        }),
      ),
      "",
    );
  }));
test("wrong normalized dimensions, missing verification, and out-of-image bounds are actionable errors", () =>
  fixture(async (root, d, a) => {
    d.samples[0].image.width = 123;
    a.grid.crop.value.width = 9999;
    delete a.cells[0].verification;
    const r = await check(root, d, a);
    assert.match(errors(r), /dimensions mismatch/);
    assert.match(errors(r), /verification/);
    a.cells[0].verification = a.verification;
    assert.match(errors(await check(root, d, a)), /rectangle exceeds/);
  }));
