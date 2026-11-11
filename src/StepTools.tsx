import { memo } from "react";
import {
  coordinate,
  stepLine,
  stepLabel,
  routeCoordinates,
  atCoordinate,
  adjacentStep,
  type Project,
} from "./model";
function StepNavigationView({
  p,
  update,
  showEmpty = false,
}: {
  p: Project;
  update: (p: Project) => void;
  showEmpty?: boolean;
}) {
  const route = routeCoordinates(p, showEmpty),
    index = route.indexOf(coordinate(p));
  const previous = adjacentStep(p, -1, showEmpty),
    next = adjacentStep(p, 1, showEmpty);
  return (
    <div className="step-navigation">
      <div className="step-nav">
        <button
          disabled={!previous}
          onClick={() => previous && update(previous)}
        >
          ← Previous
        </button>
        <span aria-live="polite">{stepLabel(p, showEmpty)}</span>
        <button disabled={!next} onClick={() => next && update(next)}>
          Next →
        </button>
      </div>
      <label className="step-slider">
        {showEmpty ? "Grid coordinate" : "Beading step"}
        <input
          aria-label="Beading step"
          type="range"
          disabled={!route.length || index < 0}
          min="0"
          max={Math.max(0, route.length - 1)}
          value={Math.max(0, index)}
          onChange={(e) =>
            update(atCoordinate(p, route[Number(e.target.value)]))
          }
        />
      </label>
    </div>
  );
}
function StepPositionsView({ p }: { p: Project }) {
  return (
    <div className="step-positions">
      <p className="muted">
        {p.strategy === "row" ? "Column" : "Row"} positions · ✓ completed ·
        dotted = empty
      </p>
      <ol aria-label="Current step bead positions" tabIndex={0}>
        {stepLine(p).map((c, i) => (
          <li key={i}>
            <span
              className={c.isEmpty ? "position empty-position" : "position"}
              style={{
                background: c.isEmpty
                  ? "transparent"
                  : p.palette.find((v) => v.code === c.colorCode)!.hex,
                color: c.colorCode === "I1" ? "white" : undefined,
              }}
              title={`${i + 1}: ${c.isEmpty ? "empty" : `${c.colorCode}, ${c.isCompleted ? "completed" : "remaining"}`}`}
              aria-label={`${i + 1}: ${c.isEmpty ? "empty" : `${c.colorCode}, ${c.isCompleted ? "completed" : "remaining"}`}`}
            >
              {c.isEmpty ? "·" : c.isCompleted ? "✓" : c.colorCode}
            </span>
            <small>{i + 1}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const StepNavigation = memo(StepNavigationView);
export const StepPositions = memo(StepPositionsView);
