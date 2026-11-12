import type { Raster, Geometry } from "../src/recognition.ts";
export function gridVariant({
  rows = 37,
  columns = 43,
  size = 12,
  major = 5,
  fine = 250,
  missing = [] as number[],
  header = false,
} = {}) {
  const width = columns * size + 40,
    height = rows * size + 60,
    image: Raster = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4).fill(255),
    },
    geometry: Geometry = {
      rows,
      columns,
      crop: { x: 20, y: 24, width: columns * size, height: rows * size },
    };
  const put = (x: number, y: number, rgb: number[]) =>
    image.data.set([...rgb, 255], (y * width + x) * 4);
  for (let r = Math.floor(rows / 2) - 2; r < Math.floor(rows / 2) + 2; r++)
    for (
      let c = Math.floor(columns / 2) - 3;
      c < Math.floor(columns / 2) + 3;
      c++
    )
      for (let y = 24 + r * size; y < 24 + (r + 1) * size; y++)
        for (let x = 20 + c * size; x < 20 + (c + 1) * size; x++)
          put(x, y, [241, 212, 217]);
  for (let c = 0; c <= columns; c++)
    if (!missing.includes(c))
      for (let y = 24; y <= 24 + rows * size; y++)
        put(20 + c * size, y, Array(3).fill(c % major === 0 ? 150 : fine));
  for (let r = 0; r <= rows; r++)
    if (!missing.includes(r))
      for (let x = 20; x <= 20 + columns * size; x++)
        put(x, 24 + r * size, Array(3).fill(r % major === 0 ? 150 : fine));
  if (header) {
    for (let y = 2; y < 10; y++)
      for (let x = 20; x < width - 20; x++) put(x, y, [230, 40, 40]);
    for (let n = 0; n < 7; n++)
      for (let y = height - 16; y < height - 8; y++)
        for (let x = 30 + n * 33; x < 40 + n * 33; x++)
          put(x, y, [80 + n * 15, 90, 100]);
  }
  return { image, geometry, beads: 24 };
}
