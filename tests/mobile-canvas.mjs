import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createProject, stepCells, stats, coordinate } from "../src/model.ts";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const url = process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const widths = [
  [375, 667],
  [390, 844],
  [402, 874],
  [430, 932],
];
const allErrors = [];
try {
  for (const [width, height] of widths) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const project = createProject();
    project.grid[66].isCompleted = true;
    const backup = {
      ...createProject(),
      id: "preserved-backup",
      name: "Preserved backup",
    };
    await context.addInitScript(
      (projects) => {
        if (!localStorage.getItem("pindou.preview.v20b1.projects.v1"))
          localStorage.setItem("pindou.preview.v20b1.projects.v1", JSON.stringify(projects));
      },
      [project, backup],
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => allErrors.push(e.message));
    page.on("dialog", (dialog) => {
      allErrors.push("Unexpected " + dialog.type());
      dialog.dismiss();
    });
    const badResponses = [];
    page.on("response", (r) => {
      if (r.status() >= 400) badResponses.push(r.url());
    });
    await page.goto(url);
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("pindou.preview.v20b1.projects.v1")),
      ),
      [project, backup],
    );
    await page.getByRole("button", { name: /Little bloom.*Continue/ }).click();
    await page.evaluate(() => document.fonts.ready);
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
    const expand = async () => {
      if (
        (await page.locator(".drawer-toggle").getAttribute("aria-expanded")) ===
        "false"
      )
        await page.locator(".drawer-toggle").click();
      await settle();
    };
    const collapse = async () => {
      if (
        (await page.locator(".drawer-toggle").getAttribute("aria-expanded")) ===
        "true"
      )
        await page.locator(".drawer-toggle").click();
      await settle();
    };
    const snapshot = () =>
      page.locator(".canvas-pattern").evaluate((el) => ({
        panX: el.dataset.panX,
        panY: el.dataset.panY,
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height),
        transform: getComputedStyle(el).transform,
        willChange: getComputedStyle(el).willChange,
      }));
    const stageRect = () => page.locator(".stage").boundingBox();
    const fill = (row, column) =>
      page
        .locator(
          `.stage [data-cell-row="${row}"][data-cell-column="${column}"] > rect`,
        )
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    const tap = async (point) => {
      await touch("touchStart", [{ ...point, id: 1 }]);
      await touch("touchEnd", []);
    };
    const drag = async (dx, dy) => {
      const a = await stageRect();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + dx, a.y + a.height / 2 + dy, {
        steps: 4,
      });
      await page.mouse.up();
      await settle();
    };
    const panTo = async (row, column) => {
      await page.locator(".stage").focus();
      await page.keyboard.down("Space");
      for (let i = 0; i < 40; i++) {
        const a = await stageRect(),
          r = await fill(row, column);
        const dx = a.x + a.width / 2 - r.x - r.width / 2,
          dy = a.y + a.height / 2 - r.y - r.height / 2;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
        await drag(
          Math.max(-a.width * 0.25, Math.min(a.width * 0.25, dx)),
          Math.max(-a.height * 0.25, Math.min(a.height * 0.25, dy)),
        );
      }
      await page.keyboard.up("Space");
      await settle();
    };
    const visibleNavigation = async () => {
      const result = await page.evaluate(() => ({
        scroll: scrollY,
        overflow: document.documentElement.scrollWidth > innerWidth,
        boxes: [
          ".stage",
          ".canvas-step-nav",
          ".canvas-caption>button",
          ".mobile-drawer",
          ".drawer-toggle",
          ".drawer-summary",
        ].map((s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { s, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
      }));
      assert.equal(result.scroll, 0);
      assert.equal(result.overflow, false);
      for (const r of result.boxes)
        assert.ok(
          r.x >= 0 &&
            r.y >= 0 &&
            r.right <= width + 1 &&
            r.bottom <= height + 1,
          `Outside viewport ${width}×${height}: ${JSON.stringify(r)}`,
        );
    };
    await settle();
    await visibleNavigation();
    assert.ok(
      (await stageRect()).height > height * 0.55,
      "Collapsed canvas is not dominant",
    );
    assert.ok(
      (await page.locator(".mobile-drawer").boundingBox()).height < 85,
      "Collapsed drawer takes excessive room",
    );
    assert.equal(
      await page.getByLabel("Beading strategy", { exact: true }).isVisible(),
      false,
    );
    assert.equal(await page.locator(".drawer-body").isVisible(), false);
    assert.equal(
      await page.evaluate(() =>
        document.fonts.check('500 14px "Pindou Pixel"'),
      ),
      true,
    );
    assert.match(
      await page
        .locator(".workspace-heading h2")
        .evaluate((el) => getComputedStyle(el).fontFamily),
      /Pindou Pixel/,
    );
    assert.doesNotMatch(
      await page
        .locator(".stage text")
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
      /Pindou Pixel/,
    );
    assert.ok(
      await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some(
            (r) => r.name.includes("pixelify") && r.name.includes(".woff2"),
          ),
      ),
    );
    // A drawer handle gesture never enters the canvas pointer handlers.
    await page.evaluate(() => {
      window.__stagePointers = 0;
      document
        .querySelector(".stage")
        .addEventListener("pointerdown", () => window.__stagePointers++);
    });
    const before = await snapshot(),
      gridBefore = (await current()).grid;
    let h = await page.locator(".drawer-handle").boundingBox();
    let point = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    await touch("touchStart", [{ ...point, id: 1 }]);
    await touch("touchMove", [{ x: point.x, y: point.y - 65, id: 1 }]);
    await touch("touchCancel", []);
    assert.equal(
      await page.locator(".drawer-toggle").getAttribute("aria-expanded"),
      "false",
      "Cancelled swipe changed drawer state",
    );

    await touch("touchStart", [{ ...point, id: 1 }]);
    await touch("touchMove", [{ x: point.x, y: point.y - 65, id: 1 }]);
    await touch("touchEnd", []);
    await settle();
    assert.equal(
      await page.locator(".drawer-toggle").getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(await page.evaluate(() => window.__stagePointers), 0);
    assert.equal((await snapshot()).panX, before.panX);
    assert.equal((await snapshot()).panY, before.panY);
    assert.deepEqual((await current()).grid, gridBefore);
    await page.locator(".drawer-toggle").focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page.locator(".drawer-toggle").getAttribute("aria-expanded"),
      "false",
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator(".drawer-toggle").getAttribute("aria-expanded"),
      "true",
    );
    await page
      .locator(".drawer-body")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await collapse();
    await expand();
    assert.equal(
      await page.locator(".drawer-body").evaluate((el) => el.scrollTop),
      0,
      "Drawer reopened below its action area",
    );
    h = await page.locator(".drawer-handle").boundingBox();
    point = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    await touch("touchStart", [{ ...point, id: 1 }]);
    await touch("touchMove", [{ x: point.x, y: point.y + 65, id: 1 }]);
    await touch("touchEnd", []);
    await settle();
    assert.equal(
      await page.locator(".drawer-toggle").getAttribute("aria-expanded"),
      "false",
    );
    const navGrid = (await current()).grid;
    for (let i = 0; i < 10; i++) {
      await page
        .getByRole("button", { name: "Next canvas step", exact: true })
        .click();
      await settle();
      await visibleNavigation();
      assert.deepEqual((await current()).grid, navGrid);
      const p = await current();
      for (const c of stats(stepCells(p), p.palette).filter((c) => c.count))
        await page
          .getByLabel(
            `${c.code}, ${c.count - c.done} remaining of ${c.count}`,
            { exact: true },
          )
          .first()
          .waitFor();
    }
    // Native SVG sizing grows at 100/200/300/500; there is never a CSS scale layer.
    await page.getByRole("button", { name: "✓ Select", exact: true }).click();
    const base = (await snapshot()).width;
    for (const target of [1, 2, 3, 5]) {
      const value =
        Number(
          (await page.locator(".toolbar>span").innerText()).replace("%", ""),
        ) / 100;
      if (value !== target) {
        const a = await stageRect();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.locator(".stage").dispatchEvent("wheel", {
          deltaY: -Math.log(target / value) * 100,
          ctrlKey: true,
          cancelable: true,
          bubbles: true,
        });
        await page
          .waitForFunction(
            (t) =>
              Math.abs(
                Number(
                  document
                    .querySelector(".toolbar>span")
                    .textContent.replace("%", ""),
                ) -
                  t * 100,
              ) < 1,
            target,
            { timeout: 5000 },
          )
          .catch(async (error) => {
            console.error("Zoom mismatch", {
              width,
              target,
              value,
              actual: await page.locator(".toolbar>span").innerText(),
            });
            throw error;
          });
      }
      await settle();
      const geometry = await snapshot();
      assert.equal(geometry.transform, "none");
      assert.equal(geometry.willChange, "auto");
      assert.ok(Math.abs(geometry.width / base - target) < 0.02);
      await panTo(2, 6);
      const r = await fill(2, 6);
      for (const [fx, fy] of [
        [0.5, 0.5],
        [0.1, 0.5],
        [0.9, 0.5],
        [0.5, 0.1],
        [0.5, 0.9],
      ]) {
        await tap({ x: r.x + r.width * fx, y: r.y + r.height * fy });
        assert.equal(
          await page.locator(".selected-marker").getAttribute("transform"),
          "translate(144 48)",
        );
        assert.deepEqual(await completed(), [[3, 6]]);
      }
      assert.equal(
        await page.locator(".drawer-toggle").getAttribute("aria-expanded"),
        "false",
        "Selection unexpectedly expanded a panel",
      );
      // Read the rendered screenshot, not only SVG fill attributes, to catch native
      // browser tap-highlight tint or accidental chart filters after selection.
      const sample = await fill(2, 7);
      const point = {
        x: sample.x + sample.width * 0.2,
        y: sample.y + sample.height * 0.8,
      };
      const screenshot = await page.screenshot();
      const pixel = await page.evaluate(
        async ({ base64, point }) => {
          const image = new Image();
          image.src = "data:image/png;base64," + base64;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return [
            ...ctx.getImageData(
              Math.floor(point.x * devicePixelRatio),
              Math.floor(point.y * devicePixelRatio),
              1,
              1,
            ).data,
          ];
        },
        { base64: screenshot.toString("base64"), point },
      );
      const rgb = (await current()).palette
        .find((c) => c.code === "P1")
        .hex.match(/[0-9a-f]{2}/gi)
        .map((v) => parseInt(v, 16));
      assert.deepEqual(
        pixel,
        [...rgb, 255],
        "Rendered bead fill was tinted after touch",
      );
      await page.screenshot({
        path: `/tmp/pindou-v14-${width}-${target * 100}.png`,
      });
    }
    const selectionBeforeGesture = await page
      .locator(".selected-marker")
      .getAttribute("transform");
    let a = await stageRect();
    let center = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    await touch("touchStart", [{ ...center, id: 1 }]);
    await touch("touchCancel", []);
    await touch("touchStart", [
      { x: center.x - 30, y: center.y, id: 1 },
      { x: center.x + 30, y: center.y, id: 2 },
    ]);
    await touch("touchMove", [
      { x: center.x - 20, y: center.y, id: 1 },
      { x: center.x + 20, y: center.y, id: 2 },
    ]);
    await touch("touchEnd", []);
    assert.equal(
      await page.locator(".selected-marker").getAttribute("transform"),
      selectionBeforeGesture,
    );
    assert.deepEqual(await completed(), [[3, 6]]);
    await expand();
    await page.getByText("Row 3 · Column 7", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Mark Selected Complete", exact: true })
      .click();
    assert.deepEqual(await completed(), [
      [2, 6],
      [3, 6],
    ]);
    await page
      .getByRole("button", { name: "Undo Completion", exact: true })
      .click();
    assert.deepEqual(await completed(), [[3, 6]]);
    assert.ok(
      await page
        .locator(".drawer-body")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
      "Expanded drawer has no internal scrolling",
    );
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("column");
    await page
      .getByLabel("Workspace starting direction", { exact: true })
      .selectOption("reverse");
    assert.equal((await current()).strategy, "column");
    assert.equal((await current()).reverse, true);
    assert.deepEqual(await completed(), [[3, 6]]);
    await page
      .getByRole("checkbox", { name: "Show empty steps", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Show empty steps", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Mark step complete", exact: false })
      .click();
    const afterStep = await completed();
    assert.ok(afterStep.length > 1);
    await page
      .getByRole("button", { name: "Undo last change", exact: false })
      .click();
    assert.deepEqual(await completed(), [[3, 6]]);
    await collapse();
    await visibleNavigation();
    const normalArea = await page
      .locator(".stage")
      .evaluate((el) => el.clientWidth * el.clientHeight);
    await page.getByRole("button", { name: "Focus mode", exact: true }).click();
    await settle();
    assert.ok(
      (await page
        .locator(".stage")
        .evaluate((el) => el.clientWidth * el.clientHeight)) >
        normalArea * 1.05,
    );
    await visibleNavigation();
    assert.equal(await page.locator(".drawer-toggle").isVisible(), true);
    await page.getByLabel("Zoom controls", { exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expand();
    assert.equal(
      await page.getByLabel("Beading strategy", { exact: true }).isVisible(),
      true,
    );
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("row");
    await collapse();
    await page.screenshot({ path: `/tmp/pindou-v14-focus-${width}.png` });
    await page.getByRole("button", { name: "Exit Focus", exact: true }).click();
    const saved = await current();
    const zoom = await page.locator(".toolbar>span").innerText();
    await page.setViewportSize({ width: height, height: width });
    await settle();
    assert.equal(await page.locator(".mobile-drawer").count(), 0);
    assert.equal((await current()).step, saved.step);
    assert.equal(await page.locator(".toolbar>span").innerText(), zoom);
    assert.deepEqual((await current()).grid, saved.grid);
    await page.setViewportSize({ width, height });
    await settle();
    assert.equal(await page.locator(".drawer-toggle").isVisible(), true);
    assert.deepEqual((await current()).grid, saved.grid);
    await page.reload();
    await page.getByRole("button", { name: /Little bloom.*Continue/ }).click();
    assert.deepEqual((await current()).grid, saved.grid);
    assert.equal((await current()).strategy, saved.strategy);
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("pindou.preview.v20b1.projects.v1")).find(
          (p) => p.id === "preserved-backup",
        ),
      ),
      backup,
    );
    assert.deepEqual(badResponses, []);
    assert.deepEqual(allErrors, []);
    console.log(
      `PASS V1.4 ${width}×${height}: canvas share, pixel font, swipe/tap/keyboard drawer, ten-step navigation, vector zoom/selection 100–500%, explicit completion/undo/routes, Focus, rotation, persistence`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
