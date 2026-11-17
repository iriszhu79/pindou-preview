import type {
  Project,
  Cell,
  Review,
  Signoff,
  Patch,
  Command,
  Meta,
  Geometry,
  LegendEntry,
  Occupancy,
  Candidate,
  Evidence,
  ImportPreview,
} from "./types.ts";
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const emptySignoff = (): Signoff => ({
  status: "unreviewed",
  reviewer: "",
  at: null,
  independent: false,
  notes: "",
  eventId: null,
});
export const emptyReview = (revision: number): Review => ({
  status: "unreviewed",
  occupancy: "unknown",
  code: null,
  reviewer: "",
  at: null,
  independent: false,
  notes: "",
  evidenceSource: "",
  eventId: null,
  geometryRevision: revision,
  secondReviewer: null,
});
export function cellsFor(g: Geometry, revision: number): Cell[] {
  return Array.from({ length: g.rows * g.columns }, (_, i) => ({
    row: Math.floor(i / g.columns),
    column: i % g.columns,
    candidate: null,
    evidence: [],
    draft: { occupancy: "unknown", code: "" },
    review: emptyReview(revision),
  }));
}
export function validateGeometry(g: Geometry, width: number, height: number) {
  const { crop: c, rows, columns } = g;
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1 ||
    rows > 300 ||
    columns > 300 ||
    rows * columns > 40000 ||
    ![c.x, c.y, c.width, c.height].every(Number.isFinite) ||
    c.x < 0 ||
    c.y < 0 ||
    c.width < 1 ||
    c.height < 1 ||
    c.x + c.width > width + 0.001 ||
    c.y + c.height > height + 0.001 ||
    c.width / columns < 1 ||
    c.height / rows < 1
  )
    throw new Error(
      "Choose an in-image rectangle and 1–300 rows/columns, at most 40,000 cells and at least one source pixel per cell.",
    );
}
export function createProject(
  source: Project["source"],
  referenceClaims: unknown = null,
): Project {
  const time = now(),
    geometry = {
      rows: 20,
      columns: 20,
      crop: { x: 0, y: 0, width: source.width, height: source.height },
    },
    meta: Meta = {
      patternId:
        source.filename.split(/[_.]/)[0].replace(/[^a-zA-Z0-9-]/g, "-") ||
        "pattern",
      title: source.filename,
      brand: "",
      reviewer: "",
      secondReviewer: "",
      kind: "real",
      purpose: "annotation",
      split: "development",
      provenance: "unknown",
      provenanceNotes: "",
      target: "Silver",
      referenceClaims,
    };
  return {
    format: "pindou.annotation-studio/project-v1",
    schemaVersion: "1.0",
    id: uid(),
    revision: 1,
    createdAt: time,
    updatedAt: time,
    source,
    meta,
    grid: { geometry, revision: 1, verification: emptySignoff() },
    legendRegion: null,
    legend: [],
    cells: cellsFor(geometry, 1),
    audit: [],
    archives: [],
    history: { undo: [], redo: [] },
  };
}
export function applyPatch(p: Project, patch: Patch, reverse = false): Project {
  const side = reverse ? "before" : "after";
  let n = { ...p };
  if (patch.frame) {
    n.grid = patch.frame[side].grid;
    n.cells = patch.frame[side].cells;
  }
  if (patch.cells) {
    n.cells = n.cells.slice();
    for (const c of patch.cells) n.cells[c.index] = c[side];
  }
  if (patch.meta) n.meta = patch.meta[side];
  if (patch.legend) n.legend = patch.legend[side];
  if (patch.region) n.legendRegion = patch.region[side];
  return n;
}
export function commit(
  p: Project,
  action: string,
  patch: Patch,
  scope: number[] = [],
  eventId = uid(),
  coalesceKey: string | null = null,
): Project {
  let n = applyPatch(p, patch);
  const command: Command = { id: eventId, action, patch, scope, coalesceKey };
  const undo = p.history.undo.slice();
  const last = undo.at(-1);
  if (
    coalesceKey &&
    last?.coalesceKey === coalesceKey &&
    patch.cells?.length === 1 &&
    last.patch.cells?.length === 1
  ) {
    undo[undo.length - 1] = {
      ...command,
      patch: {
        cells: [{ ...patch.cells[0], before: last.patch.cells[0].before }],
      },
    };
  } else undo.push(command);
  n = {
    ...n,
    revision: p.revision + 1,
    updatedAt: now(),
    audit: [
      ...p.audit,
      {
        id: eventId,
        sequence: p.audit.length + 1,
        at: now(),
        actor: n.meta.reviewer.trim() || "local operator (unidentified)",
        action,
        scope,
        patch,
        relatedEvent: null,
      },
    ],
    history: { undo: undo.slice(-100), redo: [] },
  };
  return n;
}
export function undo(p: Project, redo = false) {
  const from = redo ? p.history.redo : p.history.undo,
    c = from.at(-1);
  if (!c) return p;
  const n = applyPatch(p, c.patch, !redo);
  return {
    ...n,
    revision: p.revision + 1,
    updatedAt: now(),
    audit: [
      ...p.audit,
      {
        id: uid(),
        sequence: p.audit.length + 1,
        at: now(),
        actor: p.meta.reviewer.trim() || "local operator",
        action: redo ? "history.redo" : "history.undo",
        scope: c.scope,
        patch: null,
        relatedEvent: c.id,
      },
    ],
    history: redo
      ? { undo: [...p.history.undo, c], redo: from.slice(0, -1) }
      : { undo: from.slice(0, -1), redo: [...p.history.redo, c] },
  };
}
export function changeGeometry(p: Project, g: Geometry) {
  validateGeometry(g, p.source.width, p.source.height);
  const revision = p.grid.revision + 1;
  const before = { grid: p.grid, cells: p.cells },
    after = {
      grid: { geometry: g, revision, verification: emptySignoff() },
      cells: cellsFor(g, revision),
    };
  const n = commit(p, "grid.changed", { frame: { before, after } });
  return {
    ...n,
    archives: [
      ...p.archives,
      {
        at: now(),
        reason:
          "Geometry changed: prior evidence/reviews retained, never transferred to a new grid automatically.",
        frame: before,
      },
    ],
  };
}
export function signGrid(p: Project, notes: string, attest: boolean) {
  if (!p.meta.reviewer.trim() || !notes.trim() || !attest)
    throw new Error(
      "Name the reviewer, describe alignment evidence, and explicitly confirm first, last and intermediate lines.",
    );
  const id = uid();
  return commit(
    p,
    "grid.verified",
    {
      frame: {
        before: { grid: p.grid, cells: p.cells },
        after: {
          grid: {
            ...p.grid,
            verification: {
              status: "verified",
              reviewer: p.meta.reviewer.trim(),
              at: now(),
              independent: p.meta.purpose === "annotation",
              notes: notes.trim(),
              eventId: id,
            },
          },
          cells: p.cells,
        },
      },
    },
    [],
    id,
  );
}
export function editDraft(
  p: Project,
  indices: number[],
  draft: Partial<Cell["draft"]>,
  label = "draft.assigned",
  coalesce: string | null = null,
) {
  const cells = indices.map((index) => {
    const c = p.cells[index];
    if (!c) throw new Error("Cell address out of range");
    const d = { ...c.draft, ...draft };
    if (d.occupancy !== "occupied") d.code = "";
    return {
      index,
      before: c,
      after: { ...c, draft: d, review: emptyReview(p.grid.revision) },
    };
  });
  return commit(p, label, { cells }, indices, undefined, coalesce);
}
export function reviewCells(
  p: Project,
  indices: number[],
  status: "confirmed" | "corrected" | "ambiguous" | "unreadable",
  notes: string,
  evidence: string,
  attest: boolean,
) {
  if (p.grid.verification.status !== "verified")
    throw new Error("Confirm grid geometry before reviewing cells.");
  if (!p.meta.reviewer.trim() || !evidence.trim())
    throw new Error("Reviewer name and evidence source are required.");
  if (["confirmed", "corrected"].includes(status) && !attest)
    throw new Error("Explicit independent source inspection is required.");
  if (["ambiguous", "unreadable"].includes(status) && !notes.trim())
    throw new Error("Record why the cell is unresolved.");
  const id = uid(),
    time = now();
  const cells = indices.map((index) => {
    const c = p.cells[index];
    if (!c) throw new Error("Cell address out of range");
    const unknown = ["ambiguous", "unreadable"].includes(status),
      occupancy: Occupancy = unknown ? "unknown" : c.draft.occupancy,
      code = unknown || occupancy !== "occupied" ? null : c.draft.code.trim();
    if (
      !unknown &&
      (occupancy === "unknown" || (occupancy === "occupied" && !code))
    )
      throw new Error(
        "Every reviewed cell needs occupied + a code, or empty. Keep unresolved cells ambiguous instead.",
      );
    return {
      index,
      before: c,
      after: {
        ...c,
        review: {
          status,
          occupancy,
          code,
          reviewer: p.meta.reviewer.trim(),
          at: time,
          independent: p.meta.purpose === "annotation" && attest,
          notes: notes.trim(),
          evidenceSource: evidence.trim(),
          eventId: id,
          geometryRevision: p.grid.revision,
          secondReviewer: null,
        } as Review,
      },
    };
  });
  return commit(p, "cells.reviewed." + status, { cells }, indices, id);
}
export const reviewed = (p: Project, c: Cell) =>
  p.meta.purpose === "annotation" &&
  ["confirmed", "corrected"].includes(c.review.status) &&
  c.review.independent &&
  c.review.geometryRevision === p.grid.revision &&
  c.review.occupancy !== "unknown" &&
  (c.review.occupancy === "empty" || !!c.review.code);
