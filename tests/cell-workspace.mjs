import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createProject } from "../src/model.ts";
const url =
  process.env.PINDOU_TEST_URL || "http://127.0.0.1:4306/pindou-preview/";
const key = "pindou.preview.v20b1.projects.v1";
const protectedKeys = [
  "pindou.projects.v1",
  "pindou.preview.v15.projects.v1",
  "pindou.preview.v20a.projects.v1",
];
const fixtures = JSON.parse(
  await readFile("tests/fixtures/mard/manifest.json", "utf8"),
).slice(1);
const output = process.env.PINDOU_QA_DIR || "docs/previews/v20b11";
await mkdir(output + "/workspace-import", { recursive: true });
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  }),
  reports = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [820, 1180],
    [390, 844],
  ])
    for (const f of fixtures) {
      const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: width < 900,
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const previous = createProject();
      previous.id = "preserved";
      previous.grid.find((c) => !c.isEmpty).isCompleted = true;
      await context.addInitScript(
        ({ key, protectedKeys, previous }) => {
          if (!localStorage.getItem("fixture-seeded")) {
            localStorage.setItem(key, JSON.stringify([previous]));
            for (const k of protectedKeys)
              localStorage.setItem(k, "protected:" + k);
            localStorage.setItem("fixture-seeded", "1");
          }
        },
        { key, protectedKeys, previous },
      );
      await page.goto(url);
      await page
        .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
        .click();
      await page.locator(".recognition input[type=file]").setInputFiles(f.file);
      await page
        .getByRole("button", { name: "Detect grid automatically" })
        .click();
      await page
        .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
        .waitFor({ timeout: 30000 });
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export review JSON" }).click();
      const exported = JSON.parse(
        await readFile(await (await downloaded).path(), "utf8"),
      );
      assert.equal(exported.statistics.total, f.reference.total);
      assert.equal(exported.recognition.palette.length, f.reference.colors);
      assert.ok(
        exported.recognition.cells.every(
          (c) => c.occupancy && typeof c.occupancyConfidence === "number",
        ),
      );
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Confirm pattern → Overview" })
        .click();
      await page
        .getByRole("button", { name: "START BEADING →", exact: true })
        .click();
      await page.locator(".stage").waitFor();
      const saved = () =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
      const project = (await saved())[0];
      assert.deepEqual(
        (await saved()).find((p) => p.id === previous.id),
        previous,
      );
      assert.deepEqual(project.palette, exported.recognition.palette);
      assert.equal(
        project.grid.filter((c) => !c.isEmpty).length,
        f.reference.total,
      );
      const rendered = await page
        .locator(".canvas-pattern [data-empty=false] > rect")
        .evaluateAll((es) => es.map((e) => e.getAttribute("fill")));
      for (const p of project.palette)
        assert.ok(
          rendered.includes(p.hex),
          `Missing rendered palette ${p.hex}`,
        );
      await page.locator(".stage").focus();
      await page.keyboard.press("a");
      assert.ok((await saved())[0].grid.some((c) => c.isCompleted));
      await page.reload();
      assert.equal((await saved())[0].id, project.id);
      assert.ok((await saved())[0].grid.some((c) => c.isCompleted));
      for (const k of protectedKeys)
        assert.equal(
          await page.evaluate((k) => localStorage.getItem(k), k),
          "protected:" + k,
        );
      await page
        .locator(".project")
        .filter({
          hasText: f.file
            .split("/")
            .at(-1)
            .replace(/\.[^.]+$/, ""),
        })
        .click();
      await page.locator(".stage").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      if (width !== 820)
        await page.screenshot({
          path: `${output}/workspace-import/${f.id}-${width}.png`,
          fullPage: true,
        });
      reports.push({
        fixture: f.id,
        viewport: { width, height },
        exportedColors: project.palette.length,
        exportedBeads: exported.statistics.total,
        paletteRendered: true,
        progressPersisted: true,
        protectedStorageUntouched: true,
        protectedStorageKeys: protectedKeys,
      });
      console.log(
        "PASS",
        f.id,
        width,
        height,
        "export/import/palette rendering/progress/storage",
      );
      await context.close();
    }
  await writeFile(
    output + "/workspace-import/results.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
