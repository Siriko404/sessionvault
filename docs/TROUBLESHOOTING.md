# Troubleshooting

## `sessionvault verify` cannot connect

Run `sessionvault status`, then `sessionvault log`. The expected URL is exactly `http://127.0.0.1:5191`. A different process occupying port 5191 is an error by design; SessionVault does not choose a different port silently.

To restart cleanly:

```bash
sessionvault stop
sessionvault start
sessionvault verify
```

## The release verifier fails

Run from the repository root:

```bash
npm run verify:release
```

The checker intentionally fails if required measured backend files are absent, if either Vite mode can auto-open a browser, if loopback/strict-port settings move, or if the launcher loses its single-instance/cleanup guarantees. Fix the stated invariant rather than weakening the check.

## Search returns metadata matches but not transcript matches

The content index warms in the background. Check:

```bash
curl -s http://127.0.0.1:5191/api/search-status
```

If indexing is stale or damaged:

```bash
sessionvault reindex
sessionvault verify
```

`sessionvault reindex` only resets SessionVault's search index; it does not delete agent transcript stores.

## An agent is missing

SessionVault only shows sources/installations it can detect locally. Confirm that the agent has actually been used and that its expected local history exists. Run the existing smoke suite from the checkout for adapter diagnostics:

```bash
npm test
```

## Agent update fails

The Agents panel surfaces an error and leaves the current installation untouched. Retry once after confirming connectivity and permissions. Do not run update repeatedly without reading the underlying package/tool error.

## Desktop window does not start

The included desktop wrapper is Linux-specific and needs Python 3, PyGObject GTK 3, and WebKit2 4.1 bindings. The server/CLI can still be used without that desktop shell:

```bash
sessionvault start
sessionvault verify
sessionvault open
```

`sessionvault open` is intentionally the only command that opens the default browser.

## The desktop launcher leaves a server running

Normally the `sessionvault-app.sh` EXIT trap stops it. If the host or process was killed abnormally, run:

```bash
sessionvault stop
sessionvault status
```

Then inspect `${SESSIONVAULT_HOME:-$HOME/.local/share/sessionvault}/sessionvault.log` if necessary.

## UI looks stale after an update

The PWA service worker is network-first and versioned. Reload once while the local server is reachable. If a browser has retained an old worker unusually aggressively, unregister the SessionVault service worker in browser developer tools and reload. This is a recovery step, not part of normal updates.
