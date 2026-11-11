import {
  cellAt,
  markCell,
  markStep,
  stepCells,
  coordinate,
  type CellAddress,
  type Project,
} from "./model.ts";
export function confirmConsoleCompletion(
  p: Project,
  selectMode: boolean,
  selected: CellAddress | null,
): Project {
  const cell = selectMode ? cellAt(p, selected) : null;
  if (cell) return cell.isCompleted ? p : markCell(p, cell, true);
  const cells = stepCells(p);
  return !cells.length || cells.every((c) => c.isCompleted)
    ? p
    : markStep(p, true);
}
export function consoleActionLabel(
  p: Project,
  selectMode: boolean,
  selected: CellAddress | null,
) {
  const cell = selectMode ? cellAt(p, selected) : null;
  return cell
    ? `Complete selected bead, Row ${cell.row + 1}, Column ${cell.column + 1}`
    : `Complete ${p.strategy === "row" ? "Row" : "Column"} ${coordinate(p) + 1}`;
}
