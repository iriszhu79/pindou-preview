import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { hitCell, sameCell } from "./hitTest";
import type { CellAddress } from "./model";

type Point = { x: number; y: number };
const DRAG_THRESHOLD = 5;

export function useCanvasInteraction(
  select: boolean,
  onSelect: (cell: CellAddress | null) => void,
) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const space = useRef(false);
  const downCell = useRef<CellAddress | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef({
    origin: { x: 0, y: 0 },
    moved: false,
    hand: false,
    pinch: 0,
  });
  const hand = !select || spaceHeld;
  const zoom = (factor: number) =>
    setScale((value) => Math.max(0.6, Math.min(5, value * factor)));
  const resetGesture = () => {
    pointers.current.clear();
    gesture.current.moved = true;
    gesture.current.pinch = 0;
    setDragging(false);
  };

  useEffect(() => {
    // A native non-passive listener can suppress browser zoom only for modified
    // wheel gestures. Unmodified scrolling stays entirely with the webpage.
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
      zoom(Math.exp(-delta * 0.01));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        !stage.current ||
        event.code !== "Space" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target;
      // Preserve normal typing and Space activation of buttons, selects, etc.
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, button, a, summary, [contenteditable], [role="button"]',
        )
      )
        return;
      event.preventDefault();
      space.current = true;
      setSpaceHeld(true);
      if (pointers.current.size) {
        gesture.current.hand = true;
        gesture.current.moved = true;
        setDragging(true);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      space.current = false;
      setSpaceHeld(false);
      setDragging(false);
    };
    const blur = () => {
      space.current = false;
      setSpaceHeld(false);
      resetGesture();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!pointers.current.size)
      downCell.current = hitCell(
        event.currentTarget,
        event.clientX,
        event.clientY,
      );
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    if (!pointers.current.size) {
      gesture.current = {
        origin: point,
        moved: false,
        hand: !select || space.current,
        pinch: 0,
      };
    }
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size > 1) {
      gesture.current.moved = true;
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    setDragging(!select || space.current);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;
    if (
      Math.hypot(point.x - current.origin.x, point.y - current.origin.y) >
      DRAG_THRESHOLD
    )
      current.moved = true;
    if (pointers.current.size > 1) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (current.pinch > 0 && distance > 0) zoom(distance / current.pinch);
      current.pinch = distance;
      current.moved = true;
    } else if (!select || space.current) {
      current.hand = true;
      setPan((value) => ({
        x: value.x + point.x - last.x,
        y: value.y + point.y - last.y,
      }));
      setDragging(true);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const current = gesture.current;
    const moved =
      current.moved ||
      Math.hypot(
        event.clientX - current.origin.x,
        event.clientY - current.origin.y,
      ) > DRAG_THRESHOLD;
    const canSelect =
      select &&
      !space.current &&
      !current.hand &&
      !moved &&
      pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    current.pinch = 0;
    // A remaining finger after a pinch must never become a new tap.
    current.moved = true;
    if (!pointers.current.size) setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const releasedCell = hitCell(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    // Captured pointer events target the stage: use the actual rendered release hit.
    // Crossing a cell boundary even below the drag threshold must never pick a neighbor.
    if (canSelect && sameCell(downCell.current, releasedCell))
      onSelect(downCell.current);
  };
  const onLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(event.pointerId)) resetGesture();
  };

  return {
    stage,
    scale,
    setScale,
    pan,
    setPan,
    zoom,
    hand,
    dragging,
    fit: () => {
      setScale(1);
      setPan({ x: 0, y: 0 });
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: resetGesture,
      onLostPointerCapture,
    },
  };
}
