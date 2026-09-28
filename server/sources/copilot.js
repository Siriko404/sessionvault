// SessionVault GitHub Copilot CLI adapter. Supports current session-state/<id>/events.jsonl
// plus the older history-session-state/*.json layout. Read-only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeEntry, cdPrefix, flattenText, toolUseLine, toolResultLine, isInside } from './_shared.js';

const HOME = process.env.COPILOT_HOME?.trim() || path.join(os.homedir(), '.copilot');
const CURRENT_ROOT = path.join(HOME, 'session-state');
const LEGACY_ROOTS = [path.join(HOME, 'history-session-state'), path.join(HOME, 'sessions')];
export const source = 'copilot';

function currentFiles() {
  const out = [];
  let dirs; try { dirs = fs.readdirSync(CURRENT_ROOT, { withFileTypes: true }); } catch { return out; }
  for (const d of dirs) {
    if (d.isDirectory()) {
      const f = path.join(CURRENT_ROOT, d.name, 'events.jsonl');
      if (fs.existsSync(f)) out.push(f);
    } else if (d.isFile() && d.name.endsWith('.jsonl')) out.push(path.join(CURRENT_ROOT, d.name));
  }
  return out;
}

function legacyFiles() {
  const out = [];
  for (const root of LEGACY_ROOTS) {
    let ents; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) if (e.isFile() && e.name.endsWith('.json')) out.push(path.join(root, e.name));
  }
  return out;
}

function parseEvents(file, { wantMessages = false, lastN = 30 } = {}) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let id = path.basename(path.dirname(file));
  let cwd = '';
  let ts = null;
  let firstUserText = '';
  let userCount = 0, assistantCount = 0;
  const messages = wantMessages ? [] : null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const type = e?.type;
    const d = e?.data || {};
    ts = e?.timestamp || ts;
    if (type === 'session.start') {
      id = d.sessionId || id;
      cwd = d.context?.cwd || d.context?.gitRoot || cwd;
    } else if (type === 'user.message') {
      const text = flattenText(d.content ?? d.text);
      userCount++;
      if (!firstUserText && text) firstUserText = text;
      if (messages) messages.push({ role: 'user', text });
    } else if (type === 'assistant.message') {
      const parts = [];
      const text = flattenText(d.content ?? d.text);
      if (text) parts.push(text);
      for (const tr of d.toolRequests || []) parts.push(toolUseLine(tr.name || tr.toolName, tr.arguments || tr.args));
      assistantCount++;
      if (messages) messages.push({ role: 'assistant', text: parts.join('\n').trim() });
    } else if (type === 'tool.execution_start' && messages) {
      messages.push({ role: 'tool', text: toolUseLine(d.toolName, d.arguments) });
    } else if (type === 'tool.execution_complete' && messages) {
      messages.push({ role: 'tool', text: toolResultLine(d.result?.content ?? d.result?.detailedContent ?? d.result ?? '') });
    }
  }
  return { id, cwd, ts, firstUserText, userCount, assistantCount, messages: messages ? messages.slice(-lastN) : null };
}

function parseLegacy(file, { wantMessages = false, lastN = 30 } = {}) {
  let o; try { o = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  const msgs = Array.isArray(o) ? o : (o.messages || o.history || o.turns || []);
  const cwd = o.cwd || o.workingDirectory || o.directory || '';
  const id = o.sessionId || o.id || path.basename(file).replace(/\.json$/, '');
  const ts = o.updatedAt || o.timestamp || o.startTime || o.lastActivity || null;
  let firstUserText = '', userCount = 0, assistantCount = 0;
  const messages = wantMessages ? [] : null;
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' || m.role === 'model' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    const text = flattenText(m.content ?? m.text);
    if (role === 'user') { userCount++; if (!firstUserText && text) firstUserText = text; } else assistantCount++;
    if (messages) messages.push({ role, text });
  }
  return { id, cwd, ts, firstUserText, userCount, assistantCount, messages: messages ? messages.slice(-lastN) : null };
}

function read(file, opts) { return file.endsWith('events.jsonl') ? parseEvents(file, opts) : parseLegacy(file, opts); }
const cache = new Map();

export async function list() {
  const out = [];
  for (const file of [...currentFiles(), ...legacyFiles()]) {
    let stat; try { stat = fs.statSync(file); } catch { continue; }
    if (!stat.size) continue;
    let s;
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) s = hit.summary;
    else { try { s = read(file); } catch { continue; } if (!s) continue; cache.set(file, { mtimeMs: stat.mtimeMs, summary: s }); }
    if (!s.userCount && !s.assistantCount) continue;
    out.push(makeEntry({
      source, id: s.id, ref: file, title: s.firstUserText?.slice(0, 80), cwd: s.cwd, gitBranch: null,
      userCount: s.userCount, assistantCount: s.assistantCount,
      lastActivity: s.ts || stat.mtime.toISOString(), mtimeMs: stat.mtimeMs,
      firstUserText: s.firstUserText,
      resume: `${cdPrefix(s.cwd)}copilot --resume=${s.id}`,
    }));
  }
  return out;
}

export async function detail(ref, lastN = 30) {
  const resolved = path.resolve(ref);
  const roots = [CURRENT_ROOT, ...LEGACY_ROOTS];
  if (!roots.some((r) => isInside(resolved, r))) throw new Error('forbidden');
  const s = read(resolved, { wantMessages: true, lastN });
  if (!s) throw new Error('forbidden');
  return {
    source, id: s.id, title: (s.firstUserText || '(untitled)').slice(0, 80), projectPath: s.cwd || '', gitBranch: null,
    resume: `${cdPrefix(s.cwd)}copilot --resume=${s.id}`,
    messages: s.messages || [],
  };
}
