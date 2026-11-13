import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const fixtures = JSON.parse(
  await readFile("tests/fixtures/mard/manifest.json", "utf8"),
);
const annotations = JSON.parse(
  await readFile("tests/fixtures/mard/cell-annotations.json", "utf8"),
);
const output = "docs/previews/v20b11/cell-validation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
const reports = [];
try {
  for (const f of fixtures) {
    const bytes = await readFile(f.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
    const page = await browser.newPage();
    const raster = await page.evaluate(async (base64) => {
      const blob = await (
        await fetch("data:application/octet-stream;base64," + base64)
      ).blob();
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(
          new Blob([ctx.getImageData(0, 0, canvas.width, canvas.height).data]),
        );
      });
      return { width: canvas.width, height: canvas.height, data };
    }, bytes.toString("base64"));
    await page.close();
    const rasterPath = "/tmp/pindou-b11-" + f.id + ".json";
    await writeFile(rasterPath, JSON.stringify(raster));
    const run = (modulePath) => {
      const p = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          "--experimental-strip-types",
          "tests/cell-metrics-worker.mjs",
          modulePath,
          rasterPath,
          JSON.stringify(f),
          JSON.stringify(annotations.fixtures[f.id]),
        ],
        { encoding: "utf8", maxBuffer: 8e6 },
      );
      assert.equal(p.status, 0, p.stderr);
      return JSON.parse(p.stdout);
    };
    const current = run(path.resolve("src/recognition.ts"));
    // Thresholds test independently annotated cells, never production reference totals.
    for (const r of [
      current.automatic,
      current.manual,
      ...current.perturbations,
    ]) {
      assert.ok(!r.error, r.error);
      assert.ok(r.annotation.precision >= 0.97, JSON.stringify(r.annotation));
      assert.ok(r.annotation.recall >= 0.97, JSON.stringify(r.annotation));
      assert.ok(
        r.annotation.colorAccuracyIncludingMissed >= 0.97,
        JSON.stringify(r.annotation),
      );
    }
    for (const r of current.perturbations) {
      assert.equal(
        r.stats.total,
        current.manual.stats.total,
        `${f.id}: crop occupancy stability`,
      );
      assert.equal(
        r.stats.counts.length,
        current.manual.stats.counts.length,
        `${f.id}: crop palette stability`,
      );
    }
    assert.equal(current.automatic.geometry.rows, f.reference.rows);
    assert.equal(current.automatic.geometry.columns, f.reference.columns);
    const baseline = process.env.PINDOU_CLASSIFIER_BASELINE
      ? run(path.resolve(process.env.PINDOU_CLASSIFIER_BASELINE))
      : null;
    const report = {
      fixture: f,
      annotationMethod: annotations.method,
      current,
      baseline,
    };
    reports.push(report);
    console.log(
      JSON.stringify({
        id: f.id,
        current: current.automatic.stats,
        annotation: current.automatic.annotation,
        manual: current.manual.stats,
        perturbed: current.perturbations.map((p) => p.stats.total),
        timing: current.performance,
        baseline: baseline?.performance,
      }),
    );
  }
  await writeFile(
    output + "/results.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
