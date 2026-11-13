# Benchmark infrastructure verification

Base recognition: `91d7f25`. Branch: `feat/v2-benchmark-infrastructure`. No deployment or production merge.

## Scope

Only benchmark files, TypeScript checking configuration, package scripts/dev dependency (AJV) and benchmark-specific ignore rules changed. `src/`, `public/`, Vite configuration and `.github/` remain byte-identical to the base. Storage keys, application UI, recognition thresholds and deployed versions are unchanged.

## Checks

| Check | Result |
|---|---|
| npm ci | passed |
| npm test | 44 passed, 0 failed |
| npm run benchmark:test | 22 passed, 0 failed |
| npm run benchmark:check | passed |
| npm run benchmark:validate | 4 samples, 0 errors; expected provenance/partial-truth warnings |
| npm run benchmark:run | 4 fixtures, 8 mode evaluations, no recognition failures |
| 20-image ingestion | 20 distinct generated PNG files validated; not a 20-real-image accuracy claim |
| npm run build | passed |
| npm run build:preview | passed |
| npm run test:browser | all 6 existing Workspace suites passed |
| npm run test:recognition | five viewports plus upload/manual recovery/export/import/persistence passed |
| npm run test:crop | four viewport touch/mouse/zoom/reset/stale-gating cases passed |
| npm run test:preview | 6 passed |
| npm run test:round2 | 7 passed |
| HTML visual QA | 1440x900 synthetic and real-unreviewed pages: no overflow, no page errors, no failed image requests |

## Smoke observations — not real-image accuracy

| Fixture | Evidence | Automatic | Explicit manual input | Cell accuracy |
|---|---|---|---|
| flying-pig | real / development | 40×51, 1179 beads, 5 groups | 40×51, 1179 beads, 5 groups | Not evaluated: references are unreviewed |
| duck-copy | real / development | 50×50, 139 beads, 8 groups | 50×50, 139 beads, 8 groups | Not evaluated: references are unreviewed |
| teapot-copy | real / development | 50×50, 1333 beads, 6 groups | 50×50, 1333 beads, 6 groups | Not evaluated: references are unreviewed |
| synthetic-complete | synthetic / development | 20×20, 278 beads, 4 groups | 20×20, 278 beads, 4 groups | Synthetic occupancy precision/recall and occupied-color accuracy: 100% (278 occupied, 122 empty) |

Duck/Teapot remain the 1080×1254 preserved conversation copies, not byte-identical original 1440×1672 uploads. No new independent human review has been invented for any real fixture. All existing draft labels/references remain unreviewed. The explicit unknown cell stays unknown.

The full runtime report is generated locally under `reports/runs/`; a compact [smoke summary](smoke-summary.json), [curated synthetic report](examples/synthetic-v1/index.html), [synthetic screenshot](screenshots/synthetic-1440.png), and [unreviewed real screenshot](screenshots/real-unverified-1440.png) are retained. The curated synthetic run is infrastructure evidence only.

Run histories include source/harness hashes, manifest/annotation snapshots and image hashes. Images are referenced locally, not stored as pixels in diagnostic JSON. The screenshots above are manually captured smoke-fixture QA, not an automatic export of private benchmark images.

## Limits

- Original 20-image collection and independent human labels are not yet available. 20-image testing here verifies ingestion capacity only.
- Independent review is an explicit curator attestation; the validator cannot establish reviewer honesty. Prior-manifest comparison and Git review protect audit history.
- Real palette/code accuracy needs verified source swatches and a frozen mapping protocol. QA RGB association is not official-code OCR.
- Current model code-mapping and legend-detection status is Not evaluated / not implemented.
- Existing detector alternatives do not expose individual rejection reasons. The adapter reports this limitation and retains the actual global rejection/stage.
- Structural output-address completeness is not proof of whole-chart extent; verified bounds are required for reference coverage.
- Recognition time is measured in Node after Chromium decoding, not browser Worker/UI or native Safari latency. No raw image is silently resized.

## Entry points

See the [benchmark README](../README.md), [JSON Schema](../schema.json), [TypeScript types](../types.ts), [validator](../validate.mjs), [runner](../run.mjs), [metrics](../metrics.ts), and [diagnostic adapter](../diagnostics.ts).
