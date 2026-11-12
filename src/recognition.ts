import type { Project, Cell } from "./model.ts";
export type Raster = { width: number; height: number; data: Uint8ClampedArray };
export type Crop = { x: number; y: number; width: number; height: number };
export type Geometry = { crop: Crop; rows: number; columns: number };
export type RecognizedCell = Cell & {
  confidence: number;
  detectedColor: string;
  corrected?: boolean;
};
export type Recognition = Geometry & {
  cells: RecognizedCell[];
  palette: Project["palette"];
  warnings: string[];
  method: string;
  diagnostics?: GridDiagnostics;
};
const distance = (a: number[], b: number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));
export function validateGeometry(image: Raster, geometry: Geometry) {
  const { crop: c, rows, columns } = geometry;
  if (
    ![c.x, c.y, c.width, c.height, rows, columns].every(Number.isFinite) ||
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1 ||
    rows > 300 ||
    columns > 300 ||
    rows * columns > 40000 ||
    c.x < 0 ||
    c.y < 0 ||
    c.width <= 0 ||
    c.height <= 0 ||
    c.x + c.width > image.width ||
    c.y + c.height > image.height
  )
    throw new Error(
      "Choose an in-image crop and integer dimensions (1–300, at most 40,000 cells).",
    );
  if (Math.min(c.width / columns, c.height / rows) < 8)
    throw new Error(
      "Cells are smaller than 8 pixels. Use a higher-resolution chart or correct the grid dimensions.",
    );
}
export function cellBounds(g: Geometry, row: number, column: number): Crop {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0 ||
    row >= g.rows ||
    column >= g.columns
  )
    throw new Error("Cell is outside the grid.");
  return {
    x: g.crop.x + (column * g.crop.width) / g.columns,
    y: g.crop.y + (row * g.crop.height) / g.rows,
    width: g.crop.width / g.columns,
    height: g.crop.height / g.rows,
  };
}
function channelMedian(values: number[]) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}
export function sampleCell(image: Raster, b: Crop) {
  const colors: number[][] = [];
  let ink = 0,
    all = 0;
  for (let y = Math.ceil(b.y + b.height * 0.16); y < b.y + b.height * 0.84; y++)
    for (
      let x = Math.ceil(b.x + b.width * 0.16);
      x < b.x + b.width * 0.84;
      x++
    ) {
      const i = (y * image.width + x) * 4;
      const rgb = Array.from(image.data.subarray(i, i + 3));
      all++;
      if (Math.max(...rgb) < 145) ink++;
      if (Math.min(...rgb) > 145) colors.push(rgb);
    }
  if (colors.length < all * 0.2)
    return { rgb: [128, 128, 128], confidence: 0, ink: ink / Math.max(all, 1) };
  // A channel median suppresses lettering, symbols, JPEG noise and watermark strokes.
  const rgb = [0, 1, 2].map((i) => channelMedian(colors.map((c) => c[i])));
  const support =
    colors.filter((c) => distance(c, rgb) < 27).length / Math.max(1, all);
  return {
    rgb,
    confidence: Math.min(0.97, support),
    ink: ink / Math.max(all, 1),
  };
}
export function isEmptySample(rgb: number[], ink: number) {
  return (
    Math.min(...rgb) > 237 &&
    Math.max(...rgb) - Math.min(...rgb) < 15 &&
    ink < 0.055
  );
}
function projection(image: Raster, axis: "x" | "y", bands?: number[][]) {
  const n = axis === "x" ? image.width : image.height,
    other = axis === "x" ? image.height : image.width;
  const out = new Float64Array(n);
  const lum = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
  };
  for (let p = 2; p < n - 2; p++)
    for (let q = 0; q < other; q += 2) {
      if (bands && !bands.some(([start, end]) => q >= start && q <= end))
        continue;
      const x = axis === "x" ? p : q,
        y = axis === "y" ? p : q,
        i = (y * image.width + x) * 4;
      const rgb = image.data.subarray(i, i + 3),
        l = lum(x, y);
      if (l < 130 || l > 247 || Math.max(...rgb) - Math.min(...rgb) > 28)
        continue;
      const before = axis === "x" ? lum(x - 2, y) : lum(x, y - 2),
        after = axis === "x" ? lum(x + 2, y) : lum(x, y + 2);
      out[p] += (Math.max(0, (before + after) / 2 - l) * 2) / other;
    }
  return out;
}
export function detectAxis(v: ArrayLike<number>) {
  const peaks: number[] = [];
  const maximum = Math.max(...Array.from(v));
  for (let p = 3; p < v.length - 3; p++)
    if (
      v[p] > Math.max(0.4, maximum * 0.045) &&
      v[p] >= v[p - 1] &&
      v[p] > v[p + 1] &&
      v[p] >= v[p - 2] &&
      v[p] >= v[p + 2]
    )
      peaks.push(p);
  if (peaks.length > 1200)
    throw new Error(
      "Too many competing line candidates. Use a tighter manual crop.",
    );
  if (peaks.length < 7)
    throw new Error(
      "No regular grid lines found. Specify crop and dimensions manually.",
    );
  const candidates = new Set<number>();
  for (let i = 0; i < peaks.length; i++)
    for (let j = i + 1; j < Math.min(peaks.length, i + 7); j++) {
      const d = peaks[j] - peaks[i];
      for (let k = 1; k <= 4; k++)
        if (d / k >= 8 && d / k <= 160)
          candidates.add(Math.round((d / k) * 10) / 10);
    }
  let best = { start: 0, end: 0, count: 0, score: 0, spacing: 0 };
  for (const spacing of candidates)
    for (const start of peaks) {
      let count = 0,
        sum = 0,
        end = start;
      for (let target = start; target < v.length - 2; target += spacing) {
        let p = Math.round(target),
          value = 0,
          index = p;
        for (
          let k = Math.max(2, p - 2);
          k <= Math.min(v.length - 3, p + 2);
          k++
        )
          if (v[k] > value) {
            value = v[k];
            index = k;
          }
        if (value < Math.max(0.4, maximum * 0.04)) break;
        count++;
        sum += Math.min(value, maximum * 0.6);
        end = index;
      }
      const score = sum * Math.sqrt(count);
      if (count >= 7 && score > best.score)
        best = { start, end, count, score, spacing };
    }
  if (best.count < 7 || best.count > 301)
    throw new Error("Grid is ambiguous. Specify crop and dimensions manually.");
  return best;
}
export type GridDiagnostics = {
  method: "v2.0-a-baseline";
  x?: {
    projection: number[];
    peaks: number[];
    selected?: ReturnType<typeof detectAxis>;
  };
  y?: {
    projection: number[];
    peaks: number[];
    selected?: ReturnType<typeof detectAxis>;
  };
  edgeBands?: number[][];
  spacingRatio?: number;
  bestCandidate?: Geometry;
  geometry?: Geometry;
  stage:
    | "x-axis"
    | "y-axis"
    | "axis-agreement"
    | "geometry-validation"
    | "accepted";
  rejection?: string;
};
function diagnosticAxis(values: number[]) {
  const maximum = Math.max(...values),
    peaks: number[] = [];
  for (let p = 3; p < values.length - 3; p++)
    if (
      values[p] > Math.max(0.4, maximum * 0.045) &&
      values[p] >= values[p - 1] &&
      values[p] > values[p + 1] &&
      values[p] >= values[p - 2] &&
      values[p] >= values[p + 2]
    )
      peaks.push(p);
  return { projection: values, peaks };
}
/** Instrument the unchanged A detector before proposing algorithm changes. */
export function diagnoseGrid(image: Raster): GridDiagnostics {
  const d: GridDiagnostics = { method: "v2.0-a-baseline", stage: "x-axis" };
  try {
    d.x = diagnosticAxis(Array.from(projection(image, "x")));
    const x = detectAxis(d.x.projection);
    d.x.selected = x;
    d.edgeBands = [
      [x.start + x.spacing * 0.18, x.start + x.spacing * 0.82],
      [x.end - x.spacing * 0.82, x.end - x.spacing * 0.18],
    ];
    d.stage = "y-axis";
    const factor = image.width / (x.spacing * 1.28);
    d.y = diagnosticAxis(
      Array.from(projection(image, "y", d.edgeBands), (v) => v * factor),
    );
    const y = detectAxis(d.y.projection);
    d.y.selected = y;
    d.bestCandidate = {
      crop: {
        x: x.start,
        y: y.start,
        width: x.end - x.start,
        height: y.end - y.start,
      },
      columns: x.count - 1,
      rows: y.count - 1,
    };
    d.stage = "axis-agreement";
    d.spacingRatio = x.spacing / y.spacing;
    if (d.spacingRatio < 0.86 || d.spacingRatio > 1.16)
      throw new Error(
        "Grid spacing is inconsistent or skewed. Use a straight, square-grid chart or specify the region manually.",
      );
    d.stage = "geometry-validation";
    validateGeometry(image, d.bestCandidate);
    d.geometry = d.bestCandidate;
    d.stage = "accepted";
  } catch (error) {
    d.rejection = error instanceof Error ? error.message : String(error);
  }
  return d;
}
export class GridDetectionError extends Error {
  diagnostics: GridDiagnostics;
  constructor(diagnostics: GridDiagnostics) {
    super(diagnostics.rejection ?? "Grid could not be located reliably.");
    this.name = "GridDetectionError";
    this.diagnostics = diagnostics;
  }
}
export function detectGrid(image: Raster): Geometry {
  const d = diagnoseGrid(image);
  if (!d.geometry) throw new GridDetectionError(d);
  return d.geometry;
}
export function recognize(image: Raster, hint?: Geometry): Recognition {
  if (
    image.width < 80 ||
    image.height < 80 ||
    image.width * image.height > 20000000 ||
    Math.max(image.width, image.height) > 12000 ||
    image.data.length !== image.width * image.height * 4
  )
    throw new Error(
      "Use a chart between 80px and 20 megapixels, with neither side above 12,000px.",
    );
  const diagnostics = hint ? undefined : diagnoseGrid(image);
  if (diagnostics && !diagnostics.geometry)
    throw new GridDetectionError(diagnostics);
  const geometry = hint ?? diagnostics!.geometry!;
  validateGeometry(image, geometry);
  const clusters: { rgb: number[]; code: string; count: number }[] = [];
  const cells: RecognizedCell[] = [];
  for (let row = 0; row < geometry.rows; row++)
    for (let column = 0; column < geometry.columns; column++) {
      const s = sampleCell(image, cellBounds(geometry, row, column));
      const empty = isEmptySample(s.rgb, s.ink);
      let code: string | null = null,
        confidence = s.confidence;
      if (!empty) {
        let cluster = clusters.find((c) => distance(c.rgb, s.rgb) < 23);
        if (!cluster) {
          cluster = {
            rgb: s.rgb,
            code: `Color ${clusters.length + 1}`,
            count: 0,
          };
          clusters.push(cluster);
        }
        const delta = distance(cluster.rgb, s.rgb);
        cluster.count++;
        code = cluster.code;
        confidence = Math.min(confidence, 1 - delta / 50);
      } else if (s.ink > 0.025) confidence = Math.min(confidence, 0.55);
      cells.push({
        row,
        column,
        colorCode: code,
        isEmpty: empty,
        isCompleted: false,
        confidence,
        detectedColor:
          "#" +
          s.rgb
            .map((c) => Math.round(c).toString(16).padStart(2, "0"))
            .join(""),
      });
    }
  if (clusters.length > 24)
    throw new Error(
      "More than 24 background colors found. This may be a photo, a compressed chart, or an incorrect grid crop.",
    );
  if (!clusters.length)
    throw new Error(
      "No colored chart cells found. Check the crop and dimensions.",
    );
  return {
    ...geometry,
    diagnostics,
    cells,
    palette: clusters.map((c) => ({
      code: c.code,
      name: c.code,
      hex:
        "#" +
        c.rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""),
    })),
    method: hint
      ? "Manual geometry + robust background sampling"
      : "Automatic periodic grid + robust background sampling",
    warnings: [
      "Needs Review: grid boundaries and pale/white cells require visual checking.",
      "Color codes are temporary; official brand codes are not inferred from RGB.",
      "Dark symbols and white occupied cells can be confused with empty cells. No OCR or perspective correction is included.",
    ],
  };
}
export function recognitionStats(r: Recognition) {
  return {
    total: r.cells.filter((c) => !c.isEmpty).length,
    uncertain: r.cells.filter((c) => !c.corrected && c.confidence < 0.7).length,
    counts: r.palette.map((p) => ({
      ...p,
      count: r.cells.filter((c) => !c.isEmpty && c.colorCode === p.code).length,
    })),
  };
}
export function toProject(r: Recognition, name: string, id: string): Project {
  validateGeometry(
    {
      width: Math.ceil(r.crop.x + r.crop.width),
      height: Math.ceil(r.crop.y + r.crop.height),
      data: new Uint8ClampedArray(),
    },
    r,
  );
  if (r.cells.length !== r.rows * r.columns || !id.trim() || !name.trim())
    throw new Error("Invalid pattern dimensions, name or ID.");
  const keys = new Set(r.palette.map((p) => p.code));
  if (keys.size !== r.palette.length || r.palette.some((p) => !p.code.trim()))
    throw new Error("Palette codes must be nonempty and unique.");
  const addresses = new Set<string>();
  for (const c of r.cells) {
    cellBounds(r, c.row, c.column);
    const key = `${c.row}:${c.column}`;
    if (addresses.has(key) || (!c.isEmpty && !keys.has(c.colorCode ?? "")))
      throw new Error("Invalid or duplicate recognized cell.");
    addresses.add(key);
  }
  return {
    id,
    name,
    rows: r.rows,
    columns: r.columns,
    grid: r.cells.map(({ row, column, colorCode, isEmpty }) => ({
      row,
      column,
      colorCode: isEmpty ? null : colorCode,
      isEmpty,
      isCompleted: false,
    })),
    palette: r.palette.map((p) => ({ ...p })),
    strategy: "row",
    reverse: false,
    step: r.cells.find((c) => !c.isEmpty)?.row ?? 0,
    updatedAt: new Date().toISOString(),
  };
}
