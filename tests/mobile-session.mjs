import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  createProject,
  stepCells,
  stats,
  coordinate,
  markStep,
} from "../src/model.ts";

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const url = process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const viewports = [
  [390, 844],
  [375, 667],
  [844, 390],
  [667, 375],
  [820, 1180],
  [1180, 820],
  [1440, 900],
  [1280, 800],
  [640, 400],
];
const project = createProject();
project.step = 2;
project.grid[46].isCompleted = true;
const backup = {
  ...createProject(),
  id: "legacy-backup",
  name: "Saved V1.1 backup",
  step: 4,
};
backup.grid[66].isCompleted = true;
const large = {
  ...createProject(),
  id: "synthetic-qa",
  name: "Synthetic 40 × 51 QA grid",
  columns: 40,
  rows: 51,
  step: 2,
  grid: Array.from({ length: 40 * 51 }, (_, i) => ({
    row: Math.floor(i / 40),
    column: i % 40,
    colorCode: i % 9 === 0 ? null : ["P1", "G1", "Y1"][i % 3],
    isEmpty: i % 9 === 0,
    isCompleted: i === 41,
  })),
};
const allErrors = [];
try {
  for (const [width, height] of viewports) {
    const phone = width <= 600 && height > width;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => allErrors.push(e.message));
    await page.addInitScript(
      (projects) => {
        if (!localStorage.getItem("pindou.preview.v15.projects.v1"))
          localStorage.setItem("pindou.preview.v15.projects.v1", JSON.stringify(projects));
      },
      [project, backup, large],
    );
    await page.goto(url);
    // Entering a new version must not write or reset data just by opening the studio.
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1")),
      ),
      [project, backup, large],
    );
    await page.getByRole("button", { name: /Little bloom.*Continue/ }).click();
    const expandDrawer = async () => {
      if (
        phone &&
        (await page.locator(".drawer-toggle").getAttribute("aria-expanded")) ===
          "false"
      )
        await page.locator(".drawer-toggle").click();
    };
    const collapseDrawer = async () => {
      if (
        phone &&
        (await page.locator(".drawer-toggle").getAttribute("aria-expanded")) ===
          "true"
      )
        await page.locator(".drawer-toggle").click();
    };
    const current = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1"))[0],
      );
    const visible = async () => {
      const result = await page.evaluate(() => {
        const rect = (s) => document.querySelector(s).getBoundingClientRect();
        const stage = rect(".stage"),
          panel = rect(
            document.querySelector(".mobile-drawer")
              ? ".mobile-drawer"
              : ".task-panel",
          );
        const selectors = document.querySelector(".mobile-drawer")
          ? [".drawer-toggle", ".drawer-summary", ".canvas-step-nav"]
          : [
              ".step-title",
              ".remaining-summary",
              ".color-chips",
              ".task-panel .step-nav button:last-child",
              ".complete-action",
              ".canvas-step-nav",
            ];
        return {
          height: innerHeight,
          width: innerWidth,
          scroll: scrollY,
          overflow: document.documentElement.scrollWidth > innerWidth,
          stage: {
            left: stage.left,
            top: stage.top,
            right: stage.right,
            bottom: stage.bottom,
            width: stage.width,
            height: stage.height,
          },
          panel: {
            left: panel.left,
            top: panel.top,
            right: panel.right,
            bottom: panel.bottom,
          },
          controls: selectors.map((s) => {
            const r = rect(s);
            return {
              s,
              top: r.top,
              left: r.left,
              right: r.right,
              bottom: r.bottom,
            };
          }),
        };
      });
      assert.equal(result.overflow, false, `Overflow at ${width}×${height}`);
      assert.equal(result.scroll, 0, "Session scrolled the webpage");
      assert.ok(
        result.stage.width > 150 && result.stage.height > 90,
        `Canvas too small: ${JSON.stringify(result)}`,
      );
      for (const c of result.controls)
        assert.ok(
          c.top >= 0 &&
            c.bottom <= result.height + 1 &&
            c.left >= 0 &&
            c.right <= result.width + 1,
          `Offscreen control: ${JSON.stringify(c)} at ${width}×${height}`,
        );
      assert.ok(
        result.stage.right <= result.panel.left + 1 ||
          result.stage.bottom <= result.panel.top + 1,
        "Panel covers canvas",
      );
      await page.waitForFunction(() => {
        const a = document.querySelector(".stage").getBoundingClientRect(),
          b = document
            .querySelector(".stage [data-active-step]")
            .getBoundingClientRect(),
          p = JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1"))[0];
        return p.strategy === "row"
          ? b.top >= a.top + 10 && b.bottom <= a.bottom - 10
          : b.left >= a.left + 10 && b.right <= a.right - 10;
      });
      const landscape = width > height;
      if (landscape || width > 1000)
        assert.ok(
          result.panel.left >= result.stage.right - 1,
          "Expected side panel",
        );
      else
        assert.ok(
          result.panel.top >= result.stage.bottom - 1,
          "Expected bottom dock",
        );
    };
    await page.waitForFunction(
      () => document.querySelector(".stage").clientHeight > 90,
    );
    await visible();
    // Ten physical-crafting steps with separate navigation/completion, no page scroll.
    for (let n = 0; n < 10; n++) {
      const p = await current();
      const cells = stepCells(p);
      const counts = stats(cells, p.palette).filter((c) => c.count);
      assert.match(
        await page.locator(".remaining-summary").innerText(),
        new RegExp(
          `${cells.length} total.*${cells.filter((c) => c.isCompleted).length} completed.*${cells.filter((c) => !c.isCompleted).length} remaining`,
        ),
      );
      assert.equal(
        await page.locator(phone ? ".drawer-chip" : ".color-chip").count(),
        counts.length,
      );
      for (const c of counts)
        await page
          .getByLabel(
            `${c.code}, ${c.count - c.done} remaining of ${c.count}`,
            { exact: true },
          )
          .waitFor();
      await visible();
      if (cells.length) {
        await expandDrawer();
        await page
          .getByRole("button", { name: "Mark step complete", exact: false })
          .click();
        assert.equal(
          stepCells(await current()).filter((c) => !c.isCompleted).length,
          0,
        );
      }
      await collapseDrawer();
      const completed = (await current()).grid;
      if (phone || n % 2)
        await page
          .getByRole("button", { name: "Next canvas step", exact: true })
          .click();
      else
        await page
          .locator(".task-panel")
          .getByRole("button", { name: "Next →", exact: true })
          .click();
      const next = await current();
      assert.equal(next.step, p.step + 1);
      assert.deepEqual(next.grid, completed, "Next changed cell completion");
    }
    await visible();
    // Real touch input, not synthetic click events: pan and pinch at each viewport.
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    const stage = await page.locator(".stage").boundingBox();
    const point = {
      x: stage.x + stage.width / 2,
      y: stage.y + stage.height / 2,
    };
    const touchState = await current();
    const originalView = await page
      .locator(".canvas-pattern")
      .evaluate((el) =>
        JSON.stringify({
          transform: el.style.transform,
          x: el.dataset.panX,
          y: el.dataset.panY,
          width: el.style.width,
        }),
      );
    await touch("touchStart", [{ ...point, id: 1 }]);
    await touch("touchMove", [{ x: point.x + 20, y: point.y + 10, id: 1 }]);
    await touch("touchEnd", []);
    assert.notEqual(
      await page
        .locator(".canvas-pattern")
        .evaluate((el) =>
          JSON.stringify({
            transform: el.style.transform,
            x: el.dataset.panX,
            y: el.dataset.panY,
            width: el.style.width,
          }),
        ),
      originalView,
    );
    const pinchZoom = await page.locator(".toolbar > span").innerText();
    await touch("touchStart", [
      { x: point.x - 20, y: point.y, id: 1 },
      { x: point.x + 20, y: point.y, id: 2 },
    ]);
    await touch("touchMove", [
      { x: point.x - 30, y: point.y, id: 1 },
      { x: point.x + 30, y: point.y, id: 2 },
    ]);
    await touch("touchEnd", []);
    assert.notEqual(
      await page.locator(".toolbar > span").innerText(),
      pinchZoom,
    );
    assert.deepEqual((await current()).grid, touchState.grid);
    assert.equal((await current()).step, touchState.step);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "✓ Select", exact: true }).click();
    const before = await current();
    const zoom = await page.locator(".toolbar > span").innerText();
    const panBefore = await page
      .locator(".canvas-pattern")
      .evaluate((el) =>
        JSON.stringify({
          transform: el.style.transform,
          x: el.dataset.panX,
          y: el.dataset.panY,
          width: el.style.width,
        }),
      );
    await page.getByRole("button", { name: "Focus mode", exact: true }).click();
    await page
      .getByRole("button", { name: "Exit Focus", exact: true })
      .waitFor();
    await visible();
    assert.deepEqual((await current()).grid, before.grid);
    assert.equal(await page.locator(".toolbar > span").innerText(), zoom);
    await page.getByRole("button", { name: "Exit Focus", exact: true }).click();
    // Rotation retains step, progress, selected tool, and zoom; only layout/pan may adapt.
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(100);
    assert.equal((await current()).step, before.step);
    assert.deepEqual((await current()).grid, before.grid);
    assert.equal(
      await page
        .getByRole("button", { name: "✓ Select", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator(".toolbar > span").innerText(), zoom);
    await page.setViewportSize({ width, height });
    await page
      .getByRole("button", { name: "Focus step", exact: false })
      .click();
    // Manual focus centers the actual rendered active strip.
    await page.waitForFunction(() => {
      const a = document.querySelector(".stage").getBoundingClientRect(),
        b = document
          .querySelector(".stage [data-active-step]")
          .getBoundingClientRect();
      return (
        Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 2 &&
        Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 2
      );
    });
    await page.screenshot({ path: `/tmp/pindou-v12-${width}x${height}.png` });
    await page.reload();
    await page.getByRole("button", { name: /Little bloom.*Continue/ }).click();
    assert.equal((await current()).step, before.step);
    assert.deepEqual((await current()).grid, before.grid);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1")),
    );
    assert.deepEqual(
      stored.find((p) => p.id === backup.id),
      backup,
      "Unrelated saved project changed",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expandDrawer();
    await page
      .getByRole("button", { name: "Mark step complete", exact: false })
      .click();
    assert.ok(
      await page
        .locator(".complete-action")
        .evaluate((el) => el.classList.contains("step-completed")),
    );
    assert.equal(
      await page
        .locator(".complete-action")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
      "Reduced motion ignored",
    );
    await collapseDrawer();
    // Back restores the normal studio page rather than retaining a body scroll lock.
    await page
      .getByRole("button", { name: "Pattern overview", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        document.body.classList.contains("workspace-open"),
      ),
      false,
    );
    await page
      .getByRole("button", { name: "Back to studio", exact: false })
      .click();
    await page
      .getByRole("button", { name: /Synthetic 40 × 51 QA grid.*Continue/ })
      .click();
    assert.equal(
      await page.locator(".stage svg").getAttribute("viewBox"),
      "-20 -20 1000 1264",
    );
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const original = (await current()).grid;
    const largeZoom = await page.locator(".toolbar > span").innerText();
    // Large jump forces an offscreen row into view without resetting zoom.
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1"));
      p[0].step = 49;
      localStorage.setItem("pindou.preview.v15.projects.v1", JSON.stringify(p));
    });
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic 40 × 51 QA grid.*Continue/ })
      .click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page
      .getByRole("button", { name: "Next canvas step", exact: true })
      .click();
    assert.equal((await current()).step, 50);
    assert.deepEqual((await current()).grid, original);
    assert.equal(await page.locator(".toolbar > span").innerText(), largeZoom);
    await visible();
    console.log(
      `PASS ${width}×${height}: 10 steps without page scrolling, chips, separate completion/navigation, focus, rotation, refresh, safe layout, 40×51 synthetic grid`,
    );
    await context.close();
  }
  assert.deepEqual(allErrors, []);
} finally {
  await browser.close();
}
