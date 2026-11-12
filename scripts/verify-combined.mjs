import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { root, versions, build } from "./prepare-combined.mjs";
const { chromium } = createRequire(path.join(root, "package.json"))(
  "playwright",
);
const origin = process.env.PINDOU_ORIGIN || "http://127.0.0.1:4400";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  ...(process.env.PINDOU_BROWSER_HOME
    ? { env: { ...process.env, HOME: process.env.PINDOU_BROWSER_HOME } }
    : {}),
});
const logs = [];
const dir = path.join(
  build,
  process.env.PINDOU_ORIGIN ? "live-verification" : "verification",
);
mkdirSync(dir, { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [],
      failed = [],
      access = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400)
        failed.push({ url: r.url(), status: r.status() });
    });
    await context.exposeBinding("auditStorage", (_, method, key, url) =>
      access.push({ method, key, url }),
    );
    await context.addInitScript(() => {
      const read = Storage.prototype.getItem,
        write = Storage.prototype.setItem;
      window.qaRead = (key) => read.call(localStorage, key);
      window.qaWrite = (key, value) => write.call(localStorage, key, value);
      for (const method of ["getItem", "setItem", "removeItem", "clear"]) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          window.auditStorage(method, args[0] ?? null, location.href);
          return original.apply(this, args);
        };
      }
    });
    const url = origin + "/pindou-preview/v2-a/";
    let r = await page.goto(url);
    assert.equal(r.status(), 200);
    await page.reload();
    assert.equal(
      await page
        .getByRole("button", { name: "TRY SAMPLE", exact: true })
        .count(),
      1,
    );
    // Seed only this disposable browser context using native access, before reloading the app.
    const sample = await import(path.join(build, "v15/src/model.ts"));
    const legacy = sample.createProject();
    legacy.grid.find((c) => !c.isEmpty).isCompleted = true;
    await page.evaluate(
      ({ legacy }) => {
        qaWrite("pindou.preview.v15.projects.v1", JSON.stringify([legacy]));
        qaWrite("pindou.projects.v1", "production-sentinel");
      },
      { legacy },
    );
    await page.reload();
    assert.equal(
      await page.locator(".project").count(),
      0,
      "V2 must not load V1.5 projects",
    );
    await page
      .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Load original MARD sample", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Detect grid automatically", exact: true })
      .click();
    await page
      .getByText("Recognized · Needs Review. Not yet saved.", { exact: true })
      .waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByLabel("columns", { exact: true }).inputValue(),
      "40",
    );
    assert.equal(
      await page.getByLabel("rows", { exact: true }).inputValue(),
      "51",
    );
    assert.match(
      await page.locator(".recognition-digital").innerText(),
      /1179 beads/,
    );
    assert.equal(
      await page.evaluate(() => qaRead("pindou.preview.v20a.projects.v1")),
      null,
      "No writes before confirmation",
    );
    await page.getByLabel("Cell color", { exact: true }).selectOption("Color 1");
    assert.match(await page.locator(".recognition-digital").innerText(), /1180 beads/);
    await page.getByRole("button", { name: "Restore recognized cell" }).click();
    assert.match(await page.locator(".recognition-digital").innerText(), /1179 beads/);
    await page.screenshot({
      path: path.join(dir, `v20-recognition-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Confirm pattern → Overview", exact: true })
      .click();
    await page
      .getByRole("button", { name: "START BEADING →", exact: true })
      .click();
    await page.locator(".stage").waitFor();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("a");
    let data = await page.evaluate(() =>
      JSON.parse(qaRead("pindou.preview.v20a.projects.v1")),
    );
    assert.equal(data.length, 1);
    assert.ok(data[0].grid.some((c) => c.isCompleted));
    const v20id = data[0].id;
    await page.reload();
    await page
      .locator(".project")
      .filter({ hasText: "MARD source chart" })
      .click();
    await page.locator(".stage").waitFor();
    assert.equal(
      (
        await page.evaluate(() =>
          JSON.parse(qaRead("pindou.preview.v20a.projects.v1")),
        )
      )[0].id,
      v20id,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(qaRead("pindou.preview.v15.projects.v1")),
      ),
      [legacy],
    );
    const preserved = await page.evaluate(() =>
      qaRead("pindou.preview.v20a.projects.v1"),
    );
    r = await page.goto(origin + "/pindou-preview/");
    assert.equal(r.status(), 200);
    await page.reload();
    assert.equal(await page.locator(".project").count(), 1);
    await page.locator(".project").click();
    await page.locator(".stage").waitFor();
    assert.equal(
      await page.evaluate(() => qaRead("pindou.preview.v20a.projects.v1")),
      preserved,
      "V1.5 must leave V2 progress untouched",
    );
    assert.equal(
      await page.evaluate(() => qaRead("pindou.projects.v1")),
      "production-sentinel",
    );
    await page
      .getByRole("button", { name: "Pattern overview", exact: true })
      .click();
    assert.equal(
      (await page.locator(".preparation-banner").boundingBox()).height,
      viewport.width <= 760 ? 82 : 114,
    );
    await page.screenshot({
      path: path.join(dir, `v15-overview-${viewport.width}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    // Every application storage call is recorded across same-origin navigations.
    for (const op of access) {
      assert.ok(["getItem", "setItem"].includes(op.method));
      assert.equal(
        op.key,
        new URL(op.url).pathname.startsWith(versions[1].base) ? versions[1].key : versions[0].key,
        JSON.stringify(op),
      );
    }
    for (const version of versions) for (const method of ["getItem", "setItem"])
      assert.ok(access.some(op => op.key === version.key && op.method === method), "Missing storage audit evidence");
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    logs.push({
      origin,
      viewport,
      passed: true,
      applicationStorageCalls: access.length,
      recognition: "40x51, 1179 beads",
      errors,
      failed,
    });
    await context.close();
    console.log(
      `PASS ${origin} ${viewport.width}x${viewport.height}: both refreshes, recognition worker, sample, Workspace import/progress/reload, two-way storage isolation, banner/assets`,
    );
  }
  // Independently verify every packaged file served at both application URLs, including fonts and workers.
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const manifest = JSON.parse(
    readFileSync(path.join(build, "site/deployment-manifest.json")),
  );
  for (const v of manifest.versions)
    for (const [file, expected] of Object.entries(v.files)) {
      const url = origin + v.base + file;
      // curl uses the cloud's inherited proxy and supplied CA trust for HTTPS. No TLS bypass.
      let bytes;
      if (origin.startsWith("https://"))
        bytes = execFileSync(
          "curl",
          ["--fail", "--silent", "--show-error", "--max-time", "30", url],
          { maxBuffer: 20 * 1024 * 1024 },
        );
      else {
        const response = await fetch(url);
        assert.equal(response.status, 200, url);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      const hash = createHash("sha256").update(bytes).digest("hex");
      assert.equal(hash, expected, file);
    }
  writeFileSync(path.join(dir, "results.json"), JSON.stringify(logs, null, 2));
  console.log(
    "PASS all deployed asset SHA-256 hashes match both pinned builds.",
  );
} finally {
  await browser.close();
}
