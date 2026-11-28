import { useMemo, useState } from 'react';
import type { Format, ItemResult, Item } from '../core/types';
import { FORMATS, FORMAT_NAMES } from '../core/types';
import { buildPractice } from '../core/session';
import { commitAttempt, getState, useStore } from '../store';
import { ResultScreen, Runner } from './Runner';
import { go } from './common';

export function Practice() {
  const idx = useStore((s) => s.idx)!;
  const q = useMemo(() => new URLSearchParams(location.hash.split('?')[1] ?? ''), []);   // #/practice?level=set&id=… (from notebook links)
  const qLevel = q.get('level') as 'topic' | 'group' | 'set' | null;
  const [level, setLevel] = useState<'all' | 'topic' | 'group' | 'set'>(qLevel && ['topic', 'group', 'set'].includes(qLevel) ? qLevel : 'all');
  const [scopeId, setScopeId] = useState(q.get('id') ?? '');
  const [formats, setFormats] = useState<(Format | 'flash')[]>(['flash']);
  const [count, setCount] = useState(20);
  const [started, setStarted] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const [run, setRun] = useState<null | { items: Item[]; key: number; startedAt: number }>(null);
  const [res, setRes] = useState<null | { results: ItemResult[]; attempt: number; passed: boolean }>(null);
  const [empty, setEmpty] = useState(false);

  const scopes = level === 'topic' ? idx.bundle.topics.map((t) => ({ id: t.id, name: t.name }))
    : level === 'group' ? idx.bundle.topics.flatMap((t) => t.groups.map((g) => ({ id: g.id, name: `${t.name} › ${g.name}` })))
      : level === 'set' ? idx.sets.map((x) => ({ id: x.set.id, name: `Set ${x.order + 1} · ${x.set.name}` })) : [];
  const sid = level === 'all' ? '' : scopeId && scopes.some((x) => x.id === scopeId) ? scopeId : scopes[0]?.id ?? '';
  const toggle = (f: Format | 'flash') => setFormats((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]));

  const start = () => {
    const st = getState();
    const items = buildPractice({ level, scopeId: sid, formats, count, startedOnly: started, testMode }, st.idx!, st.progress, Math.random);
    if (!items.length) { setEmpty(true); return; }
    setEmpty(false); setRes(null); setRun({ items, key: Date.now(), startedAt: Date.now() });
  };

  if (res) {
    return <ResultScreen title={testMode ? 'Practice test' : 'Practice'} results={res.results} passMark={0.9} attempt={res.attempt} isTest passed={res.passed} replay
      onRetake={() => { setRes(null); start(); }} onBack={() => { setRes(null); setRun(null); }} info="Practice updates your review cards but never changes the path." />;
  }
  if (run) {
    return <Runner key={run.key} items={run.items} title={testMode ? 'Practice test' : 'Practice'} instant={!testMode} note={testMode ? 'Test mode: no feedback until the end.' : undefined} onBack={() => setRun(null)}
      onDone={(results, startedAt) => {
        const out = commitAttempt({ node: null, nodeId: 'practice', results, startedAt, passMark: 0.9 });
        setRes({ results, attempt: out.attempt.attempt, passed: out.passed });
      }} />;
  }
  return (
    <div className="card">
      <div className="screen-head"><h3>Practice</h3><span className="counter">free practice · exam revision</span></div>
      <p className="small muted">Updates your review cards and history, never the path.</p>
      <div className="grid g2" style={{ marginTop: 10 }}>
        <div className="stack">
          <div className="label">Scope</div>
          <div className="row">
            <select className="sel" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
              <option value="all">Everything</option><option value="topic">A topic</option><option value="group">A group</option><option value="set">A set</option>
            </select>
            {level !== 'all' && <select className="sel" value={sid} onChange={(e) => setScopeId(e.target.value)}>{scopes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          </div>
          <label className="row small"><input type="checkbox" checked={started} onChange={(e) => setStarted(e.target.checked)} /> only words I've started</label>
          <div className="label" style={{ marginTop: 8 }}>Number of items</div>
          <input className="input sm" type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} style={{ width: 120 }} />
          <div className="label" style={{ marginTop: 8 }}>Mode</div>
          <div className="seg"><span className={!testMode ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => setTestMode(false)}>practice</span><span className={testMode ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => setTestMode(true)}>practice test</span></div>
        </div>
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">Formats</span>
            <span className="small mono"><a href="#/practice" onClick={(e) => { e.preventDefault(); setFormats(['flash', ...FORMATS]); }}>all</a> · <a href="#/practice" onClick={(e) => { e.preventDefault(); setFormats([]); }}>none</a></span></div>
          {(['flash', ...FORMATS] as (Format | 'flash')[]).map((f) => (
            <label key={f} className="row small"><input type="checkbox" checked={formats.includes(f)} onChange={() => toggle(f)} /> {f === 'flash' ? 'Translation (flashcards)' : FORMAT_NAMES[f]}</label>
          ))}
        </div>
      </div>
      {empty && <div className="callout red" style={{ marginTop: 12 }}>Nothing matches these settings — try another scope, more formats, or untick “only words I've started”.</div>}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}><button className="btn ghost" onClick={() => go('/')}>Back</button><button className="btn primary" disabled={!formats.length} onClick={start}>Start</button></div>
    </div>
  );
}
