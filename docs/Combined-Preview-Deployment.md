# Combined V1.5 / V2.0-A / V2.0-B1.1 acceptance deployment

The workflow exports immutable application commits into ignored `.combined/v15`, `.combined/v20` and `.combined/v211` directories:

| Application | Source commit | Public path | Project storage key |
|---|---|---|---|
| V1.5 | `19a4cfbccc2eedcf70eab12db4512f6bc00ee57b` | `/pindou-preview/` | `pindou.preview.v15.projects.v1` |
| V2.0-A | `86f58afd93bac3ea3bcdd3339254185681fab602` | `/pindou-preview/v2-a/` | `pindou.preview.v20a.projects.v1` |
| V2.0-B1.1 | `91d7f25fd21f1323e2db52988bfdce4ee66e354b` | `/pindou-preview/v2-b1-1/` | `pindou.preview.v20b11.projects.v1` |

This deployment commit changes no application behavior beyond the exported base path and storage constant; B1.1 recognition is taken unchanged from the pinned feature commit. During export only V2's `src/storage.ts` constant and `vite.preview.config.ts` base are replaced. Existing tests are adapted to the isolated key/path in the exported scratch checkout, not in the approved source branch. No existing data is read or migrated, including the previous development key `pindou.preview.v20b1.projects.v1`. The two production source storage operations are audited: `model.ts` reads only `PROJECT_STORAGE_KEY`, and `main.tsx` writes only that key. No remove/clear operations exist. Emitted JS is checked for foreign keys.

## Publication gates

1. Export pinned trees and audit storage operations.
2. Install dependencies, run 25 V1.5 / 32 V2.0-A / 44 B1.1 unit tests and production-build each tree.
3. Copy the entire V1.5 build to the artifact root and entire V2A build under `v2-a/` and B1.1 build under `v2-b1-1/`.
4. Verify every copied file hash, correct HTML base paths, isolated bundle keys and original MARD sample SHA-256. Compare every V1.5/V2A file hash to `scripts/approved-preview-hashes.json`, captured from the approved live manifest before this extension; any difference aborts publication.
5. Serve the combined artifact locally. Run same-origin desktop/mobile tests: all three direct URL refreshes, recognition and worker loading, real MARD sample, confirmation/import, A/B progress, reload, preservation of seeded V1.5 progress, and per-application storage read/write auditing against all other version keys. Fetch and hash every packaged asset, including fonts/images/worker JS.
6. Run all six existing browser regression suites plus preview and Round 2 suites for all three versions, recognition tests for both V2 apps, and B1.1 annotated-cell, crop, real-copy, compression and Workspace-import suites.
7. Only after every gate succeeds, upload one combined Pages artifact. The deploy job depends on successful completion of the entire build/verification job. Shell and child-process errors fail the job; there is no continue-on-error or independent V2 deploy job.

`deployment-manifest.json` records all three source pins, base paths, keys and file hashes. V1.5 and V2A application bytes remain identical to their approved versions. Future application changes require explicitly updating pins; ordinary source changes on main are not silently published by this workflow. Pages still performs one atomic repository deployment; concurrency group `preview-pages` serializes deployments and is unchanged.

Production repository/site `/pindou/` is outside this workflow. The repository guard and main-ref guard prevent publication from a different repository or a feature-branch workflow dispatch.

## B1.1 validation boundaries and performance

B1.1's preserved real-copy fixtures produce 1179 beads / 5 colors (Pig), 139 / 8 (Duck), and 1333 / 6 (Teapot), with automatic and manual crop results recorded separately. Duck/Teapot fixtures are 1080×1254 conversation-preserved copies, not byte-identical original 1440×1672 iPhone files. The original files and native Safari behavior remain real-device acceptance work.

Cloud Chromium's packaged original-Pig sample recognition was about 2.48 seconds at both desktop and phone-sized viewports in the initial local artifact check (grid inference, Worker execution and UI update). This is not a native iPhone benchmark. The pinned classification QA measured warmed known-geometry Node calls at approximately 0.27–0.66 seconds and full diagnostic-process peak RSS around 176–260 MiB; those RSS values are not browser Worker-only memory or native mobile memory. Peak Safari/browser memory has not been measured. Recognition remains in the existing cancellable Worker.

