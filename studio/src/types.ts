import type { Crop, Geometry } from "../../src/recognition.ts";
export type { Crop, Geometry };
export type Occupancy = "occupied" | "empty" | "unknown";
export type Status =
  | "unreviewed"
  | "candidate-generated"
  | "confirmed"
  | "corrected"
  | "ambiguous"
  | "unreadable";
export type Signoff = {
  status: "unreviewed" | "verified";
  reviewer: string;
  at: string | null;
  independent: boolean;
  notes: string;
  eventId: string | null;
};
export type Evidence = {
  id: string;
  channel: "background-color" | "printed-code";
  provider:
    | "deterministic-sampling"
    | "manual-transcription"
    | "import"
    | "ocr";
  value: string | number[];
  at: string;
  author: string;
  bounds: Crop | null;
  confidence: number | null;
  source: string;
};
export type Candidate = {
  occupancy: Occupancy;
  rgb: number[] | null;
  group: string | null;
  code: string | null;
  confidence: number | null;
  source: string;
  at: string;
};
export type Review = {
  status: Status;
  occupancy: Occupancy;
  code: string | null;
  reviewer: string;
  at: string | null;
  independent: boolean;
  notes: string;
  evidenceSource: string;
  eventId: string | null;
  geometryRevision: number;
  secondReviewer: {
    reviewer: string;
    at: string;
    notes: string;
    decision: string;
  } | null;
};
export type Cell = {
  row: number;
  column: number;
  candidate: Candidate | null;
  evidence: Evidence[];
  draft: { occupancy: Occupancy; code: string };
  review: Review;
};
export type Grid = {
  geometry: Geometry;
  revision: number;
  verification: Signoff;
};
export type LegendEntry = {
  id: string;
  brand: string;
  code: string;
  rgb: number[] | null;
  quantity: number | null;
  location: string;
  verification: Signoff;
  resolution: null | {
    notes: string;
    reviewer: string;
    at: string;
    eventId: string;
    count: number;
    quantity: number | null;
    gridRevision: number;
  };
};
export type Region = { rect: Crop; verification: Signoff };
export type Meta = {
  patternId: string;
  title: string;
  brand: string;
  reviewer: string;
  secondReviewer: string;
  kind: "real" | "synthetic";
  purpose: "annotation" | "practice";
  split: "development" | "held-out";
  provenance:
    | "original"
    | "repository-screenshot"
    | "conversation-copy"
    | "derived"
    | "unknown";
  provenanceNotes: string;
  target: "Gold" | "Silver";
  referenceClaims: unknown;
};
export type Frame = { grid: Grid; cells: Cell[] };
export type Patch = {
  cells?: { index: number; before: Cell; after: Cell }[];
  frame?: { before: Frame; after: Frame };
  meta?: { before: Meta; after: Meta };
  legend?: { before: LegendEntry[]; after: LegendEntry[] };
  region?: { before: Region | null; after: Region | null };
};
export type Event = {
  id: string;
  sequence: number;
  at: string;
  actor: string;
  action: string;
  scope: number[];
  patch: Patch | null;
  relatedEvent: string | null;
};
export type Command = {
  id: string;
  action: string;
  patch: Patch;
  scope: number[];
  coalesceKey: string | null;
};
export type Project = {
  format: "pindou.annotation-studio/project-v1";
  schemaVersion: "1.0";
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  source: {
    filename: string;
    mime: string;
    sha256: string;
    width: number;
    height: number;
    bytes: number;
  };
  meta: Meta;
  grid: Grid;
  legendRegion: Region | null;
  legend: LegendEntry[];
  cells: Cell[];
  audit: Event[];
  archives: { at: string; reason: string; frame: Frame }[];
  history: { undo: Command[]; redo: Command[] };
};
export type Backup = {
  format: "pindou.annotation-studio/backup-v1";
  schemaVersion: "1.0";
  project: Project;
  sourceImage?: { base64: string; mime: string };
};
export type ImportPreview = {
  rows: number;
  columns: number;
  geometry: Geometry | null;
  sourceHash: string | null;
  patternId: string | null;
  coordinateBase: 0 | 1;
  cells: unknown[];
  palette: unknown[];
  format: "pindou" | "legacy-candidate" | "generic";
  raw: unknown;
  notes: string[];
};
