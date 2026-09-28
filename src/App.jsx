import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Metrics from './Metrics.jsx';
import MiniStats from './MiniStats.jsx';
import Usage from './Usage.jsx';
import Agents from './Agents.jsx';
import { SORT_OPTIONS, sortConvos } from './sortConvos.js';
import './sort.css';

const DEFAULT_META = {
  claude: { label: 'Claude Code', short: 'Claude', color: '#d97757' },
  codex: { label: 'Codex', short: 'Codex', color: '#10a37f' },
  grok: { label: 'Grok', short: 'Grok', color: '#9b87f5' },
  opencode: { label: 'opencode', short: 'opencode', color: '#f0883e' },
  cursor: { label: 'Cursor', short: 'Cursor', color: '#4d9fff' },
  gemini: { label: 'Gemini CLI', short: 'Gemini', color: '#e6477f' },
  copilot: { label: 'GitHub Copilot CLI', short: 'Copilot', color: '#3fb950' },
  goose: { label: 'Goose', short: 'Goose', color: '#e3b341' },
  droid: { label: 'Droid', short: 'Droid', color: '#ff7b72' },
  cline: { label: 'Cline', short: 'Cline', color: '#7ee787' },
};

const FILTERS_KEY = 'ccv.filters';
const STARRED_KEY = 'ccv.starred';
const TRANSCRIPT_PAGE = 120;
const LIST_PAGE = 80;

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function loadFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTERS_KEY));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const validSort = SORT_OPTIONS.some((option) => option.value === raw.sort) ? raw.sort : 'recent';
    return {
      query: typeof raw.query === 'string' ? raw.query : '',
      project: typeof raw.project === 'string' ? raw.project : 'all',
      source: typeof raw.source === 'string' ? raw.source : 'all',
      sort: validSort,
      showStats: typeof raw.showStats === 'boolean' ? raw.showStats : false,
      showAgents: typeof raw.showAgents === 'boolean' ? raw.showAgents : false,
      starredOnly: typeof raw.starredOnly === 'boolean' ? raw.starredOnly : false,
    };
  } catch {
    return {};
  }
}

function loadStarred() {
  try {
    const raw = JSON.parse(localStorage.getItem(STARRED_KEY));
    return Array.isArray(raw) ? raw.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function CopyButton({ text, label = 'Copy resume' }) {
  const [state, setState] = useState('idle');
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onClick = async () => {
    if (!text || state === 'working') return;
    setState('working');
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setState('ok');
      } catch {
        setState('err');
      }
    }
    timerRef.current = setTimeout(() => setState('idle'), 1600);
  };

  const buttonLabel = state === 'ok' ? '✓ Copied' : state === 'err' ? '✗ Copy failed' : label;
  return (
    <button
      className={`copy-btn ${state === 'ok' ? 'copied' : ''} ${state === 'err' ? 'failed' : ''}`}
      onClick={onClick}
      title={text || 'Resume command unavailable'}
      disabled={!text || state === 'working'}
      aria-live="polite"
    >
      {buttonLabel}
    </button>
  );
}

function SourceBadge({ source, meta }) {
  const m = meta[source] || { short: source, color: '#8b949e' };
  return (
    <span className="badge source" style={{ color: m.color, borderColor: m.color }}>
      <span className="dot" style={{ background: m.color }} aria-hidden="true" />
      {m.short}
    </span>
  );
}

function RequestButton({ className = '', idleLabel, okLabel = '✓ Opened', errorLabel = '✗ Failed', title, request, confirmMessage }) {
  const [state, setState] = useState('idle');
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onClick = async () => {
    if (state === 'working') return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setState('working');
    try {
      const response = await request();
      setState(response.ok ? 'ok' : 'err');
    } catch {
      setState('err');
    }
    timerRef.current = setTimeout(() => setState('idle'), 1600);
  };

  return (
    <button
      className={`${className} ${state === 'ok' ? 'ok' : ''} ${state === 'err' ? 'err' : ''}`}
      onClick={onClick}
      title={title}
      disabled={state === 'working'}
      aria-live="polite"
    >
      {state === 'working' ? 'Working…' : state === 'ok' ? okLabel : state === 'err' ? errorLabel : idleLabel}
    </button>
  );
}

function OpenButton({ path }) {
  if (!path) return null;
  return (
    <RequestButton
      className="srt-open-btn"
      idleLabel="Folder"
      title={`Open directory ${path}`}
      request={() => fetch('/api/open?path=' + encodeURIComponent(path))}
    />
  );
}

