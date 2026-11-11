type Point = { x: number; y: number };
/** Only deliberate vertical handle gestures operate the drawer. */
export function drawerSwipe(start: Point, end: Point): boolean | null {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  return Math.abs(dy) >= 28 && Math.abs(dy) > Math.abs(dx) * 1.2
    ? dy < 0
    : null;
}
