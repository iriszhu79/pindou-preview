import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createProject } from "../src/model.ts";
const baseline = process.env.PINDOU_BASELINE_URL;
assert.ok(
  baseline,
  "Set PINDOU_BASELINE_URL to the read-only main snapshot preview.",
);
const current = process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const p = createProject();
p.grid[46].isCompleted = true;
try {
  for (const [width, height] of [
    [820, 1180],
    [1180, 820],
    [1440, 900],
    [844, 390],
  ]) {
    for (const focus of [false, true]) {
      const screenshots = [];
      for (const [name, url] of [
        ["baseline", baseline],
        ["current", current],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 1,
        });
        await context.addInitScript(
          (p) =>
            localStorage.setItem("pindou.preview.v20b1.projects.v1", JSON.stringify([p])),
          p,
        );
        const page = await context.newPage();
        await page.goto(url);
        await page.getByRole("button", { name: /Continue/ }).click();
        if (focus)
          await page
            .getByRole("button", { name: "Focus mode", exact: true })
            .click();
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(100);
        assert.equal(await page.locator(".mobile-drawer").count(), 0);
        screenshots.push(
          await page.screenshot({
            animations: "disabled",
            path: `/tmp/pindou-v14-${name}-${width}-${focus ? "focus" : "normal"}.png`,
          }),
        );
        await context.close();
      }
      assert.ok(
        screenshots[0].equals(screenshots[1]),
        `Visual difference outside phone portrait: ${width}×${height} ${focus ? "Focus" : "normal"}; inspect /tmp screenshots`,
      );
      console.log(
        `PASS pixel-identical main/current ${width}×${height} ${focus ? "Focus" : "normal"}`,
      );
    }
  }
} finally {
  await browser.close();
}
