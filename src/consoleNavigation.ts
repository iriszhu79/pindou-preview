import { adjacentStep, type Project } from "./model.ts";
export type PadDirection = "up" | "down" | "left" | "right";
/** Physical directions match the D-pad even when the route is reversed. */
export function directionalStep(
  p: Project,
  direction: PadDirection,
  showEmpty = false,
): Project | null {
  const axis = p.strategy === "row" ? ["up", "down"] : ["left", "right"];
  const physical = axis.indexOf(direction);
  if (physical < 0) return null;
  const offset = (physical === 0 ? -1 : 1) * (p.reverse ? -1 : 1);
  return adjacentStep(p, offset as -1 | 1, showEmpty);
}
export function shortcutAction(
  key: string,
): PadDirection | "complete" | "undo" | null {
  switch (key.length === 1 ? key.toLowerCase() : key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "a":
      return "complete";
    case "b":
      return "undo";
    default:
      return null;
  }
}
export function keyboardIsBlocked(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return true;
  const target = event.target;
  return (
    target instanceof Element &&
    !!target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="slider"],[role="menu"],[role="listbox"],[role="dialog"],dialog',
    )
  );
}
