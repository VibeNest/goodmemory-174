Phase 29 Breakdown
==================

Status
------
- Phase 29 is closed and accepted as the Bun-only release-hardening slice for `0.1.0-rc.1`.
- Accepted evidence:
  - `docs/archive/quality-gates/GoodMemory-Phase-29-Quality-Gate.md`
  - `reports/quality-gates/phase-29/run-20260421213000/phase-29-quality-gate.json`
  - `reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json`
- Scope: make the existing public surface installable, verifiable, and releasable as a Bun-only prerelease without widening capability scope.

Execution Order
---------------
1. 01-freeze-bun-only-v1-contract.txt
2. 02-make-package-publishable.txt
3. 03-tarball-reference-consumer-smoke.txt
4. 04-installed-cli-smoke.txt
5. 05-add-release-workflow.txt
6. 06-rewrite-readme-install-quickstart.txt
7. 07-cut-0.1.0-rc.1.txt

Acceptance
----------
- Bun-only support is explicit and contractually frozen
- the tarball artifact installs cleanly in a fresh Bun workspace
- public imports and installed CLI both work from the packed artifact
- release workflow uploads the tarball artifact and supports manual plus tag triggers
- phase closure points to one canonical gate run and one canonical RC dry-run report

Files in This Folder
--------------------
- 01-freeze-bun-only-v1-contract.txt
  Freeze the release-facing public contract and document the out-of-scope boundaries.

- 02-make-package-publishable.txt
  Add release metadata, license, tarball allowlist, and package-boundary readiness.

- 03-tarball-reference-consumer-smoke.txt
  Replace repo-root-only smoke with tarball-installed public-reference validation.

- 04-installed-cli-smoke.txt
  Prove the packaged CLI works from an installed Bun dependency.

- 05-add-release-workflow.txt
  Add `gate:phase-29` and a release workflow with manual plus tag triggers.

- 06-rewrite-readme-install-quickstart.txt
  Rewrite top-level docs around installed-package-first usage.

- 07-cut-0.1.0-rc.1.txt
  Archive the RC dry run and wire the repo to the `0.1.0-rc.1` release artifact contract.
