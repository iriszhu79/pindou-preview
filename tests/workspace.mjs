import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1200, height: 900 },
  hasTouch: true,
});
page.on("pageerror", (error) => errors.push(error.message));
const url = process.env.PINDOU_TEST_URL || "http://127.0.0.1:4301/pindou-preview/";
const snapshot = () =>
  page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("pindou.preview.v15.projects.v1"))[0];
    return {
      completed: project.grid
        .filter((c) => c.isCompleted)
        .map((c) => [c.row, c.column]),
      step: project.step,
    };
  });
const transform = () =>
  page.locator(".canvas-pattern").evaluate((el) => el.style.transform);
const bead = () =>
  page.locator(".stage svg").evaluate((svg) => {
    const point = new DOMPoint(6 * 24 + 12, 2 * 24 + 12).matrixTransform(
      svg.getScreenCTM(),
    );
    return { x: point.x, y: point.y };
  });
const clickBead = async () => {
  const { x, y } = await bead();
  await page.mouse.click(x, y);
};
const mode = async (name) => {
  await page.getByRole("button", { name, exact: true }).click();
};
const drag = async () => {
  const { x, y } = await bead();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 25, { steps: 8 });
};
try {
  await page.goto(url);
  await page.mouse.move(100, 200);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "START" }).click();
  await page.getByRole("button", { name: "START BEADING →" }).click();
  await page.locator(".stage").scrollIntoViewIfNeeded();
  const initial = await snapshot();
  assert.equal(
    await page.locator(".stage").evaluate((el) => getComputedStyle(el).cursor),
    "grab",
  );
  await clickBead();
  assert.deepEqual(await snapshot(), initial, "Hand click changed progress");
  await drag();
  assert.equal(
    await page.locator(".stage").evaluate((el) => getComputedStyle(el).cursor),
    "grabbing",
  );
  await page.mouse.up();
  assert.deepEqual(
    await snapshot(),
    initial,
    "Hand drag changed progress or step",
  );
  assert.notEqual(await transform(), "translate(0px, 0px) scale(1)");
  const handView = await transform();
  await mode("✓ Select");
  assert.equal(await transform(), handView, "Mode switch changed view");
  assert.equal(
    await page.locator(".stage").evaluate((el) => getComputedStyle(el).cursor),
    "pointer",
  );
  await clickBead();
  assert.deepEqual(
    (await snapshot()).completed,
    [],
    "Selection changed completion",
  );
  await page.getByText("Row 3 · Column 7", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Mark Selected Complete", exact: true })
    .click();
  assert.deepEqual(
    (await snapshot()).completed,
    [[2, 6]],
    "Explicit completion changed wrong bead",
  );
  const completed = await snapshot();
  await drag();
  await page.mouse.up();
  assert.deepEqual(await snapshot(), completed, "Select drag toggled a bead");
  assert.equal(await transform(), handView, "Select drag moved view");
  // Temporary Hand Mode and a release before pointer-up cannot cause a selection.
  await page.locator(".stage").focus();
  await page.keyboard.down("Space");
  assert.equal(
    await page.locator(".stage").evaluate((el) => getComputedStyle(el).cursor),
    "grab",
  );
  await drag();
  await page.keyboard.up("Space");
  await page.mouse.up();
  assert.deepEqual(await snapshot(), completed);
  assert.notEqual(await transform(), handView, "Space drag did not pan");
  assert.equal(
    await page.locator(".stage").evaluate((el) => getComputedStyle(el).cursor),
    "pointer",
  );
  // Space must still activate focused controls normally.
  await page.getByRole("button", { name: "Zoom in", exact: true }).focus();
  const beforeButton = await transform();
  await page.keyboard.press("Space");
  assert.notEqual(
    await transform(),
    beforeButton,
    "Space failed to activate zoom button",
  );
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.locator(".stage").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator(".stage").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const beforeScroll = await transform();
  const scrollY = await page.evaluate(() => window.scrollY);
  assert.equal(
    await page.locator(".stage").evaluate((el) => {
      const event = new WheelEvent("wheel", {
        deltaY: 10,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    false,
    "Unmodified wheel should not be intercepted",
  );
  await page.mouse.wheel(0, 150);
  await page.waitForTimeout(250);
  assert.equal(await transform(), beforeScroll, "Normal wheel zoomed");
  assert.equal(
    await page.evaluate(() => window.scrollY),
    scrollY,
    "Crafting workspace unexpectedly scrolled",
  );
  await page.locator(".stage").scrollIntoViewIfNeeded();
  const center = await page.locator(".stage").boundingBox();
  await page.mouse.move(
    center.x + center.width / 2,
    center.y + center.height / 2,
  );
  for (const key of ["Control", "Meta"]) {
    const before = await transform();
    const y = await page.evaluate(() => window.scrollY);
    await page.keyboard.down(key);
    await page.mouse.wheel(0, -25);
    await page.keyboard.up(key);
    await page.waitForTimeout(100);
    assert.notEqual(await transform(), before, `${key}+wheel failed to zoom`);
    assert.equal(
      await page.evaluate(() => window.scrollY),
      y,
      `${key}+wheel scrolled page`,
    );
  }
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  assert.deepEqual(
    await snapshot(),
    completed,
    "View controls changed progress",
  );
  await page.reload();
  await page.getByRole("button", { name: /beads placed · Continue/ }).click();
  assert.deepEqual(
    await snapshot(),
    completed,
    "Reload lost existing progress",
  );
  await mode("✓ Select");
  await page.locator(".stage").scrollIntoViewIfNeeded();
  // Actual touch events via Chromium's input protocol exercise pointer capture/pinch.
  const session = await page.context().newCDPSession(page);
  let point = await bead();
  const touch = async (type, points) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ ...point, id: 1 }]);
  await touch("touchEnd", []);
  assert.equal(
    (await snapshot()).completed.length,
    1,
    "Touch selection changed completion",
  );
  await page
    .getByRole("button", { name: "Undo Completion", exact: true })
    .click();
  assert.equal((await snapshot()).completed.length, 0, "Explicit undo failed");
  point = await bead();
  await touch("touchStart", [{ ...point, id: 1 }]);
  await touch("touchMove", [{ x: point.x + 30, y: point.y + 10, id: 1 }]);
  await touch("touchEnd", []);
  assert.equal(
    (await snapshot()).completed.length,
    0,
    "Touch drag selected a bead",
  );
  const prePinch = await transform();
  await touch("touchStart", [
    { x: point.x - 30, y: point.y, id: 1 },
    { x: point.x + 30, y: point.y, id: 2 },
  ]);
  await touch("touchMove", [
    { x: point.x - 60, y: point.y, id: 1 },
    { x: point.x + 60, y: point.y, id: 2 },
  ]);
  await touch("touchEnd", []);
  assert.notEqual(await transform(), prePinch, "Touch pinch failed to zoom");
  assert.equal(
    (await snapshot()).completed.length,
    0,
    "Pinch changed progress",
  );
  await mode("✥ Hand");
  const touchView = await transform();
  await touch("touchStart", [{ ...point, id: 1 }]);
  await touch("touchMove", [{ x: point.x + 25, y: point.y + 25, id: 1 }]);
  await touch("touchEnd", []);
  assert.notEqual(await transform(), touchView, "Touch Hand drag failed");
  assert.equal((await snapshot()).completed.length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile horizontal overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mouse/touch Hand and Select, drag suppression, Space shortcut, unmodified wheel without zoom, Ctrl/Meta zoom, buttons, pinch, saved progress, mobile overflow.",
  );
} finally {
  await browser.close();
}
