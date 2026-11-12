import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createProject } from "../src/model.ts";

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const legacy = createProject();
legacy.grid[46].isCompleted = true;
legacy.step = 3;
const rectangle = {
  ...createProject(),
  id: "rectangle",
  name: "Rectangle demo",
  rows: 3,
  columns: 7,
  step: 0,
  palette: [{ code: "B1", name: "Blue", hex: "#336699" }],
  grid: Array.from({ length: 21 }, (_, i) => ({
    row: Math.floor(i / 7),
    column: i % 7,
    colorCode: i === 3 ? null : "B1",
    isEmpty: i === 3,
    isCompleted: i === 0,
  })),
};
const tall = {
  ...rectangle,
  id: "tall",
  name: "Tall demo",
  rows: 8,
  columns: 2,
  grid: Array.from({ length: 16 }, (_, i) => ({
    row: Math.floor(i / 2),
    column: i % 2,
    colorCode: "B1",
    isEmpty: false,
    isCompleted: false,
  })),
};
await page.addInitScript(
  (projects) => {
    if (!localStorage.getItem("pindou.preview.v15.projects.v1"))
      localStorage.setItem("pindou.preview.v15.projects.v1", JSON.stringify(projects));
  },
  [rectangle, legacy, tall],
);
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1")));
const state = () =>
  page.locator(".canvas-pattern").evaluate((el) => el.style.transform);
const centered = async () => {
  // Automatic focus now reveals only offscreen steps instead of always centering.
  await page.waitForFunction(() => {
    const stage = document.querySelector(".stage"),
      rect = document.querySelector(".stage [data-active-step]");
    if (!stage || !rect) return false;
    const a = stage.getBoundingClientRect(),
      b = rect.getBoundingClientRect();
    const p = JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1"))[0];
    return p.strategy === "row"
      ? b.top >= a.top + 10 && b.bottom <= a.bottom - 10
      : b.left >= a.left + 10 && b.right <= a.right - 10;
  });
};

try {
  await page.goto(
    process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/",
  );
  await page.locator(".project").filter({hasText:"Rectangle demo"}).click();
  await page.getByRole("button", { name: "Pattern overview", exact: true }).click();
  assert.equal(
    await page.locator(".preview svg").getAttribute("viewBox"),
    "-20 -20 208 112",
  );
  const before = (await saved()).find((p) => p.id === "rectangle").grid;
  await page.getByRole("button", { name: "Next →", exact: true }).click();
  assert.equal(
    await page.locator(".preview [data-active-step]").getAttribute("y"),
    "24",
  );
  // Direct preview tapping updates the step but never completion.
  const point = await page.locator(".preview svg").evaluate((svg) => {
    const p = new DOMPoint(12, 60).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(
    await page.locator(".preview [data-active-step]").getAttribute("y"),
    "48",
  );
  await page
    .getByRole("button", { name: "Column-by-Column", exact: false })
    .click();
  await page.getByLabel("Starting direction").selectOption("reverse");
  assert.equal(
    await page.locator("[data-active-step]").getAttribute("x"),
    "144",
  );
  await page.getByRole("slider", { name: "Beading step" }).fill("6");
  assert.equal(await page.locator("[data-active-step]").getAttribute("x"), "0");
  assert.equal(
    await page
      .getByRole("button", { name: "Next →", exact: true })
      .isDisabled(),
    true,
  );
  assert.deepEqual(
    (await saved()).find((p) => p.id === "rectangle").grid,
    before,
  );
  await page.getByRole("button", { name: "START BEADING →" }).click();
  await centered();
  assert.match(
    await page.locator(".remaining-summary").innerText(),
    /2 remaining$/,
  );
  assert.equal(await page.locator(".step-positions li").count(), 3);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoom = (await state()).match(/scale\(([^)]+)\)/)[1];
  await page.getByRole("button", { name: "← Previous", exact: true }).click();
  await centered();
  assert.equal((await state()).match(/scale\(([^)]+)\)/)[1], zoom);
  await page
    .getByRole("button", { name: "Mark step complete", exact: false })
    .click();
  assert.match(
    await page.locator(".remaining-summary").innerText(),
    /0 remaining$/,
  );
  assert.match(await page.locator(".step-counts").innerText(), /0 left/);
  await page
    .getByRole("button", { name: "Undo last change", exact: false })
    .click();
  assert.match(
    await page.locator(".remaining-summary").innerText(),
    /3 remaining$/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await centered();
  assert.equal(
    await page
      .locator(".workspace-main")
      .evaluate((el) => getComputedStyle(el).position),
    "fixed",
  );
  assert.equal(await page.locator(".drawer-body").isVisible(), false);
  const panel = await page.locator(".mobile-drawer").boundingBox();
  assert.ok(panel.y + panel.height <= 844 && panel.y + panel.height >= 820);
  await page.locator(".drawer-toggle").click();
  assert.equal(await page.locator(".drawer-body").isVisible(), true);
  await centered();
  await page.screenshot({
    path: "/tmp/pindou-task-expanded.png",
    fullPage: true,
  });
  await page.locator(".drawer-toggle").click();
  await page
    .getByRole("button", { name: "Next canvas step", exact: true })
    .click();
  await centered();
  assert.equal(await page.locator(".drawer-body").isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/pindou-task-collapsed.png",
    fullPage: true,
  });
  const stored = await saved();
  assert.equal(stored.length, 3);
  assert.deepEqual(
    stored.find((p) => p.id === "flower-demo").grid,
    legacy.grid,
    "Legacy progress was overwritten",
  );
  await page.reload();
  await page.getByRole("button", { name: /Tall demo/ }).click();
  await centered();
  assert.equal(
    await page.locator(".stage svg").getAttribute("viewBox"),
    "-20 -20 88 232",
  );
  // Narrow/tall canvas fits completely before any manual zoom.
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const fits = await page.locator(".stage").evaluate((el) => {
    const a = el.getBoundingClientRect(),
      b = el.querySelector("svg").getBoundingClientRect();
    return b.width <= a.width && b.height <= a.height;
  });
  assert.ok(fits, "Tall rectangular grid did not fit");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: rectangular preview and direction limits, click/range navigation, automatic focus with zoom retention, remaining counts/undo, compact positions, viewport-docked collapsible mobile panel, multiple saved projects/legacy progress, tall-grid fit.",
  );
} finally {
  await browser.close();
}
