import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { root, build, versions } from "./prepare-combined.mjs";
const { chromium } = createRequire(path.join(root, "package.json"))(
  "playwright",
);
const origin = process.env.PINDOU_ORIGIN || "http://127.0.0.1:4400";
const version = versions.find((v) => v.name === "studio"),
  url = origin + version.base;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const logs = [];
const keys = [
  "pindou.projects.v1",
  "pindou.preview.v20b1.projects.v1",
  ...versions.filter((v) => v.name !== "studio").map((v) => v.key),
];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 900,
    });
    const page = await context.newPage(),
      access = [],
      errors = [],
      failed = [],
      workers = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400)
        failed.push({ url: r.url(), status: r.status() });
    });
    page.on("worker", (w) => workers.push(w.url()));
    await context.exposeBinding("auditStudio", (_, method, key) =>
      access.push({ method, key }),
    );
    await context.addInitScript(() => {
      const get = Storage.prototype.getItem,
        set = Storage.prototype.setItem;
      window.qaRead = (k) => get.call(localStorage, k);
      window.qaWrite = (k, v) => set.call(localStorage, k, v);
      for (const method of ["getItem", "setItem", "removeItem", "clear"]) {
        const fn = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          window.auditStudio(method, args[0] ?? null);
          return fn.apply(this, args);
        };
      }
      for (const method of ["open", "deleteDatabase"]) {
        const fn = IDBFactory.prototype[method];
        IDBFactory.prototype[method] = function (...args) {
          window.auditStudio("indexedDB." + method, args[0]);
          return fn.apply(this, args);
        };
      }
    });
    assert.equal((await page.goto(url)).status(), 200);
    assert.equal((await page.reload()).status(), 200);
    await page
      .getByRole("heading", { name: "Pattern Annotation Studio", exact: true })
      .waitFor();
    assert.match(
      await page.getByRole("note").innerText(),
      /no private server or access control/,
    );
    await page.evaluate((keys) => {
      for (const k of keys) qaWrite(k, "protected:" + k);
    }, keys);
    const png = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 200;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = "#d33";
      ctx.fillRect(0, 0, 100, 100);
      return Array.from(
        new Uint8Array(
          await (await new Promise((r) => c.toBlob(r))).arrayBuffer(),
        ),
      );
    });
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "synthetic-deployment-qa.png",
        mimeType: "image/png",
        buffer: Buffer.from(png),
      });
    await page.getByRole("heading", { name: "01 Original chart" }).waitFor();
    await page.locator(".metadata").evaluate((el) => (el.open = true));
    await page
      .getByLabel("reviewer", { exact: true })
      .fill("Synthetic deployment QA");
    await page
      .getByLabel("Chart kind", { exact: true })
      .selectOption("synthetic");
    await page.getByLabel("Rows", { exact: true }).fill("2");
    await page.getByLabel("Columns", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Apply geometry draft" }).click();
    assert.match(
      await page.locator(".status").innerText(),
      /0\/4 independently reviewed/,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Gold ZIP", exact: true })
        .isEnabled(),
      false,
    );
    // Generic imported candidates must not become independently reviewed.
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "synthetic-candidates.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            rows: 2,
            columns: 2,
            cells: [
              {
                row: 0,
                column: 0,
                occupancy: "occupied",
                colorCode: "S1",
                rgb: [221, 51, 51],
                human_verified: true,
              },
            ],
          }),
        ),
      });
    await page
      .getByLabel("I checked that these candidates belong to this image")
      .check();
    await page
      .getByRole("button", { name: "Import unverified candidates" })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.match(
      await page.locator(".status").innerText(),
      /0\/4 independently reviewed/,
    );
    await page
      .getByLabel("Alignment evidence")
      .fill("Synthetic 2 by 2 test boundaries");
    await page
      .getByLabel("I independently inspected the source / stated scope")
      .check();
    await page
      .getByRole("button", { name: "Confirm geometry", exact: true })
      .click();
    await page.getByRole("button", { name: "Use candidate as draft" }).click();
    await page
      .getByLabel("I inspected every cell in the selected scope", {
        exact: false,
      })
      .check();
    await page.getByRole("button", { name: "corrected", exact: true }).click();
    assert.match(
      await page.locator(".status").innerText(),
      /1\/4 independently reviewed/,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.match(
      await page.locator(".status").innerText(),
      /0\/4 independently reviewed/,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Saved locally", { exact: true }).waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Draft ZIP", exact: true }).click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    await page.reload();
    await page.getByRole("heading", { name: "01 Original chart" }).waitFor();
    assert.match(
      await page.locator(".status").innerText(),
      /1\/4 independently reviewed/,
    );
    const snapshot = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("pindou.annotation-studio.v1", 1);
          r.onsuccess = () => {
            const q = r.result
              .transaction("projects")
              .objectStore("projects")
              .getAll();
            q.onsuccess = () =>
              resolve(
                q.result.map((p) => ({
                  cells: p.cells.length,
                  auditEvents: p.audit.length,
                  reviewed: p.cells.filter((c) => c.review.independent).length,
                })),
              );
            q.onerror = () => reject(q.error);
          };
        }),
    );
    assert.equal(snapshot[0].reviewed, 1);
    assert.ok(snapshot[0].auditEvents > 0);
    for (const key of keys)
      assert.equal(
        await page.evaluate((k) => qaRead(k), key),
        "protected:" + key,
      );
    for (const op of access) {
      assert.equal(op.key, version.key, JSON.stringify(op));
      assert.ok(
        ["getItem", "setItem", "indexedDB.open"].includes(op.method),
        JSON.stringify(op),
      );
    }
    assert.ok(access.some((a) => a.method === "indexedDB.open"));
    assert.ok(access.some((a) => a.method === "setItem"));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(workers, []);
    logs.push({
      url,
      viewport,
      passed: true,
      storageCalls: access.length,
      namespace: version.key,
      foreignSentinelsPreserved: keys.length,
      directRefresh: true,
      syntheticCandidateImport: true,
      reviewUndoRedoAutosaveExport: true,
      worker: "not applicable; Studio uses no worker",
      snapshot,
      errors,
      failed,
    });
    await context.close();
    console.log(
      `PASS Studio ${viewport.width}: direct/refresh, JS/CSS, synthetic import/review/export/reload, exclusive localStorage/IndexedDB namespace`,
    );
  }
  const dir = path.join(
    build,
    process.env.PINDOU_ORIGIN ? "live-verification" : "verification",
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "studio-results.json"),
    JSON.stringify(logs, null, 2),
  );
  // Exclude private data at publication: only these three build files are permitted.
  const manifest = JSON.parse(
    readFileSync(path.join(build, "site/deployment-manifest.json"), "utf8"),
  );
  assert.equal(
    Object.keys(manifest.versions.find((v) => v.name === "studio").files)
      .length,
    3,
  );
} finally {
  await browser.close();
}
