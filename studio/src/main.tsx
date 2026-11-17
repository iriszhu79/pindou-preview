import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Project, Geometry, LegendEntry } from "./types";
import {
  commit,
  changeGeometry,
  signGrid,
  editDraft,
  reviewCells,
  evidenceFor,
  cellBounds,
  cellAtPoint,
  rectangleSelection,
  undo,
  quality,
  quantities,
  emptySignoff,
  uid,
  now,
} from "./model";
import {
  sourceProject,
  save,
  loadAll,
  imageFor,
  namespace,
  importCandidates,
  candidateInfo,
  exportZip,
  download,
  readZip,
  validateProject,
  sha,
} from "./io";
import "./style.css";
const storageNotice='Public static site: this tool stores images and annotations in this browser and does not upload them. Browser storage can be cleared or evicted. Save and export backups regularly. This site provides no private server or access control.';
function App() {
  const [p, setP] = useState<Project | null>(null),
    [library, setLibrary] = useState<Project[]>([]),
    [blob, setBlob] = useState<Blob | null>(null),
    [url, setUrl] = useState(""),
    [status, setStatus] = useState("No project loaded"),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(0),
    [scope, setScope] = useState<number[]>([0]),
    [multi, setMulti] = useState(false),
    [g, setG] = useState<Geometry | null>(null),
    [zoom, setZoom] = useState(1),
    [size, setSize] = useState(22),
    [tool, setTool] = useState("inspect"),
    [notes, setNotes] = useState(""),
    [evidence, setEvidence] = useState("Original source cell inspected"),
    [attest, setAttest] = useState(false),
    [codeText, setCodeText] = useState(""),
    [gridNotes, setGridNotes] = useState(""),
    [candidate, setCandidate] = useState<any>(null),
    [base, setBase] = useState(0),
    [ack, setAck] = useState(false),
    [batchCode, setBatchCode] = useState(""),
    [legendCode, setLegendCode] = useState(""),
    [legendQty, setLegendQty] = useState(""),
    [legendColor, setLegendColor] = useState("#dddddd"),
    [legendLocation, setLegendLocation] = useState(""),
    [legendNotes, setLegendNotes] = useState(""),
    [legendAttest, setLegendAttest] = useState(false);
  const [editingLegend, setEditingLegend] = useState<string | null>(null);
  const drag = useRef<any>(null);
  const source = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const matrix = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const run = (fn: () => any) => {
    try {
      setError("");
      const result = fn();
      if (result?.catch) result.catch((e: Error) => setError(e.message));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function open(project: Project, b?: Blob) {
    const image = b || (await imageFor(project));
    if (!image) throw Error("Original image missing: reimport a backup ZIP");
    setP(project);
    setBlob(image);
    setG(structuredClone(project.grid.geometry));
    setSelected(0);
    setScope([0]);
    setCandidate(null);
    setAttest(false);
  }
  useEffect(() => {
    loadAll()
      .then(async (list) => {
        setLibrary(list);
        const active = JSON.parse(
          localStorage.getItem(namespace) || "{}",
        ).active;
        const item = list.find((x) => x.id === active);
        if (item) await open(item);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  useEffect(() => {
    if (!p || !blob) return;
    setStatus("Unsaved changes");
    const t = setTimeout(
      () =>
        save(p, blob)
          .then(() => {
            setStatus("Saved locally");
            setLibrary((list) => [p, ...list.filter((x) => x.id !== p.id)]);
          })
          .catch((e) => {
            setStatus("Save failed — export a backup");
            setError(e.message);
          }),
      450,
    );
    return () => clearTimeout(t);
  }, [p, blob]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (
        status === "Unsaved changes" ||
        (p && g && JSON.stringify(g) !== JSON.stringify(p.grid.geometry))
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [status, p, g]);
  const choose = (i: number, extend = false) => {
    if (!p) return;
    setScope(
      extend || multi
        ? rectangleSelection(selected, i, p.grid.geometry.columns)
        : [i],
    );
    setSelected(i);
    setAttest(false);
  };
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!p || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setP(undo(p, e.shiftKey));
        return;
      }
      const delta = (
        {
          ArrowRight: 1,
          ArrowLeft: -1,
          ArrowDown: p.grid.geometry.columns,
          ArrowUp: -p.grid.geometry.columns,
        } as Record<string, number>
      )[e.key];
      if (delta) {
        e.preventDefault();
        choose(
          Math.max(0, Math.min(p.cells.length - 1, selected + delta)),
          e.shiftKey,
        );
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [p, selected, multi]);
  useEffect(() => {
    if (!p || !matrix.current) return;
    const m = matrix.current,
      x = (selected % p.grid.geometry.columns) * size,
      y = Math.floor(selected / p.grid.geometry.columns) * size;
    if (x < m.scrollLeft) m.scrollLeft = x;
    else if (x + size > m.scrollLeft + m.clientWidth)
      m.scrollLeft = x + size - m.clientWidth;
    if (y < m.scrollTop) m.scrollTop = y;
    else if (y + size > m.scrollTop + m.clientHeight)
      m.scrollTop = y + size - m.clientHeight;
  }, [selected, size, p?.grid.geometry.columns]);
  useEffect(() => {
    if (!p || !canvas.current) return;
    const el = canvas.current,
      ctx = el.getContext("2d")!,
      w = matrix.current?.clientWidth || 400,
      h = 450;
    el.width = w * devicePixelRatio;
    el.height = h * devicePixelRatio;
    el.style.width = w + "px";
    el.style.height = h + "px";
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.clearRect(0, 0, w, h);
    const cols = p.grid.geometry.columns;
    for (
      let r = Math.floor(scroll.top / size);
      r < Math.min(p.grid.geometry.rows, Math.ceil((scroll.top + h) / size));
      r++
    )
      for (
        let c = Math.floor(scroll.left / size);
        c < Math.min(cols, Math.ceil((scroll.left + w) / size));
        c++
      ) {
        const i = r * cols + c,
          cell = p.cells[i],
          x = c * size - scroll.left,
          y = r * size - scroll.top;
        const rgb = cell.candidate?.rgb;
        const legend = p.legend.find((e) => e.code === cell.review.code);
        ctx.fillStyle =
          cell.review.occupancy === "empty"
            ? "#fff"
            : cell.review.occupancy === "occupied" && legend?.rgb
              ? `rgb(${legend.rgb})`
              : rgb
                ? `rgb(${rgb})`
                : "#e7e9ec";
        ctx.fillRect(x, y, size, size);
        const disagreement =
          (cell.candidate &&
            cell.review.occupancy !== "unknown" &&
            cell.candidate.occupancy !== "unknown" &&
            cell.candidate.occupancy !== cell.review.occupancy) ||
          cell.evidence.some(
            (e) =>
              e.channel === "printed-code" &&
              cell.review.code &&
              e.value !== cell.review.code,
          );
        ctx.strokeStyle = scope.includes(i)
          ? "#8338ec"
          : disagreement
            ? "#de7200"
            : ["confirmed", "corrected"].includes(cell.review.status)
              ? "#157750"
              : "#a8afb9";
        ctx.lineWidth = scope.includes(i) ? 3 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        if (size >= 24) {
          ctx.fillStyle = "#101b2b";
          ctx.font = "10px sans-serif";
          ctx.fillText(
            cell.review.code || (cell.review.occupancy === "empty" ? "·" : "?"),
            x + 3,
            y + size / 2 + 3,
          );
        }
      }
  }, [p, scope, size, scroll]);
  function point(e: React.PointerEvent) {
    const svg = source.current!,
      rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * p!.source.width,
      y: ((e.clientY - rect.top) / rect.height) * p!.source.height,
    };
  }
  function down(e: React.PointerEvent) {
    if (!p || !g) return;
    const pt = point(e);
    if (tool === "inspect") {
      const i = cellAtPoint(pt.x, pt.y, p.grid.geometry);
      if (i !== null) choose(i, e.shiftKey);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      start: pt,
      geometry: structuredClone(g),
      handle: (e.target as SVGElement).dataset.handle,
      region: p.legendRegion,
    };
  }
  function move(e: React.PointerEvent) {
    if (!drag.current || !p || !g) return;
    const pt = point(e),
      d = drag.current;
    if (tool === "legend") {
      const rect = {
        x: Math.min(pt.x, d.start.x),
        y: Math.min(pt.y, d.start.y),
        width: Math.abs(pt.x - d.start.x),
        height: Math.abs(pt.y - d.start.y),
      };
      setP({ ...p, legendRegion: { rect, verification: emptySignoff() } });
      return;
    }
    const c = d.geometry.crop;
    let x = c.x,
      y = c.y,
      w = c.width,
      h = c.height;
    const dx = pt.x - d.start.x,
      dy = pt.y - d.start.y;
    if (d.handle) {
      const right = c.x + c.width,
        bottom = c.y + c.height;
      const left = d.handle.includes("w")
          ? Math.max(0, Math.min(right - 1, pt.x))
          : c.x,
        top = d.handle.includes("n")
          ? Math.max(0, Math.min(bottom - 1, pt.y))
          : c.y;
      const endX = d.handle.includes("e")
          ? Math.min(p.source.width, Math.max(left + 1, pt.x))
          : right,
        endY = d.handle.includes("s")
          ? Math.min(p.source.height, Math.max(top + 1, pt.y))
          : bottom;
      x = left;
      y = top;
      w = endX - left;
      h = endY - top;
    } else {
      x = Math.max(0, Math.min(p.source.width - w, c.x + dx));
      y = Math.max(0, Math.min(p.source.height - h, c.y + dy));
    }
    setG({ ...g, crop: { x, y, width: w, height: h } });
  }
  async function upload(file: File) {
    if (file.name.endsWith(".zip")) {
      const items = await readZip(file);
      for (const item of items) await save(item.p, item.image);
      setLibrary(await loadAll());
      await open(items[0].p, items[0].image);
      return;
    }
    if (file.name.endsWith(".json")) {
      const raw = JSON.parse(await file.text());
      if (raw.format === "pindou.annotation-studio/project-v1") {
        const project = validateProject(raw);
        if (!blob || (await sha(blob)) !== project.source.sha256)
          throw Error(
            "Load the matching original image before importing a JSON backup, or use a complete ZIP.",
          );
        await open({ ...project, id: uid() }, blob);
        return;
      }
      if (!p) throw Error("Upload the source image first");
      setCandidate(raw);
      setBase(candidateInfo(raw).base);
      setAck(false);
      return;
    }
    const project = await sourceProject(file);
    await open(project, file);
  }
  async function sample() {
    if (!p || !blob) return;
    const image = await createImageBitmap(blob),
      c = document.createElement("canvas");
    c.width = p.source.width;
    c.height = p.source.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    image.close();
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    const changes = p.cells.map((cell, index) => {
      const b = cellBounds(p, index);
      const bins = new Map<string, { count: number; rgb: number[] }>();
      for (
        let y = Math.floor(b.y + b.height * 0.2);
        y < b.y + b.height * 0.8;
        y += Math.max(1, Math.floor(b.height / 8))
      )
        for (
          let x = Math.floor(b.x + b.width * 0.2);
          x < b.x + b.width * 0.8;
          x += Math.max(1, Math.floor(b.width / 8))
        ) {
          const o = (y * c.width + x) * 4,
            rgb = [pixels[o], pixels[o + 1], pixels[o + 2]],
            key = rgb.map((v) => Math.round(v / 16)).join(",");
          const v = bins.get(key) || { count: 0, rgb };
          v.count++;
          bins.set(key, v);
        }
      const rgb = [...bins.values()].sort((a, b) => b.count - a.count)[0]
        ?.rgb || [255, 255, 255];
      return {
        index,
        before: cell,
        after: {
          ...cell,
          candidate: {
            occupancy: cell.candidate?.occupancy || ("unknown" as const),
            rgb,
            group: cell.candidate?.group || null,
            code: cell.candidate?.code || null,
            confidence: null,
            source: "Deterministic interior RGB mode; not an official code",
            at: now(),
          },
          evidence: [
            ...cell.evidence,
            {
              id: uid(),
              channel: "background-color" as const,
              provider: "deterministic-sampling" as const,
              value: rgb,
              at: now(),
              author: "deterministic sampler",
              bounds: b,
              confidence: null,
              source: "Interior quantized RGB mode",
            },
          ],
        },
      };
    });
    setP(commit(p, "evidence.sampled", { cells: changes }));
  }
  if (!p || !g)
    return (
      <main className="welcome">
        <small>PINDOU · INTERNAL QUALITY TOOL</small>
        <h1>Pattern Annotation Studio</h1>
        <p>Build evidence, review cells, preserve uncertainty.</p><p role="note">{storageNotice}</p>
        <p>
          Images and annotations stay in this browser. Candidates never become
          verified answers automatically.
        </p>
        <label className="button">
          Open chart, corpus ZIP or Studio ZIP
          <input
            type="file"
            accept="image/*,.zip,.json"
            onChange={(e) =>
              e.target.files?.[0] && run(() => upload(e.target.files![0]))
            }
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <p>
          Separate local storage • No consumer projects accessed
        </p>
      </main>
    );
  const cell = p.cells[selected],
    bounds = cellBounds(p, selected),
    q = quality(p),
    dirty = JSON.stringify(g) !== JSON.stringify(p.grid.geometry);
  const meta = (key: string, value: string) =>
    setP(
      commit(p, "metadata.edited", {
        meta: { before: p.meta, after: { ...p.meta, [key]: value } },
      }),
    );
  const act = (fn: () => Project) => run(() => setP(fn()));
  const crop = g.crop;
  const handleSize =
    (p.source.width * 44) /
    ((source.current?.parentElement?.clientWidth || 400) * zoom);
  const lines = [...Array(g.columns + 1)]
    .map((_, i) => (
      <line
        key={"v" + i}
        x1={crop.x + (i * crop.width) / g.columns}
        x2={crop.x + (i * crop.width) / g.columns}
        y1={crop.y}
        y2={crop.y + crop.height}
      />
    ))
    .concat(
      [...Array(g.rows + 1)].map((_, i) => (
        <line
          key={"h" + i}
          x1={crop.x}
          x2={crop.x + crop.width}
          y1={crop.y + (i * crop.height) / g.rows}
          y2={crop.y + (i * crop.height) / g.rows}
        />
      )),
    );
  return (
    <>
      <header>
        <div>
          <small>PINDOU / INTERNAL</small>
          <h1>
            Pattern Annotation Studio <span>MVP</span>
          </h1>
        </div>
        <div className="actions">
          <select
            aria-label="Project library"
            value={p.id}
            onChange={(e) =>
              run(() => open(library.find((x) => x.id === e.target.value)!))
            }
          >
            {library.map((x) => (
              <option key={x.id} value={x.id}>
                {x.meta.title}
              </option>
            ))}
          </select>
          <label className="button">
            Import
            <input
              type="file"
              accept="image/*,.zip,.json"
              onChange={(e) =>
                e.target.files?.[0] && run(() => upload(e.target.files![0]))
              }
            />
          </label>
          <button
            onClick={() =>
              run(() => save(p, blob!).then(() => setStatus("Saved locally")))
            }
          >
            Save
          </button>
          <button
            disabled={!p.history.undo.length}
            onClick={() => setP(undo(p))}
          >
            Undo
          </button>
          <button
            disabled={!p.history.redo.length}
            onClick={() => setP(undo(p, true))}
          >
            Redo
          </button>
        </div>
      </header>
      <p role="note" className="storage-notice">{storageNotice}</p>
      <div className="status">
        <b>{status}</b>
        <span>
          {p.source.width} × {p.source.height} · SHA{" "}
          {p.source.sha256.slice(0, 12)}…
        </span>
        <span>
          {q.verified}/{p.cells.length} independently reviewed · {q.unresolved}{" "}
          unresolved
        </span>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <details className="metadata">
        <summary>Project identity, reviewer & provenance</summary>
        <div className="fields">
          {(
            [
              "patternId",
              "title",
              "brand",
              "reviewer",
              "secondReviewer",
              "provenanceNotes",
            ] as const
          ).map((k) => (
            <label key={k}>
              {k}
              <input
                value={p.meta[k]}
                onChange={(e) => meta(k, e.target.value)}
              />
            </label>
          ))}
          <label>
            Purpose
            <select
              aria-label="Purpose"
              value={p.meta.purpose}
              onChange={(e) => meta("purpose", e.target.value)}
            >
              <option value="annotation">Independent human annotation</option>
              <option value="practice">
                Practice / automated QA (never truth)
              </option>
            </select>
          </label>
          <label>
            Provenance
            <select
              aria-label="Provenance"
              value={p.meta.provenance}
              onChange={(e) => meta("provenance", e.target.value)}
            >
              {[
                "unknown",
                "original",
                "conversation-copy",
                "repository-screenshot",
                "derived",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Chart kind
            <select
              aria-label="Chart kind"
              value={p.meta.kind}
              onChange={(e) => meta("kind", e.target.value)}
            >
              <option value="real">Real source chart</option>
              <option value="synthetic">Synthetic test only</option>
            </select>
          </label>
          <label>
            Split
            <select
              aria-label="Split"
              value={p.meta.split}
              onChange={(e) => meta("split", e.target.value)}
            >
              <option>development</option>
              <option>held-out</option>
            </select>
          </label>
        </div>
      </details>
      <nav>
        <a href="#geometry">01 Geometry</a>
        <a href="#evidence">02 Cell evidence</a>
        <a href="#legend">03 Legend</a>
        <a href="#review">04 Human review & export</a>
      </nav>
      {candidate && (
        <section className="importer">
          <h2>Candidate import preview</h2>
          <p>
            Suggestions only. Dimensions {candidateInfo(candidate).rows} ×{" "}
            {candidateInfo(candidate).columns}. Source hash{" "}
            {candidateInfo(candidate).hash || "not supplied"}.
          </p>
          <label>
            Coordinate base
            <select value={base} onChange={(e) => setBase(+e.target.value)}>
              <option value={0}>0-based</option>
              <option value={1}>1-based</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I checked that these candidates belong to this image
          </label>
          <button
            onClick={() =>
              run(() => {
                const geometry = candidateInfo(candidate).geometry;
                if (!geometry) throw Error("No geometry supplied");
                setG(geometry);
              })
            }
          >
            Use geometry hint as draft
          </button>
          <button
            disabled={dirty}
            onClick={() => act(() => importCandidates(p, candidate, base, ack))}
          >
            Import unverified candidates
          </button>
          <button onClick={() => setCandidate(null)}>Close</button>
        </section>
      )}
      <div className="workspace">
        <section id="geometry" className="panel">
          <h2>01 Original chart</h2>
          <div className="tools">
            <select
              aria-label="Source tool"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            >
              <option value="inspect">Inspect cells</option>
              <option value="grid">Adjust grid rectangle</option>
              <option value="legend">Draw legend region</option>
            </select>
            <label>
              Zoom{" "}
              <input
                aria-label="Source zoom"
                type="range"
                min="1"
                max="5"
                step=".25"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                setZoom(1);
                setG(structuredClone(p.grid.geometry));
              }}
            >
              Reset view / draft
            </button>
          </div>
          <div className="source-scroll">
            <svg
              ref={source}
              style={{
                width: zoom * 100 + "%",
                touchAction: tool === "inspect" ? "auto" : "none",
              }}
              viewBox={`0 0 ${p.source.width} ${p.source.height}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => {
                if (tool === "legend" && drag.current) {
                  setP(
                    commit(p, "legend.region.drawn", {
                      region: {
                        before: drag.current.region,
                        after: p.legendRegion,
                      },
                    }),
                  );
                }
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <image
                href={url}
                width={p.source.width}
                height={p.source.height}
              />
              <g
                stroke="#0079c7"
                strokeWidth={p.source.width / 1100}
                opacity=".55"
                pointerEvents="none"
              >
                {lines}
              </g>
              <rect
                {...bounds}
                fill="#9933ee44"
                stroke="#7024ce"
                strokeWidth={3 * zoom}
                pointerEvents="none"
              />
              {p.legendRegion && (
                <rect
                  {...p.legendRegion.rect}
                  fill="#ffbb0022"
                  stroke="#bb7700"
                  strokeWidth="3"
                  pointerEvents="none"
                />
              )}
              {tool === "grid" &&
                (["nw", "ne", "sw", "se"] as const).map((h) => (
                  <rect
                    key={h}
                    data-handle={h}
                    x={
                      (h.includes("w") ? crop.x : crop.x + crop.width) -
                      handleSize / 2
                    }
                    y={
                      (h.includes("n") ? crop.y : crop.y + crop.height) -
                      handleSize / 2
                    }
                    width={handleSize}
                    height={handleSize}
                    fill="#fff"
                    stroke="#0754bd"
                    strokeWidth="3"
                  />
                ))}
            </svg>
          </div>
          <p className="hint">
            Scroll to pan. In Adjust mode drag the rectangle or its corner
            handles. Source pixels remain unchanged.
          </p>
          <div className="fields">
            <label>
              Rows
              <input
                type="number"
                value={g.rows}
                onChange={(e) =>
                  setG({
                    ...g,
                    rows: Math.max(1, Math.min(300, +e.target.value || 1)),
                  })
                }
              />
            </label>
            <label>
              Columns
              <input
                type="number"
                value={g.columns}
                onChange={(e) =>
                  setG({
                    ...g,
                    columns: Math.max(1, Math.min(300, +e.target.value || 1)),
                  })
                }
              />
            </label>
          </div>
          <details>
            <summary>Advanced original-pixel coordinates</summary>
            <div className="fields">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    value={g.crop[k]}
                    onChange={(e) =>
                      setG({ ...g, crop: { ...g.crop, [k]: +e.target.value } })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <button
            disabled={!dirty}
            onClick={() =>
              act(() => {
                if (
                  p.cells.some((c) => c.review.independent) &&
                  !confirm(
                    "Changing geometry archives current reviews and starts a new unreviewed grid. Continue?",
                  )
                )
                  return p;
                return changeGeometry(p, g);
              })
            }
          >
            Apply geometry draft
          </button>
          {dirty && (
            <p className="warning">
              Unapplied geometry — review and qualified export paused.
            </p>
          )}
          <textarea
            aria-label="Alignment evidence"
            placeholder="Alignment notes: first, last and intermediate lines"
            value={gridNotes}
            onChange={(e) => setGridNotes(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
            />
            I independently inspected the source / stated scope
          </label>
          <button
            disabled={dirty}
            onClick={() => act(() => signGrid(p, gridNotes, attest))}
          >
            Confirm geometry
          </button>
          <p>
            Geometry: {p.grid.verification.status}
            {p.grid.verification.status === "verified" &&
            !p.grid.verification.independent
              ? " (practice only)"
              : ""}
          </p>
        </section>
        <section className="panel" id="evidence">
          <h2>02 Structured grid</h2>
          <div className="tools">
            <label>
              Cell zoom
              <input
                type="range"
                min="12"
                max="48"
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={multi}
                onChange={(e) => setMulti(e.target.checked)}
              />
              Rectangle selection
            </label>
            <button onClick={() => run(sample)}>Sample RGB evidence</button>
          </div>
          <div
            ref={matrix}
            className="matrix"
            tabIndex={0}
            aria-label="Structured grid; arrow keys navigate"
            onScroll={(e) =>
              setScroll({
                left: e.currentTarget.scrollLeft,
                top: e.currentTarget.scrollTop,
              })
            }
          >
            <div
              style={{
                width: p.grid.geometry.columns * size,
                height: p.grid.geometry.rows * size,
              }}
            >
              <canvas
                ref={canvas}
                style={{ position: "sticky", left: 0, top: 0 }}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect(),
                    c = Math.floor((e.clientX - r.left + scroll.left) / size),
                    row = Math.floor((e.clientY - r.top + scroll.top) / size);
                  if (c < p.grid.geometry.columns && row < p.grid.geometry.rows)
                    choose(row * p.grid.geometry.columns + c, e.shiftKey);
                }}
              />
            </div>
          </div>
          <p>
            R{cell.row + 1} C{cell.column + 1} · {scope.length} selected ·
            purple = selection · green = reviewed · orange = conflicting
            evidence
          </p>
          <div className="tools">
            <button
              onClick={() => {
                const i = p.cells.findIndex(
                  (c, i) =>
                    i > selected &&
                    !["confirmed", "corrected"].includes(c.review.status),
                );
                if (i >= 0) choose(i);
              }}
            >
              Next unreviewed
            </button>
            <button
              onClick={() => {
                const i = p.cells.findIndex(
                  (c, i) =>
                    i > selected &&
                    ["ambiguous", "unreadable"].includes(c.review.status),
                );
                if (i >= 0) choose(i);
              }}
            >
              Next unresolved
            </button>
          </div>
          <h3>Batch drafts — never verification</h3>
          <input
            aria-label="Batch code"
            placeholder="Official code"
            value={batchCode}
            onChange={(e) => setBatchCode(e.target.value)}
          />
          <button
            onClick={() =>
              act(() =>
                editDraft(p, scope, { occupancy: "occupied", code: batchCode }),
              )
            }
          >
            Assign code draft
          </button>
          <button
            onClick={() =>
              act(() => editDraft(p, scope, { occupancy: "empty" }))
            }
          >
            Empty drafts
          </button>
          <button
            onClick={() =>
              act(() => editDraft(p, scope, { occupancy: "unknown" }))
            }
          >
            Unknown drafts
          </button>
          <button
            disabled={!["confirmed", "corrected"].includes(cell.review.status)}
            onClick={() =>
              act(() =>
                editDraft(
                  p,
                  scope,
                  {
                    occupancy: cell.review.occupancy,
                    code: cell.review.code || "",
                  },
                  "draft.copied",
                ),
              )
            }
          >
            Copy selected reviewed value as drafts
          </button>
        </section>
        <section className="panel" id="review">
          <h2>04 Cell inspector</h2>
          <h3>
            Row {cell.row + 1} · Column {cell.column + 1}
          </h3>
          <svg
            className="cell-crop"
            viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
          >
            <image href={url} width={p.source.width} height={p.source.height} />
          </svg>
          <p>
            Candidate: {cell.candidate?.occupancy || "none"} ·{" "}
            {cell.candidate?.group || "no group"} · RGB{" "}
            {cell.candidate?.rgb?.join(", ") || "not sampled"}
          </p>
          <p className="hint">
            RGB similarity is not an official bead-code identity. Candidate
            confidence is not verification.
          </p>
          <button
            disabled={!cell.candidate}
            onClick={() =>
              act(() =>
                editDraft(
                  p,
                  scope,
                  {
                    occupancy: cell.candidate!.occupancy,
                    code: cell.candidate!.code || "",
                  },
                  "draft.from-candidate",
                ),
              )
            }
          >
            Use candidate as draft
          </button>
          <label>
            Printed code transcription
            <input
              value={codeText}
              onChange={(e) => setCodeText(e.target.value)}
            />
          </label>
          <button onClick={() => act(() => evidenceFor(p, selected, codeText))}>
            Record code evidence only
          </button>
          <ul>
            {cell.evidence
              .filter((e) => e.channel === "printed-code")
              .map((e) => (
                <li key={e.id}>
                  {String(e.value)} — {e.author}
                </li>
              ))}
          </ul>
          <label>
            Final draft occupancy
            <select
              aria-label="Final draft occupancy"
              value={cell.draft.occupancy}
              onChange={(e) =>
                act(() =>
                  editDraft(p, scope, { occupancy: e.target.value as any }),
                )
              }
            >
              {["unknown", "occupied", "empty"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Final draft official code
            <input
              value={cell.draft.code}
              onChange={(e) =>
                act(() =>
                  editDraft(
                    p,
                    scope,
                    { code: e.target.value },
                    "draft.code",
                    "code:" + selected,
                  ),
                )
              }
            />
          </label>
          <label>
            Evidence source
            <input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label>
            Review notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
            />
            I inspected every cell in the selected scope ({scope.length})
            independently
          </label>
          {(["confirmed", "corrected", "ambiguous", "unreadable"] as const).map(
            (s) => (
              <button
                key={s}
                disabled={dirty}
                onClick={() =>
                  act(() => {
                    if (
                      scope.length > 1 &&
                      !confirm(
                        `Review exactly ${scope.length} selected cells as ${s}? Every source cell must have been inspected.`,
                      )
                    )
                      return p;
                    if (
                      s === "confirmed" &&
                      scope.some((i) => {
                        const c = p.cells[i];
                        return (
                          c.candidate &&
                          ((c.candidate.occupancy !== "unknown" &&
                            c.candidate.occupancy !== c.draft.occupancy) ||
                            (c.candidate.code &&
                              c.candidate.code !== c.draft.code))
                        );
                      })
                    )
                      throw Error(
                        "Draft differs from the candidate. Use corrected to record a correction.",
                      );
                    return reviewCells(p, scope, s, notes, evidence, attest);
                  })
                }
              >
                {s}
              </button>
            ),
          )}
          <p>
            Status: <b>{cell.review.status}</b> ·{" "}
            {cell.review.reviewer || "not reviewed"}
          </p>
          <h3>Quality gates</h3>
          <ul>
            {q.checks.map((c) => (
              <li key={c.label}>
                {c.ok ? "✓" : "○"} {c.label}
              </li>
            ))}
          </ul>
          <button
            onClick={() =>
              download(
                p.meta.patternId + "-backup.json",
                new Blob([JSON.stringify(p)], { type: "application/json" }),
              )
            }
          >
            JSON backup
          </button>
          {["Draft", "Silver", "Gold"].map((t) => (
            <button
              key={t}
              disabled={
                dirty ||
                (t === "Gold" && !q.gold) ||
                (t === "Silver" && !q.silver)
              }
              onClick={() =>
                run(async () =>
                  download(
                    `${p.meta.patternId}-${t}.zip`,
                    await exportZip(p, blob!, t),
                  ),
                )
              }
            >
              {t} ZIP
            </button>
          ))}
        </section>
      </div>
      <section id="legend" className="legend">
        <h2>03 Legend & quantity evidence</h2>
        <p>
          Counts below include independently reviewed cells only. Partial
          agreement never proves cell correctness.
        </p>
        <div className="fields">
          <label>
            Official code
            <input
              value={legendCode}
              onChange={(e) => setLegendCode(e.target.value)}
            />
          </label>
          <label>
            Printed quantity (blank = unknown)
            <input
              type="number"
              min="0"
              value={legendQty}
              onChange={(e) => setLegendQty(e.target.value)}
            />
          </label>
          <label>
            Swatch
            <input
              type="color"
              value={legendColor}
              onChange={(e) => setLegendColor(e.target.value)}
            />
          </label>
          <label>
            Evidence location
            <input
              value={legendLocation}
              onChange={(e) => setLegendLocation(e.target.value)}
              placeholder="Legend region / source location"
            />
          </label>
          <label>
            Transcription notes
            <input
              value={legendNotes}
              onChange={(e) => setLegendNotes(e.target.value)}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={legendAttest}
            onChange={(e) => setLegendAttest(e.target.checked)}
          />
          I independently checked this legend entry against the source
        </label>
        <button
          onClick={() =>
            act(() => {
              if (
                !legendCode.trim() ||
                p.legend.some(
                  (e) => e.code === legendCode.trim() && e.id !== editingLegend,
                )
              )
                throw Error("Enter a unique official code");
              if (
                legendQty !== "" &&
                (!Number.isInteger(+legendQty) || +legendQty < 0)
              )
                throw Error("Quantity must be a nonnegative integer or blank");
              if (
                legendAttest &&
                (!p.meta.reviewer.trim() ||
                  !legendNotes.trim() ||
                  !legendLocation.trim())
              )
                throw Error("Reviewer, notes and evidence location required");
              const id = uid(),
                entry: LegendEntry = {
                  id: editingLegend || uid(),
                  brand: p.meta.brand,
                  code: legendCode.trim(),
                  rgb: [1, 3, 5].map((i) =>
                    parseInt(legendColor.slice(i, i + 2), 16),
                  ),
                  quantity: legendQty === "" ? null : +legendQty,
                  location: legendLocation,
                  verification: legendAttest
                    ? {
                        status: "verified",
                        reviewer: p.meta.reviewer,
                        at: now(),
                        independent: p.meta.purpose === "annotation",
                        notes: legendNotes,
                        eventId: id,
                      }
                    : emptySignoff(),
                  resolution: null,
                };
              return commit(
                p,
                "legend.recorded",
                {
                  legend: {
                    before: p.legend,
                    after: editingLegend
                      ? p.legend.map((e) =>
                          e.id === editingLegend ? entry : e,
                        )
                      : [...p.legend, entry],
                  },
                },
                [],
                id,
              );
            })
          }
        >
          {editingLegend ? "Update legend evidence" : "Add legend evidence"}
        </button>
        <button
          onClick={() => {
            setEditingLegend(null);
            setLegendCode("");
            setLegendQty("");
            setLegendAttest(false);
          }}
        >
          New entry
        </button>
        <p>
          Legend rectangle:{" "}
          {p.legendRegion
            ? JSON.stringify(p.legendRegion.rect)
            : "not drawn — choose Draw legend region on the source"}
        </p>
        <button
          disabled={!p.legendRegion}
          onClick={() =>
            act(() => {
              if (
                !legendAttest ||
                !legendNotes.trim() ||
                !p.meta.reviewer.trim()
              )
                throw Error(
                  "Explicit legend inspection, reviewer and notes required",
                );
              const id = uid();
              return commit(
                p,
                "legend.region.verified",
                {
                  region: {
                    before: p.legendRegion,
                    after: {
                      ...p.legendRegion!,
                      verification: {
                        status: "verified",
                        reviewer: p.meta.reviewer,
                        at: now(),
                        independent: p.meta.purpose === "annotation",
                        notes: legendNotes,
                        eventId: id,
                      },
                    },
                  },
                },
                [],
                id,
              );
            })
          }
        >
          Confirm legend region
        </button>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Printed</th>
              <th>Reviewed</th>
              <th>Comparison</th>
              <th>Adjudication</th>
            </tr>
          </thead>
          <tbody>
            {quantities(p).map((row) => (
              <tr key={row.code}>
                <td>{row.code}</td>
                <td>{row.printed ?? "unknown"}</td>
                <td>{row.count}</td>
                <td>
                  {row.status}
                  {row.resolution ? " · justified" : ""}
                </td>
                <td>
                  {row.entry && (
                    <button
                      onClick={() => {
                        const e = row.entry;
                        setEditingLegend(e.id);
                        setLegendCode(e.code);
                        setLegendQty(
                          e.quantity === null ? "" : String(e.quantity),
                        );
                        setLegendLocation(e.location);
                        setLegendNotes(e.verification.notes);
                        setLegendAttest(false);
                        setLegendColor(
                          "#" +
                            (e.rgb || [220, 220, 220])
                              .map((v) => v.toString(16).padStart(2, "0"))
                              .join(""),
                        );
                      }}
                    >
                      Edit entry
                    </button>
                  )}
                  {row.entry && (
                    <button
                      onClick={() =>
                        act(() => {
                          const reason = prompt(
                            "Explain the source-supported discrepancy; this never changes cell values.",
                          );
                          if (!reason?.trim() || !p.meta.reviewer.trim())
                            throw Error("Reviewer and justification required");
                          const id = uid();
                          return commit(
                            p,
                            "legend.adjudicated",
                            {
                              legend: {
                                before: p.legend,
                                after: p.legend.map((e) =>
                                  e.id === row.entry.id
                                    ? {
                                        ...e,
                                        resolution: {
                                          notes: reason,
                                          reviewer: p.meta.reviewer,
                                          at: now(),
                                          eventId: id,
                                          count: row.count,
                                          quantity: e.quantity,
                                          gridRevision: p.grid.revision,
                                        },
                                      }
                                    : e,
                                ),
                              },
                            },
                            [],
                            id,
                          );
                        })
                      }
                    >
                      Justify discrepancy
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <details className="audit">
        <summary>
          Audit trail · {p.audit.length} events · {p.archives.length} archived
          grids
        </summary>
        {p.audit
          .slice(-30)
          .reverse()
          .map((e) => (
            <p key={e.id}>
              {e.sequence} · {e.at} · {e.actor} · {e.action} · {e.scope.length}{" "}
              cells
            </p>
          ))}
      </details>
      <footer>
        Local-only annotation tool · {namespace} · No OCR · Unknown ≠ empty · No
        accuracy claim
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
