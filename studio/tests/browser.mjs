import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
});
const out = "studio/docs/screenshots";
await mkdir(out, { recursive: true });
const image =
    "/workspace/work/annotation-inputs/candidate-review/Pindou_GT_Candidate_Review_v2/images/P020_palm_tree_watermarked_grid.png",
  candidate =
    "/workspace/work/annotation-inputs/candidate-review/Pindou_GT_Candidate_Review_v2/annotations/P020_candidate.json";
const errors = [];
const metrics = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [820, 1180],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4310");
    await page.locator("input[type=file]").setInputFiles(image);
    await page.getByRole("heading", { name: "01 Original chart" }).waitFor();
    await page.locator(".metadata").evaluate((el) => (el.open = true));
    await page.getByLabel("Purpose", { exact: true }).selectOption("practice");
    await page
      .getByLabel("reviewer", { exact: true })
      .fill("Automated QA — not a human review");
    await page.locator("input[type=file]").setInputFiles(candidate);
    await page
      .getByRole("button", { name: "Use geometry hint as draft" })
      .click();
    await page.getByRole("button", { name: "Apply geometry draft" }).click();
    await page
      .getByRole("button", { name: "Import unverified candidates" })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.match(await page.locator(".status").innerText(), /0\/4560/);
    assert.equal(
      await page
        .getByRole("button", { name: "Gold ZIP", exact: true })
        .isEnabled(),
      false,
    );
    await page
      .getByLabel("Alignment evidence")
      .fill(
        "Practice only: first, intermediate, last lines exercised; not independently verified",
      );
    await page
      .getByLabel("I independently inspected the source / stated scope")
      .check();
    await page
      .getByRole("button", { name: "Confirm geometry", exact: true })
      .click();
    await page.getByRole("button", { name: "Use candidate as draft" }).click();
    await page
      .getByLabel("Final draft occupancy", { exact: true })
      .selectOption("unknown");
    await page
      .getByLabel("Review notes", { exact: true })
      .fill("QA unresolved cell; no human interpretation asserted");
    await page.getByRole("button", { name: "ambiguous", exact: true }).click();
    await page.getByText("Status:", { exact: false }).last().waitFor();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.getByRole("button", { name: "Sample RGB evidence" }).click();
    await page.waitForTimeout(800);
    await page.getByLabel("Source zoom", { exact: true }).fill("2");
    await page.getByLabel("Source tool", { exact: true }).selectOption("grid");
    await page.getByLabel("Source zoom", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Reset view / draft" }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("heading", { name: "01 Original chart" }).waitFor();
    assert.match(await page.locator(".status").innerText(), /0\/4560/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, `${width} overflow`);
    await page.screenshot({
      path: `${out}/studio-${width}.png`,
      fullPage: true,
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Draft ZIP", exact: true }).click();
    const d = await download;
    const path = await d.path();
    const z = unzipSync(new Uint8Array(await readFile(path)));
    const p = JSON.parse(strFromU8(z["studio-project.json"])),
      ann = JSON.parse(strFromU8(z["annotations.json"]));
    assert.equal(
      p.source.sha256,
      "e6276a720f79e07f8e17fc1535f020bee766fac06f002ad3cb14bbd6c4d80c37",
    );
    assert.equal(
      p.cells.filter((c) => c.candidate?.occupancy === "occupied").length,
      1844,
    );
    assert.equal(
      ann.cells.filter((c) => c.verification.status === "verified").length,
      0,
    );
    assert.equal(
      ann.cells.filter((c) => c.occupancy === "unknown").length,
      4560,
    );
    metrics.push({
      width,
      height,
      cells: p.cells.length,
      candidateOccupied: 1844,
      verified: 0,
      sourceBytes: z["source/" + p.source.filename].length,
      zipBytes: (await readFile(path)).length,
      heap: await page.evaluate(
        () => performance.memory?.usedJSHeapSize || null,
      ),
    });
    if (width === 1440)
      await writeFile(
        "/tmp/pindou-studio-annotations.json",
        JSON.stringify(ann),
      );
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "studio/docs/browser-results.json",
    JSON.stringify({ errors, metrics }, null, 2),
  );
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  await browser.close();
}
