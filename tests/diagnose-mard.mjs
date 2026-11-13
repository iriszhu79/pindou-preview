import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  diagnoseGrid,
  recognize,
  recognitionStats,
} from "../src/recognition.ts";
const qaDir = process.env.PINDOU_QA_DIR || "docs/previews/v20b1";
const filenames = process.argv.slice(2);
if (!filenames.length) filenames.push("public/samples/sample-pattern.jpg");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
await mkdir(`${qaDir}/diagnostics`, { recursive: true });
try {
  for (const filename of filenames) {
    const bytes = await readFile(filename);
    const page = await browser.newPage();
    const decoded = await page.evaluate(async (base64) => {
      const blob = await (
        await fetch("data:application/octet-stream;base64," + base64)
      ).blob();
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const encoded = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(new Blob([data]));
      });
      return { width: canvas.width, height: canvas.height, data: encoded };
    }, bytes.toString("base64"));
    const image = {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8ClampedArray(Buffer.from(decoded.data, "base64")),
    };
    const start = performance.now(),
      diagnostics = diagnoseGrid(image);
    let classification = null;
    if (diagnostics.geometry) {
      const result = recognize(image, diagnostics.geometry);
      classification = recognitionStats(result);
    }
    const report = {
      source: filename,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dimensions: [image.width, image.height],
      automatic: !!diagnostics.geometry,
      diagnostics,
      classification,
      elapsedMs: performance.now() - start,
    };
    await writeFile(
      `${qaDir}/diagnostics/${path.basename(filename)}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        ...report,
        diagnostics: {
          stage: diagnostics.stage,
          xPeaks: diagnostics.x?.peaks.length,
          yPeaks: diagnostics.y?.peaks.length,
          x: diagnostics.x?.selected,
          y: diagnostics.y?.selected,
          spacingRatio: diagnostics.spacingRatio,
          geometry: diagnostics.geometry,
          rejection: diagnostics.rejection,
        },
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
