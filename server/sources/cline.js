// SessionVault Cline CLI adapter for current ~/.cline/data/db/sessions.db plus
// messages_path JSON artifacts. Read-only. Falls back to scanning manifest files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeEntry, cdPrefix, flattenText } from './_shared.js';

const CLINE_DIR = process.env.CLINE_DIR?.trim() || path.join(os.homedir(), '.cline');
const DATA_DIR = process.env.CLINE_DATA_DIR?.trim() || path.join(CLINE_DIR, 'data');
const SESSION_DIR = process.env.CLINE_SESSION_DATA_DIR?.trim() || path.join(DATA_DIR, 'sessions');
const DB_DIR = process.env.CLINE_DB_DATA_DIR?.trim() || path.join(DATA_DIR, 'db');
const DB_PATH = path.join(DB_DIR, 'sessions.db');
export const source = 'cline';

function openDb() {
  try { if (fs.existsSync(DB_PATH)) return new DatabaseSync(DB_PATH, { readOnly: true }); } catch {}
  return null;
}

function flattenMessageContent(content) {
  if (typeof content === 'string') return content;
  return flattenText(content);
}

const messageCache = new Map();
function readMessageData(file, { wantMessages = false, lastN = 30 } = {}) {
  let stat; try { stat = fs.statSync(file); } catch { return { count: 0, firstUserText: '', messages: [] }; }
  const hit = messageCache.get(file);
  if (!wantMessages && hit && hit.mtimeMs === stat.mtimeMs) return hit.summary;
  let o; try { o = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { count: 0, firstUserText: '', messages: [] }; }
  const arr = Array.isArray(o) ? o : (Array.isArray(o?.messages) ? o.messages : []);
  const out = [];
  let firstUserText = '';
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    const text = flattenMessageContent(m.content ?? m.text);
    if (role === 'user' && !firstUserText && text) firstUserText = text;
    out.push({ role, text });
  }
  const summary = { count: out.length, firstUserText, messages: wantMessages ? out.slice(-lastN) : [] };
  if (!wantMessages) messageCache.set(file, { mtimeMs: stat.mtimeMs, summary });
  return summary;
}

function rowsFromDb() {
  const d = openDb();
  if (!d) return [];
  try {
    const cols = d.prepare('PRAGMA table_info(sessions)').all().map((r) => r.name);
    if (!cols.includes('session_id')) return [];
    const has = (c) => cols.includes(c);
    const sql = `SELECT
      session_id AS id,
      ${has('cwd') ? 'cwd' : "''"} AS cwd,
      ${has('started_at') ? 'started_at' : 'NULL'} AS startedAt,
      ${has('ended_at') ? 'ended_at' : 'NULL'} AS endedAt,
      ${has('updated_at') ? 'updated_at' : 'NULL'} AS updatedAt,
      ${has('prompt') ? 'prompt' : 'NULL'} AS prompt,
      ${has('metadata_json') ? 'metadata_json' : 'NULL'} AS metadataJson,
      ${has('messages_path') ? 'messages_path' : 'NULL'} AS messagesPath,
      ${has('is_subagent') ? 'is_subagent' : '0'} AS isSubagent
      FROM sessions
      ${has('is_subagent') ? 'WHERE COALESCE(is_subagent, 0) = 0' : ''}
      ORDER BY ${has('updated_at') ? 'updated_at' : has('started_at') ? 'started_at' : 'session_id'} DESC`;
    return d.prepare(sql).all();
  } catch { return []; }
  finally { try { d.close(); } catch {} }
}

function manifestsFallback() {
  const rows = [];
  let dirs; try { dirs = fs.readdirSync(SESSION_DIR, { withFileTypes: true }); } catch { return rows; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const base = path.join(SESSION_DIR, d.name);
    let files; try { files = fs.readdirSync(base); } catch { continue; }
    const mf = files.find((f) => f.endsWith('.json') && !f.endsWith('.messages.json'));
    if (!mf) continue;
    let o; try { o = JSON.parse(fs.readFileSync(path.join(base, mf), 'utf8')); } catch { continue; }
    rows.push({
      id: o.session_id || d.name, cwd: o.cwd || o.workspace_root || '', startedAt: o.started_at || null,
      endedAt: o.ended_at || null, updatedAt: o.ended_at || o.started_at || null,
      prompt: o.prompt || null, metadataJson: o.metadata ? JSON.stringify(o.metadata) : null,
      messagesPath: o.messages_path || path.join(base, `${o.session_id || d.name}.messages.json`), isSubagent: 0,
    });
  }
  return rows;
}

function titleAndMeta(r) {
  let meta = {};
  try { if (r.metadataJson) meta = JSON.parse(r.metadataJson); } catch {}
  const title = meta?.title || r.prompt || '(untitled)';
  const msgPath = r.messagesPath || path.join(SESSION_DIR, String(r.id), `${r.id}.messages.json`);
  return { title, msgPath };
}

export async function list() {
  const rows = rowsFromDb();
  const sourceRows = rows.length ? rows : manifestsFallback();
  const out = [];
  for (const r of sourceRows) {
    if (!r.id) continue;
    const { title, msgPath } = titleAndMeta(r);
    let stat = null; try { stat = fs.statSync(msgPath); } catch {}
    const ms = readMessageData(msgPath);
    const ts = r.updatedAt || r.endedAt || r.startedAt || (stat ? stat.mtime.toISOString() : null);
    const mtimeMs = stat?.mtimeMs || (ts ? Date.parse(ts) || 0 : 0);
    out.push(makeEntry({
      source, id: String(r.id), ref: String(r.id), title: String(title).slice(0, 80), cwd: r.cwd || '', gitBranch: null,
      messageCount: ms.count, lastActivity: ts, mtimeMs, firstUserText: r.prompt || ms.firstUserText || String(title),
      resume: `${cdPrefix(r.cwd || '')}cline -i --id ${r.id}`,
    }));
  }
  return out;
}

function rowForId(id) {
  const rows = rowsFromDb();
  const row = rows.find((r) => String(r.id) === id);
  if (row) return row;
  return manifestsFallback().find((r) => String(r.id) === id) || null;
}

export async function detail(ref, lastN = 30) {
  if (!/^[A-Za-z0-9._-]+$/.test(ref)) throw new Error('forbidden');
  const r = rowForId(ref);
  if (!r) throw new Error('forbidden');
  const { title, msgPath } = titleAndMeta(r);
  const messages = readMessageData(msgPath, { wantMessages: true, lastN }).messages;
  return {
    source, id: ref, title: String(title).slice(0, 80), projectPath: r.cwd || '', gitBranch: null,
    resume: `${cdPrefix(r.cwd || '')}cline -i --id ${ref}`,
    messages,
  };
}
