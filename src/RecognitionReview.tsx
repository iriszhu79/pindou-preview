import { useEffect, useRef, useState } from "react";
import {
  recognitionStats,
  toProject,
  type Geometry,
  type Recognition,
  type GridDiagnostics,
} from "./recognition";
import { VisualGridCrop } from "./VisualGridCrop";
import type { Project } from "./model";
import "./recognition.css";
type Source = {
  url: string;
  name: string;
  width: number;
  height: number;
  image: ImageData;
};
export function RecognitionReview({
  onConfirm,
  onClose,
}: {
  onConfirm: (p: Project) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source | null>(null),
    [result, setResult] = useState<Recognition | null>(null);
  const [geometry, setGeometry] = useState<Geometry>({
    crop: { x: 0, y: 0, width: 0, height: 0 },
    rows: 0,
    columns: 0,
  });
  const [geometryEdited, setGeometryEdited] = useState(false);
  const [diagnostics, setDiagnostics] = useState<GridDiagnostics | null>(null);
  const [failureKind, setFailureKind] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState("grid"),
    [reviewed, setReviewed] = useState(false);
  const [row, setRow] = useState(0),
    [column, setColumn] = useState(0),
    [name, setName] = useState("Recognized chart");
  const baseline = useRef<Recognition | null>(null),
    worker = useRef<Worker | null>(null),
    request = useRef(0),
    fileRequest = useRef(0),
    urlRef = useRef(""),
    disposed = useRef(false);
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      worker.current?.terminate();
      request.current++;
      fileRequest.current++;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);
  async function load(blob: Blob, filename: string) {
    if (disposed.current) return;
    const ticket = ++fileRequest.current;
    worker.current?.terminate();
    request.current++;
    setBusy(false);
    setError("");
    setResult(null);
    setSource(null);
    setDiagnostics(null);
    setFailureKind("");
    setReviewed(false);
    if (
      !["image/jpeg", "image/png"].includes(blob.type) ||
      blob.size > 15 * 1024 * 1024
    ) {
      setError("Recognition Failed: choose a JPG or PNG smaller than 15 MB.");
      return;
    }
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      if (disposed.current || ticket !== fileRequest.current) return;
      if (
        bitmap.width < 80 ||
        bitmap.height < 80 ||
        bitmap.width * bitmap.height > 20000000 ||
        Math.max(bitmap.width, bitmap.height) > 12000
      )
        throw new Error("Use an image between 80px and 20 megapixels.");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas is unavailable.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height),
        url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setSource({
        url,
        name: filename,
        width: canvas.width,
        height: canvas.height,
        image,
      });
      setGeometry({
        crop: { x: 0, y: 0, width: canvas.width, height: canvas.height },
        rows: 0,
        columns: 0,
      });
      setName(filename.replace(/\.[^.]+$/, ""));
      setRow(0);
      setColumn(0);
    } catch (e) {
      if (ticket === fileRequest.current) {
        setSource(null);
        setError(
          `Recognition Failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } finally {
      bitmap?.close();
    }
  }
  async function sample() {
    try {
      const r = await fetch(
        `${import.meta.env.BASE_URL}samples/sample-pattern.jpg`,
      );
      if (!r.ok) throw new Error("Sample could not be loaded.");
      await load(await r.blob(), "MARD source chart.jpg");
    } catch (e) {
      setError(String(e));
    }
  }
  function run(manual: boolean) {
    if (!source) return;
    worker.current?.terminate();
    const ticket = ++request.current;
    setBusy(true);
    setError("");
    setFailureKind("");
    setReviewed(false);
    setResult(null);
    const w = new Worker(new URL("./recognition.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({
      data,
    }: {
      data: {
        result?: Recognition;
        error?: string;
        kind?: string;
        diagnostics?: GridDiagnostics;
      };
    }) => {
      if (ticket !== request.current) return;
      setBusy(false);
      w.terminate();
      if (data.error) {
        setFailureKind(data.kind ?? "analysis-failed");
        if (data.diagnostics) {
          setDiagnostics(data.diagnostics);
          const candidate = data.diagnostics.bestCandidate;
          if (
            candidate &&
            candidate.crop.x >= 0 &&
            candidate.crop.y >= 0 &&
            candidate.crop.x + candidate.crop.width <= source.width &&
            candidate.crop.y + candidate.crop.height <= source.height
          )
            setGeometry(candidate);
        }
        const prefix =
          data.kind === "grid-not-detected"
            ? "Grid not detected"
            : data.kind === "geometry-uncertain"
              ? "Grid geometry uncertain"
              : data.kind === "classification-failed"
                ? "Color classification could not be completed"
                : "Recognition Failed";
        setError(`${prefix}: ${data.error}`);
        return;
      }
      if (data.result) {
        setFailureKind("");
        if (data.result.diagnostics) setDiagnostics(data.result.diagnostics);
        setResult(data.result);
        setGeometryEdited(false);
        baseline.current = structuredClone(data.result);
        setGeometry({
          crop: data.result.crop,
          rows: data.result.rows,
          columns: data.result.columns,
        });
        setRow(0);
        setColumn(0);
      }
    };
    w.onerror = () => {
      if (ticket === request.current) {
        setBusy(false);
        setError(
          "Recognition Failed: image worker could not run. Try a smaller clean chart.",
        );
      }
      w.terminate();
    };
    w.postMessage({
      image: source.image,
      geometry: manual ? geometry : undefined,
    });
  }
  const geometryDirty =
    !!result &&
    (geometryEdited ||
      JSON.stringify({
        crop: result.crop,
        rows: result.rows,
        columns: result.columns,
      }) !== JSON.stringify(geometry));
  const summary = result ? recognitionStats(result) : null,
    selected = result?.cells.find((c) => c.row === row && c.column === column);
  const invalidate = () => setReviewed(false);
  function editCell(code: string | null) {
    if (!result || !selected) return;
    invalidate();
    setResult({
      ...result,
      cells: result.cells.map((c) =>
        c === selected
          ? {
              ...c,
              colorCode: code,
              isEmpty: code === null,
              corrected: true,
              confidence: 1,
              occupancy:
                code === null ? ("empty" as const) : ("occupied" as const),
              occupancyConfidence: 1,
              colorConfidence: 1,
              occupancyReason: "Manually corrected during review",
            }
          : c,
      ),
    });
  }
  function restore() {
    if (!result || !selected || !baseline.current) return;
    invalidate();
    const original = baseline.current.cells.find(
      (c) => c.row === row && c.column === column,
    )!;
    setResult({
      ...result,
      cells: result.cells.map((c) => (c === selected ? { ...original } : c)),
    });
  }
  function rename(index: number, field: "code" | "name", value: string) {
    if (!result) return;
    invalidate();
    const old = result.palette[index].code;
    if (
      field === "code" &&
      (!value.trim() ||
        result.palette.some((p, i) => i !== index && p.code === value))
    ) {
      setError("Palette codes must be nonempty and unique.");
      return;
    }
    setError("");
    const change = (r: Recognition) => ({
      ...r,
      palette: r.palette.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      ),
      cells: r.cells.map((c) =>
        field === "code" && c.colorCode === old
          ? { ...c, colorCode: value }
          : c,
      ),
    });
    setResult(change(result));
    if (baseline.current) baseline.current = change(baseline.current);
  }
  function confirm() {
    if (!result || !reviewed || geometryDirty || error) return;
    try {
      onConfirm(toProject(result, name, `recognized-${crypto.randomUUID()}`));
    } catch (e) {
      setError(String(e));
    }
  }
  function exportData() {
    if (!result) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            source: source
              ? {
                  name: source.name,
                  width: source.width,
                  height: source.height,
                }
              : null,
            recognition: result,
            statistics: recognitionStats(result),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pindou-recognition-review.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="recognition">
      <button className="back overview-back" onClick={onClose}>
        ← Back to Studio
      </button>
      <h1>Pattern recognition · V2.0-B1</h1>
      <p>
        Existing square-grid charts only. Images stay in this browser. Clean
        JPG/PNG up to 15 MB and 20 megapixels; rotated, blurred, or perspective
        photos may need correction.
      </p>
      <div className="recognition-actions">
        <label className="recognition-file">
          Upload existing chart
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f, f.name);
              e.target.value = "";
            }}
          />
        </label>
        <button onClick={() => void sample()}>Load original MARD sample</button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {source && failureKind && (
        <div
          className="recovery-status"
          role="region"
          aria-label="Recognition recovery"
        >
          <p>
            {failureKind === "classification-failed"
              ? "The grid was located, but its colors could not be classified. Inspect the source and crop before retrying."
              : "The grid could not be analyzed reliably."}{" "}
            {failureKind === "geometry-uncertain" && diagnostics?.bestCandidate
              ? "An unverified candidate is shown below; inspect and revise it."
              : "Align the crop over the chart, enter dimensions, and re-analyze. No geometry has been invented."}
          </p>
          <button
            onClick={() =>
              document
                .querySelector(".visual-grid-crop")
                ?.scrollIntoView({ block: "start", behavior: "smooth" })
            }
          >
            Adjust Grid Manually
          </button>
        </div>
      )}
      {source && (
        <>
          <div className="card recognition-geometry">
            <h2>Grid region & dimensions</h2>
            <p>
              {source.name} · {source.width} × {source.height}px. Coordinates
              use the orientation-normalized original image. Auto detection
              needs regular visible grid lines; always inspect its boundaries.
            </p>
            <div className="recognition-fields">
              {(["rows", "columns"] as const).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={geometry[key]}
                    disabled={busy}
                    onChange={(e) => {
                      invalidate();
                      setGeometryEdited(true);
                      setGeometry({
                        ...geometry,
                        [key]: Number(e.target.value),
                      });
                    }}
                  />
                </label>
              ))}
            </div>
            <VisualGridCrop
              key={source.url}
              url={source.url}
              width={source.width}
              height={source.height}
              geometry={geometry}
              disabled={busy}
              onChange={(next) => {
                invalidate();
                setGeometryEdited(true);
                setGeometry(next);
              }}
            />
            {diagnostics?.candidates && diagnostics.candidates.length > 1 && (
              <details className="grid-candidate-options">
                <summary>Other grid candidates</summary>
                <p>
                  Evidence scores rank geometry proposals; they are not
                  recognition accuracy probabilities. Inspect any selected grid,
                  then re-analyze.
                </p>
                {diagnostics.candidates.slice(0, 6).map((candidate, i) => (
                  <button
                    key={i}
                    disabled={busy}
                    onClick={() => {
                      invalidate();
                      setGeometryEdited(true);
                      setGeometry(structuredClone(candidate.geometry));
                    }}
                  >
                    Use candidate {i + 1}: {candidate.geometry.columns} ×{" "}
                    {candidate.geometry.rows} · score{" "}
                    {candidate.score.toFixed(2)}
                  </button>
                ))}
              </details>
            )}
            <details className="advanced-crop-settings">
              <summary>Advanced pixel coordinates</summary>
              <div className="recognition-fields advanced-crop">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key}>
                    Crop {key}
                    <input
                      type="number"
                      min={0}
                      value={geometry.crop[key]}
                      disabled={busy}
                      onChange={(e) => {
                        invalidate();
                        setGeometryEdited(true);
                        setGeometry({
                          ...geometry,
                          crop: {
                            ...geometry.crop,
                            [key]: Number(e.target.value),
                          },
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            </details>
            <div className="recognition-actions">
              <button disabled={busy} onClick={() => run(false)}>
                Detect grid automatically
              </button>
              <button disabled={busy} onClick={() => run(true)}>
                Recognize specified region
              </button>
              {busy && (
                <button
                  onClick={() => {
                    worker.current?.terminate();
                    request.current++;
                    setBusy(false);
                  }}
                >
                  Cancel recognition
                </button>
              )}
            </div>
            {diagnostics && (
              <button
                onClick={() => {
                  const blob = new Blob(
                    [JSON.stringify(diagnostics, null, 2)],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "pindou-grid-diagnostics.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export last automatic grid diagnostics
              </button>
            )}
            <p role="status">
              {busy
                ? "Analyzing in a local worker…"
                : result
                  ? "Recognized · Needs Review. Not yet saved."
                  : "Specify the region manually if automatic detection fails."}
            </p>
          </div>
          <div
            className="recognition-tabs"
            role="group"
            aria-label="Comparison view"
          >
            <button
              aria-pressed={view === "source"}
              onClick={() => setView("source")}
            >
              Original image
            </button>
            <button
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              Digital grid
            </button>
          </div>
          <div className={`recognition-comparison view-${view}`}>
            <section className="card recognition-source">
              <h2>Original image & crop</h2>
              <div className="recognition-image">
                <img src={source.url} alt="Original uploaded bead chart" />
                <svg
                  viewBox={`0 0 ${source.width} ${source.height}`}
                  aria-hidden="true"
                >
                  <rect
                    x={geometry.crop.x}
                    y={geometry.crop.y}
                    width={geometry.crop.width}
                    height={geometry.crop.height}
                    fill="none"
                    stroke="#ae245d"
                    strokeWidth={Math.max(3, source.width / 200)}
                  />
                </svg>
              </div>
            </section>
            <section className="card recognition-digital">
              <h2>Recognized grid · Needs Review</h2>
              {geometryDirty && (
                <p role="alert">
                  Grid settings changed. This grid is stale; re-analyze before
                  reviewing or saving.
                </p>
              )}
              {result ? (
                <>
                  <p>
                    {result.columns} columns × {result.rows} rows ·{" "}
                    {summary?.total} beads ·{" "}
                    {summary?.counts.filter((p) => p.count).length} colors ·{" "}
                    {summary?.uncertain} uncertain cells
                  </p>
                  <p>
                    Orange outlines: uncertain occupancy or color. Click a cell
                    or use row/column controls below.
                  </p>
                  <svg
                    className="recognition-grid"
                    viewBox={`0 0 ${result.columns} ${result.rows}`}
                    style={{ aspectRatio: `${result.columns}/${result.rows}` }}
                    role="img"
                    aria-label="Recognized editable chart"
                    onClick={(e) => {
                      const b = e.currentTarget.getBoundingClientRect();
                      setColumn(
                        Math.min(
                          result.columns - 1,
                          Math.max(
                            0,
                            Math.floor(
                              ((e.clientX - b.left) / b.width) * result.columns,
                            ),
                          ),
                        ),
                      );
                      setRow(
                        Math.min(
                          result.rows - 1,
                          Math.max(
                            0,
                            Math.floor(
                              ((e.clientY - b.top) / b.height) * result.rows,
                            ),
                          ),
                        ),
                      );
                    }}
                  >
                    {result.cells.map((c) => (
                      <rect
                        key={`${c.row}:${c.column}`}
                        x={c.column}
                        y={c.row}
                        width={1}
                        height={1}
                        fill={
                          c.isEmpty
                            ? "#fff"
                            : (result.palette.find(
                                (p) => p.code === c.colorCode,
                              )?.hex ?? "#999")
                        }
                        stroke={
                          c.row === row && c.column === column
                            ? "#292638"
                            : !c.corrected && c.confidence < 0.7
                              ? "#ce6500"
                              : "#d8d4ce"
                        }
                        strokeWidth={
                          c.row === row && c.column === column ? 0.15 : 0.04
                        }
                      >
                        <title>{`Row ${c.row + 1}, column ${c.column + 1}: ${c.colorCode ?? "Empty"}; ${Math.round(c.confidence * 100)}% sampling confidence`}</title>
                      </rect>
                    ))}
                  </svg>
                </>
              ) : (
                <p>Run recognition to display the extracted cells.</p>
              )}
            </section>
          </div>
        </>
      )}
      {result && (
        <>
          <div className="card">
            <h2>Correct a cell</h2>
            <div className="recognition-fields">
              <label>
                Cell row
                <input
                  type="number"
                  min={1}
                  max={result.rows}
                  value={row + 1}
                  onChange={(e) =>
                    setRow(
                      Math.max(
                        0,
                        Math.min(result.rows - 1, Number(e.target.value) - 1),
                      ),
                    )
                  }
                />
              </label>
              <label>
                Cell column
                <input
                  type="number"
                  min={1}
                  max={result.columns}
                  value={column + 1}
                  onChange={(e) =>
                    setColumn(
                      Math.max(
                        0,
                        Math.min(
                          result.columns - 1,
                          Number(e.target.value) - 1,
                        ),
                      ),
                    )
                  }
                />
              </label>
              <label>
                Cell color
                <select
                  aria-label="Cell color"
                  value={selected?.colorCode ?? ""}
                  onChange={(e) => editCell(e.target.value || null)}
                >
                  <option value="">Empty</option>
                  {result.palette.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              Selected: {selected?.colorCode ?? "Empty"} · sampling confidence{" "}
              {Math.round((selected?.confidence ?? 0) * 100)}%
              {selected?.corrected ? " · manually corrected" : ""}
            </p>
            {selected?.occupancyReason && !selected.corrected && (
              <p>
                Occupancy: {selected.occupancy} · {selected.occupancyReason}.
                {selected.colorCode &&
                  ` Color confidence ${Math.round((selected.colorConfidence ?? selected.confidence) * 100)}%.`}
              </p>
            )}
            <button onClick={restore}>Restore recognized cell</button>
          </div>
          <div className="card">
            <h2>Palette & quantities</h2>
            <p>
              Temporary codes are editable. Enter official codes only after
              checking the source legend. Quantities update from the grid.
            </p>
            <div className="recognition-palette">
              {summary?.counts.map((p, i) => (
                <div key={i}>
                  <i style={{ background: p.hex }} />
                  <label>
                    Color {i + 1} code
                    <input
                      aria-label={`Color ${i + 1} code`}
                      defaultValue={p.code}
                      onBlur={(e) => rename(i, "code", e.target.value)}
                    />
                  </label>
                  <label>
                    Label
                    <input
                      defaultValue={p.name}
                      onBlur={(e) => rename(i, "name", e.target.value)}
                    />
                  </label>
                  <strong>{p.count} beads</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Review before saving</h2>
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p>
              {result.method}. Sampling confidence measures pixel consistency,
              not verified recognition accuracy.
            </p>
            <label>
              Project name
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  invalidate();
                }}
              />
            </label>
            {geometryDirty && (
              <p role="alert">
                Grid settings changed. Run recognition again before confirming;
                this replaces draft cell corrections.
              </p>
            )}
            <label className="recognition-confirm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed the grid, dimensions, empty cells and palette, and
              accept remaining uncertainties.
            </label>
            <div className="recognition-actions">
              <button
                className="primary"
                disabled={
                  !reviewed ||
                  geometryDirty ||
                  !!error ||
                  !name.trim() ||
                  !summary?.total
                }
                onClick={confirm}
              >
                Confirm pattern → Overview
              </button>
              <button onClick={exportData}>Export review JSON</button>
            </div>
            <p>
              Only confirmation creates a new project. Existing projects and
              progress are preserved.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
