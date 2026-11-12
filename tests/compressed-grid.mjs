import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { gridVariant } from "./grid-variants.ts";
import {
  diagnoseGrid,
  recognize,
  recognitionStats,
} from "../src/recognition.ts";
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  }),
  page = await browser.newPage(),
  reports = [];
await mkdir("docs/previews/v20b1/synthetic", { recursive: true });
try {
  for (const quality of [0.92, 0.82]) {
    const f = gridVariant({ fine: 250, major: 5, header: true });
    const decoded = await page.evaluate(
      async ({ width, height, data, quality }) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const x = c.getContext("2d");
        x.putImageData(
          new ImageData(new Uint8ClampedArray(data), width, height),
          0,
          0,
        );
        const jpeg = c.toDataURL("image/jpeg", quality);
        const b = await createImageBitmap(await (await fetch(jpeg)).blob());
        x.clearRect(0, 0, width, height);
        x.drawImage(b, 0, 0);
        b.close();
        const rgba = x.getImageData(0, 0, width, height).data;
        const encoded = await new Promise((r) => {
          const f = new FileReader();
          f.onload = () => r(f.result.split(",")[1]);
          f.readAsDataURL(new Blob([rgba]));
        });
        return { jpeg: jpeg.split(",")[1], rgba: encoded };
      },
      {
        width: f.image.width,
        height: f.image.height,
        data: Array.from(f.image.data),
        quality,
      },
    );
    const image = {
      ...f.image,
      data: new Uint8ClampedArray(Buffer.from(decoded.rgba, "base64")),
    };
    const start = performance.now(),
      d = diagnoseGrid(image),
      manual = recognitionStats(recognize(image, f.geometry));
    if (d.geometry) {
      assert.equal(d.geometry.rows, f.geometry.rows);
      assert.equal(d.geometry.columns, f.geometry.columns);
    }
    assert.equal(manual.total, f.beads);
    const report = {
      synthetic: true,
      quality,
      rows: f.geometry.rows,
      columns: f.geometry.columns,
      automatic: !!d.geometry,
      proposed: d.geometry ?? d.bestCandidate,
      rejection: d.rejection,
      manualTotal: manual.total,
      manualUncertain: manual.uncertain,
      expected: f.beads,
      ms: performance.now() - start,
    };
    reports.push(report);
    console.log(report);
    await writeFile(
      `docs/previews/v20b1/synthetic/grid-jpeg-${quality}.jpg`,
      Buffer.from(decoded.jpeg, "base64"),
    );
  }
  await writeFile(
    "docs/previews/v20b1/synthetic/compression-results.json",
    JSON.stringify(reports, null, 2),
  );
} finally {
  await browser.close();
}
