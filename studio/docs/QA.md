# MVP verification — 2026-11-17

Scope: standalone Studio feature branch based on `8edba65`. No push, merge, Pages workflow edit or deployment. No consumer source/public asset edits. Raw user archives/images remain outside the repository; the requested screenshots contain the P020 trial view.

## Results

- `npm ci`: passed.
- Existing `npm test`: 44 passed.
- Studio `npm run test:studio`: 13 passed. Coordinates, rectangle scope, candidates versus truth, atomic invalid imports, explicit sign-off, review invalidation, geometry archives, undo/redo audit retention, Gold/Silver/practice gates, SHA-256, malformed native backups, Pindou uncertain/group-label handling and benchmark annotation schema.
- Existing benchmark unit suite: 22 passed.
- Existing production build and isolated Studio build: passed.
- Studio synthetic browser review: passed. Mouse crop, zoom/reset, explicit four-cell scope confirmation, undo/redo, legend evidence, Gold gating, benchmark schema, reload, native ZIP restore, and four production/preview storage sentinels unchanged. The fixture is generated synthetic data; no real human review is asserted.
- Exported synthetic single-sample benchmark bundle: existing benchmark CLI validator returned **0 errors, 0 warnings**.
- P020 browser integration: passed at 1440×900, 1280×800, 820×1180 and 390×844. Import, draft geometry hint/application, candidate import, practice sign-off, unknown/ambiguous edits, undo/redo, RGB evidence sampling, reload and Draft ZIP export. No page errors or horizontal overflow. Screenshots in `screenshots/`.
- Corpus import: all 20 images imported as unreviewed drafts; zero independent cell reviews. Hashes agree across both supplied archives. Touch crop-handle movement verified through Chromium touch events on 820×1180. The initial import + test action sequence took approximately 1.8 seconds in the cloud environment; this is not native iPad timing.
- Six existing consumer suites passed: steps, mobile-session, selection-navigation, routes, mobile-canvas, cell-workspace. These cover navigation, selection/pan/zoom, A/B completion, progress/persistence, mobile drawer, rotation, Focus and Duck/Teapot recognition-to-Workspace export/import.
- **Existing `tests/workspace.mjs` did not pass**: times out at line 54 waiting for `window.scrollY > 0` on the homepage, before opening the Workspace. The current compact homepage fits this test's viewport; no consumer layout code was changed to accommodate the assertion. Initial default-browser launch also required pointing the runner at the already installed `/usr/bin/chromium`; the meaningful test failure above is from that available browser.

## P020 trial interpretation

Image SHA-256: `e6276a720f79e07f8e17fc1535f020bee766fac06f002ad3cb14bbd6c4d80c37`, 1407×2048, 1,689,453 bytes. The imported candidate file supplied a 80×57 grid (4,560 addresses), 1,844 occupied suggestions and 2,716 empty suggestions. Dimensions/crop/counts came from the import, not from production hardcoding. All suggested official codes were null; RGB groups remain evidence.

Practice-mode exports contained **0 verified cells, 4,560 unknown benchmark occupancies**. The source hash and original bytes survived export. No P020 Gold dataset, cell-level accuracy or independently reviewed answers were created. Human acceptance is still required.

## Performance and limits

Latest P020 Chromium heap samples after sampling/reload/export were roughly 422–512 MB decimal (402–488 MiB); initial runs also observed about 272 MB. These are point-in-time `performance.memory.usedJSHeapSize` observations, not peak measurements, device limits or native Safari results. Draft ZIPs were about 3.67 MB; full candidate/evidence/audit payloads are larger before compression. Compression/sampling are synchronous and can pause interaction. Large histories/full-grid operations and mobile memory remain follow-up work; 40,000-cell input acceptance is not a validated capacity claim.

No native iPhone Safari or iPad Safari testing has been performed. Custom pinch manipulation, perspective correction, OCR and second-reviewer adjudication UI are out of scope. The versioned schema preserves second-reviewer and future OCR evidence fields. Split labels and provenance remain reviewer declarations, not automatic guarantees of held-out independence or original-upload identity.
