const qaDir = process.env.PINDOU_QA_DIR || "docs/previews/v20b1";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createProject } from "../src/model.ts";
import { syntheticChart } from "./recognition-fixtures.ts";
const url =
  process.env.PINDOU_TEST_URL || "http://127.0.0.1:4305/pindou-preview/";
const key = "pindou.preview.v20b1.projects.v1";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
const errors = [];
await mkdir(`${qaDir}/recognition-regression`, { recursive: true });
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [820, 1180],
    [390, 844],
    [375, 667],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const original = createProject();
    original.grid.find((c) => !c.isEmpty).isCompleted = true;
    await context.addInitScript(
      ({ key, original }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify([original]));
        localStorage.setItem("pindou.projects.v1", "production-sentinel");
      },
      { key, original },
    );
    await page.goto(url);
    await page
      .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Load original MARD sample", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Detect grid automatically", exact: true })
      .waitFor();
    const start = performance.now();
    await page
      .getByRole("button", { name: "Detect grid automatically", exact: true })
      .click();
    await page
      .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
      .waitFor({ timeout: 30000 });
    console.log(
      `${width}×${height} worker/UI recognition: ${Math.round(performance.now() - start)}ms`,
    );
    assert.equal(
      await page.getByLabel("rows", { exact: true }).inputValue(),
      "51",
    );
    assert.equal(
      await page.getByLabel("columns", { exact: true }).inputValue(),
      "40",
    );
    assert.match(
      await page.locator(".recognition-digital").innerText(),
      /1179 beads/,
    );
    assert.equal(await page.locator(".recognition-grid rect").count(), 2040);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const saved = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    assert.deepEqual(
      await saved(),
      [original],
      "Recognition must not write before review",
    );
    const confirm = page.getByRole("button", {
      name: "Confirm pattern → Overview",
      exact: true,
    });
    assert.ok(await confirm.isDisabled());
    if (width === 1440) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export review JSON" }).click();
      const file = await download;
      await file.saveAs(
        `${qaDir}/recognition-regression/mard-browser-recognition.json`,
      );
    }
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `${qaDir}/recognition-regression/recognition-${width}.png`,
        fullPage: true,
      });
    // Empty first cell is converted to a color, counts update, then restoring returns to 1,179.
    await page
      .getByLabel("Cell color", { exact: true })
      .selectOption("Color 1");
    assert.match(
      await page.locator(".recognition-digital").innerText(),
      /1180 beads/,
    );
    if (width === 1440) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export review JSON" }).click();
      const data = JSON.parse(
        await readFile(await (await download).path(), "utf8"),
      );
      assert.equal(data.recognition.cells[0].occupancy, "occupied");
      assert.equal(data.recognition.cells[0].corrected, true);
      assert.match(
        data.recognition.cells[0].occupancyReason,
        /Manually corrected/,
      );
    }
    await page.getByRole("button", { name: "Restore recognized cell" }).click();
    assert.match(
      await page.locator(".recognition-digital").innerText(),
      /1179 beads/,
    );
    await page.getByLabel("Color 1 code", { exact: true }).fill("USER-A1");
    await page.getByLabel("Color 1 code", { exact: true }).press("Tab");
    await page
      .getByLabel("Cell color", { exact: true })
      .selectOption("USER-A1");
    await page.getByRole("button", { name: "Restore recognized cell" }).click();
    // Changing geometry requires a rerun even after ticking the review box.
    await page.getByRole("checkbox").check();
    await page.locator(".advanced-crop-settings summary").click();
    await page.getByLabel("Crop x", { exact: true }).fill("35");
    assert.ok(await confirm.isDisabled());
    await page.getByLabel("Crop x", { exact: true }).fill("34");
    await page.getByRole("checkbox").check();
    assert.ok(await confirm.isDisabled());
    await page
      .getByRole("button", { name: "Recognize specified region" })
      .click();
    await page
      .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
      .waitFor();
    await page.getByRole("checkbox").check();
    await confirm.click();
    await page
      .getByRole("button", { name: "START BEADING →", exact: true })
      .waitFor();
    assert.match(await page.locator(".metrics").innerText(), /40 × 51/);
    assert.match(await page.locator(".metrics").innerText(), /1179/);
    assert.equal((await saved()).length, 2);
    assert.deepEqual(
      (await saved()).find((p) => p.id === original.id),
      original,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pindou.projects.v1")),
      "production-sentinel",
    );
    await page
      .getByRole("button", { name: "START BEADING →", exact: true })
      .click();
    await page.locator(".stage").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("a");
    assert.ok((await saved())[0].grid.some((c) => c.isCompleted));
    await page.keyboard.press("b");
    assert.ok((await saved())[0].grid.every((c) => !c.isCompleted));
    const importedId = (await saved())[0].id;
    await page.reload();
    assert.ok((await saved()).some((p) => p.id === importedId));
    assert.deepEqual(
      (await saved()).find((p) => p.id === original.id),
      original,
    );
    await page
      .locator(".project")
      .filter({ hasText: "MARD source chart" })
      .click();
    await page.locator(".stage").waitFor();
    assert.equal((await saved())[0].id, importedId);
    console.log(
      `PASS ${width}×${height}: real sample auto detection, review, correction/restore, code edit, confirmation, Workspace, storage isolation`,
    );
    await context.close();
  }
  // Exercise real upload, unsupported file and failed-grid recovery rather than only the sample-fetch shortcut.
  const context = await browser.newContext(),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page
    .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
    .click();
  const input = page.locator(".recognition input[type=file]");
  await input.setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("alert").filter({ hasText: "JPG or PNG" }).waitFor();
  await input.setInputFiles("public/samples/sample-pattern.jpg");
  await page
    .getByRole("button", { name: "Recognize specified region" })
    .waitFor();
  await page
    .getByRole("button", { name: "Recognize specified region" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Recognition Failed" })
    .waitFor();
  await page.locator(".advanced-crop-settings summary").click();
  for (const [label, value] of [
    ["Crop x", "34"],
    ["Crop y", "592"],
    ["Crop width", "1188"],
    ["Crop height", "1516"],
    ["rows", "51"],
    ["columns", "40"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Recognize specified region" })
    .click();
  await page
    .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
    .waitFor();
  assert.match(
    await page.locator(".recognition-digital").innerText(),
    /1179 beads/,
  );
  const synthetic = syntheticChart(20, 20);
  const encoded = await page.evaluate(
    ({ width, height, data }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas
        .getContext("2d")
        .putImageData(
          new ImageData(new Uint8ClampedArray(data), width, height),
          0,
          0,
        );
      return canvas.toDataURL("image/png").split(",")[1];
    },
    {
      width: synthetic.image.width,
      height: synthetic.image.height,
      data: Array.from(synthetic.image.data),
    },
  );
  await input.setInputFiles({
    name: "synthetic-20x20.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await page.getByRole("button", { name: "Detect grid automatically" }).click();
  await page
    .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("rows", { exact: true }).inputValue(),
    "20",
  );
  assert.equal(
    await page.getByLabel("columns", { exact: true }).inputValue(),
    "20",
  );
  assert.match(
    await page.locator(".recognition-digital").innerText(),
    new RegExp(`${synthetic.expected.filter((c) => c !== null).length} beads`),
  );
  await context.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS upload, invalid type, invalid geometry, manual crop recovery; zero page errors",
  );
} finally {
  await browser.close();
}
