import path from "node:path";
import { writeFile, mkdir, copyFile } from "node:fs/promises";
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  dimensions: "Grid dimensions",
  crop: "Crop geometry",
  occupancy: "Occupancy",
  occupiedColor: "Occupied-cell color",
  codeMapping: "Official-code mapping",
  paletteGroups: "Palette groups",
  beadCount: "Bead count",
  perCodeQuantities: "Per-code quantities",
};
const metric = (value) =>
  value.status === "not-evaluated"
    ? "Not evaluated: " + value.reason
    : JSON.stringify(value.value);
const css = `body{font:15px/1.5 system-ui;margin:2rem;color:#192536;background:#f5f7fa}main{max-width:1500px;margin:auto}a{color:#175dad}table{border-collapse:collapse;width:100%;background:white}th,td{border:1px solid #c7d0dc;padding:.5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{width:11rem;min-width:9rem}section,details{background:white;padding:1rem;margin:1rem 0;border:1px solid #c7d0dc}pre{white-space:pre-wrap;overflow-wrap:anywhere}.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.views svg{width:100%;max-height:1000px;border:1px solid #8796a9}svg .hit:target rect{stroke:#000;stroke-width:.3}figcaption{font-weight:600}.fp{color:#c52336}.fn{color:#1766bf}.wrong{color:#9132b3}.uncertain{color:#b36100}.unknown{color:#65707e}@media(max-width:950px){.views{grid-template-columns:1fr}body{margin:.5rem}}`;
const page = (title, body) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHTML(title)}</title><style>${css}</style><main>${body}</main></html>`;
function grid(mode, a, { groundTruth = false } = {}) {
  const p = mode.prediction,
    dimensions = groundTruth
      ? a.grid?.dimensions.value
      : p && { rows: p.rows, columns: p.columns };
  if (!dimensions) return "<p>Not evaluated / no grid returned.</p>";
  if (dimensions.rows * dimensions.columns > 100000)
    return "<p>Reference grid exceeds the 100,000-cell report display budget; inspect the JSON data and supplied source image. Metrics are not truncated.</p>";
  const cells = new Map(
      (groundTruth ? a.cells : p.cells).map((c) => [c.row + ":" + c.column, c]),
    ),
    diff = new Map(
      mode.metrics.differences.map((d) => [d.row + ":" + d.column, d]),
    );
  const prefix = mode.mode + (groundTruth ? "-truth" : "-predicted");
  let svg = `<svg viewBox="0 0 ${dimensions.columns} ${dimensions.rows}" role="img" aria-label="${groundTruth ? "Reference annotations" : "Recognized grid"}"><defs><pattern id="${prefix}-missing" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M0 1L1 0" stroke="#606975" stroke-width=".08" opacity=".45"/></pattern></defs>`;
  for (let row = 0; row < dimensions.rows; row++)
    for (let column = 0; column < dimensions.columns; column++) {
      const c = cells.get(row + ":" + column),
        d = diff.get(row + ":" + column),
        truth = groundTruth
          ? c?.verification.status === "verified" && c.occupancy !== "unknown"
            ? "verified"
            : c?.occupancy === "unknown"
              ? "unknown"
              : c
                ? "unverified"
                : "missing"
          : d?.truth;
      const colorTruth = groundTruth
        ? c?.occupancy !== "occupied"
          ? "not-applicable"
          : !c.colorCode
            ? "unknown"
            : c.colorVerification?.status === "verified"
              ? "verified"
              : "unverified"
        : d?.colorTruth;
      const needsHatch =
        truth !== "verified" ||
        ["unknown", "unverified"].includes(colorTruth) ||
        (groundTruth &&
          c?.occupancy === "occupied" &&
          a.palette.entries.find((p) => p.code === c.colorCode)?.swatch
            ?.verification.status !== "verified");
      const code = c?.colorCode,
        fill = groundTruth
          ? c?.occupancy === "empty"
            ? "#fff"
            : a.palette.entries.find((p) => p.code === code)?.swatch?.value
              ? `rgb(${a.palette.entries.find((p) => p.code === code).swatch.value.join(",")})`
              : "#c5cbd3"
          : c?.isEmpty
            ? "#fff"
            : (p.palette.find((p) => p.code === code)?.hex ?? "#b7bec9");
      const stroke =
        !groundTruth && d?.occupancyError === "false-positive"
          ? "#c52336"
          : !groundTruth && d?.occupancyError === "false-negative"
            ? "#1766bf"
            : !groundTruth && d?.wrongColor
              ? "#9132b3"
              : !groundTruth && d?.modelUncertain
                ? "#d87900"
                : "#c5cbd3";
      const title = `Row ${row + 1}, column ${column + 1}; ${groundTruth ? "annotation" : "prediction"} ${groundTruth ? (c?.occupancy ?? "missing") : c?.isEmpty ? "empty" : code}; human truth ${truth}; color truth ${colorTruth}; model uncertainty ${d?.modelUncertain ?? "not available"}${d?.occupancyError ? "; " + d.occupancyError : ""}${d?.wrongColor ? "; wrong/unmapped color" : ""}`;
      svg += `<g class="hit" id="${prefix}-${row}-${column}"><title>${escapeHTML(title)}</title><rect x="${column}" y="${row}" width="1" height="1" fill="${escapeHTML(fill)}" stroke="${stroke}" stroke-width="${stroke === "#c5cbd3" ? 0.035 : 0.13}"/>${needsHatch ? `<rect x="${column}" y="${row}" width="1" height="1" fill="url(#${prefix}-missing)" opacity=".6"/>` : ""}</g>`;
    }
  return svg + "</svg>";
}
function sourceView(src, sample, mode, a) {
  let svg = `<svg viewBox="0 0 ${sample.image.width} ${sample.image.height}" aria-label="Source with crop boundaries"><image href="${escapeHTML(src)}" width="${sample.image.width}" height="${sample.image.height}"/>`;
  for (const [crop, color, dash] of [
    [mode.prediction?.crop, "#bd2551", ""],
    [a.grid?.crop?.value, "#197ab5", "12 8"],
  ])
    if (crop)
      svg += `<rect x="${crop.x}" y="${crop.y}" width="${crop.width}" height="${crop.height}" fill="none" stroke="${color}" stroke-width="${Math.max(2, sample.image.width / 300)}" stroke-dasharray="${dash}"/>`;
  return svg + "</svg>";
}
export async function writeReports(
  report,
  records,
  runDir,
  { includeImages = false } = {},
) {
  const md = [
    "# Pindou benchmark — " + report.runId,
    "",
    "Dataset: " + report.dataset.datasetId + " " + report.dataset.version,
    "",
    "Synthetic and real evidence are separate. “Not evaluated” means the relevant independently verified truth or mapping is unavailable. Temporary-code mapping is not OCR accuracy.",
    "",
    "| Sample | Kind / split | Mode | Result | Dimensions | Occupancy | Occupied color |",
    "|---|---|---|---|---|---|---|",
  ];
  const links = [];
  for (const record of records) {
    const result = report.samples.find((r) => r.id === record.sample.id);
    if (!result) continue;
    let src = path
      .relative(runDir, record.imagePath)
      .split(path.sep)
      .map(encodeURIComponent)
      .join("/");
    if (includeImages) {
      await mkdir(path.join(runDir, "images"), { recursive: true });
      const name = record.sample.id + path.extname(record.imagePath);
      await copyFile(record.imagePath, path.join(runDir, "images", name));
      src = "images/" + encodeURIComponent(name);
    }
    let content = `<p><a href="index.html">Benchmark index</a></p><h1>${escapeHTML(result.id)}</h1><p><strong>${escapeHTML(result.kind)} / ${escapeHTML(result.split)}</strong> — ${escapeHTML(record.sample.image.provenance.source)}</p><p>Image ${record.sample.image.width}×${record.sample.image.height}; SHA-256 ${record.sample.image.sha256}. Original byte identity: ${escapeHTML(record.sample.image.provenance.byteIdentity)}.</p><p class="unknown">Hatching = missing, unknown or unverified human truth. Orange borders = model uncertainty. These are different facts.</p><p><span class="fp">Red: false positive</span> · <span class="fn">Blue: false negative</span> · <span class="wrong">Purple: wrong/unmapped color</span>. Source: pink proposed crop; dashed blue annotation (possibly unverified).</p>`;
    for (const mode of result.modes) {
      md.push(
        `| ${result.id} | ${result.kind} / ${result.split} | ${mode.mode} | ${mode.failure ? "Failure: " + mode.failure.stage : "Recognized"} | ${metric(mode.metrics.dimensions).replaceAll("|", "\\|")} | ${metric(mode.metrics.occupancy).replaceAll("|", "\\|")} | ${metric(mode.metrics.occupiedColor).replaceAll("|", "\\|")} |`,
      );
      content += `<section><h2>${mode.mode === "automatic" ? "Automatic detection" : "Explicit manual recovery input"} — ${mode.failure ? "Failed" : "Recognized"}</h2><p>Recognition ${mode.recognitionMs.toFixed(1)} ms. ${escapeHTML(mode.failure?.message ?? "")}${mode.manualInputSource ? " Input: " + escapeHTML(mode.manualInputSource) : ""}</p><table><tbody>${Object.entries(
        mode.metrics,
      )
        .filter(
          ([key]) =>
            !["differences", "paletteMapping", "uncertainty"].includes(key),
        )
        .map(
          ([key, value]) =>
            `<tr><th>${escapeHTML(labels[key] ?? key)}</th><td>${escapeHTML(metric(value))}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><div class="views"><figure><figcaption>Supplied source / boundaries</figcaption>${sourceView(src, record.sample, mode, record.annotation)}</figure><figure><figcaption>Recognized grid / differences</figcaption>${grid(mode, record.annotation)}</figure><figure><figcaption>Annotation grid — hatching is not an error</figcaption>${grid(mode, record.annotation, { groundTruth: true })}</figure></div>`;
      const errors = mode.metrics.differences.filter(
        (d) => d.occupancyError || d.wrongColor,
      );
      content += `<details><summary>${mode.metrics.occupancy.status === "evaluated" || mode.metrics.occupiedColor.status === "evaluated" ? errors.length + " evaluated mismatches" : "Mismatches Not evaluated — no eligible aligned truth"}; uncertainty and missing truth shown separately</summary><ul>${errors.map((d) => `<li><a href="#${mode.mode}-predicted-${d.row}-${d.column}">Row ${d.row + 1}, column ${d.column + 1}</a>: ${escapeHTML(d.occupancyError || "wrong/unmapped color")}${d.incorrectlyConfident ? " — incorrectly confident" : ""}</li>`).join("")}</ul></details><details><summary>Uncertainty and mapping</summary><pre>${escapeHTML(JSON.stringify({ uncertainty: mode.metrics.uncertainty, mapping: mode.metrics.paletteMapping }, null, 2))}</pre></details><details><summary>Structured diagnostics</summary><pre>${escapeHTML(JSON.stringify({ ...mode.diagnostics, occupancy: mode.diagnostics.occupancy?.length ? `${mode.diagnostics.occupancy.length} decisions in report.json; omitted from HTML diagnostic text` : mode.diagnostics.occupancy }, null, 2))}</pre></details></section>`;
    }
    await writeFile(
      path.join(runDir, result.id + ".html"),
      page(result.id, content),
    );
    links.push(
      `<tr><td><a href="${result.id}.html">${escapeHTML(result.id)}</a></td><td>${result.kind}</td><td>${result.split}</td><td>${escapeHTML(result.modes.map((m) => m.mode + ": " + (m.failure ? "failed (" + m.failure.stage + ")" : "recognized")).join("; "))}</td></tr>`,
    );
  }
  md.push(
    "",
    "No single combined real/synthetic or development/held-out accuracy score is reported. Failure and evaluation-coverage counts must be read alongside conditional metrics.",
    "",
  );
  await writeFile(path.join(runDir, "report.md"), md.join("\n"));
  await writeFile(
    path.join(runDir, "index.html"),
    page(
      "Pindou benchmark",
      `<h1>Pindou benchmark</h1><p>Run ${escapeHTML(report.runId)} · dataset ${escapeHTML(report.dataset.datasetId)} ${escapeHTML(report.dataset.version)}</p><p>Development and held-out results are evaluation records, not permission to tune held-out examples. Synthetic results are infrastructure checks, not real-image accuracy.</p><p><a href="report.json">Machine-readable report</a> · <a href="report.md">Markdown summary</a></p><table><thead><tr><th>Pattern</th><th>Evidence kind</th><th>Split</th><th>Outcome</th></tr></thead><tbody>${links.join("")}</tbody></table><h2>Coverage and failures by evidence kind / split / mode</h2><pre>${escapeHTML(JSON.stringify(report.coverage, null, 2))}</pre><h2>Validation warnings</h2><pre>${escapeHTML(JSON.stringify(report.validationIssues, null, 2))}</pre>`,
    ),
  );
}
