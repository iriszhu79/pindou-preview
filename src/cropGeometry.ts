import type { Crop } from "./recognition.ts";
export type CropHandle = "move" | "nw" | "ne" | "sw" | "se";
export function dragCrop(
  c: Crop,
  handle: CropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Crop {
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const minimum = Math.min(8, width, height);
  if (
    ![c.x, c.y, c.width, c.height, dx, dy, width, height].every(
      Number.isFinite,
    ) ||
    width < minimum ||
    height < minimum
  )
    throw new Error("Invalid crop drag geometry");
  if (handle === "move")
    return {
      ...c,
      x: clamp(c.x + dx, 0, width - c.width),
      y: clamp(c.y + dy, 0, height - c.height),
    };
  let left = c.x,
    top = c.y,
    right = c.x + c.width,
    bottom = c.y + c.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - minimum);
  if (handle.includes("e")) right = clamp(right + dx, left + minimum, width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - minimum);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + minimum, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function pointerToImage(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
) {
  if (box.width <= 0 || box.height <= 0)
    throw new Error("Image is not measurable");
  return {
    x: ((clientX - box.left) / box.width) * width,
    y: ((clientY - box.top) / box.height) * height,
  };
}
