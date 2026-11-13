# Pindou recognition benchmark infrastructure v1.0

This is a developer-only offline benchmark. It imports the existing recognition functions; it does not modify their algorithms, thresholds, public interface, storage or deployment workflow. It does not perform legend detection/OCR. No benchmark data is imported by production code.

## Layout and commands

- `schema.json`: JSON Schema Draft 2020-12, with `$defs/annotation` for annotation documents.
- `types.ts`: corresponding TypeScript data types and independent-verification eligibility rule.
- `manifests/`: immutable, versioned dataset inventories (no fixed 20-image limit).
- `images/`: local original collections; ignored by Git except the explicitly synthetic smoke PNG. The smoke manifest references the three existing real fixtures in place, preserving their bytes and provenance.
- `annotations/`: versioned reference labels, with field-level review status.
- `reports/runs/`: generated append-only evaluation history, ignored by Git.
- `reports/examples/`: curated smoke-report evidence, if checked in; not a certified real-image benchmark.

```sh
npm ci
npm run benchmark:validate
npm run benchmark:check
npm run benchmark:test
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark:run -- --diagnostics cells
```

Alternatively install the pinned Playwright browser with `npx playwright install chromium` and omit `CHROMIUM_PATH`. Chromium only decodes the original images, including EXIF orientation, onto white-composited sRGB canvas pixels. The unchanged recognition functions execute in Node. Timings exclude decoding, evaluation and HTML generation; they are not browser Worker/UI or native Safari benchmarks. The runner records Node/Chromium versions, Git state and source/harness hashes. Use `--sample synthetic-complete` for a single-case smoke report; validation still checks the full selected manifest.

To use another collection:

```sh
npm run benchmark:validate -- --root /path/to/collection --manifest manifests/v1.json --json
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark:run -- \
  --root /path/to/collection --manifest manifests/v1.json --split held-out \
  --out reports/runs --diagnostics summary
```

Supported options: `--manifest`, `--root`, `--previous`, `--sample <pattern-id>`, `--split all|development|held-out`, `--out`, `--mode automatic|both` (default both where a manual input exists), `--diagnostics summary|cells`, and **explicit** `--include-images`. `benchmark:validate --json` emits validation issues to stdout. Invalid data/schema returns exit 1 and prevents recognition. A completed evaluation returns 0 even when recognition failed; failures remain visible in the report. Use `--fail-on-recognition` to return 2 after writing reports if any recognition failed. This is not an accuracy threshold.

## Adding original images and preserving provenance

1. Place original JPEG/PNG bytes under `images/`. Do not resave, crop, compress or strip EXIF merely to add a fixture. Images stay local by default; explicitly review any decision to version or share them.
2. Allocate a stable `id` (for example `mard-teapot-original-01`) and a stable `familyId` shared by every variant of the same chart. Record available-file SHA-256 and **orientation-normalized** width/height. The validator checks PNG/JPEG headers (JPEG EXIF rotations included); the runner checks decoded dimensions again.
3. Record provenance status, source, transformations and original byte identity. `image.sha256` always hashes the file actually evaluated. `image.original` is optional: use `sha256: null` when the original hash is unknown. A resized conversation copy must not claim byte identity with a native upload. Unknown transformation history should be stated, not invented.
4. Specify chart brand/type (brand may be null). Allocate an annotation file with its matching `patternId`, schema version and revision. Images/annotations must resolve inside `--root`; path escapes and symlink escapes are rejected.
5. Add the sample to a new manifest version. There is no fixture-name logic, expected-count injection or maximum sample count. A validator test ingests 20 distinct image files without code changes.

Current decoder support is PNG/JPEG. Larger/denser grids can be recorded as benchmark metadata, even when the existing recognizer cannot process them; such limits are failures/limitations, not fabricated resized inputs. No image is silently resized. Reference grid and legend geometry are axis-aligned rectangles in the normalized source coordinate system: top-left X/Y, positive width/height, row/column indices zero-based.

## Creating human-reviewed annotations

Verification is independent of model confidence. Every asserted field has a `verification` object; nothing inherits verified status implicitly from the document header. The document verification describes review of the document, while each field/cell determines metric eligibility.

```json
{
  "status": "verified",
  "reviewer": "named independent reviewer",
  "reviewerKind": "human",
  "independent": true,
  "evidence": "Inspected the original chart and transcribed this label without using predictions",
  "reviewedAt": "2026-11-13T08:00:00Z"
}
```

