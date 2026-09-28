# SessionVault

SessionVault is a local-only browser for AI coding-session history. It merges conversations from supported coding agents into one searchable UI, lets you inspect full transcripts, and exposes explicit actions to reopen project folders or resume sessions.

**Privacy boundary:** the app server binds only to `127.0.0.1:5191`. Vite is configured with `strictPort: true` and `open: false` in both development and preview mode. Normal lifecycle commands never open a browser. The only browser-opening CLI action is an explicit `sessionvault open`.

## Requirements

- Node.js 24 or newer and npm.
- Linux for the shipped `sessionvault` lifecycle/desktop wrapper (`flock`, `/proc`, `xdg-open`; Python 3 plus GTK/WebKit for the desktop window).
- The web app itself remains ordinary React + Vite, but the included local launcher is intentionally Linux-specific.

## Development

```bash
npm ci
npm run build
npm run verify:release
npm test
npm run dev
```

`npm run dev` serves only on `http://127.0.0.1:5191` and **does not open a browser**. Open the URL yourself only when you intend to inspect the UI.

For the production build:

```bash
npm run build
npm run preview
```

Preview uses the same loopback-only address, fixed port, and no-browser rule. The Vite middleware exposes the local API in both development and preview.

## Local install

From a verified checkout:

```bash
./scripts/install-local.sh
sessionvault status
sessionvault verify
```

The installer copies the checkout into `${SESSIONVAULT_HOME:-$HOME/.local/share/sessionvault}/app`, runs `npm ci`, builds the app, installs the lifecycle scripts, and links `sessionvault` into `${SESSIONVAULT_BIN_DIR:-$HOME/.local/bin}`. It does not start SessionVault and does not open a browser.

Explicit actions:

```bash
sessionvault start      # server only; no browser
sessionvault status
sessionvault verify     # machine checks; final line must be RESULT: PASS
sessionvault open       # the only CLI command that intentionally opens your browser
sessionvault reindex
sessionvault log
sessionvault stop
```

If GTK/WebKit is available, `sessionvault-app` launches the contained desktop window. Its wrapper uses a single-instance lock and an EXIT trap that shuts down the server when the app window closes.

## Update

Pull or otherwise place the new verified source in a checkout, then run:

```bash
npm ci
npm run build
npm run verify:release
npm test
./scripts/install-local.sh
sessionvault verify
```

The installer stages and builds before replacing the installed app. Existing local transcript data belongs to the coding tools themselves and is not copied into this repository.

## Uninstall

```bash
./scripts/uninstall-local.sh
```

This removes the SessionVault install, command links, and SessionVault desktop entry. It does **not** delete source checkouts or any AI-agent transcript stores.

## UI behavior

- Search covers metadata immediately and full transcript content through the local search index. Stale search requests are aborted when the query changes.
- Tool, project, starred, and sort controls persist locally.
- Conversation detail requests the complete transcript (`limit=all`) but renders it incrementally from the newest messages backward to avoid a huge initial DOM for large histories.
- Agent, quota, metrics, loading, empty, and error states have explicit retry/status treatments.
- Keyboard focus, labels, pressed states, reduced motion, and narrow layouts are handled explicitly.

## API contract

See [`docs/API.md`](docs/API.md). The UI polish pass treats the measured backend behavior as frozen; the only included Vite config is the already-measured loopback/session-open/search-status overlay.

## Verification and troubleshooting

- Release invariant checker: `npm run verify:release`
- Existing adapter/API smoke suite: `npm test`
- Installed live check: `sessionvault verify`
- Troubleshooting: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
- Release procedure: [`docs/RELEASING.md`](docs/RELEASING.md)

## Provenance and licensing

SessionVault derives from `daniel-farina/ai-session-manager` at commit `dfdbf0f36d3b3e83dd08b7f423cb62c37a010992`. See [`NOTICE.md`](NOTICE.md) and the retained upstream MIT text under `THIRD_PARTY_LICENSES/`.

The final license for operator-authored SessionVault additions has **not** been selected. The root `LICENSE` therefore grants no new license. The release runbook recommends MIT as the simplest compatible default, but that decision must be made by the operator before public publication.
