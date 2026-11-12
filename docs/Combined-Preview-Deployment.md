# Combined V1.5 / V2.0-A acceptance deployment

The workflow exports immutable application commits into ignored `.combined/v15` and `.combined/v20` directories:

| Application | Source commit | Public path | Project storage key |
|---|---|---|---|
| V1.5 | `19a4cfbccc2eedcf70eab12db4512f6bc00ee57b` | `/pindou-preview/` | `pindou.preview.v15.projects.v1` |
| V2.0-A | `86f58afd93bac3ea3bcdd3339254185681fab602` | `/pindou-preview/v2-a/` | `pindou.preview.v20a.projects.v1` |

No V2 application behavior changes are included. During export only V2's `src/storage.ts` constant and `vite.preview.config.ts` base are replaced. Existing tests are adapted to the isolated key/path in the exported scratch checkout, not in the approved source branch. Neither production nor V1.5 data is migrated. The two production source storage operations are audited: `model.ts` reads only `PROJECT_STORAGE_KEY`, and `main.tsx` writes only that key. No remove/clear operations exist. Emitted JS is checked for foreign keys.

## Publication gates

1. Export pinned trees and audit storage operations.
2. Install dependencies, run 25 V1.5 / 32 V2.0-A unit tests and production-build each tree.
3. Copy the entire V1.5 build to the artifact root and entire V2 build under `v2-a/`.
4. Verify every copied file hash, correct HTML base paths, isolated bundle keys and original MARD sample SHA-256.
5. Serve the combined artifact locally. Run same-origin desktop/mobile tests: both direct URL refreshes, recognition and worker loading, real MARD sample, confirmation/import, A/B progress, reload, preservation of seeded V1.5 progress, and two-way storage access auditing. Fetch and hash every packaged asset, including fonts/images/worker JS.
6. Run all six existing browser regression suites plus preview and Round 2 suites for both versions, and recognition tests for V2.
7. Only after every gate succeeds, upload one combined Pages artifact. The deploy job depends on successful completion of the entire build/verification job. Shell and child-process errors fail the job; there is no continue-on-error or independent V2 deploy job.

`deployment-manifest.json` records both source pins, base paths, keys and file hashes. V1.5 source and generated root application bytes remain the approved version. Future application changes require explicitly updating pins; ordinary source changes on main are not silently published by this workflow. Pages still performs one atomic repository deployment; concurrency group `preview-pages` serializes deployments and is unchanged.

Production repository/site `/pindou/` is outside this workflow. The repository guard and main-ref guard prevent publication from a different repository or a feature-branch workflow dispatch.

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

Please record browser/iOS version, screen orientation, crop/dimensions, selected cell coordinates and screenshots for any recognition/correction issues. Native Mac/iPhone acceptance is manual; Chromium viewport emulation is not native Safari testing. V2.0-B work has not started.
