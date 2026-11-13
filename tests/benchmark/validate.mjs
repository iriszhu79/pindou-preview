import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const schema = JSON.parse(
  await readFile(new URL("./schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
const checkDataset = ajv.compile(schema),
  checkAnnotation = ajv.compile({ $ref: schema.$id + "#/$defs/annotation" });
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export { isIndependent as independentlyVerified } from "./types.ts";
import { isIndependent as independentlyVerified } from "./types.ts";
export async function inside(root, file) {
  if (path.isAbsolute(file)) throw new Error("Use a root-relative path");
  const p = await realpath(path.resolve(root, file)),
    r = await realpath(root);
  if (!p.startsWith(r + path.sep)) throw new Error("Path escapes dataset root");
  return p;
}
export function imageDimensions(bytes) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR")
      throw new Error("Invalid PNG header");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let p = 2,
      orientation = 1,
      dimensions;
    while (p < bytes.length) {
      if (bytes[p++] !== 255) continue;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (p + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(p);
      if (length < 2 || p + length > bytes.length) break;
      if (
        marker === 0xe1 &&
        bytes.toString("ascii", p + 2, p + 8) === "Exif\0\0"
      ) {
        try {
          const base = p + 8,
            little = bytes.toString("ascii", base, base + 2) === "II";
          const u16 = (i) =>
              little ? bytes.readUInt16LE(i) : bytes.readUInt16BE(i),
            u32 = (i) =>
              little ? bytes.readUInt32LE(i) : bytes.readUInt32BE(i);
          const dir = base + u32(base + 4),
            count = u16(dir);
          for (let n = 0; n < count; n++) {
            const e = dir + 2 + n * 12;
            if (u16(e) === 0x112) orientation = u16(e + 8);
          }
        } catch {
          /* Decoder will reject malformed EXIF if necessary. */
        }
      }
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      )
        dimensions = {
          width: bytes.readUInt16BE(p + 5),
          height: bytes.readUInt16BE(p + 3),
        };
      p += length;
    }
    if (dimensions)
      return orientation >= 5 && orientation <= 8
        ? { width: dimensions.height, height: dimensions.width }
        : dimensions;
  }
  throw new Error("Unsupported or malformed image: expected PNG or JPEG");
}
export async function validateDataset(
  manifestPath,
  { root = repositoryRoot, previous } = {},
) {
  const issues = [],
    samples = [];
  let dataset, manifestBytes;
  const issue = (level, at, message) => issues.push({ level, at, message });
  try {
    manifestBytes = await readFile(path.resolve(root, manifestPath));
    dataset = JSON.parse(manifestBytes);
  } catch (e) {
    issue("error", manifestPath, e.message);
    return { issues, samples, dataset: null };
  }
  if (!checkDataset(dataset)) {
    for (const e of checkDataset.errors)
      issue(
        "error",
        "manifest" + e.instancePath,
        e.message +
          (e.params?.missingProperty ? " " + e.params.missingProperty : ""),
      );
    return { issues, samples, dataset };
  }
  let previousManifestHash;
  if (previous) {
    try {
      const bytes = await readFile(path.resolve(root, previous));
      previousManifestHash = sha256(bytes);
      const prior = JSON.parse(bytes);
      if (!checkDataset(prior))
        throw new Error("Previous manifest does not match schema");
      if (prior.datasetId !== dataset.datasetId)
        issue("error", "previous", "Dataset IDs differ");
      if (prior.version === dataset.version)
        issue(
          "error",
          "previous",
          "Dataset version must change when comparing a new manifest",
        );
      for (const current of dataset.samples) {
        const old = prior.samples.find((p) => p.id === current.id);
        if (old) {
          if (current.familyId !== old.familyId)
            issue("error", current.id, "Stable chart family changed");
          if (
            old.splitHistory.some(
              (h, i) =>
                JSON.stringify(h) !== JSON.stringify(current.splitHistory[i]),
            )
          )
            issue(
              "error",
              current.id,
              "Split history was rewritten; append transitions instead",
            );
          if (
            old.split !== current.split &&
            current.splitHistory.length <= old.splitHistory.length
          )
            issue(
              "error",
              current.id,
              "Split change needs an explicit appended transition",
            );
        }
        const priorHeld = prior.samples.find(
          (p) =>
            p.split === "held-out" &&
            (p.familyId === current.familyId ||
              p.image.sha256 === current.image.sha256 ||
              (p.image.original?.sha256 &&
                p.image.original.sha256 === current.image.original?.sha256)),
        );
        if (
          priorHeld &&
          current.split === "development" &&
          !current.splitHistory.slice(0, -1).some((h) => h.split === "held-out")
        )
          issue(
            "error",
            current.id,
            "Previously held-out identity needs an explicit held-out → development history transition",
          );
      }
      for (const old of prior.samples)
        if (!dataset.samples.some((p) => p.id === old.id))
          issue(
            "warning",
            old.id,
            "Sample retired from current manifest; keep prior manifests and evaluation reports",
          );
    } catch (e) {
      issue("error", "previous", e.message);
    }
  }
  const ids = new Set(),
    hashes = new Map(),
    families = new Map();
  for (const sample of dataset.samples) {
    const at = sample.id;
    if (ids.has(at)) issue("error", at, "Duplicate pattern ID");
    ids.add(at);
    for (const key of [
      sample.image.sha256,
      sample.image.original?.sha256,
    ].filter(Boolean)) {
      const old = hashes.get(key);
      if (old && old.id !== sample.id)
        issue(
          old.split === sample.split ? "warning" : "error",
          at,
          `Image/original hash also used by ${old.id}${old.split !== sample.split ? ": development/held-out leakage" : ""}`,
        );
      hashes.set(key, sample);
    }
    if (
      families.has(sample.familyId) &&
      families.get(sample.familyId) !== sample.split
    )
      issue(
        "error",
        at,
        "Chart family crosses development and held-out splits",
      );
    families.set(sample.familyId, sample.split);
    if (sample.splitHistory.at(-1).split !== sample.split)
      issue("error", at, "Last split-history entry must match current split");
    let date = -Infinity;
    for (const h of sample.splitHistory) {
      const next = Date.parse(h.at);
      if (!Number.isFinite(next) || next < date)
        issue(
          "error",
          at,
          "Split history must contain chronological valid dates",
        );
      date = next;
    }
    if (
      sample.kind === "real" &&
      sample.image.provenance.status === "synthetic"
    )
      issue("error", at, "Real sample has synthetic provenance");
    if (
      sample.kind === "synthetic" &&
      sample.image.provenance.status !== "synthetic"
    )
      issue(
        "error",
        at,
        "Synthetic sample must explicitly record synthetic provenance",
      );
    if (
      sample.image.provenance.status === "conversation-copy" &&
      sample.image.provenance.byteIdentity === "verified" &&
      (!sample.image.original?.sha256 ||
        sample.image.original.sha256 !== sample.image.sha256)
    )
      issue(
        "error",
        at,
        "Conversation copy needs matching known original SHA-256 to claim byte identity",
      );
    if (
      sample.image.provenance.byteIdentity === "verified" &&
      sample.image.original?.sha256 &&
      sample.image.sha256 !== sample.image.original.sha256
    )
      issue(
        "error",
        at,
        "Verified original byte identity contradicts original SHA-256",
      );
    if (sample.image.provenance.byteIdentity === "not-verified")
      issue(
        "warning",
        at,
        "Original byte identity is unverified; available-file hash does not certify the original upload",
      );
    let bytes, annotation, annotationBytes, imagePath;
    try {
      imagePath = await inside(root, sample.image.file);
      bytes = await readFile(imagePath);
      if (sha256(bytes) !== sample.image.sha256)
        issue("error", at, "Image SHA-256 mismatch");
      const dimensions = imageDimensions(bytes);
      if (
        dimensions.width !== sample.image.width ||
        dimensions.height !== sample.image.height
      )
        issue(
          "error",
          at,
          `Image dimensions mismatch: normalized header ${dimensions.width}×${dimensions.height}`,
        );
    } catch (e) {
      issue("error", at + " image", e.message);
    }
    try {
      annotationBytes = await readFile(await inside(root, sample.annotation));
      annotation = JSON.parse(annotationBytes);
    } catch (e) {
      issue("error", at + " annotation", e.message);
      continue;
    }
    if (!checkAnnotation(annotation)) {
      for (const e of checkAnnotation.errors)
        issue(
          "error",
          at + e.instancePath,
          e.message +
            (e.params?.missingProperty ? " " + e.params.missingProperty : ""),
        );
      continue;
    }
    if (annotation.patternId !== sample.id)
      issue("error", at, "Annotation patternId does not match manifest");
    function verification(v, where) {
      if (v.status === "verified" && !independentlyVerified(v, sample.kind))
        issue(
          "error",
          where,
          "Verified status needs an independent human reviewer (or a synthetic truth generator), reviewer name and evidence",
        );
      if (v.status === "verified" && !v.reviewedAt)
        issue("warning", where, "Verification date is not recorded");
      if (v.reviewedAt && !Number.isFinite(Date.parse(v.reviewedAt)))
        issue("error", where, "Invalid verification date");
    }
    function walk(value, where) {
      if (!value || typeof value !== "object") return;
      if (value.verification) verification(value.verification, where);
      if (value.colorVerification)
        verification(value.colorVerification, where + " color");
      for (const [k, v] of Object.entries(value))
        if (k !== "verification" && k !== "colorVerification")
          walk(v, where + "/" + k);
    }
    walk(annotation, at);
    const dims = annotation.grid?.dimensions.value;
    if (dims && !Number.isSafeInteger(dims.rows * dims.columns))
      issue("error", at, "Grid address count exceeds safe integer precision");
    if (
      dims &&
      (dims.rows * dims.columns > 40000 ||
        dims.rows > 300 ||
        dims.columns > 300)
    )
      issue("warning", at, "Grid exceeds current recognizer 40,000-cell limit");
    for (const [label, crop] of [
      ["grid", annotation.grid?.crop?.value],
      ["legend", annotation.legend?.value],
      ["manual", sample.manualRecovery?.geometry.crop],
    ])
      if (
        crop &&
        (crop.x + crop.width > sample.image.width ||
          crop.y + crop.height > sample.image.height)
      )
        issue(
          "error",
          at,
          label + " rectangle exceeds normalized image bounds",
        );
    if (
      sample.manualRecovery &&
      dims &&
      (sample.manualRecovery.geometry.rows !== dims.rows ||
        sample.manualRecovery.geometry.columns !== dims.columns)
    )
      issue(
        "warning",
        at,
        "Manual input dimensions differ from reference dimensions; this is a separate recovery input",
      );
    const palette = new Map();
    for (const p of annotation.palette.entries) {
      if (palette.has(p.code))
        issue("error", at, "Duplicate palette code " + p.code);
      palette.set(p.code, p);
    }
    const cells = new Set(),
      verifiedCounts = new Map();
    let verifiedOccupancy = 0,
      knownColors = 0;
    for (const c of annotation.cells) {
      const key = c.row + ":" + c.column;
      if (cells.has(key)) issue("error", at, "Duplicate cell " + key);
      cells.add(key);
      if (!dims || c.row >= dims.rows || c.column >= dims.columns)
        issue(
          "error",
          at,
          "Cell " + key + " lacks dimensions or is out of range",
        );
      if (c.colorCode && !palette.has(c.colorCode))
        issue(
          "error",
          at,
          `Cell ${key} references unknown palette ${c.colorCode}`,
        );
      if (c.occupancy !== "occupied" && c.colorCode)
        issue(
          "error",
          at,
          `Cell ${key}: empty/unknown occupancy cannot have a color`,
        );
      if (c.colorCode && !c.colorVerification)
        issue(
          "error",
          at,
          `Cell ${key}: color needs a separate verification status`,
        );
      if (c.occupancy === "unknown" && c.verification.status === "verified")
        issue(
          "error",
          at,
          `Cell ${key}: unknown truth must remain ambiguous/unreviewed`,
        );
      if (
        c.colorVerification?.status === "verified" &&
        (!c.colorCode ||
          c.occupancy !== "occupied" ||
          !independentlyVerified(c.verification, sample.kind))
      )
        issue(
          "error",
          at,
          `Cell ${key}: verified color requires independently verified occupied truth`,
        );
      if (
        independentlyVerified(c.verification, sample.kind) &&
        c.occupancy !== "unknown"
      )
        verifiedOccupancy++;
      if (
        c.occupancy === "occupied" &&
        c.colorCode &&
        independentlyVerified(c.colorVerification, sample.kind)
      ) {
        knownColors++;
        verifiedCounts.set(
          c.colorCode,
          (verifiedCounts.get(c.colorCode) || 0) + 1,
        );
      }
    }
    if (
      annotation.cellCoverage === "complete" &&
      (!dims || cells.size !== dims.rows * dims.columns)
    )
      issue(
        "error",
        at,
        "Complete cell coverage must list every grid address exactly once",
      );
    if (annotation.cellCoverage === "partial")
      issue(
        "warning",
        at,
        "Partial cell annotations are valid; missing cells are not errors or successes",
      );
    if (!verifiedOccupancy)
      issue(
        "warning",
        at,
        "No independently verified occupancy labels: cell metrics will be Not evaluated",
      );
    for (const p of palette.values())
      if (
        p.quantity &&
        independentlyVerified(p.verification, sample.kind) &&
        independentlyVerified(p.quantity.verification, sample.kind)
      ) {
        const counted = verifiedCounts.get(p.code) || 0;
        if (counted > p.quantity.value)
          issue(
            "error",
            at,
            `Verified ${p.code} cells (${counted}) exceed reference quantity (${p.quantity.value})`,
          );
        if (
          dims &&
          verifiedOccupancy === dims.rows * dims.columns &&
          knownColors ===
            annotation.cells.filter((c) => c.occupancy === "occupied").length &&
          counted !== p.quantity.value
        )
          issue(
            "error",
            at,
            `Complete verified cell count for ${p.code} is ${counted}, legend says ${p.quantity.value}`,
          );
      }
    if (
      dims &&
      annotation.cellCoverage === "complete" &&
      annotation.cells.every(
        (c) =>
          c.occupancy !== "unknown" && (c.occupancy === "empty" || c.colorCode),
      )
    ) {
      for (const p of palette.values())
        if (
          p.quantity &&
          !independentlyVerified(p.quantity.verification, sample.kind)
        ) {
          const draftCount = annotation.cells.filter(
            (c) => c.occupancy === "occupied" && c.colorCode === p.code,
          ).length;
          if (draftCount !== p.quantity.value)
            issue(
              "warning",
              at,
              `Unverified full-grid draft count for ${p.code} (${draftCount}) differs from unverified quantity (${p.quantity.value}); not an accuracy result`,
            );
        }
    }
    if (sample.split === "held-out")
      issue(
        "warning",
        at,
        "Held-out evaluation only: do not tune from these outputs; any move to development must be explicit in split history",
      );
    samples.push({
      sample,
      annotation,
      imagePath,
      annotationHash: sha256(annotationBytes),
      imageBytes: bytes,
    });
  }
  return {
    dataset,
    samples,
    issues,
    manifestHash: sha256(manifestBytes),
    previousManifestHash,
  };
}
