import type { Crop, Geometry } from "../../src/recognition.ts";
export type Verification = {
  status: "unreviewed" | "verified" | "ambiguous";
  reviewer?: string;
  reviewerKind?: "human" | "assistant" | "synthetic-generator" | "recognizer";
  independent?: boolean;
  evidence?: string;
  reviewedAt?: string;
};
export type Verified<T> = { value: T; verification: Verification };
export type CellAnnotation = {
  row: number;
  column: number;
  occupancy: "occupied" | "empty" | "unknown";
  verification: Verification;
  colorCode?: string | null;
  colorVerification?: Verification;
  evidence?: string;
  notes?: string;
};
export type Annotation = {
  schemaVersion: "1.0";
  patternId: string;
  revision: number;
  verification: Verification;
  grid: null | {
    dimensions: Verified<{ rows: number; columns: number }>;
    crop?: Verified<Crop>;
  };
  legend?: Verified<Crop>;
  palette: {
    completeness: "partial" | "complete";
    verification: Verification;
    entries: {
      code: string;
      verification: Verification;
      quantity?: Verified<number>;
      swatch?: Verified<[number, number, number]>;
    }[];
  };
  mappingPolicy?: Verified<{ maxDistance: number; minMargin: number }>;
  cellCoverage: "partial" | "complete";
  cells: CellAnnotation[];
};
export type Sample = {
  id: string;
  familyId: string;
  kind: "real" | "synthetic";
  split: "development" | "held-out";
  splitHistory: {
    split: "development" | "held-out";
    at: string;
    reason: string;
  }[];
  image: {
    file: string;
    width: number;
    height: number;
    sha256: string;
    original?: { width: number; height: number; sha256: string | null };
    provenance: {
      status:
        | "original"
        | "repository-screenshot"
        | "conversation-copy"
        | "derived"
        | "synthetic";
      source: string;
      transformations: string[];
      byteIdentity: "verified" | "not-verified" | "not-applicable";
    };
  };
  chart: { brand: string | null; type: string };
  annotation: string;
  manualRecovery?: { geometry: Geometry; source: string };
};
export type Dataset = {
  schemaVersion: "1.0";
  datasetId: string;
  version: string;
  description: string;
  samples: Sample[];
};
export type Metric<T> =
  | { status: "evaluated"; value: T; denominator?: number }
  | { status: "not-evaluated"; reason: string };
export function isIndependent(
  v: Verification | undefined,
  kind: "real" | "synthetic",
): boolean {
  return (
    v?.status === "verified" &&
    v.independent === true &&
    !!v.reviewer &&
    !!v.evidence &&
    (v.reviewerKind === "human" ||
      (kind === "synthetic" && v.reviewerKind === "synthetic-generator"))
  );
}
