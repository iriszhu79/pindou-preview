import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const b = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
});
const context = await b.newContext({
  viewport: { width: 820, height: 1180 },
  hasTouch: true,
});
const p = await context.newPage();
try {
  await p.goto("http://localhost:4310");
  const start = performance.now();
  await p
    .locator("input[type=file]")
    .setInputFiles(
      "/workspace/attachments/18c17085-6645-430b-950b-5aafdf372ee1/Pindou_Pattern_Benchmark_v1_20_images.zip",
    );
  await p
    .getByRole("heading", { name: "01 Original chart" })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await p.locator('[aria-label="Project library"] option').count(),
    20,
  );
  await p.getByLabel("Source tool", { exact: true }).selectOption("grid");
  const h = p.locator("[data-handle=nw]");
  await h.scrollIntoViewIfNeeded();
  const r = await h.boundingBox();
  const cdp = await context.newCDPSession(p);
  const x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 12, y: y + 12, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(
    await p.getByRole("button", { name: "Apply geometry draft" }).isEnabled(),
    true,
  );
  const projects = await p.evaluate(
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
                filename: p.source.filename,
                sha256: p.source.sha256,
                verified: p.cells.filter((c) => c.review.independent).length,
                geometry: p.grid.verification.status,
              })),
            );
          q.onerror = () => reject(q.error);
        };
      }),
  );
  assert.equal(projects.length, 20);
  assert.ok(
    projects.every((p) => p.verified === 0 && p.geometry === "unreviewed"),
  );
  await writeFile(
    "studio/docs/corpus-results.json",
    JSON.stringify(
      {
        importMs: Math.round(performance.now() - start),
        count: 20,
        touchCrop: true,
        projects,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: 20 corpus images imported as drafts; touch crop handle changes geometry",
  );
} finally {
  await b.close();
}
