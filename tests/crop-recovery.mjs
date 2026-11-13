const qaDir = process.env.PINDOU_QA_DIR || "docs/previews/v20b1";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const url =
  process.env.PINDOU_TEST_URL || "http://127.0.0.1:4306/pindou-preview/";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
await mkdir(qaDir, { recursive: true });
try {
  for (const [width, height] of [
    [1440, 900],
    [820, 1180],
    [390, 844],
    [375, 667],
  ]) {
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
    await page
      .getByRole("button", { name: "Load original MARD sample" })
      .click();
    await page
      .getByRole("button", { name: "Detect grid automatically" })
      .click();
    await page
      .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
      .waitFor();
    assert.match(
      await page.locator(".recognition-digital").innerText(),
      /1179 beads/,
    );
    await page.getByRole("checkbox").check();
    const confirm = page.getByRole("button", {
      name: "Confirm pattern → Overview",
    });
    assert.ok(await confirm.isEnabled());
    const crop = page.locator(".visual-grid-crop");
    await crop.scrollIntoViewIfNeeded();
    const handle = page.getByRole("button", {
      name: "Resize crop nw",
      exact: true,
    });
    const b = await handle.boundingBox();
    const oldX = Number(
      await page.getByLabel("Crop x", { exact: true }).inputValue(),
    );
    const scroll = await page.evaluate(() => scrollY);
    if (width < 900) {
      const cdp = await context.newCDPSession(page);
      const x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + 7, y: y + 9, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cdp.detach();
    } else {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 7, b.y + b.height / 2 + 9, {
        steps: 4,
      });
      await page.mouse.up();
    }
    assert.ok(
      Number(await page.getByLabel("Crop x", { exact: true }).inputValue()) >
        oldX,
    );
    assert.equal(
      await page.evaluate(() => scrollY),
      scroll,
      "Handle movement must not scroll the page",
    );
    assert.ok(await confirm.isDisabled());
    const before = await page.locator(".crop-overlay").boundingBox();
    await page.getByLabel("Source zoom", { exact: true }).press("ArrowRight");
    const after = await page.locator(".crop-overlay").boundingBox();
    assert.ok(after.width > before.width);
    const image = await page.locator(".crop-image-world>img").boundingBox();
    assert.ok(
      Math.abs(image.width - after.width) < 1 &&
        Math.abs(image.height - after.height) < 1,
      "Overlay scales with original image",
    );
    await page.getByRole("button", { name: "Reset crop", exact: true }).click();
    assert.equal(
      await page.getByLabel("Crop x", { exact: true }).inputValue(),
      "0",
    );
    // A deliberately line-free SYNTHETIC 50x50 chart exercises discoverable recovery without pixel-coordinate entry.
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 500;
      const x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, 500, 500);
      x.fillStyle = "#f1d4d9";
      x.fillRect(230, 230, 40, 40);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page.locator(".recognition input[type=file]").setInputFiles({
      name: "synthetic-line-free-50x50.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await page
      .getByRole("button", { name: "Detect grid automatically" })
      .click();
    await page.getByRole("region", { name: "Recognition recovery" }).waitFor();
    await page.getByRole("button", { name: "Adjust Grid Manually" }).click();
    await page.getByLabel("rows", { exact: true }).fill("50");
    await page.getByLabel("columns", { exact: true }).fill("50");
    assert.equal(await page.locator(".crop-overlay line").count(), 98);
    assert.ok(
      !(await page.locator(".advanced-crop-settings").getAttribute("open")),
    );
    await page
      .getByRole("button", { name: "Recognize specified region" })
      .click();
    await page
      .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
      .waitFor();
    assert.match(
      await page.locator(".recognition-digital").innerText(),
      /16 beads/,
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Confirm pattern → Overview" })
        .isDisabled(),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `${qaDir}/recovery-${width}.png`,
        fullPage: true,
      });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}x${height}: crop touch/mouse, zoom alignment, reset, stale gating, failure recovery without coordinates (synthetic), original Pig 1179`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
