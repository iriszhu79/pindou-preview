# MARD regression fixtures

The user-supplied ZIP contained conversation-preserved copies, not confirmed native originals. Preserve the PNG and screenshot bytes. `README-copies.md` is the supplied README, retained separately from this test index.

- Flying Pig remains at `public/samples/sample-pattern.jpg` (unchanged repository asset).
- `duck_chat_copy.png`, `teapot_chat_copy.png`: 1080×1254 conversation copies. Do not call them the native 1440×1672 IMG_7250.jpeg / IMG_7252.jpeg uploads.
- `duck_failure_iphone.png`, `teapot_failure_iphone.png`: supporting iPhone screenshots, not chart inputs.
- `manifest.json`: SHA-256/provenance, evaluation references and annotated manual grid regions. No production code imports it. Manual annotations are explicit user-style geometry hints, not automatic detection inputs.

Run `npm run test:real-grids` against the local preview for the three-image, four-viewport automatic/manual comparison. Run `npm run diagnose:mard -- <file>` to export pixel-derived candidate evidence. See `docs/V2.0-B1-Copy-Regression-QA.md` for classification discrepancies and limits.
