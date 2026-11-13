import type { Annotation, Sample, Metric } from "./types.ts";
import { isIndependent } from "./types.ts";
import type { Recognition, Crop } from "../../src/recognition.ts";
import { toOKLab, perceptualDistance } from "../../src/cellClassification.ts";
export const notEvaluated = (reason: string): Metric<never> => ({
  status: "not-evaluated",
  reason,
});
const evaluated = <T>(value: T, denominator?: number): Metric<T> => ({
  status: "evaluated",
  value,
  ...(denominator === undefined ? {} : { denominator }),
});
const hexRGB = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
export function cropError(actual: Crop, expected: Crop) {
  const intersection =
    Math.max(
      0,
      Math.min(actual.x + actual.width, expected.x + expected.width) -
        Math.max(actual.x, expected.x),
    ) *
    Math.max(
      0,
      Math.min(actual.y + actual.height, expected.y + expected.height) -
        Math.max(actual.y, expected.y),
    );
  const errors = [
    actual.x - expected.x,
    actual.y - expected.y,
    actual.x + actual.width - expected.x - expected.width,
    actual.y + actual.height - expected.y - expected.height,
  ];
  return {
    iou:
      intersection /
      (actual.width * actual.height +
        expected.width * expected.height -
        intersection),
    referenceCoverage: intersection / (expected.width * expected.height),
    edgeRMSErrorPx: Math.sqrt(errors.reduce((s, v) => s + v * v, 0) / 4),
    maxEdgeErrorPx: Math.max(...errors.map(Math.abs)),
  };
}
export function paletteMapping(sample: Sample, a: Annotation, r: Recognition) {
  const eligible =
    a.palette.completeness === "complete" &&
    isIndependent(a.palette.verification, sample.kind) &&
    isIndependent(a.mappingPolicy?.verification, sample.kind) &&
    a.palette.entries.length > 0 &&
    a.palette.entries.every(
      (p) =>
        isIndependent(p.verification, sample.kind) &&
        isIndependent(p.swatch?.verification, sample.kind),
    );
  if (!eligible)
    return {
      eligible: false,
      reason:
        "A complete independently verified palette, reference swatches and mapping policy are required",
      groups: [] as {
        predictedCode: string;
        referenceCode: string | null;
        distance: number | null;
        margin: number | null;
      }[],
    };
  const policy = a.mappingPolicy!.value;
  return {
    eligible: true,
    reason: null,
    groups: r.palette.map((p) => {
      const distances = a.palette.entries
        .map((ref) => ({
          code: ref.code,
          d: perceptualDistance(
            toOKLab(hexRGB(p.hex)),
            toOKLab(ref.swatch!.value),
          ),
        }))
        .sort((x, y) => x.d - y.d);
      const first = distances[0],
        margin = distances.length > 1 ? distances[1].d - first.d : 1;
      return {
        predictedCode: p.code,
        referenceCode:
          first.d <= policy.maxDistance && margin >= policy.minMargin
            ? first.code
            : null,
        distance: first.d,
        margin,
      };
    }),
  };
}
export function evaluate(
  sample: Sample,
  a: Annotation,
  r: Recognition | null,
  { officialCodesAvailable = false } = {},
) {
  const verified = (v: Parameters<typeof isIndependent>[0]) =>
    isIndependent(v, sample.kind);
  const dimensions =
    a.grid && verified(a.grid.dimensions.verification)
      ? a.grid.dimensions.value
      : null;
  const aligned =
    !!r &&
    !!dimensions &&
    r.rows === dimensions.rows &&
    r.columns === dimensions.columns;
  const mapping = r
    ? paletteMapping(sample, a, r)
    : {
        eligible: false,
        reason: "Recognition did not return a grid",
        groups: [],
      };
  const map = new Map(
    mapping.groups.map((g) => [g.predictedCode, g.referenceCode]),
  );
  const references = new Map(a.cells.map((c) => [c.row + ":" + c.column, c]));
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0,
    colors = 0,
    colorCorrect = 0,
    colorMapped = 0,
    codeCorrect = 0,
    incorrectlyConfident = 0;
  const differences: {
    row: number;
    column: number;
    truth: "verified" | "unknown" | "unverified" | "missing";
    colorTruth: "verified" | "unknown" | "unverified" | "not-applicable";
    occupancyError: "false-positive" | "false-negative" | null;
    wrongColor: boolean | null;
    modelUncertain: boolean;
    incorrectlyConfident: boolean;
  }[] = [];
  if (r)
    for (const c of r.cells) {
      const ref = references.get(c.row + ":" + c.column),
        truth = !ref
          ? "missing"
          : ref.occupancy === "unknown"
            ? "unknown"
            : verified(ref.verification)
              ? "verified"
              : "unverified";
      let occupancyError: "false-positive" | "false-negative" | null = null,
        wrongColor: boolean | null = null;
      if (aligned && truth === "verified") {
        if (ref!.occupancy === "occupied") {
          if (c.isEmpty) {
            fn++;
            occupancyError = "false-negative";
          } else tp++;
        } else if (c.isEmpty) tn++;
        else {
          fp++;
          occupancyError = "false-positive";
        }
        if (
          ref!.occupancy === "occupied" &&
          ref!.colorCode &&
          verified(ref!.colorVerification)
        ) {
          if (
            officialCodesAvailable &&
            c.colorCode === ref!.colorCode &&
            !c.isEmpty
          )
            codeCorrect++;
          if (mapping.eligible) {
            colors++;
            const mapped = map.get(c.colorCode ?? "");
            if (mapped) colorMapped++;
            if (!c.isEmpty && mapped === ref!.colorCode) colorCorrect++;
            wrongColor = c.isEmpty ? null : mapped !== ref!.colorCode;
          }
        }
      }
      const wrong = !!occupancyError || wrongColor === true,
        confident = wrong && c.confidence >= 0.7;
      if (confident) incorrectlyConfident++;
      differences.push({
        row: c.row,
        column: c.column,
        truth,
        colorTruth:
          ref?.occupancy !== "occupied"
            ? "not-applicable"
            : !ref.colorCode
              ? "unknown"
              : verified(ref.colorVerification)
                ? "verified"
                : "unverified",
        occupancyError,
        wrongColor,
        modelUncertain: !c.corrected && c.confidence < 0.7,
        incorrectlyConfident: confident,
      });
    }
  const occupancyN = tp + fp + fn + tn,
    verifiedColorN = a.cells.filter(
      (c) =>
        verified(c.verification) &&
        c.occupancy === "occupied" &&
        c.colorCode &&
        verified(c.colorVerification),
    ).length;
  const completePalette =
    a.palette.completeness === "complete" &&
    verified(a.palette.verification) &&
    a.palette.entries.every((p) => verified(p.verification));
  const quantitiesKnown =
    completePalette &&
    a.palette.entries.every(
      (p) => p.quantity && verified(p.quantity.verification),
    );
  const total = r ? r.cells.filter((c) => !c.isEmpty).length : 0;
  const perCodeEligible =
    !!r &&
    quantitiesKnown &&
    mapping.eligible &&
    mapping.groups.every((g) => !!g.referenceCode);
  const perCode = perCodeEligible
    ? evaluated(
        a.palette.entries.map((p) => {
          const predicted = r!.cells.filter(
            (c) => !c.isEmpty && map.get(c.colorCode ?? "") === p.code,
          ).length;
          return {
            code: p.code,
            expected: p.quantity!.value,
            predicted,
            delta: predicted - p.quantity!.value,
          };
        }),
      )
    : notEvaluated(
        "Complete verified quantities and unambiguous color mapping for every predicted group are required",
      );
  const expectedTotal = quantitiesKnown
    ? a.palette.entries.reduce((n, p) => n + p.quantity!.value, 0)
    : null;
  return {
    dimensions: dimensions
      ? evaluated({
          expected: dimensions,
          actual: r ? { rows: r.rows, columns: r.columns } : null,
          correct: aligned,
        })
      : notEvaluated("Grid dimensions are not independently verified"),
    crop:
      r && a.grid?.crop && verified(a.grid.crop.verification)
        ? evaluated(cropError(r.crop, a.grid.crop.value))
        : notEvaluated(
            "Verified reference crop or recognition result is unavailable",
          ),
    occupancy:
      aligned && occupancyN
        ? evaluated(
            {
              tp,
              fp,
              fn,
              tn,
              precision: tp + fp ? tp / (tp + fp) : null,
              recall: tp + fn ? tp / (tp + fn) : null,
            },
            occupancyN,
          )
        : notEvaluated(
            !aligned
              ? dimensions
                ? "Predicted grid dimensions do not align with verified reference"
                : "Reference grid dimensions are not independently verified"
              : "No independently verified occupied/empty labels",
          ),
    occupiedColor:
      aligned && mapping.eligible && colors
        ? evaluated(
            {
              correct: colorCorrect,
              total: colors,
              accuracy: colorCorrect / colors,
              mappedPredictions: colorMapped,
              unmappedOrMissed: colors - colorMapped,
            },
            colors,
          )
        : notEvaluated(
            !aligned
              ? dimensions
                ? "Predicted grid dimensions do not align with verified reference"
                : "Reference grid dimensions are not independently verified"
              : mapping.reason ||
                  "No independently verified occupied-cell colors",
          ),
    codeMapping:
      officialCodesAvailable && aligned && verifiedColorN
        ? evaluated(
            {
              correct: codeCorrect,
              total: verifiedColorN,
              accuracy: codeCorrect / verifiedColorN,
            },
            verifiedColorN,
          )
        : notEvaluated(
            "Existing recognizer emits temporary group codes; official-code prediction is not implemented",
          ),
    paletteGroups:
      r && completePalette
        ? evaluated({
            expected: a.palette.entries.length,
            predicted: r.palette.length,
            delta: r.palette.length - a.palette.entries.length,
          })
        : notEvaluated(
            "Verified complete palette inventory or prediction is unavailable",
          ),
    beadCount:
      r && expectedTotal !== null
        ? evaluated({
            expected: expectedTotal,
            predicted: total,
            delta: total - expectedTotal,
          })
        : notEvaluated(
            "Verified complete palette quantities or prediction is unavailable",
          ),
    perCodeQuantities: perCode,
    paletteMapping: mapping,
    uncertainty: r
      ? {
          criterion:
            "Existing review convention: uncorrected model confidence < 0.7; not a calibrated probability",
          total: r.cells.filter((c) => !c.corrected && c.confidence < 0.7)
            .length,
          incorrectlyConfident: occupancyN
            ? evaluated(incorrectlyConfident, occupancyN)
            : notEvaluated("No aligned independently verified labels"),
          missingOrUnverifiedTruth: differences.filter(
            (d) => d.truth !== "verified",
          ).length,
        }
      : null,
    differences,
  };
}