The 169-cell targeted annotated subset is diagnostic evidence, not full-chart certified accuracy. White occupancy and close/noisy colors remain review cases. Reference counts are evaluation data only; production classification does not force them.

## Local reproduction

```sh
npm ci
node scripts/prepare-combined.mjs
node scripts/build-combined.mjs
node scripts/package-combined.mjs
node scripts/serve-combined.mjs
```

In another terminal:

```sh
node scripts/verify-combined.mjs
node scripts/test-combined.mjs
```

Set `CHROMIUM_PATH=/usr/bin/chromium` if using a system Chromium instead of Playwright's installed browser. Unit/browser fixtures use disposable contexts only. For native TLS verification in this cloud runner, an ephemeral browser-only NSS database can trust the already-provided session CA; no system trust, network policy, or TLS verification bypass is needed.

## Live acceptance

V1.5: https://iriszhu79.github.io/pindou-preview/

V2.0-A: https://iriszhu79.github.io/pindou-preview/v2-a/

V2.0-B1.1: https://iriszhu79.github.io/pindou-preview/v2-b1-1/

B1.1 iPhone Safari checklist:

1. Open the exact B1.1 URL above in normal Safari, then refresh it. Confirm the older preview project lists remain intact in their own URLs. B1.1 intentionally starts empty and does not migrate saves.
2. Upload the original Flying Pig, Duck and Teapot images from Photos/Files. Record automatic dimensions, bead/color counts, uncertainty, recognition time and any failure message. These originals have not been reproduced by the cloud copy-fixture tests.
3. Adjust the grid visually: drag the rectangle/corners, zoom, reset, set rows/columns, and re-analyze. Confirm changing geometry disables saving until re-analysis and review.
4. Inspect dark, saturated, pale cream, occupied-white, empty and watermarked cells; correct a cell, restore it, edit palette labels, and export review JSON. Count agreement alone is not full-cell acceptance.
5. Confirm the reviewed pattern into Workspace. Test pan/zoom, Hand/Select, row navigation, A/B, drawer and Focus. Refresh and reopen the project to confirm progress persists.
6. Reopen V1.5, V2A and production; their original projects/progress should remain unchanged. Report iPhone model, iOS/Safari version, exact source image dimensions, geometry, selected cell coordinates and screenshots.

The new subpath is exposed only when the single verified three-app artifact is deployed. A partial B1.1-only upload is never permitted. Pages replaces a whole artifact; the controls above protect against accidental omission or asset-path collisions. If any gate fails, the existing deployment remains live.

Mac:

1. Open V1.5 and confirm existing saved projects/progress are present.
2. Open V2.0-A in a second tab. V1.5 projects should not appear in V2's My Studio.
3. UPLOAD PATTERN → Load original MARD sample → Detect grid automatically. Expected aggregate result: 40 columns × 51 rows, 1,179 beads, five temporary colors. The output remains Needs Review; aggregate matches do not prove cell-level accuracy.
4. Compare source/digital grid. Change one empty cell to a color, observe +1 bead, then restore it. Edit a palette label/code. Crop changes must require rerunning recognition before confirmation.
5. Acknowledge review, confirm into Overview, Start Beading. Use A to complete / B to undo, pan/zoom and route controls. Refresh and resume the imported project.
6. Return to V1.5 and check its saved progress is unchanged. Changes in V1.5 must not affect V2 projects.

iPhone:

1. Open the exact V2 URL in Safari; refresh directly.
2. Load the sample and recognize. Check the Original image / Digital grid switch and absence of horizontal page scrolling.
3. Use row/column controls for precise cell corrections; inspect palette fields and review acknowledgement.
4. Confirm, enter Workspace, test touch navigation/pan/zoom, A/B buttons, mobile drawer and Focus. Reload and resume.
5. Open V1.5 separately and verify existing saves remain unchanged.

Please record browser/iOS version, screen orientation, crop/dimensions, selected cell coordinates and screenshots for any recognition/correction issues. Native Mac/iPhone acceptance is manual; Chromium viewport emulation is not native Safari testing. Legend OCR and V2.0-B2 are not included.
