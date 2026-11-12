import { useEffect, useRef, useState } from "react";
import type { Geometry } from "./recognition";
import { dragCrop, pointerToImage, type CropHandle } from "./cropGeometry";
export function VisualGridCrop({
  url,
  width,
  height,
  geometry,
  onChange,
  disabled = false,
}: {
  url: string;
  width: number;
  height: number;
  geometry: Geometry;
  onChange: (g: Geometry) => void;
  disabled?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    overlay = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 300, height: 360 }),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState(false);
  const drag = useRef<{
    id: number;
    handle: CropHandle;
    start: { x: number; y: number };
    geometry: Geometry;
  } | null>(null);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (disabled) drag.current = null;
  }, [disabled]);
  const scale = Math.min(size.width / width, size.height / height) * zoom,
    handleSize = 44 / scale;
  function point(e: { clientX: number; clientY: number }) {
    return pointerToImage(
      e.clientX,
      e.clientY,
      overlay.current!.getBoundingClientRect(),
      width,
      height,
    );
  }
  function begin(e: React.PointerEvent<SVGElement>, handle: CropHandle) {
    if (disabled || pan || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      handle,
      start: point(e),
      geometry: structuredClone(geometry),
    };
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || disabled) return;
    e.preventDefault();
    const p = point(e);
    onChange({
      ...d.geometry,
      crop: dragCrop(
        d.geometry.crop,
        d.handle,
        p.x - d.start.x,
        p.y - d.start.y,
        width,
        height,
      ),
    });
  }
  function key(e: React.KeyboardEvent<SVGElement>, handle: CropHandle) {
    if (disabled || pan) return;
    const deltas: Record<string, number[]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    onChange({
      ...geometry,
      crop: dragCrop(
        geometry.crop,
        handle,
        delta[0] * (e.shiftKey ? 10 : 1),
        delta[1] * (e.shiftKey ? 10 : 1),
        width,
        height,
      ),
    });
  }
  const c = geometry.crop,
    rows =
      Number.isInteger(geometry.rows) &&
      geometry.rows > 0 &&
      geometry.rows <= 300
        ? geometry.rows
        : 0,
    columns =
      Number.isInteger(geometry.columns) &&
      geometry.columns > 0 &&
      geometry.columns <= 300
        ? geometry.columns
        : 0;
  return (
    <section className="visual-grid-crop" aria-label="Visual grid correction">
      <h3>Align the grid</h3>
      <p>
        Drag the rectangle to move it; drag a corner to resize. Enter rows and
        columns, align the overlay to the chart, then re-analyze. Use Inspect to
        scroll the zoomed image. Corner handles also support arrow keys (Shift:
        10 pixels).
      </p>
      <div className="recognition-actions">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={pan}
          onClick={() => {
            drag.current = null;
            setPan(!pan);
          }}
        >
          {pan ? "Return to crop handles" : "Inspect / pan image"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            drag.current = null;
            setZoom(1);
            setPan(false);
            onChange({ ...geometry, crop: { x: 0, y: 0, width, height } });
            viewport.current?.scrollTo(0, 0);
          }}
        >
          Reset crop
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            viewport.current?.scrollTo(0, 0);
          }}
        >
          Fit image
        </button>
      </div>
      <label>
        Source zoom
        <input
          type="range"
          min="1"
          max="6"
          step=".1"
          value={zoom}
          disabled={disabled}
          onChange={(e) => {
            drag.current = null;
            setZoom(Number(e.target.value));
          }}
        />
      </label>
      <div className="crop-viewport" ref={viewport} data-pan={pan}>
        <div
          className="crop-image-world"
          style={{ width: width * scale, height: height * scale }}
        >
          <img
            src={url}
            alt="Full source image for visual grid correction"
            draggable={false}
          />
          <svg
            ref={overlay}
            className="crop-overlay"
            viewBox={`0 0 ${width} ${height}`}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onLostPointerCapture={() => (drag.current = null)}
          >
            <rect
              x={c.x}
              y={c.y}
              width={c.width}
              height={c.height}
              fill="transparent"
              stroke="#ae245d"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
              className={pan || disabled ? "" : "crop-drag-target"}
              onPointerDown={(e) => begin(e, "move")}
              onKeyDown={(e) => key(e, "move")}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label="Move crop rectangle"
            />
            <g
              stroke="#116b99"
              strokeWidth="1"
              opacity=".75"
              pointerEvents="none"
            >
              {Array.from({ length: Math.max(0, columns - 1) }, (_, i) => (
                <line
                  key={`x${i}`}
                  x1={c.x + ((i + 1) * c.width) / columns}
                  x2={c.x + ((i + 1) * c.width) / columns}
                  y1={c.y}
                  y2={c.y + c.height}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {Array.from({ length: Math.max(0, rows - 1) }, (_, i) => (
                <line
                  key={`y${i}`}
                  y1={c.y + ((i + 1) * c.height) / rows}
                  y2={c.y + ((i + 1) * c.height) / rows}
                  x1={c.x}
                  x2={c.x + c.width}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {(
              [
                ["nw", c.x, c.y],
                ["ne", c.x + c.width, c.y],
                ["sw", c.x, c.y + c.height],
                ["se", c.x + c.width, c.y + c.height],
              ] as const
            ).map(([handle, x, y]) => (
              <rect
                key={handle}
                data-crop-handle={handle}
                x={Math.min(
                  width - handleSize,
                  Math.max(0, x - handleSize / 2),
                )}
                y={Math.min(
                  height - handleSize,
                  Math.max(0, y - handleSize / 2),
                )}
                width={handleSize}
                height={handleSize}
                fill="#ffdf84"
                fillOpacity=".85"
                stroke="#292638"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className={pan || disabled ? "" : "crop-drag-target"}
                onPointerDown={(e) => begin(e, handle)}
                onKeyDown={(e) => key(e, handle)}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`Resize crop ${handle}`}
              />
            ))}
          </svg>
        </div>
      </div>
      <p aria-live="polite">
        {columns || "—"} columns × {rows || "—"} rows · zoom{" "}
        {Math.round(zoom * 100)}%. Geometry is a draft until re-analysis.
      </p>
    </section>
  );
}
