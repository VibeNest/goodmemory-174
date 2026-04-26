Phase 44 Breakdown: Local Viewer Data API and Lightweight UI
============================================================

Follow the parent task file:

- `task-board/48-phase-44-local-viewer-data-api-and-lightweight-ui.txt`

Task order:

1. contract and failing tests
2. read-only data API
3. local token, host binding, and no-CORS security
4. static viewer shell
5. progressive drill-down, audit, trace, and session views
6. package/license gate and closure

Working rules:

- Build inspectability, not a dashboard.
- Keep viewer read-only.
- Bind to 127.0.0.1.
- Require a local token.
- Do not show raw transcripts.
- Do not copy code from `third-party/claude-mem-main`.
