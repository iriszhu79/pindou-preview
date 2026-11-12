import test from "node:test";
import assert from "node:assert/strict";
import { dragCrop, pointerToImage } from "./cropGeometry.ts";
const crop = { x: 20, y: 30, width: 100, height: 150 };
test("crop move and each corner preserve an in-image positive rectangle", () => {
  assert.deepEqual(dragCrop(crop, "move", -999, 999, 300, 300), {
    x: 0,
    y: 150,
    width: 100,
    height: 150,
  });
  for (const handle of ["nw", "ne", "sw", "se"] as const)
    for (const delta of [-1000, 1000]) {
      const c = dragCrop(crop, handle, delta, delta, 300, 300);
      assert.ok(c.x >= 0 && c.y >= 0 && c.width >= 8 && c.height >= 8);
      assert.ok(c.x + c.width <= 300 && c.y + c.height <= 300);
    }
});
test("pointer mapping retains image coordinates under zoom, scrolling and layout offsets", () => {
  assert.deepEqual(
    pointerToImage(
      110,
      220,
      { left: 10, top: 20, width: 200, height: 400 },
      1000,
      2000,
    ),
    { x: 500, y: 1000 },
  );
  assert.deepEqual(
    pointerToImage(
      60,
      120,
      { left: -140, top: -280, width: 400, height: 800 },
      1000,
      2000,
    ),
    { x: 500, y: 1000 },
  );
});

test("B1 uses only its own project namespace when approved-version saves exist", async () => {
  const { loadProjects, createProject } = await import("./model.ts");
  const requested: string[] = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => {
        requested.push(key);
        return key === "pindou.preview.v20b1.projects.v1"
          ? null
          : JSON.stringify([createProject()]);
      },
    },
  });
  try {
    assert.deepEqual(loadProjects(), []);
    assert.deepEqual(requested, ["pindou.preview.v20b1.projects.v1"]);
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});
