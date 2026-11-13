const qaDir = process.env.PINDOU_QA_DIR || "docs/previews/v20b1";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const url =
  process.env.PINDOU_TEST_URL || "http://127.0.0.1:4306/pindou-preview/";
const fixtures = JSON.parse(
  await readFile("tests/fixtures/mard/manifest.json", "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
const reports = [];
await mkdir(`${qaDir}/real-copies`, { recursive: true });
try {
  for (const [width, height] of [
    [1440, 900],
    [820, 1180],
    [390, 844],
    [375, 667],
  ])
    for (const f of fixtures) {
      assert.equal(
        createHash("sha256")
          .update(await readFile(f.file))
          .digest("hex"),
        f.sha256,
      );
      const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: true,
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page
        .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
        .click();
      await page.locator(".recognition input[type=file]").setInputFiles(f.file);
      const start = performance.now();
      await page
        .getByRole("button", { name: "Detect grid automatically" })
        .click();
      await page
        .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
        .waitFor({ timeout: 30000 });
      const autoMs = performance.now() - start;
      assert.equal(
        Number(await page.getByLabel("rows", { exact: true }).inputValue()),
        f.reference.rows,
      );
      assert.equal(
        Number(await page.getByLabel("columns", { exact: true }).inputValue()),
        f.reference.columns,
      );
      const text = await page.locator(".recognition-digital").innerText();
      const parse = (t) => {
        const m = t.match(/(\d+) beads · (\d+) colors · (\d+) uncertain/);
        assert.ok(m, t);
        return { beads: +m[1], colors: +m[2], uncertain: +m[3] };
      };
      const automatic = parse(text);
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: `${qaDir}/real-copies/${f.id}-auto-${width}.png`,
          fullPage: true,
        });
      // Deliberate manual recovery: reset and align via pointer handles. Never enter crop pixel fields.
      await page
        .getByRole("button", { name: "Reset crop", exact: true })
        .click();
      const imageInfo = await page
        .locator(".crop-image-world>img")
        .evaluate((e) => ({ w: e.naturalWidth, h: e.naturalHeight }));
      async function moveCorner(handle, dx, dy) {
        const el = page.getByRole("button", {
          name: `Resize crop ${handle}`,
          exact: true,
        });
        await el.scrollIntoViewIfNeeded();
        const b = await el.boundingBox(),
          image = await page.locator(".crop-image-world>img").boundingBox(),
          x = b.x + b.width / 2,
          y = b.y + b.height / 2,
          tx = x + (dx * image.width) / imageInfo.w,
          ty = y + (dy * image.height) / imageInfo.h;
        if (width < 900) {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: tx, y: ty, id: 1 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await cdp.detach();
        } else {
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(tx, ty, { steps: 5 });
          await page.mouse.up();
        }
      }
      await moveCorner("nw", f.manual.crop.x, f.manual.crop.y);
      await moveCorner(
        "se",
        f.manual.crop.x + f.manual.crop.width - imageInfo.w,
        f.manual.crop.y + f.manual.crop.height - imageInfo.h,
      );
      for (const key of ["x", "y", "width", "height"])
        assert.ok(
          Math.abs(
            Number(
              await page
                .getByLabel("Crop " + key, { exact: true })
                .inputValue(),
            ) - f.manual.crop[key],
          ) < 1.5,
          `${f.id} ${key} handle alignment`,
        );
      await page
        .getByLabel("rows", { exact: true })
        .fill(String(f.reference.rows));
      await page
        .getByLabel("columns", { exact: true })
        .fill(String(f.reference.columns));
      assert.ok(
        await page
          .getByRole("button", { name: "Confirm pattern → Overview" })
          .isDisabled(),
      );
      const manualStart = performance.now();
      await page
        .getByRole("button", { name: "Recognize specified region" })
        .click();
      await page
        .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
        .waitFor();
      const manualMs = performance.now() - manualStart,
        manual = parse(await page.locator(".recognition-digital").innerText());
      if (width === 1440 || width === 390)
        await page.locator(".recognition-geometry").screenshot({
          path: `${qaDir}/real-copies/${f.id}-manual-crop-${width}.png`,
        });
      assert.ok(
        await page
          .getByRole("button", { name: "Confirm pattern → Overview" })
          .isDisabled(),
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("pindou.preview.v20b1.projects.v1"),
        ),
        null,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(errors, []);
      reports.push({
        id: f.id,
        provenance: f.provenance,
        viewport: { width, height },
        automaticGrid: true,
        automatic,
        autoMs,
        manualCropViaHandles: true,
        manual,
        manualMs,
        reference: f.reference,
        autoCountDifference: automatic.beads - f.reference.total,
        manualCountDifference: manual.beads - f.reference.total,
        cellLevelAccuracy:
          "Full-chart accuracy unknown; annotated subset evaluated separately by test:cells",
      });
      console.log(JSON.stringify(reports.at(-1)));
      await context.close();
    }
  await writeFile(
    `${qaDir}/real-copies/results.json`,
    JSON.stringify(reports, null, 2),
  );
} finally {
  await browser.close();
}
