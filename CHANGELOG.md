# Changelog

## Unreleased — UI polish and shipping pass

- Rebranded the operator-facing shell as SessionVault while retaining upstream provenance.
- Hardened persisted filter/star parsing and full-text search request cancellation.
- Added explicit accessible labels, pressed states, focus treatment, retry/status states, and narrow-screen polish.
- Changed full transcript rendering to incremental batches while still requesting the complete transcript from the frozen API.
- Improved Agents and Usage feedback, metric semantics, and 30-day activity anchoring.
- Added local install/update/uninstall scripts, live verification, release invariant checks, CI, security/provenance documentation, and a release runbook.
- Preserved the measured loopback-only, fixed-port, no-auto-browser lifecycle behavior.
