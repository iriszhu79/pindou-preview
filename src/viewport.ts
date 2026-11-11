export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
/** Screen-space correction; auto navigation leaves an already-visible step alone. */
export function stepPanDelta(
  step: Bounds,
  viewport: Bounds,
  strategy: "row" | "column",
  force = false,
) {
  const x = (viewport.left + viewport.right - step.left - step.right) / 2;
  const y = (viewport.top + viewport.bottom - step.top - step.bottom) / 2;
  if (force) return { x, y };
  const margin = 12;
  const fitAxis = (start: number, end: number, low: number, high: number) => {
    if (end - start > high - low)
      return start < low && end > high ? 0 : (low + high - start - end) / 2;
    if (start < low) return low - start;
    if (end > high) return high - end;
    return 0;
  };
  if (strategy === "row")
    return {
      x:
        step.right < viewport.left + margin ||
        step.left > viewport.right - margin
          ? x
          : 0,
      y: fitAxis(
        step.top,
        step.bottom,
        viewport.top + margin,
        viewport.bottom - margin,
      ),
    };
  return {
    x: fitAxis(
      step.left,
      step.right,
      viewport.left + margin,
      viewport.right - margin,
    ),
    y:
      step.bottom < viewport.top + margin || step.top > viewport.bottom - margin
        ? y
        : 0,
  };
}
