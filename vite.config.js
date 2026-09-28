import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { listConversations, getConversation, SOURCE_META } from './server/sources/index.js';
import { getUsage } from './server/usage.js';
import { openPath } from './server/open.js';
import { openSessionTerminal } from './server/session.js';
import { getAgents, openAgentTerminal, updateAgent } from './server/agents.js';
import { searchContent, warmIndex, getSearchStatus } from './server/search.js';

// API that reads local transcripts from every supported AI coding tool and
// serves a unified list. Registered on BOTH the dev server and the preview
// server, so a built `dist/` is fully functional via `npm run preview`.
async function apiMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const json = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  if (url.pathname === '/api/sources') {
    return json(200, SOURCE_META);
  }

  if (url.pathname === '/api/usage') {
    try { json(200, await getUsage()); }
    catch (e) { json(500, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/open') {
    const p = url.searchParams.get('path');
    try { json(200, openPath(p)); }
    catch (e) { json(400, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/session-open') {
    try { json(200, await openSessionTerminal(url.searchParams.get('source'), url.searchParams.get('ref'), url.searchParams.get('mode'))); }
    catch (e) { json(400, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/search') {
    const q = url.searchParams.get('q') || '';
    try { json(200, await searchContent(q)); }
    catch (e) { json(500, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/search-status') {
    return json(200, getSearchStatus());
  }

  if (url.pathname === '/api/agents') {
    try { json(200, await getAgents()); }
    catch (e) { json(500, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/agents/open') {
    try { json(200, openAgentTerminal(url.searchParams.get('id'))); }
    catch (e) { json(400, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/agents/update') {
    try { json(200, await updateAgent(url.searchParams.get('id'))); }
    catch (e) { json(400, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/conversations') {
    try { json(200, await listConversations()); }
    catch (e) { json(500, { error: String(e) }); }
    return;
  }

  if (url.pathname === '/api/conversation') {
    const source = url.searchParams.get('source');
    const ref = url.searchParams.get('ref');
    if (!source || !ref) return json(400, { error: 'missing source or ref' });
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === 'all' || !rawLimit ? 1000000 : Math.max(1, Math.min(1000000, Number(rawLimit) || 1000000));
    try { json(200, await getConversation(source, ref, limit)); }
    catch (e) { json(e.message === 'forbidden' ? 403 : 500, { error: String(e) }); }
    return;
  }

  next();
}

function conversationsApi() {
  return {
    name: 'conversations-api',
    configureServer(server) { server.middlewares.use(apiMiddleware); warmIndex(); },
    configurePreviewServer(server) { server.middlewares.use(apiMiddleware); warmIndex(); },
  };
}

export default defineConfig({
  plugins: [react(), conversationsApi()],
  // SessionVault is private local data. Bind only to loopback, never choose another
  // port silently, and NEVER ask Vite to open a browser. Explicitly setting
  // preview.open=false is essential: in Vite 5, preview.open defaults to
  // server.open when omitted.
  server: { port: 5191, open: false, host: '127.0.0.1', strictPort: true },
  preview: { port: 5191, open: false, host: '127.0.0.1', strictPort: true },
});
