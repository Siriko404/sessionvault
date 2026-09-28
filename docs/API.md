# SessionVault local API contract

Base URL: `http://127.0.0.1:5191`.

The server is loopback-only. The shipping pass treats the measured API behavior as frozen; UI work consumes these routes without broadening network exposure.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/sources` | Source display metadata. |
| GET | `/api/conversations` | Unified conversation summaries. |
| GET | `/api/conversation?source=<source>&ref=<ref>&limit=<n|all>` | Conversation detail. `limit=all` requests the complete readable transcript. |
| GET | `/api/search?q=<query>` | Full-transcript search results. |
| GET | `/api/search-status` | Search-index status. |
| GET | `/api/open?path=<path>` | Explicitly open a validated project path in the OS file manager. |
| GET | `/api/session-open?source=<source>&ref=<ref>` | Explicitly open/resume the selected session in a terminal. |
| GET | `/api/agents` | Installed-agent inventory. |
| GET | `/api/agents/open?id=<id>` | Explicitly open an agent terminal. |
| GET | `/api/agents/update?id=<id>` | Explicitly update an installed agent. |
| GET | `/api/usage` | Local usage/quota information. |

## Security invariants

- Vite development and preview both bind exactly to `127.0.0.1` on port `5191`.
- `strictPort: true` prevents silent fallback to another port.
- `open: false` is explicit for both development and preview.
- The browser UI uses same-origin `/api/...` requests.
- The lifecycle scripts do not launch a browser during start, status, verify, restart, reindex, or desktop-app startup. Only the explicit `sessionvault open` command invokes `xdg-open`.
- Path/session actions rely on the existing backend validation and do not accept shell fragments from the UI.