export function evidenceFor(p: Project, index: number, text: string) {
  if (!p.meta.reviewer.trim())
    throw new Error("Enter an evidence author/reviewer name.");
  const c = p.cells[index],
    e: Evidence = {
      id: uid(),
      channel: "printed-code",
      provider: "manual-transcription",
      value: text.trim(),
      at: now(),
      author: p.meta.reviewer.trim(),
      bounds: cellBounds(p, index),
      confidence: null,
      source: "Manual reading of the source cell, not a final annotation",
    };
  return commit(
    p,
    "evidence.transcribed",
    {
      cells: [
        { index, before: c, after: { ...c, evidence: [...c.evidence, e] } },
      ],
    },
    [index],
  );
}
export function cellBounds(p: Project, index: number) {
  const g = p.grid.geometry,
    row = Math.floor(index / g.columns),
    column = index % g.columns;
  return {
    x: g.crop.x + (column * g.crop.width) / g.columns,
    y: g.crop.y + (row * g.crop.height) / g.rows,
    width: g.crop.width / g.columns,
    height: g.crop.height / g.rows,
  };
}
export function cellAtPoint(x: number, y: number, g: Geometry) {
  if (
    x < g.crop.x ||
    y < g.crop.y ||
    x >= g.crop.x + g.crop.width ||
    y >= g.crop.y + g.crop.height
  )
    return null;
  return (
    Math.floor(((y - g.crop.y) / g.crop.height) * g.rows) * g.columns +
    Math.floor(((x - g.crop.x) / g.crop.width) * g.columns)
  );
}
export function matrixPoint(
  x: number,
  y: number,
  size: number,
  scroll: { left: number; top: number },
  rows: number,
  columns: number,
) {
  const c = Math.floor((x + scroll.left) / size),
    r = Math.floor((y + scroll.top) / size);
  return r >= 0 && c >= 0 && r < rows && c < columns ? r * columns + c : null;
}
export function rectangleSelection(
  anchor: number,
  target: number,
  columns: number,
) {
  const ar = Math.floor(anchor / columns),
    ac = anchor % columns,
    br = Math.floor(target / columns),
    bc = target % columns,
    out = [];
  for (let r = Math.min(ar, br); r <= Math.max(ar, br); r++)
    for (let c = Math.min(ac, bc); c <= Math.max(ac, bc); c++)
      out.push(r * columns + c);
  return out;
}
export function quantities(p: Project) {
  const counts = new Map<string, number>();
  for (const c of p.cells)
    if (reviewed(p, c) && c.review.occupancy === "occupied")
      counts.set(c.review.code!, 1 + (counts.get(c.review.code!) || 0));
  const complete = p.cells.every((c) => reviewed(p, c));
  const rows = p.legend.map((e) => {
    const count = counts.get(e.code) || 0;
    const resolution =
      e.resolution &&
      e.resolution.count === count &&
      e.resolution.quantity === e.quantity &&
      e.resolution.gridRevision === p.grid.revision
        ? e.resolution
        : null;
    const status =
      e.verification.status !== "verified"
        ? "unverified"
        : e.quantity === null
          ? "unknown"
          : count > e.quantity
            ? "conflicting"
            : complete && count === e.quantity
              ? "matching"
              : count < e.quantity
                ? "missing"
                : "unknown";
    return {
      entry: e,
      code: e.code,
      count,
      printed: e.quantity,
      status,
      complete,
      resolution,
    };
  });
  for (const [code, count] of counts)
    if (!p.legend.some((e) => e.code === code))
      rows.push({
        entry: null as unknown as LegendEntry,
        code,
        count,
        printed: null,
        status: "missing",
        complete,
        resolution: null,
      });
  return rows;
}
export function auditProblems(p: Project) {
  const events = new Map(p.audit.map((e) => [e.id, e]));
  const problems: string[] = [];
  if (
    p.audit.some((e, i) => e.sequence !== i + 1) ||
    events.size !== p.audit.length
  )
    problems.push("Audit sequence/IDs are invalid");
  if (p.grid.verification.status === "verified") {
    const e = events.get(p.grid.verification.eventId || "");
    if (
      !e ||
      e.action !== "grid.verified" ||
      e.actor !== p.grid.verification.reviewer ||
      JSON.stringify(e.patch?.frame?.after.grid) !== JSON.stringify(p.grid)
    )
      problems.push("Grid sign-off is not backed by its audit event");
  }
  for (const c of p.cells)
    if (
      ["confirmed", "corrected", "ambiguous", "unreadable"].includes(
        c.review.status,
      )
    ) {
      const e = events.get(c.review.eventId || ""),
        index = c.row * p.grid.geometry.columns + c.column,
        after = e?.patch?.cells?.find((x) => x.index === index)?.after;
      if (
        !e ||
        !e.action.startsWith("cells.reviewed.") ||
        e.actor !== c.review.reviewer ||
        JSON.stringify(after?.review) !== JSON.stringify(c.review)
      )
        problems.push(
          `Cell ${c.row + 1},${c.column + 1} review is not backed by its audit event`,
        );
    }
  for (const entry of p.legend) {
    if (entry.verification.status === "verified") {
      const e = events.get(entry.verification.eventId || "");
      const saved = e?.patch?.legend?.after.find((x) => x.id === entry.id);
      if (
        !e ||
        e.actor !== entry.verification.reviewer ||
        JSON.stringify(saved?.verification) !==
          JSON.stringify(entry.verification)
      )
        problems.push(
          "Legend verification lacks audit evidence: " + entry.code,
        );
    }
    if (entry.resolution) {
      const e = events.get(entry.resolution.eventId);
      const saved = e?.patch?.legend?.after.find((x) => x.id === entry.id);
      if (
        !e ||
        e.actor !== entry.resolution.reviewer ||
        JSON.stringify(saved?.resolution) !== JSON.stringify(entry.resolution)
      )
        problems.push(
          "Legend adjudication lacks audit evidence: " + entry.code,
        );
    }
  }
  return problems;
}
export function quality(p: Project) {
  const audit = auditProblems(p),
    geometry =
      p.grid.verification.status === "verified" &&
      p.grid.verification.independent,
    verified = p.cells.filter((c) => reviewed(p, c)).length,
    unresolved = p.cells.length - verified;
  const counted = quantities(p),
    legend =
      p.legend.length > 0 &&
      p.legend.every(
        (e) =>
          e.verification.status === "verified" && e.verification.independent,
      ) &&
      counted.every(
        (q) => !!q.entry && (q.status === "matching" || !!q.resolution),
      );
  const checks = [
    {
      label: "Annotation mode (not practice)",
      ok: p.meta.purpose === "annotation",
    },
    {
      label: "Source provenance documented",
      ok: p.meta.provenance !== "unknown" && !!p.meta.provenanceNotes.trim(),
    },
    { label: "Full geometry independently verified", ok: geometry },
    { label: "Every cell independently resolved", ok: unresolved === 0 },
    {
      label: "Every occupied code represented in verified legend",
      ok: p.cells
        .filter((c) => reviewed(p, c) && c.review.occupancy === "occupied")
        .every((c) =>
          p.legend.some(
            (e) =>
              e.code === c.review.code &&
              e.verification.status === "verified" &&
              e.verification.independent,
          ),
        ),
    },
    {
      label: "Printed quantity discrepancies resolved or explicitly justified",
      ok: legend,
    },
    { label: "Review audit is complete", ok: audit.length === 0 },
  ];
  return {
    checks,
    gold: checks.every((c) => c.ok),
    silver:
      p.meta.purpose === "annotation" &&
      audit.length === 0 &&
      (geometry ||
        verified > 0 ||
        p.legend.some(
          (e) =>
            e.verification.status === "verified" && e.verification.independent,
        )),
    verified,
    unresolved,
    audit,
  };
}
