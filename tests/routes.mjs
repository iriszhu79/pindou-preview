import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createProject, coordinate } from "../src/model.ts";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const url = process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const p = {
  ...createProject(),
  id: "legacy-sparse",
  name: "Legacy sparse demo",
  rows: 6,
  columns: 7,
  step: 0,
  grid: Array.from({ length: 42 }, (_, i) => {
    const row = Math.floor(i / 7),
      column = i % 7,
      bead = (row === 2 || row === 4) && (column === 1 || column === 5);
    return {
      row,
      column,
      colorCode: bead ? "P1" : null,
      isEmpty: !bead,
      isCompleted: false,
    };
  }),
};
const other = { ...p, id: "other", name: "Other project" };
async function open(projects) {
  const context = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
  });
  await context.addInitScript(
    (projects) =>
      localStorage.setItem("pindou.preview.v20b1.projects.v1", JSON.stringify(projects)),
    projects,
  );
  const page = await context.newPage();
  await page.goto(url);
  return { page, context };
}
const current = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("pindou.preview.v20b1.projects.v1"))[0],
  );
try {
  let { page, context } = await open([p, other]);
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pindou.preview.v20b1.projects.v1")),
    ),
    [p, other],
  );
  await page
    .getByRole("button", { name: /Legacy sparse demo.*Continue/ })
    .click();
  assert.equal((await current(page)).step, 2);
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Show empty steps", exact: true })
      .isChecked(),
    false,
  );
  assert.equal(
    await page.locator(".step-title").innerText(),
    "Step 1 / 2 · Row 3",
  );
  await page
    .getByRole("checkbox", { name: "Show empty steps", exact: true })
    .check();
  assert.equal(
    await page.locator(".step-title").innerText(),
    "Grid coordinate 3 / 6 · Row 3",
  );
  await page
    .getByRole("button", { name: "Next canvas step", exact: true })
    .click();
  assert.equal(
    await page.locator(".step-title").innerText(),
    "Grid coordinate 4 / 6 · Row 4",
  );
  await page
    .getByRole("checkbox", { name: "Show empty steps", exact: true })
    .uncheck();
  assert.equal(
    await page.locator(".step-title").innerText(),
    "Step 1 / 2 · Row 3",
  );
  await page
    .getByRole("button", { name: "Next canvas step", exact: true })
    .click();
  assert.equal(
    await page.locator(".step-title").innerText(),
    "Step 2 / 2 · Row 5",
  );
  assert.equal(
    (await current(page)).grid.filter((c) => c.isCompleted).length,
    0,
  );
  await page
    .getByLabel("Workspace starting direction", { exact: true })
    .selectOption("reverse");
  assert.equal(coordinate(await current(page)), 4);
  assert.match(
    await page.locator(".step-title").innerText(),
    /^Step 1 \/ 2 · Row 5/,
  );
  await page.getByRole("button", { name: "✓ Select", exact: true }).click();
  await page.getByRole("button", { name: "Focus step", exact: false }).click();
  await page.waitForTimeout(80);
  const r = await page
    .locator('.stage [data-cell-row="4"][data-cell-column="1"] > rect')
    .boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await page.getByText("Row 5 · Column 2", { exact: true }).waitFor();
  assert.equal(
    (await current(page)).grid.filter((c) => c.isCompleted).length,
    0,
  );
  await page
    .getByRole("button", { name: "Mark Selected Complete", exact: true })
    .click();
  assert.equal(
    (await current(page)).grid.filter((c) => c.isCompleted).length,
    1,
  );
  await page
    .getByLabel("Beading strategy", { exact: true })
    .selectOption("column");
  assert.equal(
    (await current(page)).grid.filter((c) => c.isCompleted).length,
    1,
  );
  const focused = page.locator(
    '.stage [data-cell-row="4"][data-cell-column="1"]',
  );
  await focused.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByText("Row 5 · Column 6", { exact: true }).waitFor();
  await page.keyboard.press("Enter");
  assert.equal(
    (await current(page)).grid.filter((c) => c.isCompleted).length,
    1,
  );
  await page
    .getByRole("button", { name: "Pattern overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to studio", exact: false })
    .click();
  await page.getByRole("button", { name: /Other project.*Continue/ }).click();
  assert.equal(await page.locator(".selected-marker").count(), 0);
  assert.equal((await current(page)).id, "other");
  assert.equal(
    (await current(page)).grid.filter((c) => c.isCompleted).length,
    0,
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pindou.preview.v20b1.projects.v1")),
  );
  assert.equal(
    stored.find((v) => v.id === p.id).grid.filter((c) => c.isCompleted).length,
    1,
  );
  await context.close();
  ({ page, context } = await open([{ ...p, step: 4 }]));
  await page.getByRole("button", { name: /Continue/ }).click();
  assert.equal((await current(page)).step, 4);
  assert.equal(
    await page.locator(".step-title").innerText(),
    "Step 2 / 2 · Row 5",
  );
  await context.close();
  ({ page, context } = await open([
    {
      ...p,
      grid: p.grid.map((c) => (c.isEmpty ? c : { ...c, isCompleted: true })),
    },
  ]));
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("Project complete", { exact: false }).waitFor();
  assert.equal(coordinate(await current(page)), 2);
  assert.equal(await page.locator(".progress-info b").innerText(), "100%");
  await context.close();
  const empty = {
    ...p,
    grid: p.grid.map((c) => ({ ...c, isEmpty: true, colorCode: null })),
  };
  ({ page, context } = await open([empty]));
  await page.getByRole("button", { name: /Continue/ }).click();
  assert.equal(
    await page.locator(".step-title").innerText(),
    "No beads in this pattern",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Next canvas step", exact: true })
      .isDisabled(),
    true,
  );
  await context.close();
  console.log(
    "PASS: sparse nonempty/reverse routes, explicit grid-coordinate mode, saved legacy positions, keyboard selection, project-change clearing, unrelated progress, finished and empty patterns.",
  );
} finally {
  await browser.close();
}