function TerminalButton({ source, convRef }) {
  if (!source || !convRef) return null;
  return (
    <RequestButton
      className="srt-open-btn"
      idleLabel="Terminal"
      title="Open terminal session"
      request={() => fetch(
        '/api/session-open?source=' + encodeURIComponent(source) + '&ref=' + encodeURIComponent(convRef)
      )}
    />
  );
}

// Sources with a locally verified permission-bypass flag (see server/session.js).
// Rendered only for those agents; everything else keeps Folder + Terminal only.
const YOLO_SOURCES = ['claude', 'codex', 'opencode', 'cline', 'gemini', 'copilot'];

function YoloTerminalButton({ source, convRef }) {
  if (!source || !convRef || !YOLO_SOURCES.includes(source)) return null;
  return (
    <RequestButton
      className="srt-open-btn srt-yolo-btn"
      idleLabel="⚡ Terminal"
      title="Open terminal session with all permission checks bypassed (dangerous)"
      confirmMessage="Open this session with ALL permission checks bypassed? The agent will be able to run any command without asking."
      request={() => fetch(
        '/api/session-open?source=' + encodeURIComponent(source) + '&ref=' + encodeURIComponent(convRef) + '&mode=yolo'
      )}
    />
  );
}

function highlight(text, query) {
  if (!query || !text) return text;
  const s = String(text);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const lower = s.toLowerCase();
  const out = [];
  let i = 0;
  while (i < s.length) {
    let best = -1;
    let bestLen = 0;
    for (const t of terms) {
      const p = lower.indexOf(t, i);
      if (p !== -1 && (best === -1 || p < best)) {
        best = p;
        bestLen = t.length;
      }
    }
    if (best === -1) {
      out.push(s.slice(i));
      break;
    }
    if (best > i) out.push(s.slice(i, best));
    out.push(<mark className="hl" key={`${best}-${bestLen}`}>{s.slice(best, best + bestLen)}</mark>);
    i = best + bestLen;
  }
  return out;
}

