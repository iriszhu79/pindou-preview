import type { CellAddress } from "./model";
type Point = { x: number; y: number };
type RenderedCell = {
  left: number;
  top: number;
  width: number;
  height: number;
};
/** All workspace transforms are axis-aligned translate/scale. Use measured fill
 * rectangles rather than SVG native hit regions, which can quantize tiny edges.
 * The origin includes viewBox padding, letterboxing, CSS pan/zoom and viewport. */
export function addressFromBounds(
  point: Point,
  origin: RenderedCell,
  rows: number,
  columns: number,
): CellAddress | null {
  if (
    ![
      point.x,
      point.y,
      origin.left,
      origin.top,
      origin.width,
      origin.height,
    ].every(Number.isFinite) ||
    origin.width <= 0 ||
    origin.height <= 0
  )
    return null;
  const row = Math.floor((point.y - origin.top) / origin.height);
  const column = Math.floor((point.x - origin.left) / origin.width);
  return Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    row < rows &&
    column >= 0 &&
    column < columns
    ? { row, column }
    : null;
}
export function hitCell(
  stage: HTMLElement,
  x: number,
  y: number,
): CellAddress | null {
  const surface = stage.ownerDocument.elementFromPoint(x, y);
  if (!surface || !stage.contains(surface)) return null;
  const svg = stage.querySelector<SVGSVGElement>("svg[data-grid-rows]");
  const anchor = svg?.querySelector<SVGRectElement>(
    '[data-cell-row="0"][data-cell-column="0"] > rect',
  );
  if (!svg || !anchor) return null;
  const origin = anchor.getBoundingClientRect();
  const rows = Number(svg.dataset.gridRows),
    columns = Number(svg.dataset.gridColumns);
  const matrix = svg.getScreenCTM();
  const width = anchor.width.baseVal.value,
    height = anchor.height.baseVal.value;
  let address: CellAddress | null;
  // Use the live SVG transform only when it agrees with measured fill geometry.
  // Some engines omit ancestor CSS transforms in CTM; the axis-aligned rendered
  // cell rectangle is a verifiable fallback, never a device-specific correction.
  const consistent =
    matrix &&
    matrix.a > 0 &&
    matrix.d > 0 &&
    Math.abs(matrix.b) < 1e-7 &&
    Math.abs(matrix.c) < 1e-7 &&
    Math.abs(matrix.e - origin.left) < 0.01 &&
    Math.abs(matrix.f - origin.top) < 0.01 &&
    Math.abs(matrix.a * width - origin.width) < 0.01 &&
    Math.abs(matrix.d * height - origin.height) < 0.01;
  if (consistent) {
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    address = addressFromBounds(
      point,
      { left: 0, top: 0, width, height },
      rows,
      columns,
    );
  } else {
    address = addressFromBounds({ x, y }, origin, rows, columns);
  }
  if (!address) return null;
  const target = svg.querySelector(
    `[data-cell-row="${address.row}"][data-cell-column="${address.column}"]`,
  );
  return target && target.getAttribute("data-empty") !== "true"
    ? address
    : null;
}
export function sameCell(a: CellAddress | null, b: CellAddress | null) {
  return a?.row === b?.row && a?.column === b?.column;
}
