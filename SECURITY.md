# Security

SessionVault displays private local conversation history. Treat loopback confinement as a security boundary, not a convenience setting.

- Do not run Vite with `--host`, `0.0.0.0`, a LAN address, or any reverse tunnel.
- Do not remove `strictPort: true`; unexpected port fallback complicates lifecycle verification.
- Do not add telemetry or remote transcript uploads without an explicit product/security decision.
- Do not commit transcript data, SessionVault logs, search databases, screenshots containing private history, credentials, or home-directory secrets.
- Keep path and session-opening validation server-side. UI affordances are not authorization checks.

For a security issue in a future public repository, use that repository's private security-reporting channel if enabled. Until the operator chooses the final repository/visibility, no public disclosure address is asserted here.