function StarButton({ on, onToggle }) {
  return (
    <button
      className={`star-btn ${on ? 'on' : ''}`}
      onClick={onToggle}
      title={on ? 'Unstar' : 'Star'}
      aria-label={on ? 'Unstar conversation' : 'Star conversation'}
      aria-pressed={on}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

function segmentText(text) {
  const segs = [];
  for (const line of String(text).split('\n')) {
    let kind = 'text';
    if (line.startsWith('🔧 ')) kind = 'call';
    else if (line.startsWith('↳ ')) kind = 'result';
    else if (line.startsWith('💭 ')) kind = 'think';
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) last.lines.push(line);
    else segs.push({ kind, lines: [line] });
  }
  return segs;
}

const Message = memo(function Message({ msg, assistantLabel }) {
  const roleClass = msg.role === 'user' ? 'm-user' : msg.role === 'tool' ? 'm-tool' : 'm-assistant';
  const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'tool' ? 'Tool result' : assistantLabel;
  const segs = useMemo(() => (msg.text ? segmentText(msg.text) : []), [msg.text]);
  return (
    <article className={`msg ${roleClass}`}>
      <div className="msg-role">{roleLabel}</div>
      <div className="msg-text">
        {segs.length === 0 && <span className="muted">(empty)</span>}
        {segs.map((s, i) => (
          s.kind === 'text'
            ? <span key={i}>{s.lines.join('\n') + '\n'}</span>
            : <span key={i} className={`seg seg-${s.kind}`}>{s.lines.join('\n') + '\n'}</span>
        ))}
      </div>
    </article>
  );
});

const ConversationCard = memo(function ConversationCard({
  convo, meta, expanded, onToggle, query, starred, onToggleStar, snippet, tick,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState(TRANSCRIPT_PAGE);
  const assistantLabel = (meta[convo.source] && meta[convo.source].short) || 'Assistant';
  void tick;

  useEffect(() => {
    setDetail(null);
    setVisibleMessages(TRANSCRIPT_PAGE);
  }, [convo.key, convo.mtimeMs]);

  useEffect(() => {
    if (!expanded || detail) return undefined;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const qs = `source=${encodeURIComponent(convo.source)}&ref=${encodeURIComponent(convo.ref)}&limit=all`;
    fetch(`/api/conversation?${qs}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (active) setDetail(d.error ? { messages: [], error: true } : d); })
      .catch((error) => {
        if (active && error.name !== 'AbortError') setDetail({ messages: [], error: true });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [expanded, detail, convo.source, convo.ref]);

  const messages = detail && Array.isArray(detail.messages) ? detail.messages : [];
  const startIndex = Math.max(0, messages.length - visibleMessages);
  const displayed = messages.slice(startIndex);

  return (
    <article className={`card ${expanded ? 'expanded' : ''}`}>
      <div className="card-head">
        <button
          className="card-toggle"
          onClick={() => onToggle(convo.key)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${convo.title || 'conversation'}`}
        >
          <span className="card-main">
            <span className="card-title">{highlight(convo.title || 'Untitled conversation', query)}</span>
            <span className="card-meta">
              <SourceBadge source={convo.source} meta={meta} />
              <span className="badge project">{highlight(convo.projectLabel || 'Unknown project', query)}</span>
              {convo.gitBranch && <span className="badge branch">⎇ {convo.gitBranch}</span>}
              <span className="badge">{convo.messageCount || 0} msgs</span>
              <span className="badge time">{relativeTime(convo.lastActivity)}</span>
            </span>
            {convo.projectPath && <span className="card-path">{highlight(convo.projectPath, query)}</span>}
            {snippet && (
              <span className="card-snippet" title="Matched in conversation content">
                <span aria-hidden="true">💬</span> {highlight(snippet, query)}
              </span>
            )}
          </span>
          <span className="chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
        </button>

        <div className="card-actions" aria-label="Conversation actions">
          <StarButton on={starred} onToggle={() => onToggleStar(convo.key)} />
          <CopyButton text={convo.resume} />
          <OpenButton path={convo.projectPath} />
          <TerminalButton source={convo.source} convRef={convo.ref} />
          <YoloTerminalButton source={convo.source} convRef={convo.ref} />
        </div>
      </div>

      {expanded && (
        <div className="card-body">
          <div className="transcript-toolbar">
            <span className="transcript-title">Full transcript</span>
            {detail && !detail.error && (
              <span className="transcript-count">{messages.length.toLocaleString()} messages</span>
            )}
            <button className="text-btn" onClick={() => onToggle(convo.key)}>Collapse</button>
          </div>
          {convo.resume && (
            <div className="resume-line" title="Resume command">
              <code>{convo.resume}</code>
            </div>
          )}
          {loading && <div className="state-block muted" role="status">Loading transcript…</div>}
          {detail && detail.error && (
            <div className="state-block error" role="alert">
              Failed to load the transcript.{' '}
              <button className="retry-btn" onClick={() => setDetail(null)}>Retry</button>
            </div>
          )}
          {detail && !detail.error && messages.length === 0 && (
            <div className="state-block muted">This conversation has no readable messages.</div>
          )}
          {detail && !detail.error && startIndex > 0 && (
            <button
              className="load-earlier"
              onClick={() => setVisibleMessages((n) => Math.min(messages.length, n + TRANSCRIPT_PAGE))}
            >
              Show {Math.min(TRANSCRIPT_PAGE, startIndex)} earlier messages
              <span className="muted"> · {startIndex.toLocaleString()} hidden</span>
            </button>
          )}
          {displayed.map((m, i) => (
            <Message key={`${startIndex + i}-${m.role || 'message'}`} msg={m} assistantLabel={assistantLabel} />
          ))}
        </div>
      )}
    </article>
  );
});

export default function App() {
  const saved = loadFilters();
  const [convos, setConvos] = useState(null);
  const [meta, setMeta] = useState(DEFAULT_META);
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [query, setQuery] = useState(saved.query || '');
  const [project, setProject] = useState(saved.project || 'all');
  const [source, setSource] = useState(saved.source || 'all');
  const [sort, setSort] = useState(saved.sort || 'recent');
  const [showStats, setShowStats] = useState(saved.showStats ?? false);
  const [showAgents, setShowAgents] = useState(saved.showAgents ?? false);
  const [starredOnly, setStarredOnly] = useState(saved.starredOnly ?? false);
  const [starred, setStarred] = useState(() => new Set(loadStarred()));
  const [expandedKey, setExpandedKey] = useState(null);
  const [showTop, setShowTop] = useState(false);
  const [contentKeys, setContentKeys] = useState(() => new Set());
  const [contentSnippets, setContentSnippets] = useState({});
  const [searchState, setSearchState] = useState('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [limit, setLimit] = useState(LIST_PAGE);
  const searchRef = useRef(null);
  const sentinelRef = useRef(null);
  const lastLoadRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setContentKeys(new Set());
      setContentSnippets({});
      setSearchState('idle');
      return undefined;
    }

    setContentKeys(new Set());
    setContentSnippets({});
    setSearchState('loading');
    const controller = new AbortController();
    const id = setTimeout(() => {
      fetch('/api/search?q=' + encodeURIComponent(q), { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          setContentKeys(new Set(Array.isArray(d.keys) ? d.keys : []));
          setContentSnippets(d && typeof d.snippets === 'object' && d.snippets ? d.snippets : {});
          setSearchState('ready');
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setSearchState('error');
        });
    }, 300);

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  const toggleStar = useCallback((key) => setStarred((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    try { localStorage.setItem(STARRED_KEY, JSON.stringify([...next])); } catch {}
    return next;
  }), []);

  const toggleExpand = useCallback((key) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        query, project, source, sort, showStats, showAgents, starredOnly,
      }));
    } catch {}
  }, [query, project, source, sort, showStats, showAgents, starredOnly]);

  const loadConversations = useCallback((silent = false) => {
    if (!silent) setError(null);
    setRefreshError(null);
    setRefreshing(true);
    return fetch('/api/conversations')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!Array.isArray(d)) throw new Error(d && d.error ? d.error : 'Invalid conversation response');
        setConvos(d);
        setError(null);
        setRefreshError(null);
        lastLoadRef.current = Date.now();
      })
      .catch((e) => {
        const message = String(e.message || e);
        if (silent) setRefreshError(message);
        else setError(message);
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    fetch('/api/sources')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (d && typeof d === 'object') setMeta(d); })
      .catch(() => {});
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const onFocus = () => {
      if (document.hidden) return;
      if (Date.now() - lastLoadRef.current > 30000) loadConversations(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loadConversations]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!convos) return;
    if (source !== 'all' && !convos.some((c) => c.source === source)) setSource('all');
    if (project !== 'all' && !convos.some((c) => (source === 'all' || c.source === source) && (c.projectLabel || 'Unknown project') === project)) setProject('all');
  }, [convos, source, project]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 800);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sourceCounts = useMemo(() => {
    if (!convos) return [];
    const counts = new Map();
    for (const c of convos) counts.set(c.source, (counts.get(c.source) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [convos]);

  const starredCount = useMemo(
    () => (convos ? convos.reduce((n, c) => n + (starred.has(c.key) ? 1 : 0), 0) : 0),
    [convos, starred]
  );

  const projects = useMemo(() => {
    if (!convos) return [];
    const counts = new Map();
    for (const c of convos) {
      if (source !== 'all' && c.source !== source) continue;
      const label = c.projectLabel || 'Unknown project';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [convos, source]);

  const filtered = useMemo(() => {
    if (!convos) return [];
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return convos.filter((c) => {
      if (starredOnly && !starred.has(c.key)) return false;
      if (source !== 'all' && c.source !== source) return false;
      if (project !== 'all' && (c.projectLabel || 'Unknown project') !== project) return false;
      if (!terms.length) return true;
      const sm = meta[c.source] || {};
      const hay = `${c.title || ''} ${c.projectLabel || ''} ${c.projectPath || ''} ${c.firstUserText || ''} ${c.id || ''} ${c.source || ''} ${sm.label || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t)) || contentKeys.has(c.key);
    });
  }, [convos, query, project, source, meta, starredOnly, starred, contentKeys]);

  const sorted = useMemo(() => sortConvos(filtered, sort), [filtered, sort]);

  useEffect(() => {
    setLimit(LIST_PAGE);
  }, [query, project, source, sort, starredOnly]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLimit((current) => (current < sorted.length ? current + LIST_PAGE : current));
        }
      },
      { rootMargin: '800px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sorted.length, limit]);

  const clearFilters = () => {
    setQuery('');
    setSource('all');
    setProject('all');
    setStarredOnly(false);
  };

  const countLabel = convos
    ? (filtered.length === convos.length
      ? `${convos.length.toLocaleString()} conversations`
      : `${filtered.length.toLocaleString()} shown · ${convos.length.toLocaleString()} total`)
    : 'Loading conversations…';

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-row">
          <div className="brand-block">
            <h1>SessionVault</h1>
            <span className="privacy-mark">Local only · 127.0.0.1</span>
          </div>
          <span className="count" aria-live="polite">
            {countLabel}
            {searchState === 'loading' && <span className="searching"> · searching transcripts…</span>}
            {searchState === 'error' && <span className="status-error"> · transcript search unavailable</span>}
            {refreshError && <span className="status-error"> · refresh failed</span>}
          </span>
          <div className="header-actions">
            <button
              className={`stats-toggle refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={() => loadConversations(true)}
              disabled={refreshing}
              title="Refresh conversations"
              aria-label="Refresh conversations"
            >
              ⟳
            </button>
            <button
              className={`stats-toggle ${showAgents ? 'active' : ''}`}
              onClick={() => setShowAgents((v) => !v)}
              title="Toggle installed AI coding agents"
              aria-pressed={showAgents}
            >
              Agents
            </button>
            <button
              className={`stats-toggle ${showStats ? 'active' : ''}`}
              onClick={() => setShowStats((v) => !v)}
              title="Toggle metrics and usage"
              aria-pressed={showStats}
            >
              Stats
            </button>
          </div>
        </div>

        {convos && (
          <div className="source-filter" aria-label="Filter by source">
            <button
              className={`chip star-chip ${starredOnly ? 'active' : ''}`}
              onClick={() => setStarredOnly((v) => !v)}
              title="Show only starred conversations"
              aria-pressed={starredOnly}
            >
              ★ Starred <span className="chip-n">{starredCount}</span>
            </button>
            <button
              className={`chip ${source === 'all' ? 'active' : ''}`}
              onClick={() => { setSource('all'); setProject('all'); }}
              aria-pressed={source === 'all'}
            >
              All <span className="chip-n">{convos.length}</span>
            </button>
            {sourceCounts.map(([s, n]) => {
              const m = meta[s] || { short: s, color: '#8b949e' };
              const selected = source === s;
              return (
                <button
                  key={s}
                  className={`chip ${selected ? 'active' : ''}`}
                  style={selected ? { borderColor: m.color, color: m.color } : undefined}
                  onClick={() => { setSource(s); setProject('all'); }}
                  aria-pressed={selected}
                >
                  <span className="dot" style={{ background: m.color }} aria-hidden="true" />
                  {m.short} <span className="chip-n">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="controls">
          <label className="search-wrap">
            <span className="sr-only">Search conversations and full transcripts</span>
            <input
              ref={searchRef}
              className="search"
              type="search"
              placeholder="Search titles, paths, tools, and full transcripts…  ( / )"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              spellCheck="false"
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                title="Clear search (Esc)"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </label>
          <label className="select-wrap">
            <span className="sr-only">Project</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project">
              <option value="all">All projects ({projects.reduce((a, [, n]) => a + n, 0)})</option>
              {projects.map(([name, n]) => (
                <option key={name} value={name}>{name} ({n})</option>
              ))}
            </select>
          </label>
          <label className="select-wrap">
            <span className="sr-only">Sort conversations</span>
            <select className="srt-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort conversations">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {!showStats && convos && convos.length > 0 && <MiniStats convos={convos} meta={meta} />}

      {showStats && convos && (
        <section className="dashboard" aria-label="Conversation statistics">
          <Metrics convos={convos} meta={meta} />
          <Usage />
        </section>
      )}

      {showAgents && <Agents />}

      <main className="list" id="conversation-list">
        {error && (
          <div className="state-card error" role="alert">
            <strong>Could not load conversations.</strong>
            <span>{error}</span>
            <button className="retry-btn" onClick={() => loadConversations()}>Retry</button>
          </div>
        )}
        {!convos && !error && (
          <div className="skeletons" aria-label="Loading conversations" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="card skeleton" key={i}>
                <div className="sk-line sk-title" />
                <div className="sk-line sk-meta" />
                <div className="sk-line sk-path" />
              </div>
            ))}
          </div>
        )}
        {convos && convos.length === 0 && (
          <div className="state-card muted">
            <strong>No conversations found yet.</strong>
            <span>SessionVault will list sessions after a supported coding agent has created local history.</span>
          </div>
        )}
        {convos && convos.length > 0 && filtered.length === 0 && (
          <div className="state-card muted">
            <strong>No conversations match the current filters.</strong>
            {(query || source !== 'all' || project !== 'all' || starredOnly) && (
              <button className="retry-btn" onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        )}
        {sorted.slice(0, limit).map((c) => (
          <ConversationCard
            key={c.key}
            convo={c}
            meta={meta}
            query={query.trim()}
            snippet={contentSnippets[c.key]}
            starred={starred.has(c.key)}
            onToggleStar={toggleStar}
            expanded={expandedKey === c.key}
            onToggle={toggleExpand}
            tick={tick}
          />
        ))}
        {sorted.length > limit && (
          <button
            ref={sentinelRef}
            className="load-more"
            onClick={() => setLimit((current) => current + LIST_PAGE)}
          >
            Show {Math.min(LIST_PAGE, sorted.length - limit)} more
            <span className="muted"> · {limit.toLocaleString()} of {sorted.length.toLocaleString()} shown</span>
          </button>
        )}
      </main>

      {showTop && (
        <button
          className="to-top"
          onClick={() => {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
          }}
          title="Back to top"
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}
