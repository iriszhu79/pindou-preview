import type { Raster, Crop, Geometry } from "./recognition.ts";
export type Lab = [number, number, number];
export type CellSample = {
  rgb: number[];
  lab: Lab;
  confidence: number;
  support: number;
  patchAgreement: number;
  ink: number;
  centralInk: number;
  patchLabs?: Lab[];
};
export const perceptualDistance = (a: Lab, b: Lab) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Raster channels are bytes: reuse transfer values rather than exponentiating
// each pixel repeatedly. No image or palette data is cached across analyses.
const linearRGB = Array.from({ length: 256 }, (_, v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});
export function toOKLab(rgb: number[]): Lab {
  const r = linearRGB[rgb[0]],
    g = linearRGB[rgb[1]],
    b = linearRGB[rgb[2]];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const median = (a: number[]) => {
  a.sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)] ?? 0;
};
const medianRGB = (pixels: number[][]) =>
  [0, 1, 2].map((k) => median(pixels.map((p) => p[k])));
function mode(pixels: number[][]) {
  const bins = new Map<number, { n: number; rgb: number[] }>();
  for (const p of pixels) {
    const key = (p[0] >> 3) * 1024 + (p[1] >> 3) * 32 + (p[2] >> 3);
    const b = bins.get(key);
    if (b) b.n++;
    else bins.set(key, { n: 1, rgb: p });
  }
  let winner = { n: 0, rgb: [255, 255, 255] };
  for (const b of bins.values()) if (b.n > winner.n) winner = b;
  const seed = toOKLab(winner.rgb);
  const near = pixels.filter(
    (p) => perceptualDistance(toOKLab(p), seed) < 0.022,
  );
  return {
    rgb: medianRGB(near.length ? near : [winner.rgb]),
    support: near.length / Math.max(1, pixels.length),
  };
}
export function sampleCell(image: Raster, b: Crop): CellSample {
  const pixels: number[][] = [],
    patches = Array.from({ length: 9 }, () => [] as number[][]);
  let ink = 0,
    centralInk = 0,
    centralN = 0;
  for (let y = Math.ceil(b.y + b.height * 0.18); y < b.y + b.height * 0.82; y++)
    for (
      let x = Math.ceil(b.x + b.width * 0.18);
      x < b.x + b.width * 0.82;
      x++
    ) {
      const i = (y * image.width + x) * 4,
        p = Array.from(image.data.subarray(i, i + 3));
      pixels.push(p);
      const nx = (x - b.x) / b.width,
        ny = (y - b.y) / b.height,
        px = Math.min(2, Math.floor(((nx - 0.18) / 0.64) * 3)),
        py = Math.min(2, Math.floor(((ny - 0.18) / 0.64) * 3));
      patches[py * 3 + px].push(p);
      const dark = Math.max(...p) < 145;
      if (dark) ink++;
      if (nx > 0.28 && nx < 0.72 && ny > 0.28 && ny < 0.72) {
        centralN++;
        if (dark) centralInk++;
      }
    }
  if (!pixels.length)
    return {
      rgb: [255, 255, 255],
      lab: toOKLab([255, 255, 255]),
      confidence: 0,
      support: 0,
      patchAgreement: 0,
      ink: 0,
      centralInk: 0,
    };
  const representative = mode(pixels),
    lab = toOKLab(representative.rgb),
    regional = patches.filter((p) => p.length).map((p) => mode(p));
  const patchAgreement =
    regional.filter((p) => perceptualDistance(toOKLab(p.rgb), lab) < 0.035)
      .length / Math.max(1, regional.length);
  // Lettering can lower support while the independently sampled patches agree.
  const confidence = Math.min(
    0.98,
    0.4 + 0.35 * representative.support + 0.25 * patchAgreement,
  );
  return {
    ...representative,
    lab,
    confidence,
    patchAgreement,
    patchLabs: regional.map((p) => toOKLab(p.rgb)),
    ink: ink / pixels.length,
    centralInk: centralInk / Math.max(1, centralN),
  };
}
export type Occupancy = {
  occupied: boolean;
  confidence: number;
  reason: string;
  ambiguous: boolean;
};
export function decideOccupancy(
  s: CellSample,
  background: Lab,
  chromaTolerance = 0.008,
): Occupancy {
  const difference = perceptualDistance(s.lab, background);
  const backgroundDifference = (lab: Lab) =>
    Math.hypot(lab[1] - background[1], lab[2] - background[2]) >
      chromaTolerance || Math.abs(lab[0] - background[0]) > 0.035;
  const coverage = s.patchLabs
    ? s.patchLabs.filter(backgroundDifference).length /
      Math.max(1, s.patchLabs.length)
    : 1;
  if (difference > 0.007 && backgroundDifference(s.lab) && coverage >= 0.66) {
    const confidence = difference > 0.018 && s.support > 0.45 ? 0.94 : 0.78;
    return {
      occupied: true,
      confidence: Math.min(confidence, s.confidence),
      reason:
        "Consistent multi-region cell background differs from learned empty background",
      ambiguous: difference < 0.01 || s.patchAgreement < 0.45,
    };
  }
  if (s.centralInk > 0.055 && s.ink > 0.025 && s.ink < 0.5)
    return {
      occupied: true,
      confidence: s.centralInk > 0.12 ? 0.88 : 0.66,
      reason: "Background-colored cell contains centered printed marks",
      ambiguous: s.centralInk <= 0.12,
    };
  const ambiguous =
    Math.hypot(s.lab[1] - background[1], s.lab[2] - background[2]) >
      chromaTolerance * 0.7 ||
    Math.abs(s.lab[0] - background[0]) > 0.025 ||
    s.ink >= 0.015;
  return {
    occupied: false,
    confidence: ambiguous ? 0.6 : 0.96,
    reason: ambiguous
      ? "Weak background or printed-mark evidence: inspect occupancy"
      : "Matches learned empty-grid background",
    ambiguous,
  };
}
/** Compatibility helper; full recognition learns its background globally. */
export function isEmptySample(rgb: number[], ink: number) {
  return !decideOccupancy(
    {
      rgb,
      lab: toOKLab(rgb),
      confidence: 1,
      support: 1,
      patchAgreement: 1,
      ink,
      centralInk: ink,
    },
    toOKLab([255, 255, 255]),
  ).occupied;
}
export function classifyCells(image: Raster, g: Geometry) {
  const samples: CellSample[] = [];
  for (let row = 0; row < g.rows; row++)
    for (let column = 0; column < g.columns; column++)
      samples.push(
        sampleCell(image, {
          x: g.crop.x + (column * g.crop.width) / g.columns,
          y: g.crop.y + (row * g.crop.height) / g.rows,
          width: g.crop.width / g.columns,
          height: g.crop.height / g.rows,
        }),
      );
  // Empty background is estimated from bright, neutral, well-supported perimeter
  // cells. It is not the most frequent palette color (a filled chart may dominate).
  const perimeter = samples.filter((s, i) => {
    const r = Math.floor(i / g.columns),
      c = i % g.columns;
    return (
      (r < 2 || c < 2 || r >= g.rows - 2 || c >= g.columns - 2) &&
      s.lab[0] > 0.96 &&
      Math.hypot(s.lab[1], s.lab[2]) < 0.008 &&
      s.support > 0.6
    );
  });
  const lightest = perimeter
    .sort((a, b) => b.lab[0] - a.lab[0])
    .slice(0, Math.max(1, Math.ceil(perimeter.length * 0.6)));
  const backgroundRGB = lightest.length
      ? medianRGB(lightest.map((s) => s.rgb))
      : [255, 255, 255],
    background = toOKLab(backgroundRGB);
  // Learn a chromatic noise envelope from neutral perimeter cells. Compression
  // can tint nominally white paper; that variation is not a bead palette.
  const noise = perimeter
    .map((s) => Math.hypot(s.lab[1] - background[1], s.lab[2] - background[2]))
    .sort((a, b) => a - b);
  const chromaTolerance = Math.max(
    0.008,
    (noise[Math.floor((noise.length - 1) * 0.98)] ?? 0) * 1.5 + 0.001,
  );
  const occupancy = samples.map((s) =>
    decideOccupancy(s, background, chromaTolerance),
  );
  // Unlabelled white cells inside beaded regions may be holes or white beads.
  // Keep their provisional empty state but expose the ambiguity, never certainty.
  occupancy.forEach((o, i) => {
    if (o.occupied) return;
    const r = Math.floor(i / g.columns),
      c = i % g.columns;
    const neighbors = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].filter(([y, x]) => y >= 0 && x >= 0 && y < g.rows && x < g.columns);
    if (
      neighbors.filter(([y, x]) => occupancy[y * g.columns + x].occupied)
        .length >= 2
    ) {
      o.confidence = Math.min(o.confidence, 0.5);
      o.ambiguous = true;
      o.reason =
        "Unlabelled white cell among beads: empty hole versus occupied white cannot be resolved";
    }
  });
  const distinctPaleWhite = (a: Lab, b: Lab) =>
    Math.min(
      perceptualDistance(a, background),
      perceptualDistance(b, background),
    ) < 0.007 &&
    Math.max(
      perceptualDistance(a, background),
      perceptualDistance(b, background),
    ) > 0.014 &&
    Math.hypot(a[1] - b[1], a[2] - b[2]) > 0.008;
  const clusters: { lab: Lab; rgb: number[]; indices: number[] }[] = [];
  const order = samples
    .map((_, i) => i)
    .filter((i) => occupancy[i].occupied)
    .sort((a, b) => samples[b].confidence - samples[a].confidence || a - b);
  for (const i of order) {
    const s = samples[i];
    let closest = -1,
      best = Infinity;
    clusters.forEach((c, k) => {
      const d = perceptualDistance(s.lab, c.lab);
      if (d < best && !distinctPaleWhite(s.lab, c.lab)) {
        best = d;
        closest = k;
      }
    });
    // A text/watermark-dominated whole-cell mode must not invent a palette
    // color when independent regions strongly support an established group.
    // Genuine rare colors remain possible: require four matching patches and
    // a clear lead over every alternative, and keep the low sample confidence.
    const regional = s.patchLabs ?? [];
    if (s.support < 0.25 || s.patchAgreement < 0.6) {
      const evidence = clusters
        .map((c, k) => ({
          k,
          n: regional.filter((lab) => perceptualDistance(lab, c.lab) < 0.045)
            .length,
        }))
        .sort((a, b) => b.n - a.n);
      if (evidence[0]?.n >= 4 && evidence[0].n - (evidence[1]?.n ?? 0) >= 2) {
        closest = evidence[0].k;
        best = 0;
      }
    }
    if (best < 0.026) {
      const cluster = clusters[closest];
      cluster.indices.push(i);
    } else clusters.push({ lab: s.lab, rgb: s.rgb, indices: [i] });
  }
  // Representative palette colors come from all group members, not whichever
  // cell happened to occur first. Codes remain temporary and editable.
  for (const c of clusters) {
    c.rgb = medianRGB(c.indices.map((i) => samples[i].rgb));
    c.lab = toOKLab(c.rgb);
  }
  // Revisit well-supported outliers against complete group medians. A rare
  // real color must not stay merged merely because the first seed was tinted.
  // Weak text/watermark modes cannot seed new groups in this refinement.
  const moves = new Map<number, number>();
  clusters.slice().forEach((cluster, k) => {
    for (const i of cluster.indices) {
      const s = samples[i];
      if (
        s.confidence < 0.7 ||
        s.support < 0.25 ||
        s.patchAgreement < 0.66 ||
        perceptualDistance(s.lab, cluster.lab) <= 0.026
      )
        continue;
      let target = -1,
        distance = Infinity;
      clusters.forEach((c, j) => {
        const d = perceptualDistance(s.lab, c.lab);
        if (d < distance && !distinctPaleWhite(s.lab, c.lab)) {
          distance = d;
          target = j;
        }
      });
      if (distance >= 0.026) {
        target = clusters.length;
        clusters.push({ lab: s.lab, rgb: s.rgb, indices: [] });
      }
      if (target !== k) moves.set(i, target);
    }
  });
  clusters.forEach((cluster, k) => {
    cluster.indices = cluster.indices.filter(
      (i) => !moves.has(i) || moves.get(i) === k,
    );
  });
  moves.forEach((k, i) => clusters[k].indices.push(i));
  for (let k = clusters.length - 1; k >= 0; k--) {
    const c = clusters[k];
    if (!c.indices.length) {
      clusters.splice(k, 1);
      continue;
    }
    c.rgb = medianRGB(c.indices.map((i) => samples[i].rgb));
    c.lab = toOKLab(c.rgb);
  }
  // Merge split compression/shading variants after estimating complete groups.
  // Preserve a resolved near-background white versus tinted pale separation.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < clusters.length; a++)
      for (let b = a + 1; b < clusters.length; b++) {
        const ca = clusters[a],
          cb = clusters[b];
        const whiteVersusPale = distinctPaleWhite(ca.lab, cb.lab);
        if (!whiteVersusPale && perceptualDistance(ca.lab, cb.lab) < 0.035) {
          ca.indices.push(...cb.indices);
          ca.rgb = medianRGB(ca.indices.map((i) => samples[i].rgb));
          ca.lab = toOKLab(ca.rgb);
          clusters.splice(b, 1);
          merged = true;
          break outer;
        }
      }
  }
  clusters.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
  const assignment = new Int16Array(samples.length).fill(-1);
  clusters.forEach((c, k) => c.indices.forEach((i) => (assignment[i] = k)));
  const separation = clusters.map((c, k) =>
    Math.min(
      1,
      ...clusters
        .filter((_, j) => j !== k)
        .map((other) => perceptualDistance(c.lab, other.lab)),
    ),
  );
  return {
    samples,
    occupancy,
    clusters,
    assignment,
    backgroundRGB,
    chromaTolerance,
    separation,
  };
}
