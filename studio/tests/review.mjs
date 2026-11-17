import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import Ajv from "ajv/dist/2020.js";
const b = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}:{}),
});
const context = await b.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
});
const p = await context.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto(process.env.PINDOU_TEST_URL || "http://localhost:4310");
  await p.evaluate(() => {
    for (const k of [
      "pindou.projects.v1",
      "pindou.preview.projects.v1",
      "pindou.preview.v20a.projects.v1",
      "pindou.preview.v20b1.projects.v1",
    ])
      localStorage.setItem(k, "sentinel-" + k);
  });
  const bytes = await p.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 200;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 200, 200);
    x.fillStyle = "red";
    x.fillRect(0, 0, 100, 100);
    return Array.from(
      new Uint8Array(
        await (await new Promise((r) => c.toBlob(r))).arrayBuffer(),
      ),
    );
  });
  await p.locator("input[type=file]").setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes),
  });
  await p.getByRole("heading", { name: "01 Original chart" }).waitFor();
  await p.locator(".metadata").evaluate((el) => (el.open = true));
  await p
    .getByLabel("reviewer", { exact: true })
    .fill("Synthetic UI test reviewer");
  await p
    .getByLabel("provenanceNotes", { exact: true })
    .fill(
      "Generated synthetic pixels for workflow QA, not real-world Ground Truth",
    );
  await p.getByLabel("Provenance", { exact: true }).selectOption("derived");
  await p.getByLabel("Chart kind", { exact: true }).selectOption("synthetic");
  await p.getByLabel("Rows", { exact: true }).fill("2");
  await p.getByLabel("Columns", { exact: true }).fill("2");
  await p.getByRole("button", { name: "Apply geometry draft" }).click();
  await p.getByLabel("Source tool", { exact: true }).selectOption("grid");
  const handle = p.locator("[data-handle=nw]");
  await handle.scrollIntoViewIfNeeded();
  const rect = await handle.boundingBox();
  await p.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await p.mouse.down();
  await p.mouse.move(
    rect.x + rect.width / 2 + 10,
    rect.y + rect.height / 2 + 10,
  );
  await p.mouse.up();
  assert.equal(
    await p.getByRole("button", { name: "Apply geometry draft" }).isEnabled(),
    true,
  );
  await p.getByRole("button", { name: "Reset view / draft" }).click();
  await p.getByLabel("Source zoom", { exact: true }).fill("2");
  await p.getByRole("button", { name: "Reset view / draft" }).click();
  await p
    .getByLabel("Alignment evidence")
    .fill("Synthetic 2x2 boundaries inspected");
  await p
    .getByLabel("I independently inspected the source / stated scope")
    .check();
  await p
    .getByRole("button", { name: "Confirm geometry", exact: true })
    .click();
  await p.getByLabel("Rectangle selection", { exact: true }).check();
  const mat = p.locator("canvas");
  await mat.scrollIntoViewIfNeeded();
  const r = await mat.boundingBox();
  await p.mouse.click(r.x + 33, r.y + 33);
  assert.match(await p.locator("#evidence").innerText(), /4 selected/);
  await p.getByRole("button", { name: "Empty drafts", exact: true }).click();
  await p.getByLabel(/I inspected every cell/).check();
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "confirmed", exact: true }).click();
  assert.match(await p.locator(".status").innerText(), /4\/4/);
  await p.getByRole("button", { name: "Undo", exact: true }).click();
  assert.match(await p.locator(".status").innerText(), /0\/4/);
  await p.getByRole("button", { name: "Redo", exact: true }).click();
  assert.match(await p.locator(".status").innerText(), /4\/4/);
  await p.getByLabel("Official code", { exact: true }).fill("A1");
  await p
    .getByLabel("Printed quantity (blank = unknown)", { exact: true })
    .fill("0");
  await p
    .getByLabel("Evidence location", { exact: true })
    .fill("Synthetic legend outside test image");
  await p
    .getByLabel("Transcription notes", { exact: true })
    .fill("Synthetic zero quantity to exercise completeness gate");
  await p
    .getByLabel("I independently checked this legend entry against the source")
    .check();
  await p
    .getByRole("button", { name: "Add legend evidence", exact: true })
    .click();
  assert.equal(
    await p.getByRole("button", { name: "Gold ZIP", exact: true }).isEnabled(),
    true,
  );
  const wait = p.waitForEvent("download");
  await p.getByRole("button", { name: "Gold ZIP", exact: true }).click();
  const download = await wait;
  const downloadPath = await download.path();
  await writeFile(
    "/tmp/pindou-studio-synthetic.zip",
    await readFile(downloadPath),
  );
  const z = unzipSync(new Uint8Array(await readFile(await download.path())));
  const annotation = JSON.parse(strFromU8(z["annotations.json"]));
  const schema = JSON.parse(
    await readFile("tests/benchmark/schema.json", "utf8"),
  );
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  ajv.addSchema(schema);
  const check = ajv.compile({ $ref: schema.$id + "#/$defs/annotation" });
  assert.equal(check(annotation), true, JSON.stringify(check.errors));
  assert.equal(
    annotation.cells.filter((c) => c.verification.status === "verified").length,
    4,
  );
  await p.waitForTimeout(700);
  await p.reload();
  await p.getByRole("heading", { name: "01 Original chart" }).waitFor();
  assert.match(await p.locator(".status").innerText(), /4\/4/);
  const sentinels = await p.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k !== "pindou.annotation-studio.v1")
      .map((k) => [k, localStorage.getItem(k)]),
  );
  assert.equal(sentinels.length, 4);
  assert.ok(sentinels.every(([k, v]) => v === "sentinel-" + k));
  const file = {
    name: "backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await readFile(await download.path())),
  };
  await p.locator("input[type=file]").setInputFiles(file);
  await p.waitForTimeout(800);
  assert.match(await p.locator(".status").innerText(), /4\/4/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS synthetic scope review, mouse crop, zoom reset, undo/redo, Gold gates, benchmark schema, reload, ZIP restore, four storage sentinels",
  );
} finally {
  await b.close();
}
