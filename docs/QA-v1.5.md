# V1.5 Preview QA

## Scope and isolation

Based on production `main` commit `bb8c239` (V1.4). The V1.5 feature branch is unapproved for production. No production workflow or original Vite config is changed; no merge or production deployment is requested. Existing sample/reference images, PRD, chart geometry and palette are preserved.

The experiment uses `pindou.preview.v15.projects.v1`; production uses `pindou.projects.v1`. Automated tests seed a valid production project and verify it stays byte-identical and never appears in preview save slots. No migration, ID changes or synchronization. Separate Pages repository: `iriszhu79/pindou-preview`; base `/pindou-preview/`; artifact `dist-preview/`.

## Checks

- `npm ci --cache /tmp/pindou-npm-cache`: pass. The default cache path is not writable in this sandbox; a writable temporary cache resolves the environment issue without dependency or lockfile changes. Normal `npm ci` is used on GitHub runners.
- `npm test`: 23 passing unit tests, including new A-button idempotence, selected-cell/step targeting, unrelated-progress preservation, and storage isolation.
- `npm run build:preview`: pass; generated HTML, JS, CSS and font references use `/pindou-preview/`.
- `npm run build`: pass with the unchanged original Vite configuration. This output is not published for the preview.
- Six existing Playwright interaction suites pass after adapting entry-button names and preview storage/base URL. They cover mouse/touch tools, pan/Space/pinch/cancellation, plain and modifier wheel, explicit completion/undo, remaining counts, directions, nonempty routes, Focus, legacy/rectangular grids, 40 × 51 synthetic data, rotation, reload and drawers.
- `npm run test:preview`: six responsive viewports, upload preview, START/new and saved flows, actual demo statistics, selection without completion, contextual A, idempotence, B undo, axis-aware D-pad, strategy/direction, Focus exit, refresh, ten navigation steps, and production-key isolation.
- Six real-browser screenshots (three pages × mobile/desktop) are committed in `docs/previews/v15/`.

## Automated browser viewports

Chromium on Linux using Playwright, mouse and emulated touch; no physical device claims.

| Coverage | Viewports |
| --- | --- |
| V1.5 end-to-end and isolation | 390 × 844, 375 × 667, 844 × 390, 820 × 1180, 1180 × 820, 1440 × 900 |
| Responsive sessions | above plus 667 × 375, 1280 × 800, 640 × 400 |
| Phone vector rendering and selection at 100/200/300/500% | 375 × 667, 390 × 844, 402 × 874, 430 × 932 |
| Tablet/desktop hit detection at 100/200/300%, gestures and shared progress | 844 × 390, 820 × 1180, 1180 × 820, 1440 × 900 |

Historical V1.4 screenshot-equality tests are retained for reference but not run: all-page visual changes are intentional in V1.5. Functional regression suites remain active.

## Known limitations / review needed

- Real iPhone Safari, iPad Safari and physical Mac trackpads have not been tested. Emulated Chromium touch is not equivalent; review the isolated site on actual devices.
- The original chart has not been transcribed. The structured flower remains explicitly synthetic (91 beads); upload is preview-only.
- Undo is session-only (last 30 completion edits), matching the existing application. Refresh retains progress but not undo history.
- The full D-pad is in expanded task details to protect chart space; existing adjacent directional arrows remain persistent. A/B stay in the canvas navigation bar, with duplicate controls in expanded details. The short-phone landscape canvas is necessarily compact; zoom/focus remain available.
- Browser zoom and unusually long project names or large palettes deserve further real-device review; scrollable secondary panels handle extra content.
- Preview hosting requires Pages source set to GitHub Actions in the preview repository. Git write access and actual deployment success are separate checks.
- During setup this cloud environment’s network policy denied `api.github.com` and `iriszhu79.github.io`. Public GitHub Actions HTML and Git transport are reachable. A blocked live URL is not evidence of a Pages failure; inspect the deployment run before calling the site live.
