import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createProject, coordinate, stepCells } from "../src/model.ts";
const url =
  process.env.PINDOU_TEST_URL || "http://127.0.0.1:4303/pindou-preview/";
const key = "pindou.preview.v20b1.projects.v1";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const errors = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [820, 1180],
    [1180, 820],
    [390, 844],
    [375, 667],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const failures = [];
    page.on("response", (r) => {
      if (r.url().startsWith(url) && r.status() >= 400) failures.push(r.url());
    });
    const legacy = createProject();
    legacy.grid.find((c) => !c.isEmpty && c.row === 17).isCompleted = true;
    await context.addInitScript(
      ({ legacy, key }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify([{...legacy,id:"other-preview",name:"Other preview"},legacy]));
        localStorage.setItem("pindou.projects.v1", "untouched-production");
      },
      { legacy, key },
    );
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page
        .getByRole("button", { name: "TRY SAMPLE", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
        .count(),
      1,
    );
    const sprite = page.locator(".mushroom-sprite");
    assert.match(
      await sprite.getAttribute("href"),
      /\/pindou-preview\/sprites\/mushroom.svg$/,
    );
    assert.equal(
      (
        await page.request.get(new URL("sprites/mushroom.svg", url).href)
      ).status(),
      200,
    );
    const safe = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(await safe());
    await page.getByRole("button", { name: "My Studio", exact: true }).click();
    assert.ok((await page.locator(".recent").boundingBox()).y < height);
    // TRY SAMPLE resumes the sample even when another project is first in storage.
    await page.getByRole("button", { name: "TRY SAMPLE", exact: true }).click();
    const back = await page
      .getByRole("button", { name: "← Back to Studio", exact: true })
      .boundingBox();
    assert.ok(back.height >= 36 && back.height <= 44);
    const banner = page.locator(".preparation-banner");
    assert.equal(await banner.count(), 1);
    assert.equal(await page.locator(".preparation-strip").count(), 0);
    assert.match(await banner.innerText(), /PINDOU/);
    const bannerBox = await banner.boundingBox();
    assert.equal(bannerBox.height, width <= 760 ? 82 : 114);
    assert.ok(await safe(), "Overview fits the viewport");
    await page
      .getByRole("button", { name: "START BEADING →", exact: true })
      .click();
    const state = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0], key);
    const placed = async () =>
      (await state()).grid.filter((c) => c.isCompleted).length;
    const blur = () => page.evaluate(() => document.activeElement?.blur());
    const keypress = async (key) => {
      await blur();
      await page.keyboard.press(key);
    };
    const initial = await state();
    await keypress("ArrowDown");
    assert.equal(coordinate(await state()), coordinate(initial) + 1);
    assert.equal(await placed(), 1);
    const stepQty = stepCells(await state()).length;
    await keypress("a");
    assert.equal(await placed(), 1 + stepQty);
    await keypress("a");
    assert.equal(await placed(), 1 + stepQty, "A must not clear");
    await keypress("b");
    assert.equal(await placed(), 1);
    await keypress("b");
    assert.equal(await placed(), 1, "empty undo is inert");
    const before = await state();
    // Typing, selects, editable content, custom textboxes and open dialogs own keys.
    for (const tag of ["input", "textarea", "select", "editable", "textbox"]) {
      await page.evaluate((tag) => {
        let e = document.createElement(
          tag === "editable" || tag === "textbox" ? "div" : tag,
        );
        e.id = "qa-input";
        if (tag === "editable") e.contentEditable = "true";
        if (tag === "textbox") {
          e.setAttribute("role", "textbox");
          e.tabIndex = 0;
        }
        if (tag === "select")
          e.innerHTML = "<option>One</option><option>Two</option>";
        document.querySelector(".workspace-main").append(e);
        e.focus();
      }, tag);
      await page.keyboard.press("a");
      await page.keyboard.press("b");
      await page.keyboard.press("ArrowDown");
      assert.equal((await state()).step, before.step);
      assert.equal(await placed(), 1);
      await page.evaluate(() => document.getElementById("qa-input").remove());
    }
    await blur();
    await page.evaluate(()=>{const event=new KeyboardEvent('keydown',{key:'a',bubbles:true,cancelable:true});event.preventDefault();window.dispatchEvent(event);});
    assert.equal(await placed(),1);
    for (const flags of [
      { repeat: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { isComposing: true },
    ]) {
      await page.evaluate(
        (flags) =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "a",
              bubbles: true,
              cancelable: true,
              ...flags,
            }),
          ),
        flags,
      );
      assert.equal(await placed(), 1);
    }
    await page.evaluate(() => {
      let d = document.createElement("dialog");
      d.id = "qa-dialog";
      d.innerHTML = "<button>Close test</button>";
      document.body.append(d);
      d.showModal();
    });
    await page.keyboard.press("a");
    await page.keyboard.press("ArrowDown");
    assert.equal(await placed(), 1);
    assert.equal((await state()).step, before.step);
    await page.evaluate(() => document.getElementById("qa-dialog").remove());
    await page.getByRole("button", { name: "✓ Select", exact: true }).click();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page
      .locator('.stage [data-cell-row="2"][data-cell-column="6"] > rect')
      .first()
      .tap();
    await page.waitForFunction(() =>
      document
        .querySelector(".canvas-caption .console-a")
        .getAttribute("aria-label")
        .includes("selected bead"),
    );
    await keypress("a");
    assert.equal(await placed(), 2);
    await keypress("a");
    assert.equal(await placed(), 2);
    const phone = width <= 600 && height > width;
    if (phone) await page.locator(".drawer-toggle").click();
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("column");
    await keypress("b");
    assert.equal(await placed(), 1);
    assert.equal(
      (await state()).strategy,
      "column",
      "Undo must not rewind route",
    );
    await page
      .getByLabel("Workspace starting direction", { exact: true })
      .selectOption("reverse");
    let pos = coordinate(await state());
    await keypress("ArrowLeft");
    assert.ok(
      coordinate(await state()) < pos,
      "Reverse column physically left",
    );
    await page
      .getByLabel("Beading strategy", { exact: true })
      .selectOption("row");
    await page
      .getByLabel("Workspace starting direction", { exact: true })
      .selectOption("reverse");
    pos = coordinate(await state());
    await keypress("ArrowUp");
    assert.ok(coordinate(await state()) < pos, "Reverse row physically up");
    if (phone) await page.locator(".drawer-toggle").click();
    const bar = page.locator(".canvas-caption");
    assert.deepEqual(
      await bar.locator(".console-ab button").allTextContents(),
      ["A", "B"],
    );
    assert.deepEqual(
      await bar.locator(".console-action small").allTextContents(),
      ["Complete", "Undo"],
    );
    assert.equal(
      await bar.evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
      "Primary controls fit at normal text size",
    );
    for (const button of await bar.locator(".console-ab button").all()) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
    }
    if (phone) {
      const stage = await page.locator(".stage").boundingBox();
      assert.ok(
        stage.height >= (height === 667 ? 390 : 567),
        `A/B fix must not shrink the canvas: ${width}x${height}, measured ${stage.height}`,
      );
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      assert.ok(await safe());
      const labelBoxes = await bar
        .locator(".console-action small")
        .evaluateAll((es) =>
          es.map((e) => ({ scroll: e.scrollWidth, width: e.clientWidth })),
        );
      assert.ok(labelBoxes.every((b) => b.scroll <= b.width + 1));
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    }
    await page
      .getByRole("button", { name: "Pattern overview", exact: true })
      .click();
    const saved = await state();
    await keypress("a");
    await keypress("ArrowDown");
    assert.deepEqual((await state()).grid, saved.grid);
    assert.equal((await state()).step, saved.step);
    await page.reload();
    await page.locator(".project").filter({hasText:"Little bloom"}).click();
    assert.equal(await placed(), 1);
    assert.equal((await state()).reverse, true);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pindou.projects.v1")),
      "untouched-production",
    );
    assert.deepEqual(failures, []);
    console.log(
      `PASS Round 2 ${width}×${height}: navigation, A/B keys, conflicts, repeat, undo/route, assets, persistence, responsive labels`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
