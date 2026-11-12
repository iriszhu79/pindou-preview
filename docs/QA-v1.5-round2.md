# V1.5 Preview Round 2 QA

## Baseline and scope

Preview baseline: `1643d06`. Production `main`: `bb8c239`. Both repositories’ most recent Pages runs succeeded before implementation. Work is isolated to the existing `iriszhu79/pindou-preview` repository on `feat/v1.5-round2-refinements`, then published to that repository’s `main` through its unchanged Pages workflow. The production repository and website are untouched.

The existing storage namespace `pindou.preview.v15.projects.v1`, project IDs, schema, chart/palette data, assets and PRD are preserved. Tests seed old preview progress and verify refresh, route switches and undo retain it; a production-key sentinel remains unchanged.

## Changes and interaction details

- TRY SAMPLE opens/resumes the real flower sample, regardless of another saved project being most recent. UPLOAD PATTERN remains a temporary image preview with explicit recognition limitations. My Studio scrolls to actual saved projects; those projects open normally.
- Simplified header; preview identity and the production comparison link live in the unobtrusive footer. Overview uses a small warm preparation strip and a 36px desktop/40px mobile secondary Back control.
- `public/sprites/mushroom.svg` is a transparent vector redraw based on the supplied mushroom reference: burgundy stepped outlines, red cap, cream spots, gray/cream stem and small sparkles. It is decorative, noninteractive, proportionally scaled and rendered with crisp edges. It replaces the bead-keeper creature, not chart content. It is not a background-removed copy of the original raster.
- Keyboard and D-pad share `directionalStep`. Physical arrows move toward the corresponding grid coordinate; in a reverse route, Up/Left advances and Down/Right returns. Empty coordinates are skipped using existing routing. The unrelated axis does nothing.
- A explicitly completes the selected bead in Select Mode, otherwise the active step. Repeated A never clears anything. B uses the completion undo stack and preserves the current strategy/direction/step. Unrelated completed cells remain unchanged. Undo history remains session-only, as before.
- Game shortcuts are registered only in Workspace and removed on exit. They ignore repeats, composition, modifiers, prevented events, editable/native controls, custom text entry and open visible dialogs. Existing focused-grid-cell arrow navigation continues to inspect beads; click a canvas margin to use step shortcuts. A/B remain available with grid selection. Keyboard hints include this detail in their tooltip.
- Circles contain only A/B; visible Complete/Undo labels sit beside them. Touch targets remain at least 44px. At 200% root text size, labels wrap independently; the chrome can scroll if needed rather than reducing the canvas or causing page overflow.
- Selection and undo are cleared atomically when opening a different project, avoiding a frame where the prior project’s selected tile could appear.

## Validation

- `npm ci --cache /tmp/pindou-npm-cache`: passed. The explicit writable cache is a sandbox accommodation; no dependencies or lockfile versions changed.
- `npm test`: 25 passing unit tests.
- `npm run build`: passed, emitting `/pindou-preview/` asset URLs and `dist-preview/` via the existing preview config.
- `npm run test:round2`: seven viewport checks for header/home navigation, compact overview Back control, actual mushroom asset response, keyboard directions including reverse routes, A idempotence, B undo and empty stack, focused-input/textarea/select/contenteditable/custom-textbox conflicts, open dialogs, modifiers/repeats/IME, selected-cell completion, route-preserving undo, refresh, production-data isolation, A/B layout and touch size, and 200% text on phones.
- `npm run test:preview`: six viewport checks for uploads, sample/saves, real counts, A/B, D-pad, strategy, Focus Mode, refresh and storage isolation; captures the six after screenshots.
- Existing interaction suites cover mouse/touch pan, Space, plain/modifier wheel, pinch/cancel, selection at 100–500% zoom, directions, empty-step routes, rectangular/40 × 51 synthetic data, completion/undo, drawers, Focus, rotation and persistence.

## Viewports

Requested: 1440 × 900, 1280 × 800, 820 × 1180, 1180 × 820, 390 × 844, 375 × 667, 844 × 390. Existing regression coverage additionally includes 667 × 375, 640 × 400, 402 × 874 and 430 × 932.

Chromium/Playwright on Linux with mouse and emulated touch. No physical Safari, iPhone, iPad or Mac trackpad testing was performed. These checks do not substitute for actual-device acceptance testing.

## Hosting verification limits

The existing Pages workflow is reused without changes. Hosted status is verified from its actual GitHub run and deploy job after push. At the start of this task the cloud network policy blocks `iriszhu79.github.io`, preventing a direct live-site load from this executor. JS/CSS/fonts/mushroom are verified against the production build locally. If that policy remains unchanged, direct hosted asset/browser verification must be reported as unavailable, not as passed. The user has been asked to allow that hostname; no credentials are requested.

[Before/after screenshots](previews/v15-round2/README.md)
