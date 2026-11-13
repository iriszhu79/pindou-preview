import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { recognizeMode } from "./run.mjs";
import { repositoryRoot } from "./validate.mjs";
import { oracle } from "./test-oracles.ts";
import { GridDetectionError } from "../../src/recognition.ts";
test("automatic inference receives only pixels, manual input stays explicit, and labels never enter recognition arguments", () => {
  const { sample, a, r } = oracle(),
    calls: any[] = [];
  const geometry = {
      rows: 2,
      columns: 3,
      crop: { x: 0, y: 0, width: 30, height: 20 },
    },
    image = { width: 80, height: 80, data: new Uint8ClampedArray(80 * 80 * 4) };
  const record = {
    sample: {
      ...sample,
      manualRecovery: { geometry, source: "explicit independent manual input" },
    },
    annotation: a,
  };
  const recognizer = (...args: any[]) => {
    calls.push(args);
    return r;
  };
  const auto = recognizeMode(image, record, "automatic", { recognizer }),
    manual = recognizeMode(image, record, "manual", { recognizer });
  assert.equal(calls[0].length, 1);
  assert.equal(calls[0][0], image);
  assert.deepEqual(calls[1], [image, geometry]);
  assert.equal(auto.mode, "automatic");
  assert.equal(manual.mode, "manual");
  const prior = JSON.stringify(auto.prediction);
  a.cells = [];
  assert.equal(
    JSON.stringify(
      recognizeMode(image, record, "automatic", { recognizer }).prediction,
    ),
    prior,
  );
});
test("failure records retain existing grid stage and manual validation failure rather than making empty-grid predictions", () => {
  const { sample, a } = oracle(),
    image = { width: 80, height: 80, data: new Uint8ClampedArray(80 * 80 * 4) };
  const record = {
    sample: {
      ...sample,
      manualRecovery: {
        geometry: {
          rows: 2,
          columns: 3,
          crop: { x: 0, y: 0, width: 999, height: 20 },
        },
        source: "bad explicit hint",
      },
    },
    annotation: a,
  };
  const failed = recognizeMode(image, record, "automatic", {
    recognizer: () => {
      throw new GridDetectionError({
        method: "v2.0-b1-ranked",
        stage: "axis-agreement",
        rejection: "ambiguous test lattice",
      });
    },
  });
  assert.equal(failed.failure.stage, "grid-detection/axis-agreement");
  assert.equal(failed.prediction, null);
  assert.equal(failed.metrics.occupancy.status, "not-evaluated");
  assert.equal(
    recognizeMode(image, record, "manual").failure.stage,
    "manual-geometry-validation",
  );
});
test("production source never imports benchmark annotations or dataset fixtures", async () => {
  for (const file of await readdir(path.join(repositoryRoot, "src"))) {
    if (
      file.includes(".test.") ||
      (!file.endsWith(".ts") && !file.endsWith(".tsx"))
    )
      continue;
    const text = await readFile(path.join(repositoryRoot, "src", file), "utf8");
    assert.doesNotMatch(
      text,
      /(?:from\s*|import\s*\()["'][^"']*(?:benchmark|tests\/fixtures|annotations)[^"']*["']/i,
      file,
    );
  }
});
test("static difference view renders independently known FP, FN, wrong-color and unverified regions distinctly", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"),
    os = await import("node:os"),
    { writeReports } = await import("./report.mjs");
  const dir = await mkdtemp(path.join(os.tmpdir(), "pindou-visual-oracle-"));
  try {
    const { sample, a, r } = oracle();
    r.cells[0].colorCode = "Color 2";
    const s = {
      ...sample,
      id: "oracle",
      split: "development",
      image: {
        width: 90,
        height: 80,
        sha256: "test-only",
        provenance: {
          source:
            "Synthetic visualization oracle, deliberately corrupted predictions",
          byteIdentity: "not-applicable",
        },
      },
    };
    const mode = {
      mode: "automatic",
      prediction: r,
      metrics: (await import("./metrics.ts")).evaluate(sample, a, r),
      recognitionMs: 0,
      diagnostics: { occupancy: [] },
    };
    await writeReports(
      {
        runId: "unit",
        dataset: { datasetId: "test", version: "1" },
        samples: [
          {
            id: "oracle",
            kind: "synthetic",
            split: "development",
            modes: [mode],
          },
        ],
        coverage: {},
        validationIssues: [],
      },
      [{ sample: s, annotation: a, imagePath: path.join(dir, "source.png") }],
      dir,
    );
    const html = await readFile(path.join(dir, "oracle.html"), "utf8");
    for (const color of ["#c52336", "#1766bf", "#9132b3", "#d87900"])
      assert.ok(html.includes(`stroke="${color}"`), color);
    assert.match(html, /human truth unknown/);
    assert.match(html, /human truth unverified/);
    assert.match(html, /not an error/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("manual recovery success never turns an automatic detection failure into automatic success", () => {
  const { sample, a, r } = oracle(),
    geometry = {
      rows: 2,
      columns: 3,
      crop: { x: 0, y: 0, width: 30, height: 20 },
    },
    image = { width: 80, height: 80, data: new Uint8ClampedArray(80 * 80 * 4) },
    record = {
      sample: {
        ...sample,
        manualRecovery: { geometry, source: "explicit test correction" },
      },
      annotation: a,
    };
  const recognizer = (...args: any[]) => {
    if (args.length === 1)
      throw new GridDetectionError({
        method: "v2.0-b1-ranked",
        stage: "axis-agreement",
        rejection: "ambiguous automatic candidate",
      });
    return r;
  };
  const automatic = recognizeMode(image, record, "automatic", { recognizer }),
    manual = recognizeMode(image, record, "manual", { recognizer });
  assert.equal(automatic.prediction, null);
  assert.equal(automatic.metrics.occupancy.status, "not-evaluated");
  assert.equal(manual.failure, null);
  assert.ok(manual.prediction);
  assert.equal(manual.mode, "manual");
  assert.equal(automatic.mode, "automatic");
});
