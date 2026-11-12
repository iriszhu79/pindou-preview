import type { Raster, Geometry } from "../src/recognition.ts";
export function syntheticChart(rows: number, columns: number, size = 16) {
  const geometry: Geometry = {
    rows,
    columns,
    crop: { x: 16, y: 24, width: columns * size, height: rows * size },
  };
  const image: Raster = {
    width: columns * size + 32,
    height: rows * size + 48,
    data: new Uint8ClampedArray(
      (columns * size + 32) * (rows * size + 48) * 4,
    ).fill(255),
  };
  const colors = [
    [248, 244, 204],
    [209, 226, 249],
    [241, 212, 217],
    [255, 255, 255],
  ];
  const expected: (number | null)[] = [];
  const pixel = (x: number, y: number, c: number[]) => {
    const i = (y * image.width + x) * 4;
    image.data.set([...c, 255], i);
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const code =
        c === 0 ||
        c === columns - 1 ||
        r === 0 ||
        r === rows - 1 ||
        (r + c) % 7 === 0
          ? null
          : (r + c) % 4;
      expected.push(code);
      const x = 16 + c * size,
        y = 24 + r * size;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++)
          pixel(x + dx, y + dy, code === null ? [255, 255, 255] : colors[code]);
      if (code !== null)
        for (let dy = Math.floor(size * 0.35); dy < size * 0.65; dy++)
          for (let dx = Math.floor(size * 0.35); dx < size * 0.65; dx++)
            pixel(x + dx, y + dy, [70, 70, 70]);
    }
  for (let c = 0; c <= columns; c++)
    for (let y = 24; y <= 24 + rows * size; y++)
      pixel(16 + c * size, y, [180, 180, 180]);
  for (let r = 0; r <= rows; r++)
    for (let x = 16; x <= 16 + columns * size; x++)
      pixel(x, 24 + r * size, [180, 180, 180]);
  return { image, geometry, expected, colors };
}
