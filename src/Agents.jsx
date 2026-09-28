import { useCallback, useEffect, useRef, useState } from 'react';
import './agents.css';

function CopyBtn({ text }) {
  const [state, setState] = useState('idle');
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onClick = async () => {
    if (!text) return;
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
    timerRef.current = setTimeout(() => setState('idle'), 1500);
  };

  return (
    <button
      className={`ag-btn ag-copy ${state === 'ok' ? 'ag-ok' : state === 'err' ? 'ag-err' : ''}`}
      onClick={onClick}
      title={text ? `Copy: ${text}` : 'Command unavailable'}
      disabled={!text}
      aria-live="polite"
    >
      {state === 'ok' ? '✓ Copied' : state === 'err' ? '✗ Failed' : 'Copy'}
    </button>
  );
}

function OpenTerminalBtn({ id }) {
  const [state, setState] = useState('idle');
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onClick = async () => {
    if (state === 'working') return;
    setState('working');
    try {
      const r = await fetch('/api/agents/open?id=' + encodeURIComponent(id));
      setState(r.ok ? 'ok' : 'err');
    } catch {
      setState('err');
    }
    timerRef.current = setTimeout(() => setState('idle'), 1500);
  };

  return (
    <button
      className={`ag-btn ag-term ${state === 'ok' ? 'ag-ok' : state === 'err' ? 'ag-err' : ''}`}
      onClick={onClick}
      disabled={state === 'working'}
      title="Open a terminal running this agent"
      aria-live="polite"
    >
      {state === 'working' ? 'Opening…' : state === 'ok' ? '✓ Opened' : state === 'err' ? '✗ Failed' : 'Open terminal'}
    </button>
  );
}

function UpdateBtn({ id, command, onUpdated }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);

  const onClick = async () => {
    if (running) return;
    const confirmed = window.confirm(`Run the configured update command for this agent?\n\n${command}`);
    if (!confirmed) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch('/api/agents/update?id=' + encodeURIComponent(id));
      const body = await r.json().catch(() => ({ ok: false, output: 'Invalid response' }));
      const normalized = {
        ok: Boolean(r.ok && body && body.ok),
        output: body && typeof body.output === 'string' ? body.output : '',
      };
      setResult(normalized);
      setOpen(true);
      if (normalized.ok) onUpdated?.();
    } catch (e) {
      setResult({ ok: false, output: String(e) });
      setOpen(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="ag-update-wrap">
      <button
        className={`ag-btn ag-update ${running ? 'ag-running' : ''}`}
        onClick={onClick}
        disabled={running}
        title={`Run: ${command}`}
      >
        {running ? <><span className="ag-spinner" aria-hidden="true" /> Updating…</> : 'Update'}
      </button>
      {result && (
        <div className={`ag-result ${result.ok ? 'ag-result-ok' : 'ag-result-err'}`}>
          <button
            className="ag-result-head"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span className="ag-result-status">{result.ok ? '✓ Update finished' : '✗ Update failed'}</span>
            <span className="ag-result-toggle">{open ? 'Hide output' : 'Show output'}</span>
          </button>
          {open && <pre className="ag-result-out">{result.output || '(no output)'}</pre>}
        </div>
      )}
    </div>
  );
}

function Exists({ ok, label }) {
  return (
    <span className={`ag-exists ${ok ? 'ag-yes' : 'ag-no'}`} title={`${label}: ${ok ? 'found' : 'not found'}`}>
      <span aria-hidden="true">{ok ? '✓' : '—'}</span>
      <span className="sr-only">{ok ? 'Found' : 'Not found'}</span>
    </span>
  );
}

function AgentCard({ a, onUpdated }) {
  const label = a.label || a.id || 'Unknown agent';
  return (
    <article className={`ag-card ${a.installed ? '' : 'ag-card-off'}`}>
      <div className="ag-card-head">
        <span className="ag-name">{label}</span>
        <span className={`ag-badge ${a.installed ? 'ag-badge-on' : 'ag-badge-off'}`}>
          {a.installed ? 'installed' : 'not installed'}
        </span>
        {Number(a.conversationCount) > 0 && (
          <span className="ag-count" title="Conversations from this tool">
            {Number(a.conversationCount).toLocaleString()} convos
          </span>
        )}
      </div>

      <div className="ag-rows">
        {a.installed && a.version && (
          <div className="ag-row"><span className="ag-key">Version</span><span className="ag-val">{a.version}</span></div>
        )}
        {a.installed && a.path && (
          <div className="ag-row"><span className="ag-key">Binary</span><code className="ag-val ag-mono">{a.path}</code></div>
        )}
        <div className="ag-row">
          <span className="ag-key">Config dir</span>
          <span className="ag-val"><Exists ok={a.configDirExists} label="Config directory" /> <code className="ag-mono">{a.configDir || 'unknown'}</code></span>
        </div>
        <div className="ag-row">
          <span className="ag-key">Config file</span>
          <span className="ag-val">
            {a.configFile ? <><Exists ok={a.configFileExists} label="Config file" /> <code className="ag-mono">{a.configFile}</code></> : <span className="ag-muted">none well-known</span>}
          </span>
        </div>
      </div>

      {a.runCommand && (
        <div className="ag-cmd-line">
          <code className="ag-cmd">{a.runCommand}</code>
          <div className="ag-cmd-actions">
            <CopyBtn text={a.runCommand} />
            {a.installed && <OpenTerminalBtn id={a.id} />}
          </div>
        </div>
      )}

      {a.updateCommand && a.installed && <UpdateBtn id={a.id} command={a.updateCommand} onUpdated={onUpdated} />}
    </article>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAgents = useCallback(async (quiet = false) => {
    if (!quiet) setAgents(null);
    setError(null);
    setRefreshing(true);
    try {
      const r = await fetch('/api/agents');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d && d.error) throw new Error(String(d.error));
      setAgents(Array.isArray(d) ? d : []);
    } catch (e) {
      setError(e.message || 'failed to load');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const installedCount = agents ? agents.filter((a) => a.installed).length : 0;

  return (
    <section className="ag-wrap" aria-labelledby="agents-heading">
      <div className="ag-panel-head">
        <div>
          <h2 className="ag-panel-title" id="agents-heading">AI coding agents</h2>
          {agents && <span className="ag-panel-sub">{installedCount} of {agents.length} installed</span>}
        </div>
        <button className="ag-refresh" onClick={() => loadAgents(true)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="ag-state ag-state-err" role="alert">
          Agents unavailable ({error}) <button className="ag-inline-btn" onClick={() => loadAgents()}>Retry</button>
        </div>
      )}
      {!agents && !error && <div className="ag-state" role="status">Probing installed agents…</div>}
      {agents && agents.length === 0 && <div className="ag-state">No supported agents were detected.</div>}

      {agents && agents.length > 0 && (
        <div className="ag-grid">
          {agents.map((a) => <AgentCard key={a.id} a={a} onUpdated={() => loadAgents(true)} />)}
        </div>
      )}
    </section>
  );
}
