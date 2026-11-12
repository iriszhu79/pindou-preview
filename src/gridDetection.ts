import type { Geometry, Raster } from "./recognition.ts";
export type AxisFit = {
  start: number;
  end: number;
  spacing: number;
  count: number;
  coverage: number;
  quality: number;
  band?: number;
};
export type GridCandidate = {
  geometry: Geometry;
  score: number;
  methods: string[];
  phase: number;
  agreement: number;
  coverage: number;
  boundary?: number;
};
type Component = { x: number; y: number; width: number; height: number };
const median = (v: number[]) => {
  const a = [...v].sort((a, b) => a - b);
  return a[Math.floor(a.length / 2)] ?? 0;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
function fitPositions(positions: number[], minPoints = 7): AxisFit[] {
  const ps = [...new Set(positions.map((v) => Math.round(v * 10) / 10))].sort(
    (a, b) => a - b,
  );
  if (ps.length < minPoints) return [];
  const votes = new Map<number, number>();
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < Math.min(ps.length, i + 5); j++)
      for (let d = 1; d <= 10; d++) {
        const s = Math.round(((ps[j] - ps[i]) / d) * 10) / 10;
        if (s >= 8 && s <= 160) votes.set(s, (votes.get(s) ?? 0) + 1 / d);
      }
  const steps = [...votes]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)
    .map((v) => v[0]);
  const fits: AxisFit[] = [];
  for (const step of steps)
    for (const origin of ps) {
      const matches = new Map<number, number>();
      for (const p of ps) {
        const n = Math.round((p - origin) / step);
        if (n < 0) continue;
        const residual = Math.abs(p - origin - n * step);
        if (
          residual <= Math.max(1.25, step * 0.09) &&
          (!matches.has(n) ||
            residual < Math.abs(matches.get(n)! - origin - n * step))
        )
          matches.set(n, p);
      }
      const entries = [...matches].sort((a, b) => a[0] - b[0]);
      let group: typeof entries = [];
      const emit = () => {
        if (group.length < minPoints) return;
        const first = group[0],
          last = group.at(-1)!,
          count = last[0] - first[0] + 1,
          coverage = group.length / count;
        if (count > 301 || coverage < 0.72) return;
        const ns = group.map((v) => v[0]),
          vals = group.map((v) => v[1]),
          mn = ns.reduce((a, b) => a + b, 0) / ns.length,
          mp = vals.reduce((a, b) => a + b, 0) / vals.length;
        const spacing =
            group.reduce((sum, [n, p]) => sum + (n - mn) * (p - mp), 0) /
            group.reduce((sum, [n]) => sum + (n - mn) ** 2, 0),
          offset = mp - spacing * mn;
        const error = Math.sqrt(
          group.reduce(
            (sum, [n, p]) => sum + (p - offset - n * spacing) ** 2,
            0,
          ) / group.length,
        );
        fits.push({
          start: offset + first[0] * spacing,
          end: offset + last[0] * spacing,
          spacing,
          count,
          coverage,
          quality: coverage * (1 - error / spacing) * Math.sqrt(count),
        });
      };
      for (const entry of entries) {
        if (group.length && entry[0] - group.at(-1)![0] > 3) {
          emit();
          group = [];
        }
        group.push(entry);
      }
      emit();
    }
  const unique: AxisFit[] = [];
  for (const f of fits.sort((a, b) => b.quality - a.quality))
    if (
      !unique.some(
        (u) =>
          u.count === f.count &&
          Math.abs(u.start - f.start) < 2 &&
          Math.abs(u.end - f.end) < 2,
      )
    )
      unique.push(f);
  // Later starting fits on the same lattice are subsets, not competing geometries.
  return unique
    .filter(
      (f) =>
        !unique.some(
          (u) =>
            u !== f &&
            u.count > f.count &&
            Math.abs(u.spacing / f.spacing - 1) < 0.015 &&
            u.start <= f.start + 1.5 &&
            u.end >= f.end - 1.5,
        ),
    )
    .slice(0, 16);
}
function components(image: Raster): Component[] {
  const { width: w, height: h, data } = image,
    mask = new Uint8Array(w * h),
    seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    mask[i] =
      Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 210 ? 1 : 0;
  const result: Component[] = [],
    maxSide = Math.max(12, Math.min(w, h) * 0.035),
    stack: number[] = [];
  for (let i = 0; i < mask.length; i++)
    if (mask[i] && !seen[i]) {
      stack.push(i);
      seen[i] = 1;
      let left = w,
        right = 0,
        top = h,
        bottom = 0,
        area = 0;
      while (stack.length) {
        const p = stack.pop()!,
          x = p % w,
          y = Math.floor(p / w);
        area++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        for (const q of [
          x ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ])
          if (q >= 0 && mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
      }
      if (
        area >= 2 &&
        right - left + 1 <= maxSide &&
        bottom - top + 1 <= maxSide &&
        bottom > top
      )
        result.push({
          x: left,
          y: top,
          width: right - left + 1,
          height: bottom - top + 1,
        });
    }
  return result;
}
function axisBands(cs: Component[], axis: "x" | "y"): AxisFit[] {
  const horizontal = axis === "x";
  const groups: { band: number; items: Component[] }[] = [];
  const ortho = (c: Component) =>
    horizontal ? c.y + c.height / 2 : c.x + c.width / 2;
  const ordered = [...cs].sort((a, b) => ortho(a) - ortho(b));
  for (const c of ordered) {
    const tolerance = horizontal
      ? Math.max(2, c.height * 0.4)
      : Math.max(3, c.width * 0.7);
    const g = groups.find((g) => Math.abs(g.band - ortho(c)) <= tolerance);
    if (g) {
      g.items.push(c);
      g.band = median(g.items.map(ortho));
    } else groups.push({ band: ortho(c), items: [c] });
  }
  const fits: AxisFit[] = [];
  for (const g of groups) {
    if (g.items.length < 12) continue;
    const positions = g.items
      .map((c) => ({
        lo: horizontal ? c.x : c.y,
        hi: horizontal ? c.x + c.width : c.y + c.height,
      }))
      .sort((a, b) => a.lo - b.lo);
    const gap = horizontal
      ? Math.max(2, median(g.items.map((c) => c.height)) * 0.8)
      : Math.max(1.5, median(g.items.map((c) => c.height)) * 0.35);
    const tokens: { lo: number; hi: number }[] = [];
    for (const p of positions) {
      const last = tokens.at(-1);
      if (last && p.lo - last.hi <= gap) last.hi = Math.max(last.hi, p.hi);
      else tokens.push({ ...p });
    }
    for (const f of fitPositions(
      tokens.map((t) => (t.lo + t.hi) / 2),
      12,
    ).slice(0, 3))
      fits.push({ ...f, band: g.band });
  }
  return fits.sort((a, b) => b.quality - a.quality).slice(0, 80);
}
function signals(image: Raster) {
  const { width: w, height: h, data } = image;
  const grayX = new Float64Array(w),
    grayY = new Float64Array(h),
    colorX = new Float64Array(w),
    colorY = new Float64Array(h);
  const lum = (i: number) => (data[i] + data[i + 1] + data[i + 2]) / 3;
  // Sample the orthogonal direction only. Every possible line position is retained.
  for (const axis of ["x", "y"] as const) {
    const n = axis === "x" ? w : h,
      other = axis === "x" ? h : w,
      gray = axis === "x" ? grayX : grayY,
      color = axis === "x" ? colorX : colorY,
      stride = axis === "x" ? 4 : w * 4;
    for (let p = 2; p < n - 2; p++)
      for (let q = 2; q < other - 2; q += 2) {
        const x = axis === "x" ? p : q,
          y = axis === "y" ? p : q,
          i = (y * w + x) * 4,
          l = lum(i),
          chroma =
            Math.max(data[i], data[i + 1], data[i + 2]) -
            Math.min(data[i], data[i + 1], data[i + 2]);
        if (chroma < 35)
          gray[p] +=
            (Math.min(
              1,
              Math.max(0, (lum(i - stride * 2) + lum(i + stride * 2)) / 2 - l) /
                1.5,
            ) *
              2) /
            other;
        let delta = 0;
        for (let c = 0; c < 3; c++)
          delta = Math.max(
            delta,
            Math.abs(data[i - stride + c] - data[i + stride + c]),
          );
        color[p] += (Math.min(delta, 100) * 2) / other;
      }
  }
  return { grayX, grayY, colorX, colorY };
}
function peaks(a: Float64Array) {
  const threshold = Math.max(0.015, Math.max(...a) * 0.006),
    ps: number[] = [];
  for (let i = 3; i < a.length - 3; i++)
    if (
      a[i] > threshold &&
      a[i] >= a[i - 1] &&
      a[i] > a[i + 1] &&
      a[i] >= a[i - 2] &&
      a[i] >= a[i + 2]
    )
      ps.push(i);
  return ps;
}
function phase(
  signal: Float64Array,
  start: number,
  end: number,
  count: number,
) {
  const s = (end - start) / count;
  let aligned = 0,
    shifted = 0;
  const value = (p: number) => {
    let best = 0;
    for (
      let k = Math.max(0, Math.round(p) - 2);
      k <= Math.min(signal.length - 1, Math.round(p) + 2);
      k++
    )
      best = Math.max(best, signal[k]);
    return best;
  };
  for (let n = 0; n <= count; n++) aligned += value(start + n * s);
  for (let n = 0; n < count; n++) shifted += value(start + (n + 0.5) * s);
  aligned /= count + 1;
  shifted /= count;
  return aligned + shifted > 0
    ? clamp(((aligned - shifted) / (aligned + shifted)) * 0.5 + 0.5)
    : 0;
}
function boundarySupport(image: Raster, g: Geometry) {
  const { data, width: w, height: h } = image,
    c = g.crop;
  const lum = (x: number, y: number) => {
    x = Math.max(0, Math.min(w - 1, Math.round(x)));
    y = Math.max(0, Math.min(h - 1, Math.round(y)));
    const i = (y * w + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  const edge = (axis: "x" | "y", p: number, start: number, end: number) => {
    let hits = 0,
      total = 0;
    for (let q = start; q <= end; q += 2) {
      let best = 0;
      for (let off = -2; off <= 2; off++) {
        const x = axis === "x" ? p + off : q,
          y = axis === "y" ? p + off : q;
        const value =
          (axis === "x"
            ? lum(x - 2, y) + lum(x + 2, y)
            : lum(x, y - 2) + lum(x, y + 2)) /
            2 -
          lum(x, y);
        best = Math.max(best, value);
      }
      hits += best > 1 ? 1 : 0;
      total++;
    }
    return hits / Math.max(1, total);
  };
  return Math.min(
    edge("x", c.x, c.y, c.y + c.height),
    edge("x", c.x + c.width, c.y, c.y + c.height),
    edge("y", c.y, c.x, c.x + c.width),
    edge("y", c.y + c.height, c.x, c.x + c.width),
  );
}
export function rankGridCandidates(image: Raster, legacy?: Geometry) {
  const sig = signals(image),
    cs = components(image),
    xs = axisBands(cs, "x"),
    ys = axisBands(cs, "y");
  const candidates: GridCandidate[] = [];
  function add(
    g: Geometry,
    methods: string[],
    coverage: number,
    axisEvidence = 0,
  ) {
    const c = g.crop,
      sx = c.width / g.columns,
      sy = c.height / g.rows;
    if (
      c.x < 0 ||
      c.y < 0 ||
      c.x + c.width > image.width ||
      c.y + c.height > image.height ||
      sx < 8 ||
      sy < 8 ||
      g.rows > 300 ||
      g.columns > 300 ||
      Math.abs(sx / sy - 1) > 0.12
    )
      return;
    const agreement = 1 - Math.abs(sx / sy - 1),
      p =
        (phase(sig.colorX, c.x, c.x + c.width, g.columns) +
          phase(sig.colorY, c.y, c.y + c.height, g.rows) +
          phase(sig.grayX, c.x, c.x + c.width, g.columns) +
          phase(sig.grayY, c.y, c.y + c.height, g.rows)) /
        4;
    const boundary = boundarySupport(image, g),
      score =
        axisEvidence +
        coverage * 0.5 +
        agreement * 0.25 +
        p +
        (axisEvidence ? 0 : boundary * 0.5);
    const duplicate = candidates.find(
      (v) =>
        v.geometry.rows === g.rows &&
        v.geometry.columns === g.columns &&
        Math.abs(v.geometry.crop.x - c.x) < 2 &&
        Math.abs(v.geometry.crop.y - c.y) < 2 &&
        Math.abs(v.geometry.crop.width - c.width) < 3 &&
        Math.abs(v.geometry.crop.height - c.height) < 3,
    );
    if (duplicate) {
      duplicate.methods = [...new Set([...duplicate.methods, ...methods])];
      if (methods.includes("legacy")) duplicate.geometry = g;
      if (score > duplicate.score) {
        duplicate.score = score;
        duplicate.phase = p;
        duplicate.coverage = coverage;
      }
    } else
      candidates.push({
        geometry: g,
        methods,
        score,
        phase: p,
        agreement,
        coverage,
        boundary,
      });
  }
  const pairs = (bands: AxisFit[]) => {
    const result: [AxisFit, AxisFit][] = [];
    for (let i = 0; i < bands.length; i++)
      for (let j = i + 1; j < bands.length; j++) {
        const a = bands[i],
          b = bands[j];
        if (
          Math.abs(a.spacing / b.spacing - 1) < 0.035 &&
          Math.abs(a.start - b.start) < a.spacing * 0.3 &&
          Math.abs(a.end - b.end) < a.spacing * 0.3 &&
          Math.abs(a.band! - b.band!) > a.spacing * 6
        )
          result.push(a.band! < b.band! ? [a, b] : [b, a]);
      }
    return result;
  };
  for (const [top, bottom] of pairs(xs))
    for (const [left, right] of pairs(ys))
      for (const convention of ["boundary", "center"] as const) {
        const sx = (top.spacing + bottom.spacing) / 2,
          sy = (left.spacing + right.spacing) / 2,
          x =
            (top.start + bottom.start) / 2 -
            (convention === "center" ? sx / 2 : 0),
          y =
            (left.start + right.start) / 2 -
            (convention === "center" ? sy / 2 : 0),
          columns =
            Math.round((top.count + bottom.count) / 2) -
            (convention === "boundary" ? 1 : 0),
          rows =
            Math.round((left.count + right.count) / 2) -
            (convention === "boundary" ? 1 : 0);
        const xEnd = x + columns * sx,
          yEnd = y + rows * sy;
        if (
          !(
            left.band! < x &&
            right.band! > xEnd &&
            top.band! < y &&
            bottom.band! > yEnd
          )
        )
          continue;
        if (
          Math.max(
            (x - left.band!) / sx,
            (right.band! - xEnd) / sx,
            (y - top.band!) / sy,
            (bottom.band! - yEnd) / sy,
          ) > 1.5
        )
          continue;
        add(
          { crop: { x, y, width: xEnd - x, height: yEnd - y }, rows, columns },
          ["paired-numbered-boundaries", convention],
          Math.min(
            top.coverage,
            bottom.coverage,
            left.coverage,
            right.coverage,
          ),
          1.5,
        );
      }
  const lineXs = fitPositions(peaks(sig.grayX)),
    lineYs = fitPositions(peaks(sig.grayY));
  for (const x of lineXs)
    for (const y of lineYs)
      add(
        {
          crop: {
            x: x.start,
            y: y.start,
            width: x.end - x.start,
            height: y.end - y.start,
          },
          rows: y.count - 1,
          columns: x.count - 1,
        },
        ["mixed-weight-lines"],
        Math.min(x.coverage, y.coverage),
      );
  const colorXs = fitPositions(peaks(sig.colorX)).slice(0, 8),
    colorYs = fitPositions(peaks(sig.colorY)).slice(0, 8);
  for (const x of colorXs)
    for (const y of colorYs)
      add(
        {
          crop: {
            x: x.start,
            y: y.start,
            width: x.end - x.start,
            height: y.end - y.start,
          },
          rows: y.count - 1,
          columns: x.count - 1,
        },
        ["color-block-periodicity"],
        Math.min(x.coverage, y.coverage),
      );
  function strength(
    signal: Float64Array,
    start: number,
    end: number,
    count: number,
  ) {
    let sum = 0;
    for (let n = 0; n <= count; n++) {
      const p = Math.round(start + ((end - start) * n) / count);
      let v = 0;
      for (
        let k = Math.max(0, p - 2);
        k <= Math.min(signal.length - 1, p + 2);
        k++
      )
        v = Math.max(v, signal[k]);
      sum += v;
    }
    return sum / (count + 1) / Math.max(0.001, Math.max(...signal));
  }
  if (legacy) add(legacy, ["legacy"], 1);
  for (const c of candidates) {
    if (
      c.methods.includes("legacy") &&
      c.methods.includes("mixed-weight-lines")
    )
      c.score += 0.25;
    if (c.methods.length === 1 && c.methods[0] === "color-block-periodicity") {
      c.score -= 0.5;
      c.methods.push("extent-unverified");
    }
  }
  for (const coarse of candidates)
    for (const fine of candidates) {
      const a = coarse.geometry,
        b = fine.geometry,
        c = a.crop,
        d = b.crop,
        fx = d.width / b.columns,
        fy = d.height / b.rows,
        ratio = c.width / a.columns / fx;
      if (
        ratio < 1.8 ||
        Math.abs(ratio - Math.round(ratio)) > 0.04 ||
        Math.abs(c.height / a.rows / fy - ratio) > 0.04 ||
        !fine.methods.includes("mixed-weight-lines") ||
        fine.coverage < 0.85
      )
        continue;
      if (
        c.x < d.x - 2 ||
        c.y < d.y - 2 ||
        c.x + c.width > d.x + d.width + 2 ||
        c.y + c.height > d.y + d.height + 2
      )
        continue;
      if (
        Math.abs((c.x - d.x) / fx - Math.round((c.x - d.x) / fx)) > 0.15 ||
        Math.abs((c.y - d.y) / fy - Math.round((c.y - d.y) / fy)) > 0.15
      )
        continue;
      const support = Math.min(
        strength(sig.grayX, d.x, d.x + d.width, b.columns),
        strength(sig.grayY, d.y, d.y + d.height, b.rows),
      );
      if (support > 0.72) {
        coarse.score -= 0.6 * (1 - 1 / ratio);
        coarse.methods.push("coarse-alias-penalized");
        break;
      }
    }
  return {
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 24),
    evidence: {
      horizontalAxisBands: xs,
      verticalAxisBands: ys,
      lineX: lineXs,
      lineY: lineYs,
      colorLatticeX: colorXs,
      colorLatticeY: colorYs,
      colorX: Array.from(sig.colorX),
      colorY: Array.from(sig.colorY),
    },
  };
}

/** Detect strong colored transitions that contradict a proposed cell period.
 * Gray grid lines are removed by channel-difference range; headers/legends are
 * excluded by measuring only inside the proposed chart, not the whole page.
 */
export function colorBoundaryAgreement(image: Raster, g: Geometry) {
  const results: { alignment: number; strength: number }[] = [];
  const { data, width: w, height: h } = image,
    c = g.crop;
  for (const axis of ["x", "y"] as const) {
    const start = axis === "x" ? c.x : c.y,
      end = start + (axis === "x" ? c.width : c.height),
      otherStart = axis === "x" ? c.y : c.x,
      otherEnd = otherStart + (axis === "x" ? c.height : c.width),
      spacing = (end - start) / (axis === "x" ? g.columns : g.rows),
      values: { p: number; v: number }[] = [];
    for (let p = Math.ceil(start) + 1; p < end - 1; p++) {
      let v = 0,
        n = 0;
      for (let q = Math.ceil(otherStart) + 1; q < otherEnd - 1; q += 2) {
        const x = axis === "x" ? p : q,
          y = axis === "y" ? p : q;
        if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue;
        const i = (y * w + x) * 4,
          stride = axis === "x" ? 4 : w * 4,
          delta = [0, 1, 2].map(
            (k) => data[i - stride + k] - data[i + stride + k],
          );
        v += Math.min(100, Math.max(...delta) - Math.min(...delta));
        n++;
      }
      values.push({ p, v: v / Math.max(1, n) });
    }
    const max = Math.max(0, ...values.map((v) => v.v));
    let total = 0,
      aligned = 0;
    for (const { p, v } of values)
      if (v >= max * 0.4) {
        total += v;
        const phase = (p - start) / spacing;
        if (
          Math.abs(phase - Math.round(phase)) * spacing <=
          Math.max(2, spacing * 0.12)
        )
          aligned += v;
      }
    results.push({ alignment: total ? aligned / total : 1, strength: max });
  }
  return results;
}
