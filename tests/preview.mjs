import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createProject } from "../src/model.ts";
const url =
  process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const key = "pindou.preview.v15.projects.v1",
  prod = "pindou.projects.v1",
  sentinel = JSON.stringify([
    {
      ...createProject(),
      id: "production-only",
      name: "Production save — must stay hidden",
    },
  ]);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const screenshots = "docs/previews/v15-round2/after";
await mkdir(screenshots, { recursive: true });
const errors = [];
try {
  for (const [width, height] of [
    [390, 844],
    [375, 667],
    [844, 390],
    [820, 1180],
    [1180, 820],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ prod, sentinel }) => {
        if (!localStorage.getItem(prod)) localStorage.setItem(prod, sentinel);
      },
      { prod, sentinel },
    );
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.locator(".project").count(),
      0,
      "production saves must not appear",
    );
    const label = width === 390 ? "mobile" : width === 1440 ? "desktop" : null;
    if (label)
      await page.screenshot({
        path: `${screenshots}/home-${label}.png`,
        fullPage: true,
      });
    await page
      .locator("input[type=file]")
      .setInputFiles("public/samples/sample-pattern.jpg");
    await page.locator(".upload").waitFor();
    assert.match(
      await page.locator(".upload").innerText(),
      /has not been parsed/,
    );
    await page
      .getByRole("button", { name: "Close preview", exact: true })
      .click();
    await page.getByRole("button", { name: "TRY SAMPLE", exact: true }).click();
    assert.match(await page.locator(".metrics").innerText(), /91/);
    assert.equal(
      await page.locator(".preview svg").getAttribute("viewBox"),
      "-20 -20 520 520",
    );
    await page.getByRole("button", { name: /Column-by-Column/ }).click();
    assert.equal(
      (await page.locator(".preview [data-active-step]").getAttribute("x")) !==
        null,
      true,
    );
    await page.getByRole("button", { name: /Row-by-Row/ }).click();
    if (label)
      await page.screenshot({
        path: `${screenshots}/overview-${label}.png`,
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "START BEADING →", exact: true })
      .click();
    const snapshot = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0], key);
    const count = async () =>
      (await snapshot()).grid.filter((c) => c.isCompleted).length;
    const checkFit = async () => {
      const s = await page.locator(".stage").boundingBox();
      assert.ok(s.width > 150 && s.height > (height < 540 ? 90 : 130));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    };
    await checkFit();
    if (label)
      await page.screenshot({ path: `${screenshots}/workspace-${label}.png` });
    const a = page.locator(".canvas-caption .console-a"),
      b = page.locator(".canvas-caption .console-b");
    const current = await snapshot();
    const qty = current.grid.filter((c) => !c.isEmpty && c.row === 2).length;
    await a.click();
    assert.equal(await count(), qty);
    await b.click();
    assert.equal(await count(), 0);
    // Tap selection is not completion. Test A contextual action and B undo.
    await page.getByRole("button", { name: "✓ Select", exact: true }).click();
    const target = page
      .locator('.stage [data-cell-row="2"][data-cell-column="6"] > rect')
      .first();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await target.tap();
    await page.waitForFunction(() =>
      document
        .querySelector(".canvas-caption .console-a")
        .getAttribute("aria-label")
        .includes("selected bead"),
    );
    assert.equal(await count(), 0);
    assert.match(
      await a.getAttribute("aria-label"),
      /selected bead, Row 3, Column 7/,
    );
    await a.click();
    assert.equal(await count(), 1);
    await b.click();
    assert.equal(await count(), 0);
    await a.click();
    assert.equal(await count(), 1);
    assert.equal(await a.isDisabled(), true);
    await page
      .getByRole("button", { name: /Focus mode/i, exact: true })
      .click();
    await checkFit();
    assert.equal(await page.locator(".focus-mode").count(), 1);
    assert.equal(await count(), 1);
    await page.getByRole("button", { name: /Exit focus/i }).click();
    const phone = width <= 600 && height > width;
    if (phone)
      await page
        .getByRole("button", { name: "Expand task drawer", exact: true })
        .click();
    else if (
      (await page.locator(".panel-toggle").isVisible()) &&
      (await page.locator(".panel-toggle").getAttribute("aria-expanded")) ===
        "false"
    )
      await page.locator(".panel-toggle").click();
    const pad = page.getByRole("group", { name: "D-pad step navigation" });
    assert.equal(
      await pad
        .getByRole("button", { name: "D-pad left", exact: true })
        .isDisabled(),
      true,
    );
    const before = (await snapshot()).step;
    await pad.getByRole("button", { name: "D-pad down", exact: true }).click();
    assert.notEqual((await snapshot()).step, before);
    assert.equal(await count(), 1);
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("column");
    assert.equal((await snapshot()).strategy, "column");
    assert.equal(await count(), 1);
    await page
      .getByLabel("Workspace starting direction", { exact: true })
      .selectOption("reverse");
    assert.equal(
      await pad
        .getByRole("button", { name: "D-pad up", exact: true })
        .isDisabled(),
      true,
    );
    await pad.getByRole("button", { name: "D-pad left", exact: true }).click();
    assert.equal(await count(), 1);
    if (phone) await page.locator(".drawer-toggle").click();
    await page.reload();
    assert.equal(await page.locator(".project").count(), 1);
    await page.getByRole("button", { name: "My Studio", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
        .isVisible(),
      true,
    );
    await page.locator(".project").click();
    assert.equal(await count(), 1);
    assert.equal((await snapshot()).strategy, "column");
    assert.equal(
      await page.evaluate((prod) => localStorage.getItem(prod), prod),
      sentinel,
    );
    for (let i = 0; i < 10; i++) {
      const next = page.getByRole("button", {
        name: "Next canvas step",
        exact: true,
      });
      if (!(await next.isDisabled())) await next.click();
    }
    await checkFit();
    assert.equal(await count(), 1);
    if (phone) assert.equal(await page.evaluate(() => window.scrollY), 0);
    console.log(
      `PASS V1.5 ${width}×${height}: upload/start, chart stats, selection, A/B, D-pad, route, Focus, saves and isolation`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
