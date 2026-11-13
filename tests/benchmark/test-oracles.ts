import type { Annotation, Sample, Verification } from "./types.ts";
import type { Recognition } from "../../src/recognition.ts";
const v: Verification = {
  status: "verified",
  reviewer: "Explicit unit-test oracle",
  reviewerKind: "synthetic-generator",
  independent: true,
  evidence:
    "Hand-specified confusion matrix, independent of recognition predictions",
  reviewedAt: "2026-11-13T00:00:00Z",
};
const draft: Verification = { status: "unreviewed" };
export function oracle() {
  const sample = { kind: "synthetic" } as Sample;
  const a: Annotation = {
    schemaVersion: "1.0",
    patternId: "oracle",
    revision: 1,
    verification: v,
    grid: {
      dimensions: { value: { rows: 2, columns: 3 }, verification: v },
      crop: { value: { x: 0, y: 0, width: 30, height: 20 }, verification: v },
    },
    palette: {
      completeness: "complete",
      verification: v,
      entries: [
        {
          code: "RED",
          verification: v,
          quantity: { value: 2, verification: v },
          swatch: { value: [240, 40, 60], verification: v },
        },
        {
          code: "BLUE",
          verification: v,
          quantity: { value: 1, verification: v },
          swatch: { value: [20, 40, 220], verification: v },
        },
      ],
    },
    mappingPolicy: {
      value: { maxDistance: 0.04, minMargin: 0.01 },
      verification: v,
    },
    cellCoverage: "complete",
    cells: [
      {
        row: 0,
        column: 0,
        occupancy: "occupied",
        verification: v,
        colorCode: "RED",
        colorVerification: v,
      },
      { row: 0, column: 1, occupancy: "empty", verification: v },
      {
        row: 0,
        column: 2,
        occupancy: "occupied",
        verification: v,
        colorCode: "BLUE",
        colorVerification: v,
      },
      {
        row: 1,
        column: 0,
        occupancy: "unknown",
        verification: { status: "ambiguous" },
      },
      {
        row: 1,
        column: 1,
        occupancy: "occupied",
        verification: draft,
        colorCode: "RED",
        colorVerification: draft,
      },
      { row: 1, column: 2, occupancy: "empty", verification: v },
    ],
  };
  const r: Recognition = {
    rows: 2,
    columns: 3,
    crop: { x: 0, y: 0, width: 30, height: 20 },
    method: "test predictions",
    warnings: [],
    palette: [
      { code: "Color 1", name: "temporary", hex: "#f0283c" },
      { code: "Color 2", name: "temporary", hex: "#1428dc" },
    ],
    cells: [0, 1, 2, 3, 4, 5].map((i) => ({
      row: Math.floor(i / 3),
      column: i % 3,
      colorCode: [0, 3].includes(i) ? "Color 1" : i === 1 ? "Color 2" : null,
      isEmpty: [2, 4, 5].includes(i),
      isCompleted: false,
      confidence: i === 5 ? 0.6 : 0.95,
      detectedColor: "#ffffff",
    })),
  };
  return { sample, a, r };
}
