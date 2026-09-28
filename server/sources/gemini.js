// SessionVault Gemini CLI adapter for current auto-saved session JSON/JSONL under
// ~/.gemini/tmp/<project_hash>/chats/. Read-only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeEntry, toolUseLine, toolResultLine, thinkingLine, isInside, flattenText } from './_shared.js';

const GEMINI_HOME = process.env.GEMINI_CLI_HOME?.trim() || os.homedir();
const ROOT = path.join(GEMINI_HOME, '.gemini', 'tmp');
export const source = 'gemini';

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return flattenText(content);
  const out = [];
  for (const p of content) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.text === 'string') out.push(p.text);
    else if (p.functionCall) out.push(toolUseLine(p.functionCall.name, p.functionCall.args));
    else if (p.functionResponse) out.push(toolResultLine(p.functionResponse.response ?? p.functionResponse));
    else if (p.inlineData || p.fileData) out.push('🖼️ [media]');
  }
  return out.join('\n').trim();
}

function messageText(m) {
  const parts = [];
  const base = flattenContent(m.content ?? m.displayContent);
  if (base) parts.push(base);
  for (const t of m.thoughts || []) {
    const s = [t.subject, t.description].filter(Boolean).join(': ');
    if (s) parts.push(thinkingLine(s));
  }
  for (const tc of m.toolCalls || []) {
    parts.push(toolUseLine(tc.name, tc.args));
    if (tc.result != null) parts.push(toolResultLine(flattenContent(tc.result)));
  }
  return parts.join('\n').trim();
}

function parseJsonl(text) {
  let meta = {};
  const map = new Map();
  const order = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r && typeof r === 'object' && typeof r.$rewindTo === 'string') {
      const idx = order.indexOf(r.$rewindTo);
      const cut = idx >= 0 ? idx : 0;
      for (const id of order.splice(cut)) map.delete(id);
      continue;
    }
    if (r && typeof r === 'object' && r.$set && typeof r.$set === 'object') {
      if (Array.isArray(r.$set.messages)) {
        map.clear(); order.length = 0;
        for (const m of r.$set.messages) if (m?.id) { map.set(m.id, m); order.push(m.id); }
      }
      meta = { ...meta, ...r.$set };
      continue;
    }
    if (r && typeof r === 'object' && typeof r.id === 'string') {
      if (!map.has(r.id)) order.push(r.id);
      map.set(r.id, r);
      continue;
    }
    if (r && typeof r === 'object' && typeof r.sessionId === 'string') {
      meta = { ...meta, ...r };
      if (Array.isArray(r.messages)) {
        map.clear(); order.length = 0;
        for (const m of r.messages) if (m?.id) { map.set(m.id, m); order.push(m.id); }
      }
    }
  }
  return { meta, messages: order.map((id) => map.get(id)).filter(Boolean) };
}

function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.jsonl')) return parseJsonl(text);
  try {
    const o = JSON.parse(text);
    return { meta: o || {}, messages: Array.isArray(o?.messages) ? o.messages : [] };
  } catch { return { meta: {}, messages: [] }; }
}

function summarize(file, { wantMessages = false, lastN = 30 } = {}) {
  const { meta, messages: raw } = parseFile(file);
  let userCount = 0, assistantCount = 0, firstUserText = '';
  const messages = wantMessages ? [] : null;
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = m.type === 'user' ? 'user' : m.type === 'gemini' ? 'assistant' : null;
    if (!role) continue;
    const text = messageText(m);
    if (role === 'user') { userCount++; if (!firstUserText && text) firstUserText = text; }
    else assistantCount++;
    if (messages) messages.push({ role, text });
  }
  return {
    id: meta.sessionId || path.basename(file).replace(/^session-/, '').replace(/\.jsonl?$/, ''),
    projectHash: meta.projectHash || path.basename(path.dirname(path.dirname(file))),
    title: meta.summary || firstUserText || '(untitled)',
    lastUpdated: meta.lastUpdated || null,
    userCount, assistantCount, firstUserText,
    messages: messages ? messages.slice(-lastN) : null,
  };
}

function sessionFiles() {
  const out = [];
  let projects; try { projects = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { return out; }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const chats = path.join(ROOT, p.name, 'chats');
    const walk = (dir, depth = 0) => {
      if (depth > 2) return;
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const q = path.join(dir, e.name);
        if (e.isDirectory()) walk(q, depth + 1);
        else if (/^session-.*\.jsonl?$/.test(e.name)) out.push(q);
      }
    };
    walk(chats);
  }
  return out;
}

const cache = new Map();
export async function list() {
  const out = [];
  for (const file of sessionFiles()) {
    let stat; try { stat = fs.statSync(file); } catch { continue; }
    if (!stat.size) continue;
    let s;
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) s = hit.summary;
    else { try { s = summarize(file); } catch { continue; } cache.set(file, { mtimeMs: stat.mtimeMs, summary: s }); }
    if (!s.userCount && !s.assistantCount) continue;
    out.push(makeEntry({
      source, id: s.id, ref: file, title: s.title.slice(0, 80), cwd: null, gitBranch: null,
      userCount: s.userCount, assistantCount: s.assistantCount,
      lastActivity: s.lastUpdated || stat.mtime.toISOString(), mtimeMs: stat.mtimeMs,
      firstUserText: s.firstUserText,
      resume: `gemini --resume ${s.id}  # run from the original project directory`,
    }));
  }
  return out;
}

export async function detail(ref, lastN = 30) {
  const resolved = path.resolve(ref);
  if (!isInside(resolved, ROOT)) throw new Error('forbidden');
  const s = summarize(resolved, { wantMessages: true, lastN });
  return {
    source, id: s.id, title: s.title.slice(0, 80), projectPath: '', gitBranch: null,
    resume: `gemini --resume ${s.id}  # run from the original project directory`,
    messages: s.messages || [],
  };
}
