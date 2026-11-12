import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import {
  createProject,
  loadProjects,
  stats,
  stepCells,
  markStep,
  coordinate,
  recommendation,
  cellAt,
  markCell,
  switchStrategy,
  startRoute,
  routeCoordinates,
  adjacentStep,
  stepLabel,
  type CellAddress,
  type Project,
} from "./model";
import "./style.css";
import "./workspace.css";
import "./mobile-workspace.css";
import "./preview-design.css";
import "./round2.css";
import { PROJECT_STORAGE_KEY } from "./storage";
import { GameStart, GamePanel, ConsolePad } from "./previewDesign";
import { confirmConsoleCompletion, consoleActionLabel } from "./consoleActions";
import { useConsoleKeyboard } from "./useConsoleKeyboard";
import { directionalStep } from "./consoleNavigation";
import { MobileDrawer } from "./MobileDrawer";
import { usePhonePortrait } from "./usePhonePortrait";
import { stepPanDelta } from "./viewport";
import { Grid, CELL } from "./Grid";
import { StepNavigation, StepPositions } from "./StepTools";
import { useCanvasInteraction } from "./useCanvasInteraction";
function Strategy({ p, update }: { p: Project; update: (p: Project) => void }) {
  return (
    <div className="strategy">
      <div className="segmented strategy-cards">
        {(["row", "column"] as const).map((s) => (
          <button
            key={s}
            className={p.strategy === s ? "selected" : ""}
            onClick={() => update(switchStrategy(p, s))}
          >
            <span className={`strategy-mini ${s}`} aria-hidden="true" />
            <span>
              {s === "row" ? "☷ Row-by-Row" : "▥ Column-by-Column"}
              <small>
                {s === "row"
                  ? "Bead across, one row at a time."
                  : "Bead down, one column at a time."}
              </small>
            </span>
          </button>
        ))}
      </div>
      <label>
        Starting direction
        <select
          value={p.reverse ? "reverse" : "forward"}
          onChange={(e) =>
            update(switchStrategy(p, p.strategy, e.target.value === "reverse"))
          }
        >
          <option value="forward">
            {p.strategy === "row" ? "Top to bottom ↓" : "Left to right →"}
          </option>
          <option value="reverse">
            {p.strategy === "row" ? "Bottom to top ↑" : "Right to left ←"}
          </option>
        </select>
      </label>
    </div>
  );
}
function App() {
  useEffect(() => {
    document.body.classList.add("v15-preview");
    return () => document.body.classList.remove("v15-preview");
  }, []);
  const phone = usePhonePortrait();
  const [saved, setSaved] = useState(loadProjects);
  const [p, setP] = useState<Project>(
    () => loadProjects()[0] ?? createProject(),
  );
  const [page, setPage] = useState("home");
  const [upload, setUpload] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [select, setSelect] = useState(false);
  const [undo, setUndo] = useState<Project[]>([]);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [selected, setSelected] = useState<CellAddress | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const chooseCell = useCallback(
    (address: CellAddress | null) => setSelected(address),
    [],
  );
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const file = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => stats(p.grid, p.palette), [p.grid, p.palette]);
  const total = counts.reduce((a, c) => a + c.count, 0),
    done = counts.reduce((a, c) => a + c.done, 0);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const cells = useMemo(
    () => stepCells(p),
    [p.grid, p.step, p.strategy, p.reverse, p.rows, p.columns],
  );
  const rec = useMemo(() => recommendation(p), [p.grid, p.rows, p.columns]);
  const selectedCell = cellAt(p, selected);
  const previous = useMemo(
    () => adjacentStep(p, -1, showEmpty),
    [p, showEmpty],
  );
  const next = useMemo(() => adjacentStep(p, 1, showEmpty), [p, showEmpty]);
  useEffect(() => setSelected(null), [p.id]);
  useEffect(() => {
    if (selected && !cellAt(p, selected)) setSelected(null);
  }, [p.grid, selected]);
  const updateRoute = (project: Project) => {
    setShowEmpty(false);
    setP(project);
  };
  const resume = (project: Project) => {
    if(project.id!==p.id){setSelected(null);setUndo([]);}
    // Preserve a valid meaningful saved position; legacy empty positions are not
    // beading tasks. Route to remaining work without migrating the stored format.
    setShowEmpty(false);
    setP(stepCells(project).length ? project : startRoute(project));
  };
  useEffect(() => {
    if (page === "home") return;
    const next = [
      { ...p, updatedAt: new Date().toISOString() },
      ...saved.filter((v) => v.id !== p.id),
    ];
    setSaved(next);
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
      setError("");
    } catch {
      setError(
        "Local storage is unavailable. Progress stays in this tab but cannot be saved.",
      );
    }
  }, [p, page]);
  useEffect(
    () => () => {
      if (upload) URL.revokeObjectURL(upload.url);
    },
    [upload],
  );
  useEffect(() => setUndo([]), [p.id]);
  useEffect(() => {
    if (upload)
      document.querySelector(".upload")?.scrollIntoView({ block: "start" });
  }, [upload]);
  const change = (n: Project) => {
    if (n === p) return;
    setUndo((v) => [...v.slice(-29), p]);
    setP(n);
  };
  const open = () => {
    resume(
      saved.find((project) => project.id === "flower-demo") ?? createProject(),
    );
    setPage("overview");
    setUpload(null);
  };
  const focus = (force = true) => {
    const el = stage.current;
    const svg = el?.querySelector("svg");
    const active = svg?.querySelector<SVGRectElement>("[data-active-step]");
    if (!el || !active || !svg) return;
    const delta = stepPanDelta(
      active.getBoundingClientRect(),
      el.getBoundingClientRect(),
      p.strategy,
      force,
    );
    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) return;
    const pattern = svg.parentElement!;
    if (phone) {
      setPan({
        x: Number(pattern.dataset.panX) + delta.x,
        y: Number(pattern.dataset.panY) + delta.y,
      });
    } else {
      const transform = new DOMMatrix(getComputedStyle(pattern).transform);
      setPan({ x: transform.m41 + delta.x, y: transform.m42 + delta.y });
    }
  };
  const { stage, scale, pan, setPan, zoom, fit, hand, dragging, handlers } =
    useCanvasInteraction(select, chooseCell);

  useEffect(() => {
    if (page !== "workspace") return;
    document.body.classList.add("workspace-open");
    return () => document.body.classList.remove("workspace-open");
  }, [page]);
  useEffect(() => {
    if (page !== "workspace" || !stage.current) return;
    const element = stage.current;
    const measure = () =>
      setStageSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page]);
  useEffect(() => {
    if (page !== "workspace") return;
    const frame = requestAnimationFrame(() => focus(false));
    return () => cancelAnimationFrame(frame);
  }, [
    page,
    p.id,
    p.step,
    p.strategy,
    p.reverse,
    p.rows,
    p.columns,
    stageSize.width,
    stageSize.height,
  ]);
  const routeSettings = (
    <div
      className="workspace-route"
      role="group"
      aria-label="Beading route settings"
    >
      <label>
        Strategy
        <select
          aria-label="Beading strategy"
          value={p.strategy}
          onChange={(e) =>
            updateRoute(
              switchStrategy(p, e.target.value as Project["strategy"]),
            )
          }
        >
          <option value="row">Row-by-Row</option>
          <option value="column">Column-by-Column</option>
        </select>
      </label>
      <label>
        Direction
        <select
          aria-label="Workspace starting direction"
          value={p.reverse ? "reverse" : "forward"}
          onChange={(e) =>
            updateRoute(
              switchStrategy(p, p.strategy, e.target.value === "reverse"),
            )
          }
        >
          <option value="forward">
            {p.strategy === "row" ? "Top to bottom ↓" : "Left to right →"}
          </option>
          <option value="reverse">
            {p.strategy === "row" ? "Bottom to top ↑" : "Right to left ←"}
          </option>
        </select>
      </label>
      <label className="show-empty">
        <input
          type="checkbox"
          checked={showEmpty}
          onChange={(e) => {
            setShowEmpty(e.target.checked);
            if (!e.target.checked && !stepCells(p).length) setP(startRoute(p));
          }}
        />{" "}
        Show empty steps
      </label>
    </div>
  );
  const baseWidth = Math.max(
    1,
    Math.min(
      stageSize.width - 32,
      ((stageSize.height - 32) * (p.columns * CELL + 40)) /
        (p.rows * CELL + 40),
    ),
  );
  const renderedWidth = phone ? baseWidth * scale : baseWidth;
  const renderedHeight =
    (renderedWidth * (p.rows * CELL + 40)) / (p.columns * CELL + 40);
  const undoLast = () => {
    if (!undo.length) return;
    const previous = undo[undo.length - 1];
    // Undo completion edits without rewinding the currently chosen route or step.
    setP({ ...p, grid: previous.grid });
    setUndo((v) => v.slice(0, -1));
  };
  useConsoleKeyboard(page === "workspace", {
    navigate: (direction) => {
      const target = directionalStep(p, direction, showEmpty);
      if (target) setP(target);
    },
    complete: () => change(confirmConsoleCompletion(p, select, selected)),
    undo: undoLast,
  });
  const showStudio = () => {
    setPage("home");
    requestAnimationFrame(() =>
      document.querySelector(".recent")?.scrollIntoView({ block: "start" }),
    );
  };
  const actionLabel = consoleActionLabel(p, select, selected);
  const canConfirm =
    select && selectedCell
      ? !selectedCell.isCompleted
      : cells.some((cell) => !cell.isCompleted);
  const actionButtons = (
    <div
      className="console-ab"
      role="group"
      aria-label="Console completion controls"
    >
      <span className="console-action">
        <button
          className="console-a"
          title={`A: ${actionLabel}`}
          aria-label={`A: ${actionLabel}`}
          disabled={!canConfirm}
          onClick={() => change(confirmConsoleCompletion(p, select, selected))}
        >
          <b>A</b>
        </button>
        <small aria-hidden="true">Complete</small>
      </span>
      <span className="console-action">
        <button
          className="console-b"
          aria-label="B: Undo last completion"
          title="B: Undo last completion"
          disabled={!undo.length}
          onClick={undoLast}
        >
          <b>B</b>
        </button>
        <small aria-hidden="true">Undo</small>
      </span>
    </div>
  );
  const extraControls = (
    <GamePanel title="Console controls">
      <ConsolePad p={p} showEmpty={showEmpty} onNavigate={setP} />
      <p className="console-explanation">
        A: {actionLabel}. B: undo the last completion change.
      </p>
      {actionButtons}
    </GamePanel>
  );
  return (
    <>
      <header>
        <button className="logo" onClick={() => setPage("home")}>
          <span>✿</span> PINDOU<sup>✦</sup>
        </button>
        <nav>
          <button className="studio-nav" onClick={showStudio}>
            My Studio
          </button>
        </nav>
      </header>
      <main
        className={
          page === "workspace"
            ? `workspace-main${focusMode ? " focus-mode" : ""}${phone ? " phone-workspace" : ""}`
            : undefined
        }
      >
        {page === "workspace" && (
          <div className="preview-workspace-note" role="note">
            <b>V1.5 PREVIEW</b>
            <span>Separate saves · V1.4 untouched</span>
          </div>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {page === "home" && (
          <>
            <GameStart onSample={open} onUpload={() => file.current?.click()} />
            {upload && (
              <section className="card upload">
                <div>
                  <div className="eyebrow">YOUR UPLOAD · PREVIEW ONLY</div>
                  <h2>{upload.name}</h2>
                  <p>
                    Automatic image recognition isn't available in Phase 1. This
                    image has not been parsed. Try the synthetic demo for an
                    interactive workspace.
                  </p>
                  <button onClick={open}>Use sample →</button>{" "}
                  <button onClick={() => setUpload(null)}>Close preview</button>
                </div>
                <img
                  src={upload.url}
                  alt="Uploaded pattern preview"
                  onError={() =>
                    setError(
                      "This image format cannot be displayed. Try PNG or JPEG.",
                    )
                  }
                />
              </section>
            )}
            <section className="recent">
              <div className="section-title">
                <div>
                  <div className="eyebrow">YOUR SAVE SLOTS</div>
                  <h2>
                    Saved adventures{" "}
                    <sup>{String(saved.length).padStart(2, "0")}</sup>
                  </h2>
                </div>
                <small>Preview saves on this device</small>
              </div>
              {saved.length ? (
                saved.map((v) => (
                  <button
                    className="project"
                    key={v.id}
                    onClick={() => {
                      resume(v);
                      setPage("workspace");
                      fit();
                    }}
                  >
                    <div className="thumb">
                      <Grid p={v} />
                    </div>
                    <div>
                      <span className="tag">SYNTHETIC DEMO</span>
                      <h3>{v.name}</h3>
                      <p>
                        {v.columns} × {v.rows} ·{" "}
                        {stats(v.grid, v.palette).filter((c) => c.count).length}{" "}
                        colors
                      </p>
                      <small>
                        {v.grid.filter((c) => c.isCompleted).length} beads
                        placed · Continue →
                      </small>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty">
                  <span>▧</span>
                  <div>
                    <h3>Your next little masterpiece starts here.</h3>
                    <p>
                      Upload an image to preview it, or find your flow with our
                      sample.
                    </p>
                  </div>
                  <button onClick={open}>Explore the sample →</button>
                </div>
              )}
            </section>
          </>
        )}
        {page === "overview" && (
          <>
            <div className="preparation-strip">
              ✦ LEVEL PREPARATION <span>Pattern · Inventory · Route</span>
            </div>
            <button className="back overview-back" onClick={showStudio}>
              ← Back to Studio
            </button>
            <div className="page-heading">
              <div className="eyebrow">A SMALL PROJECT, A HAPPY MOMENT</div>
              <h1>{p.name}</h1>
              <p>Pick your supplies. Choose a route. Make something little.</p>
            </div>
            <div className="overview">
              <section className="card preview">
                <div className="board-label">
                  PATTERN BOARD <span className="tag">SYNTHETIC DEMO</span>
                </div>
                <Grid
                  p={p}
                  active
                  onStep={(step) => {
                    const next = { ...p, step };
                    if (!stepCells(next).length) setShowEmpty(true);
                    setP(next);
                  }}
                />
                <p>{p.name} · Tap a row or column to preview</p>
                <StepNavigation p={p} update={setP} showEmpty={showEmpty} />
                <details>
                  <summary>About this sample & original reference</summary>
                  <p>
                    {p.id === "flower-demo"
                      ? "This synthetic flower is not a transcription of the original 40 × 51 chart."
                      : "This project uses structured grid data."}{" "}
                    All counts come from the {p.columns} × {p.rows} project
                    grid. The original's 1,179-bead total is not used here.
                  </p>
                  <a
                    href={`${import.meta.env.BASE_URL}samples/sample-pattern.jpg`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View original chart ↗
                  </a>
                </details>
              </section>
              <div className="info">
                <section className="card">
                  <h2 className="panel-heading">✦ Project info ✦</h2>
                  <div className="metrics">
                    <div>
                      <b>
                        {p.columns} × {p.rows}
                      </b>
                      <small>GRID SIZE</small>
                    </div>
                    <div>
                      <b>{total}</b>
                      <small>BEADS</small>
                    </div>
                    <div>
                      <b>{counts.filter((c) => c.count).length}</b>
                      <small>COLORS</small>
                    </div>
                  </div>
                  <h3 className="panel-heading">▣ Bead inventory</h3>
                  <div className="palette">
                    {counts.map((c) => (
                      <div key={c.code}>
                        <i style={{ background: c.hex }} />
                        <b>{c.code}</b>
                        <span>{c.name}</span>
                        <strong>
                          {c.count} <small>beads</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <h2 className="panel-heading">⚑ Beading strategy</h2>
                  <Strategy p={p} update={updateRoute} />
                  <div className="recommend">
                    <b>
                      ✦ Route hint <small>EXPERIMENTAL</small>
                    </b>
                    <p>
                      {rec.strategy === "row"
                        ? "Row-by-row"
                        : "Column-by-column"}{" "}
                      has fewer or equal continuous color runs (
                      {Math.min(rec.row, rec.column)} vs{" "}
                      {Math.max(rec.row, rec.column)}). This simple estimate may
                      reduce color changes. Choose what feels comfortable.
                    </p>
                    <button
                      onClick={() =>
                        updateRoute(
                          startRoute({ ...p, strategy: rec.strategy }),
                        )
                      }
                    >
                      Use suggestion
                    </button>
                  </div>
                  <button
                    className="primary full"
                    onClick={() => {
                      setPage("workspace");
                      fit();
                    }}
                  >
                    START BEADING →
                  </button>
                </section>
              </div>
            </div>
          </>
        )}
        {page === "workspace" && (
          <>
            <p
              className="keyboard-hint"
              title="With a bead focused, arrow keys inspect cells. Click the canvas margin for step shortcuts."
            >
              ↑↓ / ←→ Navigate · A Complete · B Undo
            </p>
            <div className="workspace-heading">
              <div>
                <button
                  className="back"
                  aria-label="Pattern overview"
                  title="Exit workspace"
                  onClick={() => setPage("overview")}
                >
                  ←
                </button>
                <h2 title={p.name}>
                  {p.name} <span className="tag">DEMO</span>
                </h2>
              </div>
              {!phone && (
                <select
                  className="focus-route"
                  aria-label="Focus route"
                  value={`${p.strategy}-${p.reverse ? "reverse" : "forward"}`}
                  onChange={(e) => {
                    const [axis, direction] = e.target.value.split("-");
                    updateRoute(
                      switchStrategy(
                        p,
                        axis as Project["strategy"],
                        direction === "reverse",
                      ),
                    );
                  }}
                >
                  <option value="row-forward">Rows ↓</option>
                  <option value="row-reverse">Rows ↑</option>
                  <option value="column-forward">Columns →</option>
                  <option value="column-reverse">Columns ←</option>
                </select>
              )}
              {phone && focusMode && (
                <div className="phone-focus-tools">
                  <button
                    aria-pressed={hand}
                    className={hand ? "selected" : ""}
                    onClick={() => setSelect(false)}
                  >
                    ✥ Hand
                  </button>
                  <button
                    aria-pressed={!hand}
                    className={!hand ? "selected" : ""}
                    onClick={() => setSelect(true)}
                  >
                    ✓ Select
                  </button>
                  <details className="focus-zoom-menu">
                    <summary aria-label="Zoom controls">
                      {Math.round(scale * 100)}% ▾
                    </summary>
                    <div>
                      <button
                        aria-label="Zoom out"
                        onClick={(event) => {
                          zoom(0.8);
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      >
                        −
                      </button>
                      <button
                        aria-label="Zoom in"
                        onClick={(event) => {
                          zoom(1.25);
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      >
                        +
                      </button>
                      <button
                        onClick={(event) => {
                          fit();
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      >
                        Fit
                      </button>
                    </div>
                  </details>
                </div>
              )}
              <button
                className="focus-mode-toggle"
                aria-pressed={focusMode}
                onClick={() => setFocusMode((v) => !v)}
              >
                {focusMode ? "Exit Focus" : "Focus mode"}
              </button>
              <div className="progress-info">
                <b>{percent}%</b> complete
                <div className="progress">
                  <i style={{ width: `${percent}%` }} />
                </div>
                <small>
                  {done} / {total} beads ·{" "}
                  {error ? "Unsaved" : "Preview saves on this device"}
                </small>
              </div>
            </div>
            {!phone && routeSettings}
            <div className="workspace">
              <section className="canvas-card">
                <div className="toolbar">
                  <div>
                    <button
                      aria-pressed={hand}
                      className={hand ? "selected" : ""}
                      onClick={() => setSelect(false)}
                    >
                      ✥ Hand
                    </button>
                    <button
                      aria-pressed={!hand}
                      className={!hand ? "selected" : ""}
                      onClick={() => setSelect(true)}
                    >
                      ✓ Select
                    </button>
                  </div>
                  <span>{Math.round(scale * 100)}%</span>
                  <div>
                    <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
                      −
                    </button>
                    <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
                      +
                    </button>
                    <button onClick={fit}>Fit</button>
                  </div>
                </div>
                {!phone && (select || selectedCell) && (
                  <section
                    className="selection-context"
                    aria-label="Selected bead"
                  >
                    {selectedCell ? (
                      <>
                        <div aria-live="polite">
                          <strong>
                            Row {selectedCell.row + 1} · Column{" "}
                            {selectedCell.column + 1}
                          </strong>
                          <span>
                            Color: {selectedCell.colorCode} ·{" "}
                            {selectedCell.isCompleted
                              ? "Completed"
                              : "Not completed"}
                          </span>
                        </div>
                        <button
                          className="selected-action"
                          onClick={() =>
                            change(
                              markCell(
                                p,
                                selectedCell,
                                !selectedCell.isCompleted,
                              ),
                            )
                          }
                        >
                          {selectedCell.isCompleted
                            ? "Undo Completion"
                            : "Mark Selected Complete"}
                        </button>
                        <button
                          className="clear-selection"
                          aria-label="Clear selection"
                          onClick={() => setSelected(null)}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <p>
                        Tap a bead to inspect its color and coordinates.
                        Completion is a separate action.
                      </p>
                    )}
                  </section>
                )}
                <div
                  className={`stage ${hand ? "hand-mode" : "select-mode"}${dragging && hand ? " is-dragging" : ""}`}
                  ref={stage}
                  tabIndex={0}
                  aria-label="Pattern canvas"
                  aria-describedby="canvas-help"
                  {...handlers}
                >
                  <div
                    className="canvas-pattern"
                    data-pan-x={pan.x}
                    data-pan-y={pan.y}
                    style={
                      phone
                        ? {
                            width: `${renderedWidth}px`,
                            height: `${renderedHeight}px`,
                            maxWidth: "none",
                            position: "absolute",
                            left: `calc(50% + ${pan.x}px)`,
                            top: `calc(50% + ${pan.y}px)`,
                            marginLeft: `${-renderedWidth / 2}px`,
                            marginTop: `${-renderedHeight / 2}px`,
                            transform: "none",
                            willChange: "auto",
                          }
                        : {
                            aspectRatio: `${p.columns * CELL + 40} / ${p.rows * CELL + 40}`,
                            width: `${baseWidth}px`,
                            maxWidth: "none",
                            transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`,
                          }
                    }
                  >
                    <Grid
                      p={p}
                      active
                      selected={selectedCell ? selected : null}
                      onSelect={!hand ? chooseCell : undefined}
                    />
                  </div>
                </div>
                <div className="canvas-caption">
                  <span id="canvas-help">
                    {hand
                      ? "Drag to pan · Ctrl/⌘ + scroll to zoom"
                      : "Tap to select, then complete · Space to pan"}
                  </span>
                  <div
                    className="canvas-step-nav"
                    role="group"
                    aria-label="Canvas step navigation"
                  >
                    <button
                      aria-label="Previous canvas step"
                      title="Previous step (does not mark complete)"
                      disabled={!previous}
                      onClick={() => previous && setP(previous)}
                    >
                      {p.strategy === "row"
                        ? p.reverse
                          ? "↓"
                          : "↑"
                        : p.reverse
                          ? "→"
                          : "←"}
                    </button>
                    <span>
                      {p.strategy === "row" ? "Row" : "Column"}{" "}
                      {coordinate(p) + 1}
                    </span>
                    <button
                      aria-label="Next canvas step"
                      title="Next step (does not mark complete)"
                      disabled={!next}
                      onClick={() => next && setP(next)}
                    >
                      {p.strategy === "row"
                        ? p.reverse
                          ? "↑"
                          : "↓"
                        : p.reverse
                          ? "←"
                          : "→"}
                    </button>
                  </div>
                  <button
                    className="console-focus-step"
                    title="Focus current step"
                    aria-label="Focus step"
                    onClick={() => focus()}
                  >
                    ⌖ <span>Focus step</span>
                  </button>
                  {actionButtons}
                </div>
              </section>
              {phone ? (
                <MobileDrawer
                  p={p}
                  expanded={panelExpanded}
                  setExpanded={setPanelExpanded}
                  selected={selectedCell}
                  settings={routeSettings}
                  showEmpty={showEmpty}
                  extras={extraControls}
                  canUndo={!!undo.length}
                  onUndo={undoLast}
                  onStepComplete={() =>
                    change(markStep(p, !cells.every((c) => c.isCompleted)))
                  }
                  onSelectedComplete={() =>
                    selectedCell &&
                    change(markCell(p, selectedCell, !selectedCell.isCompleted))
                  }
                  onClearSelection={() => setSelected(null)}
                />
              ) : (
                <aside
                  className={`card task-panel ${panelExpanded ? "expanded" : "collapsed"}`}
                  aria-label="Beading task"
                >
                  {total > 0 && done === total && (
                    <div className="finished-banner" role="status">
                      ✦ Project complete · all {total} beads placed
                    </div>
                  )}
                  <div className="task-heading">
                    <h2 className="step-title">{stepLabel(p, showEmpty)}</h2>

                    <button
                      className="panel-toggle"
                      aria-expanded={panelExpanded}
                      aria-controls="task-details"
                      onClick={() => setPanelExpanded((v) => !v)}
                    >
                      {panelExpanded ? "− Less" : "+ Details"}
                    </button>
                  </div>
                  <p className="remaining-summary" aria-live="polite">
                    <span>
                      {cells.length} total ·{" "}
                      {cells.filter((c) => c.isCompleted).length} completed
                      ·{" "}
                    </span>
                    {cells.filter((c) => !c.isCompleted).length} remaining
                  </p>
                  <div
                    className="color-chips"
                    role="list"
                    tabIndex={0}
                    aria-label="Remaining beads by color"
                  >
                    {stats(cells, p.palette)
                      .filter((c) => c.count)
                      .map((c) => (
                        <span
                          className="color-chip"
                          role="listitem"
                          key={c.code}
                          aria-label={`${c.code}, ${c.count - c.done} remaining of ${c.count}`}
                        >
                          <i style={{ background: c.hex }} />
                          <b>{c.code}</b> × {c.count - c.done}
                        </span>
                      ))}
                    {!cells.length && (
                      <span className="empty-step" role="listitem">
                        Empty step · continue when ready
                      </span>
                    )}
                  </div>
                  <StepNavigation p={p} update={setP} showEmpty={showEmpty} />
                  <button
                    className={`primary full complete-action${cells.length && cells.every((c) => c.isCompleted) ? " step-completed" : ""}`}
                    disabled={!cells.length}
                    onClick={() =>
                      change(markStep(p, !cells.every((c) => c.isCompleted)))
                    }
                  >
                    {cells.length && cells.every((c) => c.isCompleted)
                      ? "↶ Clear this step"
                      : "✓ Mark step complete"}
                  </button>
                  <div
                    className="task-details"
                    id="task-details"
                    role="region"
                    aria-label="Task details"
                    tabIndex={0}
                  >
                    {extraControls}
                    <div className="palette step-counts">
                      {stats(cells, p.palette)
                        .filter((c) => c.count)
                        .map((c) => (
                          <div key={c.code}>
                            <i style={{ background: c.hex }} />
                            <b>{c.code}</b>
                            <strong>
                              {c.count - c.done} left <small>/ {c.count}</small>
                            </strong>
                          </div>
                        ))}
                    </div>
                    {!cells.length && (
                      <p className="muted">
                        A little breathing room. This step is empty — move on
                        when ready.
                      </p>
                    )}
                    <StepPositions p={p} />
                    <button
                      className="undo full"
                      disabled={!undo.length}
                      onClick={undoLast}
                    >
                      ↶ Undo last change
                    </button>
                    <hr />
                    <Strategy p={p} update={updateRoute} />
                    <p className="muted">
                      ▣ Switching strategies preserves your completed beads.
                    </p>
                    {percent === 100 && (
                      <div className="recommend" role="status">
                        <h3>✦ You made it bloom!</h3>
                        <p>
                          Every bead is in place. Your finished project is saved
                          on this device.
                        </p>
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
        <input
          hidden
          ref={file}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!f.type.startsWith("image/") || f.size > 15 * 1024 * 1024) {
              setError("Choose an image smaller than 15 MB.");
              return;
            }
            setUpload({ url: URL.createObjectURL(f), name: f.name });
            e.target.value = "";
          }}
        />
      </main>
      <footer>
        <span className="logo">✿ pindou</span>
        <span>V1.5 design experiment · preview-only saves</span>
        <a
          className="production-link"
          href="https://iriszhu79.github.io/pindou/"
          target="_blank"
          rel="noreferrer"
        >
          Compare production V1.4 ↗
        </a>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