Use real review metadata, not the example timestamp/name. Verified assertions require reviewer identity, independent review and evidence. A missing review date is a warning; do not invent one. `reviewerKind: assistant` or `recognizer` cannot certify real-image truth. An explicitly synthetic sample may use `synthetic-generator` with expected labels defined independently before rendering. Synthetic results never count as real-image accuracy.

- `grid: null` is valid when nothing is known. Grid dimensions, crop and legend region have independent statuses; a known grid does not imply known cell labels.
- Palette completeness is `partial` or `complete`. Each entry has code verification, optional verified quantity and optional independently checked source-image RGB swatch. Official code text is reference data, not inferred by the runner.
- Cells use `occupied`, `empty` or `unknown`. Occupied-cell color verification is **separate** from occupancy verification. A verified occupied white bead with unknown color identity may omit its code. Empty/unknown cells cannot carry a color code. Unknown occupancy cannot be marked verified; retain ambiguous/unreviewed status, evidence and notes.
- Missing cells are unannotated, not empty. A partial annotation is valid and receives a warning, not rejection. `cellCoverage: complete` asserts that every address is listed; it does not automatically verify its labels. Unknown/ambiguous cells still remain outside accuracy denominators.
- Reviewer notes belong in `cell.notes`; evidence can describe printed labels, shadows, watermark interference or conflicting reviewers. Never fill missing truth from model predictions or promote draft model/development labels automatically.

For each edit, increment annotation `revision`, keep prior files/manifests in version control, and increment the dataset version. Preserve image hashes. A named reviewer should inspect the exact evaluated bytes. The three existing real smoke fixtures retain assistant-created development labels and user-supplied reference values as **unreviewed**; no independent human sign-off is invented for those copies. Their supplied reference grid/quantities remain inspectable, but reference-based scores are Not evaluated until independently reviewed.

## Validation rules and partial truth

`benchmark:validate` reports paths/IDs with **errors** (exit 1) versus **warnings** (exit 0).

Errors include missing files, wrong SHA/dimensions, schema violations, duplicate IDs/palette codes/cell addresses, out-of-grid cells, dangling color references, out-of-image rectangles, contradictory occupancy/color/reviewer status, complete-cell coverage gaps, impossible verified per-color lower bounds, and full verified cell/legend quantity disagreement. Verified quantities are not forced to equal partial cell counts. Unverified full-grid disagreements are warnings rather than accuracy claims.

Warnings include partial annotations, absent independent labels, missing review dates, unverified original byte identity and held-out-use reminders. These do not fabricate or invalidate otherwise valid partial annotations. Annotation counts and labels used for comparison come only from eligible verified assertions.

## Development / held-out protection and evaluation history

The included real charts have already been used in development; all smoke fixtures are development samples. Do not rebrand them as held-out evidence.

Every sample carries a chronological `splitHistory`, ending in its current split. Identical image/original hashes or chart families cannot cross splits within a manifest. Reusing a development chart's resized variant as held-out is leakage.

To move held-out data to development, create a new manifest version and **append** a dated, explained transition before tuning. Check against the prior manifest:

```sh
npm run benchmark:validate -- --manifest manifests/v2.json --previous manifests/v1.json
npm run benchmark:run -- --manifest manifests/v2.json --previous manifests/v1.json
```

Prior-manifest comparison detects erased/re-written split history, stable-family changes and concealed held-out → development moves. Retired samples generate warnings; keep the prior manifest/report. The runner does not move samples or tune the recognizer. Held-out outputs are evaluation records only until an explicit transition. Git history/review remains necessary: software cannot attest to a reviewer's independence or prevent someone from manually rewriting all historical files.

Each evaluation creates a unique timestamp/UUID directory and never overwrites a previous run. JSON records dataset version, raw manifest/annotation/image hashes, optional prior-manifest hash, annotation revisions, complete split history, source/harness fingerprints, runtime and policy. No single combined development/held-out or real/synthetic headline accuracy is produced. Coverage and failures are grouped separately by kind/split/mode.

## Metrics and failures

Automatic mode calls `recognize(image)` with **no reference arguments**. Manual recovery is a separate call with an explicitly supplied `sample.manualRecovery.geometry`; this is a correction input, not automatic success. An unverified historical manual rectangle may be used as an input, but is never promoted into verified crop truth. Manual inputs must be in normalized original-image coordinates.

