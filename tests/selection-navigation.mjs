import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createProject, coordinate, routeCoordinates } from "../src/model.ts";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const url = process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const viewports = [
  [844, 390],
  [820, 1180],
  [1180, 820],
  [1440, 900],
].filter(
  ([w]) => !process.env.V13_WIDTH || w === Number(process.env.V13_WIDTH),
);
assert.ok(
  viewports.length,
  "Use tests/mobile-canvas.mjs for V1.4 phone portrait; no matching V1.3 regression viewport.",
);
let debugPage;
const errors = [];
try {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
    });
    const page = await context.newPage();
    debugPage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole("button", { name: "TRY SAMPLE" }).click();
    assert.equal(
      await page.locator(".preview [data-active-step]").getAttribute("y"),
      "48",
    );
    await page.getByRole("button", { name: "START BEADING →" }).click();
    assert.equal(
      await page.locator(".step-title").innerText(),
      "Step 1 / 16 · Row 3",
    );
    const current = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("pindou.preview.v20b1.projects.v1"))[0],
      );
    const completed = async () =>
      (await current()).grid
        .filter((c) => c.isCompleted)
        .map((c) => [c.row, c.column]);
    const settle = () =>
      page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    const rect = (row, column) =>
      page
        .locator(
          `.stage [data-cell-row="${row}"][data-cell-column="${column}"] > rect`,
        )
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
    const transform = () =>
      page.locator(".canvas-pattern").evaluate((el) => el.style.transform);
    const select = () =>
      page.getByRole("button", { name: "✓ Select", exact: true }).click();
    const hand = () =>
      page.getByRole("button", { name: "✥ Hand", exact: true }).click();
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    const tap = async (point) => {
      await page.evaluate(
        (point) =>
          (window.__lastTap = {
            point,
            target: document.elementFromPoint(point.x, point.y)?.outerHTML,
          }),
        point,
      );
      await touch("touchStart", [{ ...point, id: 1 }]);
      await touch("touchEnd", []);
    };
    const dragBy = async (dx, dy) => {
      const a = await page.locator(".stage").boundingBox();
      let x = dx,
        y = dy;
      while (Math.abs(x) > 0.3 || Math.abs(y) > 0.3) {
        const sx = Math.max(-a.width * 0.25, Math.min(a.width * 0.25, x)),
          sy = Math.max(-a.height * 0.25, Math.min(a.height * 0.25, y));
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2 + sx, a.y + a.height / 2 + sy, {
          steps: 3,
        });
        await page.mouse.up();
        x -= sx;
        y -= sy;
      }
    };
    // Keep inspector space reserved while switching tools, or remeasure after Select.
    const ensureVisible = async (row, column) => {
      await select();
      await settle();
      const a = await page.locator(".stage").boundingBox(),
        b = await rect(row, column);
      if (
        b.x < a.x + 8 ||
        b.x + b.width > a.x + a.width - 8 ||
        b.y < a.y + 8 ||
        b.y + b.height > a.y + a.height - 8
      ) {
        await page.locator(".stage").focus();
        await page.keyboard.down("Space");
        await dragBy(
          a.x + a.width / 2 - b.x - b.width / 2,
          a.y + a.height / 2 - b.y - b.height / 2,
        );
        await page.keyboard.up("Space");
      }
      await settle();
    };
    const zoomTo = async (target) => {
      const n =
        Number(
          (await page.locator(".toolbar > span").innerText()).replace("%", ""),
        ) / 100;
      const a = await page.locator(".stage").boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -Math.log(target / n) * 100);
      await page.keyboard.up("Control");
      await page.waitForFunction(
        (expected) =>
          Math.abs(
            Number(
              document
                .querySelector(".toolbar > span")
                .textContent.replace("%", ""),
            ) -
              expected * 100,
          ) < 1,
        target,
      );
    };
    for (const zoom of [1, 2, 3]) {
      await zoomTo(zoom);
      await ensureVisible(2, 6);
      for (const [row, column] of [
        [2, 6],
        [2, 7],
        [3, 6],
      ]) {
        await ensureVisible(row, column);
        for (const [fx, fy] of [
          [0.5, 0.5],
          [0.1, 0.5],
          [0.9, 0.5],
          [0.5, 0.1],
          [0.5, 0.9],
        ]) {
          await settle();
          const b = await rect(row, column);
          await tap({ x: b.x + b.width * fx, y: b.y + b.height * fy });
          await page
            .getByText(`Row ${row + 1} · Column ${column + 1}`, { exact: true })
            .waitFor();
          assert.equal(await page.locator(".selected-marker").count(), 1);
          assert.deepEqual(
            await completed(),
            [],
            "A selection completed a bead",
          );
        }
      }
      // Horizontal, vertical and combined panning must not shift address ownership.
      for (const [dx, dy] of [
        [12, 0],
        [0, 12],
        [-12, -12],
      ]) {
        await page.locator(".stage").focus();
        await page.keyboard.down("Space");
        await dragBy(dx, dy);
        await page.keyboard.up("Space");
        await ensureVisible(2, 6);
        const b = await rect(2, 6);
        await tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
        await page.getByText("Row 3 · Column 7", { exact: true }).waitFor();
      }
      await page
        .getByRole("button", { name: "Mark Selected Complete", exact: true })
        .click();
      assert.deepEqual(await completed(), [[2, 6]]);
      assert.match(
        await page.locator(".remaining-summary").innerText(),
        /1 completed/,
      );
      const marked = await rect(2, 6);
      await tap({
        x: marked.x + marked.width * 0.85,
        y: marked.y + marked.height * 0.15,
      });
      await page
        .getByRole("button", { name: "Undo Completion", exact: true })
        .click();
      assert.deepEqual(await completed(), []);
      await ensureVisible(2, 9);
      const empty = await rect(2, 9);
      await tap({
        x: empty.x + empty.width / 2,
        y: empty.y + empty.height / 2,
      });
      assert.equal(
        await page
          .getByRole("button", { name: "Mark Selected Complete", exact: true })
          .count(),
        0,
      );
      assert.equal(await page.locator(".selected-marker").count(), 0);
      assert.deepEqual(await completed(), []);
    }
    // Exercise the fallback for an engine CTM that omits CSS ancestors.
    await ensureVisible(2, 6);
    await page.locator(".stage svg").evaluate((svg) => {
      svg.getScreenCTM = () => new DOMMatrix();
    });
    const fallbackRect = await rect(2, 6);
    await tap({
      x: fallbackRect.x + fallbackRect.width / 2,
      y: fallbackRect.y + fallbackRect.height / 2,
    });
    await page.getByText("Row 3 · Column 7", { exact: true }).waitFor();
    assert.deepEqual(await completed(), []);
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await page.locator(".stage svg").evaluate((svg) => {
      delete svg.getScreenCTM;
    });
    // Reproduce V1.2's release drift: <5px movement crosses a rendered cell boundary.
    await ensureVisible(2, 6);
    let b = await rect(2, 6);
    await touch("touchStart", [
      { x: b.x + b.width - 0.8, y: b.y + b.height / 2, id: 1 },
    ]);
    await touch("touchMove", [
      { x: b.x + b.width + 0.8, y: b.y + b.height / 2, id: 1 },
    ]);
    await touch("touchEnd", []);
    assert.equal(
      await page.locator(".selected-marker").count(),
      0,
      "A boundary-crossing tap selected the neighboring bead",
    );
    assert.deepEqual(await completed(), []);
    await touch("touchStart", [
      { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 },
    ]);
    await touch("touchCancel", []);
    assert.equal(await page.locator(".selected-marker").count(), 0);
    const a = await page.locator(".stage").boundingBox(),
      point = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const beforePinch = await transform();
    await touch("touchStart", [
      { x: point.x - 20, y: point.y, id: 1 },
      { x: point.x + 20, y: point.y, id: 2 },
    ]);
    await touch("touchMove", [
      { x: point.x - 30, y: point.y, id: 1 },
      { x: point.x + 30, y: point.y, id: 2 },
    ]);
    await touch("touchEnd", []);
    assert.notEqual(await transform(), beforePinch);
    assert.equal(await page.locator(".selected-marker").count(), 0);
    assert.deepEqual(await completed(), []);
    // Complete five explicit cells, preserving selection/progress across tools and routes.
    for (const column of [6, 7, 8, 10, 11]) {
      await ensureVisible(2, column);
      b = await rect(2, column);
      await tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      await page
        .getByRole("button", { name: "Mark Selected Complete", exact: true })
        .click();
    }
    const five = await completed();
    assert.equal(five.length, 5);
    const percent = await page.locator(".progress-info b").innerText();
    await hand();
    await select();
    await page.getByText("Row 3 · Column 12", { exact: true }).waitFor();
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("column");
    assert.deepEqual(await completed(), five);
    assert.equal(await page.locator(".progress-info b").innerText(), percent);
    const columnProject = await current();
    const expected = routeCoordinates(columnProject).find((n) =>
      columnProject.grid.some(
        (c) => c.column === n && !c.isEmpty && !c.isCompleted,
      ),
    );
    assert.equal(coordinate(columnProject), expected);
    await page.getByText("Row 3 · Column 12", { exact: true }).waitFor();
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("row");
    assert.deepEqual(await completed(), five);
    const normalArea = await page
      .locator(".stage")
      .evaluate((el) => el.clientWidth * el.clientHeight);
    await page.getByRole("button", { name: "Focus mode", exact: true }).click();
    await page.waitForTimeout(100);
    const focusArea = await page
      .locator(".stage")
      .evaluate((el) => el.clientWidth * el.clientHeight);
    assert.ok(
      focusArea > normalArea * 1.08,
      `Focus canvas did not meaningfully grow at ${width}×${height}: ${normalArea} -> ${focusArea}`,
    );
    assert.equal(
      await page.getByLabel("Focus route", { exact: true }).isVisible(),
      true,
    );
    await page
      .getByLabel("Focus route", { exact: true })
      .selectOption("column-reverse");
    assert.deepEqual(await completed(), five);
    assert.equal((await current()).strategy, "column");
    assert.equal((await current()).reverse, true);
    for (const selector of [
      ".complete-action",
      ".color-chips",
      ".canvas-step-nav",
      ".focus-mode-toggle",
    ]) {
      const r = await page.locator(selector).boundingBox();
      assert.ok(
        r &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= width + 1 &&
          r.y + r.height <= height + 1,
        `${selector} offscreen in Focus`,
      );
    }
    await page.getByText("Row 3 · Column 12", { exact: true }).waitFor();
    await page.screenshot({
      path: `/tmp/pindou-v13-focus-${width}x${height}.png`,
    });
    await page.getByRole("button", { name: "Exit Focus", exact: true }).click();
    assert.deepEqual(await completed(), five);
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(100);
    if (await page.locator(".mobile-drawer").count())
      assert.equal(
        (
          await page
            .getByText("Row 3 · Column 12", { exact: true })
            .textContent()
        ).trim(),
        "Row 3 · Column 12",
      );
    else await page.getByText("Row 3 · Column 12", { exact: true }).waitFor();
    assert.deepEqual(await completed(), five);
    await ensureVisible(2, 8);
    b = await rect(2, 8);
    await tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    if (await page.locator(".mobile-drawer").count())
      assert.equal(
        (
          await page
            .getByText("Row 3 · Column 9", { exact: true })
            .textContent()
        ).trim(),
        "Row 3 · Column 9",
      );
    else await page.getByText("Row 3 · Column 9", { exact: true }).waitFor();
    const beforeReload = await current();
    await page.reload();
    await page.getByRole("button", { name: /beads placed · Continue/ }).click();
    assert.deepEqual(await completed(), five);
    assert.equal((await current()).strategy, beforeReload.strategy);
    assert.equal((await current()).step, beforeReload.step);
    assert.equal(await page.locator(".selected-marker").count(), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    console.log(
      `PASS V1.3 ${width}×${height}: rendered hit geometry at 100/200/300%, pan/boundaries/cancel/pinch, explicit five-cell progress, strategy/Focus/rotation/refresh, larger Focus canvas`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  if (debugPage && !debugPage.isClosed()) {
    console.error(
      await debugPage.evaluate(() => ({
        lastTap: window.__lastTap,
        context: document.querySelector(".selection-context")?.innerText,
        transform: document
          .querySelector(".canvas-pattern")
          ?.getAttribute("style"),
        stage: JSON.stringify(
          document.querySelector(".stage")?.getBoundingClientRect(),
        ),
      })),
    );
    await debugPage.screenshot({ path: "/tmp/pindou-v13-hit-failure.png" });
  }
  throw error;
} finally {
  await browser.close();
}
