import type { Annotation, Sample } from "./types.ts";
import { isIndependent } from "./types.ts";
import type {
  Raster,
  Recognition,
  GridDiagnostics,
  Geometry,
} from "../../src/recognition.ts";
import { cropError } from "./metrics.ts";
export function diagnostics(
  image: Pick<Raster, "width" | "height">,
  sample: Sample,
  a: Annotation,
  r: Recognition | null,
  grid: GridDiagnostics | undefined,
  mode: "automatic" | "manual",
) {
  const candidates = (grid?.candidates ?? []).map((c, rank) => ({
    rank: rank + 1,
    ...c,
    disposition:
      r &&
      c.geometry.rows === r.rows &&
      c.geometry.columns === r.columns &&
      JSON.stringify(c.geometry.crop) === JSON.stringify(r.crop)
        ? "selected"
        : !r && rank === 0
          ? "best-rejected"
          : "alternative-not-selected",
    rejectionReason: !r && rank === 0 ? (grid?.rejection ?? null) : null,
    reasonAvailability:
      rank > 0
        ? "Existing detector does not expose per-alternative rejection reasons"
        : "selection/global rejection",
  }));
  const geometry = r
    ? { rows: r.rows, columns: r.columns, crop: r.crop }
    : sample.manualRecovery?.geometry;
  const validBounds = (g: Geometry) =>
    g.crop.x >= 0 &&
    g.crop.y >= 0 &&
    g.crop.x + g.crop.width <= image.width &&
    g.crop.y + g.crop.height <= image.height;
  const addresses = new Set(r?.cells.map((c) => c.row + ":" + c.column) ?? []);
  return {
    schemaVersion: "1.0",
    rawImageIncluded: false,
    mode,
    grid: {
      stage:
        grid?.stage ?? (mode === "manual" ? "manual-input" : "not-available"),
      rejection: grid?.rejection ?? null,
      candidates,
      evidence: grid?.evidence ?? null,
      colorPhase: grid?.colorPhase ?? null,
      legacy: {
        stage: grid?.legacy?.stage ?? null,
        rejection: grid?.legacy?.rejection ?? null,
      },
    },
    completeness: {
      structural: r
        ? {
            expectedAddresses: r.rows * r.columns,
            actualCells: r.cells.length,
            uniqueAddresses: addresses.size,
            completeAddressSet: addresses.size === r.rows * r.columns,
            boundsInsideImage: validBounds(r),
          }
        : null,
      referenceCoverage:
        r &&
        a.grid?.crop &&
        isIndependent(a.grid.crop.verification, sample.kind)
          ? cropError(r.crop, a.grid.crop.value)
          : null,
      fullChartTruthStatus:
        a.grid?.crop && isIndependent(a.grid.crop.verification, sample.kind)
          ? "Compare numeric reference crop coverage; structural address completeness alone does not prove whole-chart detection"
          : "Not evaluated: no independently verified whole-grid bounds",
      manualInputBounds:
        mode === "manual" && geometry ? validBounds(geometry) : null,
    },
    occupancy:
      r?.cells.map((c) => ({
        row: c.row,
        column: c.column,
        provisional: c.isEmpty ? "empty" : "occupied",
        decision: c.occupancy ?? "not-exposed",
        occupancyConfidence: c.occupancyConfidence ?? null,
        reason: c.occupancyReason ?? "not-exposed",
        colorCode: c.colorCode,
        colorConfidence: c.colorConfidence ?? null,
        confidence: c.confidence,
        detectedColor: c.detectedColor,
      })) ?? [],
    clustering:
      r?.palette.map((p) => ({
        ...p,
        count: r.cells.filter((c) => !c.isEmpty && c.colorCode === p.code)
          .length,
        uncertainMembers: r.cells.filter(
          (c) => !c.isEmpty && c.colorCode === p.code && c.confidence < 0.7,
        ).length,
      })) ?? [],
    legendRegion: {
      detectionStatus: "not-implemented",
      annotationStatus: a.legend?.verification.status ?? "not-annotated",
      referenceRegion: a.legend?.value ?? null,
      note: "Reference annotation is not a model-detected legend; no legend OCR is run",
    },
  };
}