- **Dimensions:** scored only against independently verified dimensions. A returned different size or no automatic grid is incorrect for this metric. Cell metrics require aligned verified dimensions; no arbitrary resampling/reindexing is performed.
- **Crop:** IoU, reference coverage, edge RMS and maximum edge error against independently verified bounds. Structural grid address completeness alone does not prove full-chart completeness.
- **Occupancy:** TP/FP/FN/TN on independently verified occupied/empty labels only. Precision/recall denominators of zero yield null, not invented perfect scores.
- **Occupied color:** independently verified occupied color labels plus a complete independently verified reference palette, source-image RGB swatches and mapping policy are required. Evaluation maps temporary group RGB to nearest reference swatches within the declared OKLab distance/margin. Freeze this QA policy before inspecting held-out predictions; calibrate it on development data and record the protocol in verification evidence. This is a QA association policy, **not a changed recognition threshold or official-code OCR**. Ambiguous/unmapped predictions abstain and do not get accuracy credit; missed occupied cells remain color failures. Mapping coverage is reported.
- **Palette/groups and quantities:** use complete verified inventory/quantities. Per-code deltas require unambiguous mapping for every predicted group; otherwise Not evaluated. No desired group/count is passed to recognition.
- **Code mapping:** the current recognizer emits temporary Color N groups and has no official-code detector. Code-mapping accuracy therefore remains Not evaluated, even when QA swatch association is possible. A future explicit evaluator adapter can enable native-code metrics without changing annotations.
- **Uncertainty:** the report uses the existing review convention (uncorrected confidence < 0.7). It does not change the recognizer. A confident wrong prediction counts only where occupancy/color error is independently evaluable; missing human truth is never a confident error or success.
- **Failures:** image decoding, existing grid detector stage/reason and manual-geometry validation are recorded separately. Other existing generic errors are reported as `recognition` with their exact message; the existing API does not always localize image validation versus classification. The infrastructure does not invent a more precise stage. Failed recognition produces no fabricated empty-grid prediction and no cell accuracy; failure/evaluation coverage must be read alongside successful-case metrics.

## Diagnostics and visual differences

Open the generated `index.html`, then a pattern's HTML page. For reliable relative-image loading, serve the repository/dataset root locally (not publicly):

```sh
python -m http.server 4307 --bind 127.0.0.1
# Open http://127.0.0.1:4307/tests/benchmark/reports/runs/<run-id>/index.html
```

Every page shows supplied source image with proposed/reference crop, recognized grid and reference grid, separately for automatic/manual modes. **Red** = false positive; **blue** = false negative; **purple** = wrong/unmapped color; **orange border** = model uncertainty. **Gray hatching** = absent, unknown or unverified human truth. Hatching is not an error; model uncertainty is not an annotation status. Verified occupancy with unknown/unverified color (or an unverified display swatch) remains hatched rather than appearing fully certified. Click an evaluated mismatch to find its row/column. The source crop annotation may itself be unverified and is labelled accordingly. Very large reference grids use a report-only display budget; JSON metrics are not truncated.

JSON diagnostics expose existing ranked candidates and scores, global rejection/stage, available grid evidence, bounds/address completeness, verified reference coverage, cluster membership summaries and uncertainty. The existing detector does not emit independent rejection reasons for every unchosen alternative; the report states this instead of inventing them. `--diagnostics cells` adds per-cell occupancy reasons/confidences. Legend detection is explicitly `not-implemented`; an annotated region is not a detection result. No full-resolution projection arrays or raw uploaded pixels are logged.

HTML references source image files by default without copying or embedding their bytes. Only `--include-images` explicitly copies originals into a run for portability; the JSON records that choice. Reports can reveal held-out labels, so retain them as evaluation history rather than using them as tuning examples or publishing them automatically. Nothing in this iteration deploys reports or changes the Pindou website.

## Tests and smoke evidence

`benchmark:test` includes an independent hand-specified confusion matrix, wrong colors, false positives/negatives, unknown/draft exclusions, missing/ambiguous mapping, confident errors, crop metrics, schema/semantic validation, 20-image ingestion, split leakage/history, automatic argument isolation, failure stages, source-import protection, HTML escaping and difference-color rendering.

The synthetic image has complete generator truth: 20×20 grid, 278 occupied cells and four colors. Real smoke outputs should still show Pig 40×51 / 1179 / 5, Duck copy 50×50 / 139 / 8 and Teapot copy 50×50 / 1333 / 6, but these are **observations**, not independently certified real-image accuracy. Schema and metric tests deliberately use corrupted synthetic predictions to verify failure visualization and exact metric calculations; these are not claims about real-image recognizer performance.
