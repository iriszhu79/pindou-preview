# Pattern Annotation Studio — local MVP

A separate internal annotation application. It does not modify Pindou recognition, Workspace, project storage, production, Pages workflows, or approved previews. No OCR or consumer functionality is added.

## Run

From the repository root:

```sh
npm ci
npm run dev:studio
```

Open `http://localhost:4310/`. Production bundle: `npm run build:studio` → `dist-studio/`. The Studio uses a relative Vite base, its own entry point and its own IndexedDB and LocalStorage namespace, **pindou.annotation-studio.v1**. No backend is needed. Browser data is origin-specific; use ZIP backups when changing hosts, ports or browsers. No public deployment has been made.

## First project / P020 trial

1. Open a chart image. Open Project identity, reviewer & provenance; enter the actual reviewer, source provenance and notes. For demos or automated QA select **Practice**, which cannot produce verified Ground Truth. Synthetic exercises can be explicitly labeled Synthetic.
2. Set rows and columns. Select **Adjust grid rectangle**, drag the rectangle/corner handles, and zoom with the slider. Scroll the source viewport to pan. Advanced original-image coordinates are optional. Apply the geometry draft. Inspect first, last and intermediate grid lines; enter alignment evidence and explicitly confirm geometry. Geometry changes archive old reviews and begin a fresh unreviewed grid; they never transfer old cell answers.
3. For the supplied P020 trial, import the source image, then `P020_candidate.json` from the supplied candidate archive. The preview shows its one-based indexing. Use its geometry hint **as a draft**, inspect/apply it, then import candidates. The hash must match. This adapter has no P020-specific dimensions, crop, counts or palette in production code. The corpus ZIP can also be imported to create 20 separate draft projects. Original image bytes are preserved; archive README text is not executed or treated as annotation instructions. Source-annotation templates are not interpreted as verified labels.
4. Candidate imports accept generic `{rows,columns,cells:[{row,column,occupancy,rgb?,colorCode?}]}`, the legacy candidate-review structure, and Pindou `{recognition:{rows,columns,crop,cells,palette}}` exports. Coordinate base is explicit, missing addresses remain unknown, and duplicates/dimension/hash errors reject the import. Imports without hashes require explicit image-association acknowledgment. Pindou `Color 1` labels are groups, **not official bead codes**. Imported `human_verified` flags are ignored. Candidate geometry is never automatically verified.
5. **Sample RGB evidence** records deterministic quantized interior RGB modes. It does not infer occupancy or official bead codes. Printed code transcription is stored as separate evidence. It never sets the final reviewed code.
6. Click/tap the original or structured grid to synchronize selection. Arrow keys navigate; Shift-click or Rectangle selection selects a rectangular scope. The structured grid is virtualized and has its own cell zoom. Purple is selection; green indicates a recorded resolved review; orange flags occupancy/printed-code disagreements. Practice records are not independent truth.
7. Set draft occupancy and official code. Inspect the enlarged source crop, record evidence and notes, explicitly attest to inspection, then choose confirmed or corrected. A candidate contradiction requires corrected. Ambiguous/unreadable cells remain unknown and need notes. Batch code/empty/unknown/copy actions create **drafts only**. Multi-cell review requires a second dialog naming the scope. Undo/redo retains the latest 100 commands and preserves all original audit events; edits invalidate prior reviewed state. Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z work outside form fields.
8. Draw a legend rectangle using the source tool. Transcribe brand/code/swatch/printed quantity/location/notes, explicitly check each entry if independently inspected, then add it. Edit entry loads it back into the form; recheck to sign it again. Quantity comparison uses only independently reviewed cells. Partial matches remain unknown; missing/unverified/conflicting entries stay explicit. Discrepancy adjudication requires a reason, is audited, and expires when the relevant count/quantity/grid changes. It never changes cell answers.
9. Review the quality checklist. Draft ZIP always preserves uncertainty; Silver needs independently verified reference information; Gold requires documented source provenance, independently verified geometry, every cell resolved, independently verified legend codes and matching or explicitly justified quantities, plus an intact audit. A total matching the chart never passes these gates by itself.
10. Autosave reports pending/saved/error. Manual Save is available. Reload restores the last applied project and image. Unapplied geometry is a draft and prompts before leaving. Export backups regularly: browser storage is not durable archival storage. JSON backup requires the matching original image when restored; ZIP backup includes it. Imports restore as a new project ID, preserving existing projects. No deletion UI exists.

## Export contract

`studio/schema.json` is the versioned native JSON Schema. A Studio ZIP includes original source bytes, native project with candidates/evidence/history/archives, metadata, reviewed annotations, legend, audit, reviewed-cell CSV, validation checklist, README and a single-sample `benchmark-manifest.json`.

`annotations.json` follows the existing benchmark annotation v1 schema. Only independently resolved cells get verified occupancy/code. Everything else remains explicit unknown/unreviewed. Practice exports contain **no verified cells**, even when review controls were exercised. The full native project separately retains ambiguous/unreadable statuses and all candidate evidence. Benchmark IDs are normalized to lowercase slugs; original project identity is retained in metadata. Gold quantity references are derived from the complete reviewed cell grid. The entered printed legend is retained separately; no cells are altered to fit it. `cellCoverage: complete` means every address is represented, **not every cell verified**.

To validate an extracted export with the existing runner:

```sh
npm run benchmark:validate -- --root /absolute/path/to/extracted-export --manifest benchmark-manifest.json --json
```

Splits and source originality are reviewer statements, not automatically authenticated. The full edit audit remains available; users must manage held-out families and prior development exposure independently. ZIP source hashes establish byte preservation, not proof of provenance. Native review/audit data is self-reported, not a cryptographic signature or proof of independent human work. Second-reviewer fields exist in the schema; a second-reviewer adjudication UI is deferred.

## Tests

```sh
npm run test:studio
npm run build:studio
node studio/tests/review.mjs
node studio/tests/browser.mjs
node studio/tests/corpus.mjs
```

Browser tests require the Studio server above and `/usr/bin/chromium` (adjust the test launcher on other machines). The P020/corpus integration scripts use the locally supplied private archive paths; they are not bundled into the application. Change those fixture paths for another machine. Tests run in disposable browser contexts; real-device Safari has not been tested. Screenshots and measured results are in `studio/docs/`.

## MVP limits

- Desktop-first, usable stacked layout on iPad/mobile; sliders and scroll containers provide zoom/pan. No custom two-finger pinch editor, lasso, perspective transform, rotation correction, or OCR.
- Sampling and ZIP compression/decompression run on the main thread and can pause the UI. The tested P020 export used roughly 270–512 MB of Chromium JS heap in initial runs; these are cloud browser observations, not mobile memory measurements. Very long histories/full-grid operations need performance work before large-scale mobile use.
- Geometry cap 40,000 cells is a safety bound, not a proven performance guarantee. Corpus imports are image-only draft initialization; user reference templates and candidate files must be reviewed/imported explicitly.
- A matching RGB or aggregate total is never independent cell validation. No real chart has been promoted to Gold by this implementation. Automated UI trials are workflow QA, not human-reviewed Ground Truth or recognition accuracy measurements.
- Backup ZIP exports one project at a time. No accounts, backend, collaboration, shared review queue or multi-project benchmark merge UI.
