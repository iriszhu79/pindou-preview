import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import {
  recognize,
  GridDetectionError,
  validateGeometry,
} from "../../src/recognition.ts";
import { evaluate } from "./metrics.ts";
import { diagnostics } from "./diagnostics.ts";
import { validateDataset, repositoryRoot, sha256 } from "./validate.mjs";
import { writeReports } from "./report.mjs";
export async function decodeImage(browser, bytes) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async (base64) => {
      const blob = await (
        await fetch("data:application/octet-stream;base64," + base64)
      ).blob();
      let bitmap;
      try {
        bitmap = await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
        if (
          bitmap.width * bitmap.height > 20000000 ||
          Math.max(bitmap.width, bitmap.height) > 12000
        )
          throw new Error(
            "Image exceeds existing recognizer limits (20 MP / 12000 px)",
          );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const encoded = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(new Blob([data]));
        });
        return { width: canvas.width, height: canvas.height, data: encoded };
      } finally {
        bitmap?.close();
      }
    }, bytes.toString("base64"));
  } finally {
    await page.close();
  }
}
export function recognizeMode(
  image,
  record,
  mode,
  { diagnosticLevel = "summary", recognizer = recognize } = {},
) {
  const start = performance.now();
  let r = null,
    failure = null,
    grid,
    stage = mode === "manual" ? "manual-geometry-validation" : "recognition";
  try {
    if (mode === "manual")
      validateGeometry(image, record.sample.manualRecovery.geometry);
    stage = "recognition";
    r =
      mode === "automatic"
        ? recognizer(image)
        : recognizer(image, record.sample.manualRecovery.geometry);
    grid = r.diagnostics;
  } catch (e) {
    grid = e instanceof GridDetectionError ? e.diagnostics : undefined;
    failure = {
      stage: grid ? "grid-detection/" + grid.stage : stage,
      message: e.message,
    };
  }
  const recognitionMs = performance.now() - start;
  const detail = diagnostics(
    image,
    record.sample,
    record.annotation,
    r,
    grid,
    mode,
  );
  if (diagnosticLevel !== "cells") {
    const decisions = detail.occupancy;
    detail.occupancy = [];
    detail.occupancySummary = Object.fromEntries(
      [...new Set(decisions.map((c) => c.reason))].map((reason) => [
        reason,
        decisions.filter((c) => c.reason === reason).length,
      ]),
    );
  }
  return {
    mode,
    manualInputSource:
      mode === "manual" ? record.sample.manualRecovery.source : null,
    recognitionMs,
    failure,
    prediction: r
      ? {
          rows: r.rows,
          columns: r.columns,
          crop: r.crop,
          palette: r.palette,
          cells: r.cells.map((c) => ({
            row: c.row,
            column: c.column,
            colorCode: c.colorCode,
            isEmpty: c.isEmpty,
            confidence: c.confidence,
            detectedColor: c.detectedColor,
          })),
        }
      : null,
    metrics: evaluate(record.sample, record.annotation, r),
    diagnostics: detail,
  };
}
export async function runBenchmark(options = {}) {
  const root = path.resolve(options.root ?? repositoryRoot),
    manifest = options.manifest ?? "tests/benchmark/manifests/smoke-v1.json";
  const validation = await validateDataset(manifest, {
    root,
    previous: options.previous,
  });
  if (validation.issues.some((i) => i.level === "error"))
    throw Object.assign(
      new Error("Dataset validation failed; recognition was not run"),
      { issues: validation.issues },
    );
  const records = validation.samples.filter(
    (r) =>
      (!options.split ||
        options.split === "all" ||
        r.sample.split === options.split) &&
      (!options.sample || r.sample.id === options.sample),
  );
  if (!records.length) throw new Error("No samples match the requested split");
  const runId =
    new Date().toISOString().replaceAll(":", "-") +
    "-" +
    randomUUID().slice(0, 8);
  const parent = path.resolve(
    root,
    options.out ?? "tests/benchmark/reports/runs",
  );
  await mkdir(parent, { recursive: true });
  const runDir = path.join(parent, runId);
  await mkdir(runDir); // No overwrite path: history is append-only.
  const codeFiles = [
    "src/recognition.ts",
    "src/gridDetection.ts",
    "src/cellClassification.ts",
  ];
  const codeHashes = Object.fromEntries(
    await Promise.all(
      codeFiles.map(async (file) => [
        file,
        sha256(await readFile(path.join(repositoryRoot, file))),
      ]),
    ),
  );
  const harnessFiles = [
    "cli.mjs",
    "schema.json",
    "types.ts",
    "metrics.ts",
    "diagnostics.ts",
    "validate.mjs",
    "run.mjs",
    "report.mjs",
  ];
  const harnessHashes = Object.fromEntries(
    await Promise.all(
      harnessFiles.map(async (file) => [
        file,
        sha256(await readFile(new URL(file, import.meta.url))),
      ]),
    ),
  );
  let git = { commit: null, dirty: null };
  try {
    git = {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim(),
      dirty: !!execFileSync("git", ["status", "--porcelain"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim(),
    };
  } catch {
    /* External archive: hashes still identify exact code. */
  }
  const report = {
    schemaVersion: "1.0",
    runId,
    createdAt: new Date().toISOString(),
    dataset: {
      datasetId: validation.dataset.datasetId,
      manifestSnapshot: validation.dataset,
      version: validation.dataset.version,
      manifestHash: validation.manifestHash,
      sampleCount: validation.dataset.samples.length,
      evaluatedSampleIds: records.map((r) => r.sample.id),
      previousManifestHash: validation.previousManifestHash ?? null,
    },
    split: options.split ?? "all",
    historyPolicy:
      "Append-only run directories; manifests, annotation/image hashes and split history preserved in every run",
    imagePolicy: options.includeImages
      ? "Explicit source-image copies requested"
      : "No raw images in diagnostic JSON; HTML references local originals without copying",
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      decoder:
        "Chromium createImageBitmap; orientation-normalized, white alpha composite",
      recognition:
        "Existing production functions executed in Node; times exclude decoding/metrics/report generation and are not browser Worker or native Safari timings",
    },
    git,
    codeHashes,
    harnessHashes,
    validationIssues: validation.issues,
    samples: [],
    coverage: {},
  };
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  report.runtime.chromium = browser.version();
  try {
    for (const record of records) {
      const { sample, annotation } = record;
      const result = {
        id: sample.id,
        familyId: sample.familyId,
        chart: sample.chart,
        manualRecoveryInput: sample.manualRecovery ?? null,
        kind: sample.kind,
        split: sample.split,
        splitHistory: sample.splitHistory,
        image: { ...sample.image },
        annotationRevision: annotation.revision,
        annotation: { file: sample.annotation, snapshot: annotation },
        annotationHash: record.annotationHash,
        decodeMs: 0,
        modes: [],
      };
      const start = performance.now();
      let image;
      try {
        if (
          sample.image.width * sample.image.height > 20000000 ||
          Math.max(sample.image.width, sample.image.height) > 12000
        )
          throw new Error(
            "Declared image exceeds existing recognizer input limits",
          );
        const decoded = await decodeImage(browser, record.imageBytes);
        if (
          decoded.width !== sample.image.width ||
          decoded.height !== sample.image.height
        )
          throw new Error("Decoder normalized dimensions differ from manifest");
        image = {
          width: decoded.width,
          height: decoded.height,
          data: new Uint8ClampedArray(Buffer.from(decoded.data, "base64")),
        };
      } catch (e) {
        result.modes.push({
          mode: "automatic",
          manualInputSource: null,
          recognitionMs: 0,
          failure: { stage: "image-decoding", message: e.message },
          prediction: null,
          metrics: evaluate(sample, annotation, null),
          diagnostics: {
            rawImageIncluded: false,
            legendRegion: { detectionStatus: "not-implemented" },
            occupancy: [],
          },
        });
      }
      result.decodeMs = performance.now() - start;
      if (image) {
        result.modes.push(recognizeMode(image, record, "automatic", options));
        if (sample.manualRecovery && options.mode !== "automatic")
          result.modes.push(recognizeMode(image, record, "manual", options));
      }
      report.samples.push(result);
      console.log(
        `${sample.id} [${sample.kind}/${sample.split}]: ${result.modes.map((m) => m.mode + " " + (m.failure ? "FAILED " + m.failure.stage : `${m.prediction.columns}×${m.prediction.rows}, ${m.prediction.cells.filter((c) => !c.isEmpty).length} beads / ${m.prediction.palette.length} groups`)).join("; ")}`,
      );
    }
  } finally {
    await browser.close();
  }
  for (const result of report.samples)
    for (const mode of result.modes) {
      const key = `${result.kind}/${result.split}/${mode.mode}`,
        c = (report.coverage[key] ??= {
          samples: 0,
          failures: 0,
          occupancyEvaluated: 0,
          colorEvaluated: 0,
          dimensionsEvaluated: 0,
        });
      c.samples++;
      if (mode.failure) c.failures++;
      if (mode.metrics.occupancy.status === "evaluated") c.occupancyEvaluated++;
      if (mode.metrics.occupiedColor.status === "evaluated") c.colorEvaluated++;
      if (mode.metrics.dimensions.status === "evaluated")
        c.dimensionsEvaluated++;
    }
  await writeFile(
    path.join(runDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeReports(report, records, runDir, options);
  return { report, runDir };
}
