# Isolated V1.5 source

Source: https://github.com/iriszhu79/pindou/tree/4444c28ba33afadb8f6ead72f96e0c6102f9a3e9

Branch: feat/v1.5-pixel-game-redesign

The initial preview was seeded from that source snapshot. Round 2 is maintained directly in this preview repository on `feat/v1.5-round2-refinements`, then published from its own `main`; the production repository is not modified or synchronized. The original production deployment workflow is excluded. The default Vite config forwards to the preview config so all local builds here use /pindou-preview/. The preview-only Pages workflow builds and uploads dist-preview/. No production main branch, workflow or storage is changed.

Preview progress uses pindou.preview.v15.projects.v1. No production data is imported.

## Hosting verification — 2026-11-11

Pages is enabled and the official deployment action succeeded in runs 42997336076 and 42996977648. The older run was rerun after the newer one; this documentation update triggers a fresh deployment from the current preview main so the published application includes the latest save-picker fix. When rerunning a deployment, select the latest commit rather than an older source snapshot.

Preview URL: https://iriszhu79.github.io/pindou-preview/

The cloud environment blocks direct access to the github.io hostname. Deployment success is verified through the public GitHub Actions run and deploy-job status; live-browser loading from this environment remains unverified. Local browser regression tests and screenshots are documented in docs/QA-v1.5.md.


## Round 2 (2026-11-12)

Targeted refinements continue the existing V1.5 application and reuse this repository’s Pages workflow unchanged. See [Round 2 QA](docs/QA-v1.5-round2.md) and [before/after screenshots](docs/previews/v15-round2/README.md). The existing preview storage namespace is retained; production data is never read or migrated.
