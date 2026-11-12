import { useEffect, useLayoutEffect, useRef } from "react";
import { keyboardIsBlocked, shortcutAction } from "./consoleNavigation";
import type { PadDirection } from "./consoleNavigation";
export function useConsoleKeyboard(
  active: boolean,
  actions: {
    navigate: (direction: PadDirection) => void;
    complete: () => void;
    undo: () => void;
  },
) {
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        keyboardIsBlocked(event) ||
        Array.from(
          document.querySelectorAll(
            'dialog[open],[role="dialog"],[role="alertdialog"]',
          ),
        ).some(
          (el) =>
            el.getClientRects().length > 0 &&
            getComputedStyle(el).visibility !== "hidden" &&
            el.getAttribute("aria-hidden") !== "true",
        )
      )
        return;
      const action = shortcutAction(event.key);
      if (!action) return;
      // Grid cells retain their existing accessible arrow-key selection model.
      if (
        ["up", "down", "left", "right"].includes(action) &&
        event.target instanceof Element &&
        event.target.closest('[role="gridcell"]')
      )
        return;
      event.preventDefault();
      if (action === "complete") latest.current.complete();
      else if (action === "undo") latest.current.undo();
      else latest.current.navigate(action);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active]);
}
