import test from "node:test";
import assert from "node:assert/strict";
import { drawerSwipe } from "./drawerGesture.ts";
test("vertical handle swipes expand up and collapse down", () => {
  assert.equal(drawerSwipe({ x: 100, y: 100 }, { x: 103, y: 60 }), true);
  assert.equal(drawerSwipe({ x: 100, y: 100 }, { x: 97, y: 140 }), false);
});
test("taps, jitter and horizontal chip scrolling do not trigger the drawer", () => {
  for (const point of [
    { x: 100, y: 100 },
    { x: 103, y: 80 },
    { x: 170, y: 130 },
    { x: 40, y: 80 },
  ])
    assert.equal(drawerSwipe({ x: 100, y: 100 }, point), null);
});
