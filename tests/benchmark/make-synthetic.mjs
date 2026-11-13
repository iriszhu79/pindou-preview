import { deflateSync } from "node:zlib";
import { writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { syntheticChart } from "../recognition-fixtures.ts";
import { sha256 } from "./validate.mjs";
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function encodePNG(image) {
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      n = Buffer.alloc(4),
      check = Buffer.alloc(4);
    n.writeUInt32BE(data.length);
    check.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([n, type, data, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++)
    Buffer.from(
      image.data.buffer,
      image.data.byteOffset + y * image.width * 4,
      image.width * 4,
    ).copy(rows, y * (image.width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export function syntheticFixture() {
  const { image, geometry, expected, colors } = syntheticChart(20, 20);
  const verification = {
    status: "verified",
    reviewer: "synthetic-chart generator v1",
    reviewerKind: "synthetic-generator",
    independent: true,
    evidence:
      "Expected labels are defined by generator row/column formula before rendering, without running recognition.",
    reviewedAt: new Date().toISOString(),
  };
  const verified = (value) => ({ value, verification });
  const codes = ["SYN-CREAM", "SYN-BLUE", "SYN-PINK", "SYN-WHITE"];
  const annotation = {
    schemaVersion: "1.0",
    patternId: "synthetic-complete",
    revision: 1,
    verification,
    grid: {
      dimensions: verified({ rows: 20, columns: 20 }),
      crop: verified(geometry.crop),
    },
    palette: {
      completeness: "complete",
      verification,
      entries: codes.map((code, i) => ({
        code,
        verification,
        quantity: verified(expected.filter((v) => v === i).length),
        swatch: verified(colors[i]),
      })),
    },
    mappingPolicy: verified({ maxDistance: 0.06, minMargin: 0.005 }),
    cellCoverage: "complete",
    cells: expected.map((color, i) => ({
      row: Math.floor(i / 20),
      column: i % 20,
      occupancy: color === null ? "empty" : "occupied",
      verification,
      ...(color === null
        ? {}
        : { colorCode: codes[color], colorVerification: verification }),
    })),
  };
  return { image, geometry, annotation, bytes: encodePNG(image) };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.argv.includes("--regenerate-smoke"))
    throw new Error(
      "Explicit --regenerate-smoke required; never overwrite human-reviewed annotations with generated labels",
    );
  const f = syntheticFixture();
  await writeFile(
    new URL("./images/synthetic-complete.png", import.meta.url),
    f.bytes,
  );
  await writeFile(
    new URL("./annotations/synthetic-complete.json", import.meta.url),
    JSON.stringify(f.annotation, null, 2) + "\n",
  );
  console.log(sha256(f.bytes));
}
