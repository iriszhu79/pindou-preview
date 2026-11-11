import { useRef, useEffect, type ReactNode } from "react";
import { drawerSwipe } from "./drawerGesture";
import { stepCells, stats, stepLabel, type Cell, type Project } from "./model";
import { StepPositions } from "./StepTools";
type Props = {
  p: Project;
  extras?: ReactNode;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  selected: Cell | null;
  settings: ReactNode;
  showEmpty: boolean;
  onStepComplete: () => void;
  onSelectedComplete: () => void;
  onClearSelection: () => void;
  onUndo: () => void;
  canUndo: boolean;
};
export function MobileDrawer({
  p,
  extras,
  expanded,
  setExpanded,
  selected,
  settings,
  showEmpty,
  onStepComplete,
  onSelectedComplete,
  onClearSelection,
  onUndo,
  canUndo,
}: Props) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && body.current) body.current.scrollTop = 0;
  }, [expanded]);
  const gesture = useRef<{ x: number; y: number } | null>(null),
    swiped = useRef(false);
  const cells = stepCells(p),
    done = cells.filter((c) => c.isCompleted).length,
    remaining = cells.length - done;
  const colors = stats(cells, p.palette).filter((c) => c.count);
  const finished =
    p.grid.some((c) => !c.isEmpty) &&
    p.grid.every((c) => c.isEmpty || c.isCompleted);
  return (
    <aside
      className={`mobile-drawer ${expanded ? "expanded" : "collapsed"}`}
      aria-label="Beading task drawer"
    >
      <button
        className="drawer-toggle"
        aria-label={expanded ? "Collapse task drawer" : "Expand task drawer"}
        aria-expanded={expanded}
        aria-controls="mobile-task-details"
        aria-describedby="mobile-drawer-summary"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          gesture.current = { x: event.clientX, y: event.clientY };
          swiped.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          if (!start) return;
          const action = drawerSwipe(start, {
            x: event.clientX,
            y: event.clientY,
          });
          if (action !== null) {
            swiped.current = true;
            setExpanded(action);
          }
        }}
        onPointerCancel={() => {
          gesture.current = null;
          swiped.current = false;
        }}
        onClick={(event) => {
          if (swiped.current && event.detail !== 0) {
            swiped.current = false;
            return;
          }
          swiped.current = false;
          setExpanded(!expanded);
        }}
      >
        <span className="drawer-handle" aria-hidden="true" />
        <span
          className="drawer-summary"
          id="mobile-drawer-summary"
          aria-live="polite"
        >
          <svg
            className="bead-token"
            viewBox="0 0 18 18"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            <path
              d="M5 1H13V3H16V6H18V13H15V16H6V18H1V7H3V3H5Z"
              fill="#292638"
            />
            <path
              d="M6 3H12V5H14V7H16V12H13V14H6V16H3V8H5V5H6Z"
              fill="#fff9f0"
            />
            <path d="M8 6H12V10H8Z" fill="#a7cb8c" />
          </svg>
          <span className="drawer-completion">
            <b>
              {done} / {cells.length}
            </b>
            <span>{remaining} remaining</span>
          </span>
          <span className="drawer-colors" aria-label="Remaining beads by color">
            {colors.map((c) => (
              <span
                className="drawer-chip"
                key={c.code}
                aria-label={`${c.code}, ${c.count - c.done} remaining of ${c.count}`}
              >
                <i style={{ background: c.hex }} />
                {c.code} × {c.count - c.done}
              </span>
            ))}
            {!colors.length && <span className="drawer-empty">Empty step</span>}
          </span>
          <span className="drawer-chevron" aria-hidden="true">
            {expanded ? "⌄" : "⌃"}
          </span>
        </span>
      </button>
      <div
        ref={body}
        id="mobile-task-details"
        className="drawer-body"
        hidden={!expanded}
        role="region"
        aria-label="Task drawer details"
        tabIndex={0}
      >
        {finished && (
          <div className="finished-banner" role="status">
            ✦ Project complete · all beads placed
          </div>
        )}
        <div className="drawer-body-heading">
          <h2>{stepLabel(p, showEmpty)}</h2>
          <button
            aria-label="Collapse task drawer"
            onClick={() => setExpanded(false)}
          >
            Close ↓
          </button>
        </div>
        {selected && (
          <section className="drawer-selection" aria-label="Selected bead">
            <div aria-live="polite">
              <strong>
                Row {selected.row + 1} · Column {selected.column + 1}
              </strong>
              <p>
                Color: {selected.colorCode} ·{" "}
                {selected.isCompleted ? "Completed" : "Not completed"}
              </p>
            </div>
            <button className="selected-action" onClick={onSelectedComplete}>
              {selected.isCompleted
                ? "Undo Completion"
                : "Mark Selected Complete"}
            </button>
            <button aria-label="Clear selection" onClick={onClearSelection}>
              Clear selection
            </button>
          </section>
        )}
        <p className="remaining-summary" aria-live="polite">
          {cells.length} total · {done} completed · {remaining} remaining
        </p>
        <button
          className={`primary full complete-action${cells.length && done === cells.length ? " step-completed" : ""}`}
          disabled={!cells.length}
          onClick={onStepComplete}
        >
          {cells.length && done === cells.length
            ? "↶ Clear this step"
            : "✓ Mark step complete"}
        </button>
        <div className="palette step-counts">
          {colors.map((c) => (
            <div key={c.code}>
              <i style={{ background: c.hex }} />
              <b>{c.code}</b>
              <strong>
                {c.count - c.done} left{" "}
                <small>
                  / {c.count} · {c.done} placed
                </small>
              </strong>
            </div>
          ))}
        </div>
        {!cells.length && (
          <p className="muted">
            This coordinate is empty. Navigation can continue without completing
            anything.
          </p>
        )}
        <StepPositions p={p} />
        {extras}
        <h3>Choose your route</h3>
        {settings}
        <button className="undo full" disabled={!canUndo} onClick={onUndo}>
          ↶ Undo last change
        </button>
        <p className="drawer-help">
          Tap to inspect in Select. Complete explicitly here. Swipe the handle
          down to return to your chart.
        </p>
      </div>
    </aside>
  );
}
