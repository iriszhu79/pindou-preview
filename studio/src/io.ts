import Ajv from "ajv";
import schema from "../schema.json" with { type: "json" };
const checkProject = new Ajv({ allErrors: true, strict: false }).compile(
  schema,
);
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Project, Candidate } from "./types.ts";
import {
  createProject,
  validateGeometry,
  auditProblems,
  commit,
  now,
  quality,
  quantities,
  reviewed,
  uid,
} from "./model.ts";
export const namespace = "pindou.annotation-studio.v1";
export async function sha(blob: Blob) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function sourceProject(file: File) {
  const bitmap = await createImageBitmap(file);
  const p = createProject({
    filename: file.name,
    mime: file.type || "image/png",
    sha256: await sha(file),
    width: bitmap.width,
    height: bitmap.height,
    bytes: file.size,
  });
  bitmap.close();
  return p;
}
function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(namespace, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("projects", { keyPath: "id" });
      r.result.createObjectStore("images");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function save(p: Project, image?: Blob) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(["projects", "images"], "readwrite");
    t.objectStore("projects").put(p);
    if (image) t.objectStore("images").put(image, p.source.sha256);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  d.close();
  localStorage.setItem(namespace, JSON.stringify({ active: p.id }));
}
export async function loadAll() {
  const d = await db();
  const data = await new Promise<Project[]>((resolve, reject) => {
    const r = d.transaction("projects").objectStore("projects").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  d.close();
  return data;
}
export async function imageFor(p: Project) {
  const d = await db();
  const b = await new Promise<Blob>((resolve, reject) => {
    const r = d
      .transaction("images")
      .objectStore("images")
      .get(p.source.sha256);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  d.close();
  return b;
}
export function validateProject(p: Project) {
  if (!checkProject(p))
    throw Error(
      "Invalid Studio schema: " +
        JSON.stringify(checkProject.errors?.slice(0, 3)),
    );
  if (
    p?.format !== "pindou.annotation-studio/project-v1" ||
    p.schemaVersion !== "1.0"
  )
    throw Error("Not a Studio v1 project");
  validateGeometry(p.grid.geometry, p.source.width, p.source.height);
  if (
    !/^[a-f0-9]{64}$/.test(p.source.sha256) ||
    !Array.isArray(p.audit) ||
    !p.history ||
    !p.meta ||
    !Array.isArray(p.legend)
  )
    throw Error("Invalid project metadata");
  if (p.cells.length !== p.grid.geometry.rows * p.grid.geometry.columns)
    throw Error("Missing cell addresses");
  for (let i = 0; i < p.cells.length; i++) {
    const c = p.cells[i];
    if (
      c.row !== Math.floor(i / p.grid.geometry.columns) ||
      c.column !== i % p.grid.geometry.columns ||
      !["unknown", "empty", "occupied"].includes(c.draft.occupancy) ||
      ![
        "unreviewed",
        "candidate-generated",
        "confirmed",
        "corrected",
        "ambiguous",
        "unreadable",
      ].includes(c.review.status)
    )
      throw Error("Invalid cell address or status");
  }
  if (
    !p.source.filename ||
    /[\\/]/.test(p.source.filename) ||
    p.source.filename === ".."
  )
    throw Error("Unsafe source filename");
  if (
    new Set(p.legend.map((e) => e.code)).size !== p.legend.length ||
    p.legend.some((e) => !e.code.trim())
  )
    throw Error("Duplicate or blank legend code");
  for (const c of p.cells) {
    const r = c.review;
    if (
      ["confirmed", "corrected"].includes(r.status) &&
      (!r.reviewer.trim() ||
        !r.at ||
        !r.evidenceSource.trim() ||
        r.occupancy === "unknown" ||
        (r.occupancy === "occupied" && !r.code?.trim()) ||
        r.geometryRevision !== p.grid.revision)
    )
      throw Error("Incomplete resolved review");
  }
  for (const command of [...p.history.undo, ...p.history.redo]) {
    for (const change of command.patch.cells || [])
      if (
        change.index < 0 ||
        change.index >= 40000 ||
        change.before.row !== change.after.row ||
        change.before.column !== change.after.column
      )
        throw Error("Invalid history cell patch");
    for (const frame of command.patch.frame
      ? [command.patch.frame.before, command.patch.frame.after]
      : []) {
      validateGeometry(frame.grid.geometry, p.source.width, p.source.height);
      if (
        frame.cells.length !==
        frame.grid.geometry.rows * frame.grid.geometry.columns
      )
        throw Error("Invalid history geometry");
    }
  }
  const issues = auditProblems(p);
  if (issues.length) throw Error(issues.join("; "));
  return p;
}
export function candidateInfo(raw: any) {
  const legacy = !!raw.grid?.crop_pixel_bounds_xyxy;
  const g = raw.grid || raw.geometry || raw.recognition || raw;
  const rows = g.rows,
    columns = g.columns;
  const bounds = g.crop_pixel_bounds_xyxy;
  return {
    raw,
    rows,
    columns,
    base: legacy ? 1 : 0,
    hash: raw.source_sha256 || raw.source?.sha256 || null,
    geometry: bounds
      ? {
          rows,
          columns,
          crop: {
            x: bounds[0],
            y: bounds[1],
            width: bounds[2] - bounds[0],
            height: bounds[3] - bounds[1],
          },
        }
      : g.crop
        ? { rows, columns, crop: g.crop }
        : null,
  };
}
export function importCandidates(
  p: Project,
  raw: any,
  base: number,
  ack: boolean,
) {
  const info = candidateInfo(raw);
  if (
    info.rows !== p.grid.geometry.rows ||
    info.columns !== p.grid.geometry.columns
  )
    throw Error(
      "Candidate dimensions differ from the applied grid. Apply and inspect the geometry first.",
    );
  if (info.hash && info.hash !== p.source.sha256)
    throw Error("Source SHA-256 mismatch");
  if (!info.hash && !ack)
    throw Error(
      "No source hash: explicitly acknowledge the image association.",
    );
  const importedCells = raw.cells || raw.recognition?.cells;
  if (!Array.isArray(importedCells))
    throw Error("Candidate cells must be an array");
  const seen = new Set<number>();
  const palette =
    raw.palette_candidates || raw.palette || raw.recognition?.palette || [];
  const pindou = !!raw.recognition;
  const cells = importedCells.map((v: any) => {
    const row = v.row - base,
      column = v.column - base,
      index = row * info.columns + column;
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(column) ||
      row < 0 ||
      column < 0 ||
      row >= info.rows ||
      column >= info.columns ||
      seen.has(index)
    )
      throw Error("Duplicate or out-of-range cell coordinate");
    seen.add(index);
    let occupancy =
      v.occupancy_candidate ||
      v.occupancy ||
      (pindou && typeof v.isEmpty === "boolean"
        ? v.isEmpty
          ? "empty"
          : "occupied"
        : "unknown");
    if (occupancy === "uncertain") occupancy = "unknown";
    if (!["occupied", "empty", "unknown"].includes(occupancy))
      throw Error("Invalid candidate occupancy");
    const group =
      v.color_group_candidate || (pindou ? v.colorCode : null) || null;
    const pal = palette.find(
      (x: any) =>
        x.group === group || x.color_group === group || x.id === group,
    );
    const hex = v.detectedColor || pal?.hex;
    const rgb =
      v.rgb ||
      pal?.representative_rgb ||
      pal?.rgb ||
      (typeof hex === "string" && /^#[a-f0-9]{6}$/i.test(hex)
        ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        : null);
    if (
      rgb &&
      (!Array.isArray(rgb) ||
        rgb.length !== 3 ||
        !rgb.every((n: any) => Number.isFinite(n) && n >= 0 && n <= 255))
    )
      throw Error("Invalid candidate RGB");
    const code = v.official_code || (!pindou ? v.colorCode : null) || null;
    if (code !== null && typeof code !== "string")
      throw Error("Candidate code must be text");
    const candidate: Candidate = {
      occupancy,
      rgb,
      group,
      code,
      confidence: typeof v.confidence === "number" ? v.confidence : null,
      source: "Imported suggestion; not independently reviewed",
      at: now(),
    };
    const before = p.cells[index];
    return {
      index,
      before,
      after: {
        ...before,
        candidate,
        review:
          before.review.status === "unreviewed"
            ? { ...before.review, status: "candidate-generated" as const }
            : before.review,
      },
    };
  });
  return commit(p, "candidate.imported", { cells }, [...seen]);
}
export const benchmarkId = (p: Project) =>
  p.meta.patternId
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[^a-z0-9]+/, "") || "pattern";
export function benchmark(p: Project) {
  const verified = (notes: string) => ({
    status: "verified",
    reviewer: p.meta.reviewer,
    reviewerKind: "human",
    independent: true,
    evidence: notes,
    reviewedAt: now(),
  });
  const un = { status: "unreviewed" };
  const q = quality(p);
  return {
    schemaVersion: "1.0",
    patternId: benchmarkId(p),
    revision: p.revision,
    verification: un,
    grid: {
      dimensions: {
        value: { rows: p.grid.geometry.rows, columns: p.grid.geometry.columns },
        verification:
          q.silver && p.grid.verification.independent
            ? {
                ...verified(p.grid.verification.notes),
                reviewer: p.grid.verification.reviewer,
                reviewedAt: p.grid.verification.at,
              }
            : un,
      },
      crop: {
        value: p.grid.geometry.crop,
        verification:
          q.silver && p.grid.verification.independent
            ? {
                ...verified(p.grid.verification.notes),
                reviewer: p.grid.verification.reviewer,
                reviewedAt: p.grid.verification.at,
              }
            : un,
      },
    },
    palette: {
      completeness: q.gold ? "complete" : "partial",
      verification: q.gold
        ? verified("Complete independently reviewed legend and cell grid")
        : un,
      entries: p.legend.map((e) => ({
        code: e.code,
        ...(q.gold
          ? {
              quantity: {
                value: p.cells.filter(
                  (c) =>
                    reviewed(p, c) &&
                    c.review.occupancy === "occupied" &&
                    c.review.code === e.code,
                ).length,
                verification: verified(
                  "Derived from complete independently reviewed cell annotations, separate from printed legend quantity",
                ),
              },
            }
          : {}),
        verification:
          q.silver && e.verification.independent
            ? {
                ...verified(e.verification.notes),
                reviewer: e.verification.reviewer,
                reviewedAt: e.verification.at,
              }
            : un,
      })),
    },
    cellCoverage: "complete",
    cells: p.cells.map((c) => ({
      row: c.row,
      column: c.column,
      occupancy: reviewed(p, c) ? c.review.occupancy : "unknown",
      ...(reviewed(p, c) && c.review.code
        ? {
            colorCode: c.review.code,
            colorVerification: {
              ...verified(c.review.evidenceSource),
              reviewer: c.review.reviewer,
              reviewedAt: c.review.at,
            },
          }
        : {}),
      verification: reviewed(p, c)
        ? {
            ...verified(c.review.evidenceSource),
            reviewer: c.review.reviewer,
            reviewedAt: c.review.at,
          }
        : un,
      ...(c.review.notes ? { notes: c.review.notes } : {}),
    })),
  };
}
export function download(name: string, blob: Blob) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export async function exportZip(p: Project, image: Blob, tier: string) {
  validateProject(p);
  if ((await sha(image)) !== p.source.sha256)
    throw Error("Original image SHA mismatch");
  const q = quality(p);
  if ((tier === "Gold" && !q.gold) || (tier === "Silver" && !q.silver))
    throw Error(`${tier} quality gates have not passed`);
  const enc = (x: unknown) => strToU8(JSON.stringify(x, null, 2));
  const csv = [
    "row,column,occupancy,code,status,reviewer,independently_verified",
    ...p.cells.map((c) =>
      [
        c.row,
        c.column,
        reviewed(p, c) ? c.review.occupancy : "unknown",
        reviewed(p, c) ? c.review.code || "" : "",
        c.review.status,
        c.review.reviewer,
        reviewed(p, c),
      ]
        .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
        .join(","),
    ),
  ].join("\n");
  const files = {
    ["source/" + p.source.filename]: new Uint8Array(await image.arrayBuffer()),
  };
  return new Blob(
    [
      zipSync({
        ...files,
        "studio-project.json": enc(p),
        "metadata.json": enc({
          schemaVersion: "1.0",
          tier,
          source: p.source,
          meta: p.meta,
        }),
        "annotations.json": enc(benchmark(p)),
        "benchmark-manifest.json": enc({
          schemaVersion: "1.0",
          datasetId: "studio-" + benchmarkId(p),
          version: "1.0." + p.revision,
          description:
            "Studio " +
            tier +
            " export; independent cell review and source provenance are explicit. Pattern ID normalized for benchmark compatibility; original ID retained in metadata.",
          samples: [
            {
              id: benchmarkId(p),
              familyId: benchmarkId(p),
              kind: p.meta.kind,
              split: p.meta.split,
              splitHistory: [
                {
                  split: p.meta.split,
                  at: now(),
                  reason:
                    "Reviewer-assigned split at export; consult full audit for edits. No automatic held-out independence guarantee.",
                },
              ],
              image: {
                file: "source/" + p.source.filename,
                width: p.source.width,
                height: p.source.height,
                sha256: p.source.sha256,
                provenance: {
                  status:
                    p.meta.kind === "synthetic"
                      ? "synthetic"
                      : p.meta.provenance === "unknown"
                        ? "derived"
                        : p.meta.provenance,
                  source:
                    p.meta.provenanceNotes ||
                    "Originality not established; uploaded bytes preserved",
                  transformations: [],
                  byteIdentity:
                    p.meta.kind === "synthetic"
                      ? "not-applicable"
                      : "not-verified",
                },
              },
              chart: { brand: p.meta.brand || null, type: "square-grid chart" },
              annotation: "annotations.json",
              ...(p.grid.verification.status === "verified"
                ? {
                    manualRecovery: {
                      geometry: p.grid.geometry,
                      source:
                        "Explicit Studio geometry, not automatic grid detection",
                    },
                  }
                : {}),
            },
          ],
        }),
        "legend.json": enc(p.legend),
        "audit.json": enc(p.audit),
        "validation-report.json": enc({
          ...q,
          tier,
          modelAccuracy: "not evaluated",
          reviewedQuantities: quantities(p).map((r) => ({
            code: r.code,
            reviewed: r.count,
            printed: r.printed,
            status: r.status,
            complete: r.complete,
            justification: r.resolution?.notes || null,
          })),
        }),
        "reviewed-cells.csv": strToU8(csv),
        "README.txt": strToU8(
          "Original bytes preserved. Coordinates are zero-based. Unknown cells are not empty. Candidates are not Ground Truth. Printed quantities are evidence, not inferred cell truth. Studio review history is self-reported, not cryptographically authenticated. No model accuracy is measured by this export.",
        ),
      }),
    ],
    { type: "application/zip" },
  );
}
export async function readZip(file: File) {
  if (file.size > 80 * 1024 * 1024)
    throw Error("ZIP exceeds 80 MB compressed limit");
  let expanded = 0,
    count = 0;
  const z = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      expanded += entry.originalSize;
      count++;
      if (
        count > 250 ||
        entry.originalSize > 64 * 1024 * 1024 ||
        expanded > 256 * 1024 * 1024 ||
        entry.name.startsWith("/") ||
        entry.name.split("/").includes("..")
      )
        throw Error("Unsafe or oversized ZIP");
      return true;
    },
  });
  const entries = Object.entries(z);
  if (
    entries.length > 250 ||
    entries.reduce((n, [, v]) => n + v.length, 0) > 256 * 1024 * 1024 ||
    entries.some(
      ([k, v]) =>
        k.split("/").includes("..") ||
        k.startsWith("/") ||
        v.length > 64 * 1024 * 1024,
    )
  )
    throw Error("Unsafe or oversized ZIP");
  const native = z["studio-project.json"];
  if (native) {
    const p = validateProject(JSON.parse(strFromU8(native)));
    const bytes = z["source/" + p.source.filename];
    if (!bytes) throw Error("ZIP lacks original source");
    const image = new Blob([bytes]);
    if ((await sha(image)) !== p.source.sha256)
      throw Error("Source hash mismatch");
    return [{ p: { ...p, id: uid() }, image }];
  }
  const out = [];
  for (const [name, bytes] of entries) {
    if (!/(^|\/)images\/[^/]+\.(png|jpe?g|webp)$/i.test(name)) continue;
    const filename = name.split("/").at(-1)!;
    const image = new File([bytes], filename, {
      type: /png$/i.test(name) ? "image/png" : "image/jpeg",
    });
    out.push({ p: await sourceProject(image), image });
  }
  if (!out.length) throw Error("No corpus images or Studio project found");
  return out;
}
