import { memo, type MouseEvent, type KeyboardEvent } from "react";
import { coordinate, type Project, type CellAddress } from "./model";
export const CELL = 24;
export const MARGIN = 20;
function GridView({
  p,
  active = false,
  onStep,
  selected = null,
  onSelect,
}: {
  p: Project;
  active?: boolean;
  onStep?: (step: number) => void;
  selected?: CellAddress | null;
  onSelect?: (cell: CellAddress) => void;
}) {
  const width = p.columns * CELL,
    height = p.rows * CELL;
  const choose = (event: MouseEvent<SVGSVGElement>) => {
    if (!onStep) return;
    const target = (event.target as Element).closest("[data-cell-row]");
    if (!target) return;
    const n = Number(
      target.getAttribute(
        p.strategy === "row" ? "data-cell-row" : "data-cell-column",
      ),
    );
    onStep(p.reverse ? (p.strategy === "row" ? p.rows : p.columns) - 1 - n : n);
  };
  const first = p.grid.find((c) => !c.isEmpty);
  const keyboard = (
    event: KeyboardEvent<SVGGElement>,
    row: number,
    column: number,
  ) => {
    if (!onSelect) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect({ row, column });
      return;
    }
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    let r = row + move[0],
      c = column + move[1];
    while (r >= 0 && r < p.rows && c >= 0 && c < p.columns) {
      const target = p.grid[r * p.columns + c];
      if (!target.isEmpty) {
        onSelect({ row: r, column: c });
        event.currentTarget.ownerSVGElement
          ?.querySelector<SVGGElement>(
            `[data-cell-row="${r}"][data-cell-column="${c}"]`,
          )
          ?.focus({ preventScroll: true });
        break;
      }
      r += move[0];
      c += move[1];
    }
  };
  return (
    <svg
      data-grid-rows={p.rows}
      data-grid-columns={p.columns}
      viewBox={`-${MARGIN} -${MARGIN} ${width + MARGIN * 2} ${height + MARGIN * 2}`}
      role={onSelect ? "grid" : "img"}
      aria-rowcount={onSelect ? p.rows : undefined}
      aria-colcount={onSelect ? p.columns : undefined}
      aria-label={`${p.name}, ${p.columns} columns by ${p.rows} rows${active ? `, ${p.strategy} ${coordinate(p) + 1} highlighted` : ""}`}
      onClick={choose}
    >
      {Array.from({ length: p.columns }, (_, i) => (
        <text key={`c${i}`} x={i * CELL + 12} y="-7">
          {i + 1}
        </text>
      ))}
      {Array.from({ length: p.rows }, (_, i) => (
        <text key={`r${i}`} x="-10" y={i * CELL + 15}>
          {i + 1}
        </text>
      ))}
      {Array.from({ length: p.rows }, (_, row) => (
        <g
          key={`row-${row}`}
          role={onSelect ? "row" : undefined}
          aria-rowindex={onSelect ? row + 1 : undefined}
        >
          {p.grid.slice(row * p.columns, (row + 1) * p.columns).map((c) => {
            const chosen =
              selected?.row === c.row && selected.column === c.column;
            const tabbable = selected
              ? chosen
              : first?.row === c.row && first.column === c.column;
            return (
              <g
                key={`${c.row}-${c.column}`}
                data-cell-row={c.row}
                data-cell-column={c.column}
                data-empty={c.isEmpty}
                role={onSelect && !c.isEmpty ? "gridcell" : undefined}
                aria-selected={onSelect && !c.isEmpty ? chosen : undefined}
                aria-label={
                  onSelect && !c.isEmpty
                    ? `Row ${c.row + 1}, Column ${c.column + 1}, ${c.colorCode}, ${c.isCompleted ? "completed" : "not completed"}`
                    : undefined
                }
                tabIndex={
                  onSelect && !c.isEmpty ? (tabbable ? 0 : -1) : undefined
                }
                onKeyDown={(event) => keyboard(event, c.row, c.column)}
              >
                <rect
                  pointerEvents="fill"
                  x={c.column * CELL}
                  y={c.row * CELL}
                  width={CELL}
                  height={CELL}
                  fill={
                    c.isEmpty
                      ? "#fffdf8"
                      : p.palette.find((v) => v.code === c.colorCode)!.hex
                  }
                  stroke="#d9d3c8"
                  strokeWidth=".6"
                />
                {!c.isEmpty && (
                  <text
                    pointerEvents="none"
                    fill={c.colorCode === "I1" ? "#fff" : "#292638"}
                    x={c.column * CELL + 12}
                    y={c.row * CELL + 15}
                  >
                    {c.colorCode}
                  </text>
                )}
                {!c.isEmpty && c.isCompleted && (
                  <g
                    className="completion-badge"
                    pointerEvents="none"
                    transform={`translate(${c.column * CELL + 14} ${c.row * CELL + 1})`}
                  >
                    <rect
                      width="9"
                      height="9"
                      fill="#fffdf8"
                      stroke="#292638"
                      strokeWidth="1"
                    />
                    <path
                      d="M1.5 4.5 L3.5 6.5 L7.5 2"
                      fill="none"
                      stroke="#292638"
                      strokeWidth="1.5"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      ))}
      {active && (
        <rect
          data-active-step
          x={p.strategy === "column" ? coordinate(p) * CELL : 0}
          y={p.strategy === "row" ? coordinate(p) * CELL : 0}
          width={p.strategy === "column" ? CELL : width}
          height={p.strategy === "row" ? CELL : height}
          fill="none"
          stroke="#292638"
          strokeWidth="3"
          pointerEvents="none"
        />
      )}
      {selected && (
        <g
          className="selected-marker"
          pointerEvents="none"
          transform={`translate(${selected.column * CELL} ${selected.row * CELL})`}
        >
          <rect
            x="1"
            y="1"
            width="22"
            height="22"
            fill="none"
            stroke="white"
            strokeWidth="3"
          />
          <rect
            x="1"
            y="1"
            width="22"
            height="22"
            fill="none"
            stroke="#292638"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
          <path
            d="M2 7 V2 H7 M17 22 H22 V17"
            stroke="#292638"
            strokeWidth="3"
            fill="none"
          />
        </g>
      )}
    </svg>
  );
}
export const Grid = memo(GridView);
