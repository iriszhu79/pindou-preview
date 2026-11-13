import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const dir = path.join(
  build,
  process.env.PINDOU_ORIGIN ? "live-verification" : "verification",
);
mkdirSync(dir, { recursive: true });
const logs = [];
const { createProject } = await import(path.join(build, "v15/src/model.ts"));
const protectedKeys = [
  "pindou.projects.v1",
  "pindou.preview.v20b1.projects.v1",
  ...versions.map((v) => v.key),
];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ])
    for (const version of versions) {
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.width < 900,
      });
      const page = await context.newPage(),
        errors = [],
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
      const url = origin + version.base;
      assert.equal((await page.goto(url)).status(), 200);
      assert.equal((await page.reload()).status(), 200);
      const sentinels = {};
      for (const key of protectedKeys.filter((k) => k !== version.key)) {
        const p = createProject();
        p.id = "protected:" + key;
        p.name = p.id;
        p.grid.find((c) => !c.isEmpty).isCompleted = true;
        sentinels[key] = JSON.stringify([p]);
      }
      await page.evaluate((s) => {
        for (const [key, value] of Object.entries(s)) qaWrite(key, value);
      }, sentinels);
      if (version.name === "v15") {
        const legacy = createProject();
        legacy.grid.find((c) => !c.isEmpty).isCompleted = true;
        await page.evaluate(
          ({ key, legacy }) => qaWrite(key, JSON.stringify([legacy])),
          { key: version.key, legacy },
        );
      }
      await page.reload();
      assert.equal(
        await page.locator(".project").count(),
        version.name === "v15" ? 1 : 0,
        "Foreign projects must not be loaded",
      );
      let recognition = null;
      if (version.name !== "v15") {
        await page
          .getByRole("button", { name: "UPLOAD PATTERN", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Load original MARD sample",
            exact: true,
          })
          .click();
        const start = performance.now();
        await page
          .getByRole("button", {
            name: "Detect grid automatically",
            exact: true,
          })
          .click();
        await page
          .getByText("Recognized · Needs Review. Not yet saved.", {
            exact: true,
          })
          .waitFor({ timeout: 30000 });
        const automaticMs = performance.now() - start;
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
          /1179 beads · 5 colors/,
        );
        assert.equal(
          await page.evaluate((key) => qaRead(key), version.key),
          null,
          "No save before confirmation",
        );
        await page
          .getByLabel("Cell color", { exact: true })
          .selectOption("Color 1");
        assert.match(
          await page.locator(".recognition-digital").innerText(),
          /1180 beads/,
        );
        await page
          .getByRole("button", { name: "Restore recognized cell" })
          .click();
        assert.match(
          await page.locator(".recognition-digital").innerText(),
          /1179 beads/,
        );
        if (version.name === "v211") {
          // Reclassification through the manual path uses the same reviewed geometry;
          // the full pointer/touch correction tests run separately against this artifact.
          await page
            .getByRole("button", {
              name: "Recognize specified region",
              exact: true,
            })
            .click();
          await page
            .getByText("Recognized · Needs Review. Not yet saved.", {
              exact: true,
            })
            .waitFor({ timeout: 30000 });
          assert.match(
            await page.locator(".recognition-digital").innerText(),
            /1179 beads · 5 colors/,
          );
        }
        await page.screenshot({
          path: path.join(
            dir,
            `${version.name}-recognition-${viewport.width}.png`,
          ),
          fullPage: true,
        });
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", {
            name: "Confirm pattern → Overview",
            exact: true,
          })
          .click();
        recognition = {
          columns: 40,
          rows: 51,
          beads: 1179,
          colors: 5,
          automaticMs,
          manualReclassification: version.name === "v211",
        };
      } else {
        await page.locator(".project").click();
        await page.locator(".stage").waitFor();
        await page
          .getByRole("button", { name: "Pattern overview", exact: true })
          .click();
        assert.equal(
          (await page.locator(".preparation-banner").boundingBox()).height,
          viewport.width <= 760 ? 82 : 114,
        );
      }
      await page
        .getByRole("button", { name: "START BEADING →", exact: true })
        .click();
      await page.locator(".stage").waitFor();
      const saved = () =>
        page.evaluate((key) => JSON.parse(qaRead(key)), version.key);
      const before = (await saved())[0],
        completed = (p) => p.grid.filter((c) => c.isCompleted).length;
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("a");
      const after = (await saved())[0];
      assert.ok(completed(after) >= completed(before));
      assert.ok(completed(after) > 0);
      const stored = await page.evaluate((key) => qaRead(key), version.key);
      await page.reload();
      assert.equal(
        await page.evaluate((key) => qaRead(key), version.key),
        stored,
      );
      await page.locator(".project").first().click();
      await page.locator(".stage").waitFor();
      assert.equal((await saved())[0].id, after.id);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(dir, `${version.name}-workspace-${viewport.width}.png`),
        fullPage: true,
      });
      for (const [key, value] of Object.entries(sentinels))
        assert.equal(
          await page.evaluate((key) => qaRead(key), key),
          value,
          `Foreign save changed: ${key}`,
        );
      // Audit reads as well as writes: untouched values alone would miss a foreign read.
      for (const op of access) {
        assert.ok(
          ["getItem", "setItem"].includes(op.method),
          JSON.stringify(op),
        );
        assert.equal(op.key, version.key, JSON.stringify(op));
      }
      for (const method of ["getItem", "setItem"])
        assert.ok(
          access.some((op) => op.method === method && op.key === version.key),
        );
      assert.deepEqual(errors, []);
      assert.deepEqual(failed, []);
      logs.push({
        origin,
        version: version.name,
        sha: version.sha,
        base: version.base,
        key: version.key,
        viewport,
        passed: true,
        applicationStorageCalls: access.length,
        protectedKeys: Object.keys(sentinels),
        recognition,
        errors,
        failed,
      });
      console.log(
        `PASS ${version.name} ${viewport.width}×${viewport.height}: direct refresh, assets, Workspace progress/reload, read/write storage audit${recognition ? ", recognition worker/sample/import" : ""}`,
      );
      await context.close();
    }
  const manifest = JSON.parse(
    readFileSync(path.join(build, "site/deployment-manifest.json"), "utf8"),
  );
  if (origin.startsWith("https://")) {
    const live = JSON.parse(
      execFileSync(
        "curl",
        [
          "--fail",
          "--silent",
          "--show-error",
          "--max-time",
          "30",
          origin + "/pindou-preview/deployment-manifest.json",
        ],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual(
      live,
      manifest,
      "Live deployment manifest must match this complete artifact",
    );
  }
  for (const v of manifest.versions)
    for (const [file, expected] of Object.entries(v.files)) {
      const url = origin + v.base + file;
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
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        expected,
        url,
      );
    }
  writeFileSync(
    path.join(dir, "results.json"),
    JSON.stringify(logs, null, 2) + "\n",
  );
  console.log(
    "PASS all three applications' HTML, JavaScript, CSS, fonts, images and workers match packaged hashes.",
  );
} finally {
  await browser.close();
}
