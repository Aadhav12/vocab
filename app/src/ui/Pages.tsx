import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { attemptsFor, mutateProgress, resetAll, useCore, useStore } from '../store';
import { dueCards, mastery } from '../core/srs';
import { position, topicStats, type PathNode, type Position } from '../core/path';
import { DEFAULT_SETTINGS, type Attempt, type Progress, type Settings } from '../core/types';
import { articleFor } from '../core/forms';
import { MasteryBar, MasteryDot, fmtDate, fmtDur, go, historyHref, nodeHref, pct, useOpenWord } from './common';

// ------------------------------------------------------------------ overview
export function Overview() {
  const { idx, path, progress: p } = useCore();
  const pos = position(idx, path, p);
  const cur = pos.inserts[0] ?? pos.node;
  const setsDone = path.nodes.filter((n) => n.type === 'test' && p.passed[n.id]).length;
  const started = Object.keys(p.introduced).filter((id) => idx.byId.has(id)).length;
  const due = dueCards(p).length;
  const stat = (k: string, v: string) => <div className="card soft"><div className="label">{k}</div><div className="score" style={{ fontSize: 30, marginTop: 6 }}>{v}</div></div>;
  return (
    <div>
      <div className="grid g4" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginTop: 24, gap: 12 }}>
        {stat('Sets done', String(setsDone))}{stat('Words started', `${started}/${idx.words.length}`)}{stat('Cards due', String(due))}{stat('XP', p.xp.toLocaleString())}{stat('Day streak', String(p.streak.count))}
      </div>
      <div style={{ marginTop: 16 }}>
        {cur ? (
          <a href={nodeHref(cur.id)} style={{ textDecoration: 'none' }}>
            <div className="continue"><div><div className="label">{pos.inserts.length ? 'Review first' : 'Continue'}</div><b>{cur.name} · {cur.inserted ? cur.sub : cur.section.replace(/ · Set \d+ · .*$/, (m) => m)}</b></div><span className="go">→</span></div>
          </a>
        ) : <div className="continue"><div><div className="label">All done</div><b>You've finished every node on the path.</b></div></div>}
      </div>
      <div className="sec" style={{ marginTop: 28 }}>
        <div className="sec-h"><span className="n">01</span><h2>Topics</h2><span className="note">{idx.bundle.topics.length} topics · {idx.sets.length} sets · {idx.words.length} words</span></div>
        <div className="grid g3">
          {idx.bundle.topics.map((t, i) => {
            const st = topicStats(idx, path, p, t.id);
            const ws = t.groups.flatMap((g) => g.sets.flatMap((s) => s.words));
            const counts = [0, 0, 0, 0, 0]; ws.forEach((w) => counts[mastery(p, w.id)]++);
            const body = (
              <div className="card soft" style={{ opacity: st.unlocked ? 1 : 0.55, borderStyle: st.unlocked ? 'solid' : 'dashed', height: '100%' }}>
                <div className="label">Topic {i + 1}{!st.unlocked && ' · locked'}</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>{t.name}</div>
                <div className="small muted">{st.groups} group{st.groups === 1 ? '' : 's'} · {st.sets} sets · {st.words} words</div>
                <div className="bar cyan" style={{ margin: '8px 0 4px' }}><i style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} /></div>
                <div className="small mono muted">{st.done}/{st.total} steps · health {pct(st.health)}</div>
                <div style={{ marginTop: 6 }}><MasteryBar counts={counts} total={ws.length} /></div>
              </div>
            );
            return st.unlocked ? <a key={t.id} href={`#/topic/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</a> : <div key={t.id}>{body}</div>;
          })}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span style={{ ['--c' as string]: 'var(--ink)' }}>mastered</span><span style={{ ['--c' as string]: 'var(--cyan)' }}>solid</span><span style={{ ['--c' as string]: 'var(--cyan-20)' }}>familiar</span><span style={{ ['--c' as string]: 'var(--g-200)' }}>learning</span><span style={{ ['--c' as string]: 'var(--paper)' }}>new</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ topic page / path
function nodeState(n: PathNode, p: Progress, pos: Position, attempts: Attempt[]): 'done' | 'cur' | 'lock' | 'fail' | 'review' {
  if (n.inserted) return 'review';
  if (p.passed[n.id]) return 'done';
  if (pos.node?.id === n.id && pos.inserts.length === 0) return 'cur';
  if (pos.node?.id === n.id) return 'lock';
  return 'lock';
}

function PathNodeView({ n, x, p, pos }: { n: PathNode; x: number; p: Progress; pos: Position }) {
  const atts = useStore((s) => s.attempts).filter((a) => a.nodeId === n.id);
  const hist = attemptsFor(n.id);
  const st = nodeState(n, p, pos, atts);
  const clickable = st !== 'lock';
  const best = p.passed[n.id]?.bestScore;
  const sub = st === 'done' ? (n.passKind === 'test' && best !== undefined ? `${pct(best)} · ${atts.length} attempt${atts.length === 1 ? '' : 's'}` : atts.length ? `done · ${atts.length} attempt${atts.length === 1 ? '' : 's'}` : 'done') : n.sub;
  const glyph = st === 'done' ? '✓' : n.glyph;
  const cls = `node ${n.boss ? 'boss' : ''} ${st === 'done' ? 'done' : st === 'cur' ? 'cur' : st === 'review' ? 'review' : st === 'fail' ? 'fail' : 'lock'}`;
  const inner = (
    <>
      <div className={cls}>{glyph}</div>
      <div className="t"><b>{n.name}</b><span>{sub}</span>
        {hist.length > 0 && <> <a className="mono small" href={historyHref(n.id)} style={{ color: 'var(--cyan-ink)' }} onClick={(e) => e.stopPropagation()}>history ›</a></>}</div>
    </>
  );
  return (
    <div className="pn" data-x={x} style={{ transform: `translateX(${x}px)`, cursor: clickable ? 'pointer' : 'default' }} onClick={() => clickable && go(`/node/${encodeURIComponent(n.id)}`)}>{inner}</div>
  );
}

export function TopicPage({ id }: { id: string }) {
  const { idx, path, progress: p } = useCore();
  useStore((s) => s.attempts);
  const topic = idx.topicById.get(id);
  const pos = position(idx, path, p);
  const nodes = path.nodes.filter((n) => n.topicId === id);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const curIsHere = pos.node?.topicId === id;
  const draw = () => {
    if (!wrap.current || !svg.current) return;
    const base = wrap.current.getBoundingClientRect();
    const els = [...wrap.current.querySelectorAll('.node')] as HTMLElement[];
    const pts = els.map((n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2 - base.left, r.top + r.height / 2 - base.top]; });
    let curI = els.findIndex((e) => e.classList.contains('cur') || e.classList.contains('fail') || (e.classList.contains('lock') && !e.closest('.inserted')));
    if (curI < 0) curI = els.length;
    const insIdx = els.findIndex((e) => e.closest('.inserted'));
    if (insIdx >= 0) curI = Math.max(curI, insIdx);
    svg.current.setAttribute('width', String(base.width)); svg.current.setAttribute('height', String(base.height));
    const seg = (a: number[], b: number[]) => `M${a[0]} ${a[1]} C${a[0]} ${(a[1] + b[1]) / 2} ${b[0]} ${(a[1] + b[1]) / 2} ${b[0]} ${b[1]}`;
    let solid = '', dashed = '';
    for (let i = 0; i < pts.length - 1; i++) (i < curI ? (solid += seg(pts[i], pts[i + 1])) : (dashed += seg(pts[i], pts[i + 1])));
    svg.current.innerHTML = `<path d="${solid}" fill="none" stroke="#4d8b96" stroke-width="1.5"/><path d="${dashed}" fill="none" stroke="#9c9c9c" stroke-width="1" stroke-dasharray="4 4"/>`;
  };
  useLayoutEffect(() => { draw(); const f = () => draw(); addEventListener('resize', f); (document as any).fonts?.ready.then(draw); return () => removeEventListener('resize', f); });
  const topics = idx.bundle.topics;
  const ti = topics.findIndex((t) => t.id === id);
  const next = topics[ti + 1];
  const testPassed = !!p.passed[`topic:${id}:test`];
  const cur = pos.inserts[0] ?? pos.node;
  if (!topic) return <div className="card">Unknown topic.</div>;
  const st = topicStats(idx, path, p, id);
  let lastSection = '';
  return (
    <div>
      <div className="sec" style={{ marginTop: 24 }}>
        <div className="sec-h"><span className="n">0{ti + 1}</span><h2>{topic.name}</h2><span className="note">{st.done}/{st.total} steps · health {pct(st.health)}</span></div>
        {cur && (
          <a href={nodeHref(cur.id)} style={{ textDecoration: 'none' }}><div className="continue" style={{ marginBottom: 12 }}><div><div className="label">{pos.inserts.length ? 'Review first' : 'Continue'}</div><b>{cur.name}{cur.inserted ? '' : ` · ${cur.section}`}</b></div><span className="go">→</span></div></a>
        )}
        <div className="card" style={{ padding: 16 }}>
          <div className="path-wrap" ref={wrap}>
            <svg className="path-svg" ref={svg} />
            <div className="path">
              {nodes.map((n, i) => {
                const out: React.ReactNode[] = [];
                if (n.section !== lastSection) { lastSection = n.section; out.push(<div className="sect" key={`s${n.id}`}><span>{n.section}</span></div>); }
                if (curIsHere && pos.node?.id === n.id && pos.inserts.length) {
                  out.push(
                    <div className="inserted" key="ins" style={{ transform: 'translateX(20px)' }}>
                      <div className="label">Review inserted here</div>
                      {pos.inserts.map((ins, k) => <PathNodeView key={ins.id} n={ins} x={0} p={p} pos={pos} />)}
                    </div>,
                  );
                }
                out.push(<PathNodeView key={n.id} n={n} x={Math.round(Math.sin(i * 0.8) * 85)} p={p} pos={pos} />);
                return out;
              })}
            </div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <a className="btn ghost" href="#/">← Overview</a>
          {next && testPassed && <a className="btn primary" href={`#/topic/${next.id}`}>Next topic: {next.name} →</a>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ words
export function Words() {
  const { idx, progress: p } = useCore();
  const open = useOpenWord();
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const ql = q.trim().toLowerCase();
  const list = useMemo(() => idx.words.filter((w) => {
    if (topic) { const h = idx.home.get(w.id); if (h?.topic.id !== topic && !w.topics?.includes(topic)) return false; }
    if (!ql) return true;
    return w.lemma.toLowerCase().includes(ql) || w.senses.some((s) => s.en.some((e) => e.toLowerCase().includes(ql)));
  }), [idx, ql, topic]);
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="screen-head"><h3>Words</h3><span className="counter">{list.length} of {idx.words.length}</span></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input sm" style={{ flex: 1, minWidth: 220 }} placeholder="Search German or English…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sel" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">All topics</option>{idx.bundle.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </div>
      <table className="tbl"><thead><tr><th style={{ width: 24 }} /><th>German</th><th>English</th><th>Set</th><th>Level</th></tr></thead><tbody>
        {list.map((w) => {
          const h = idx.home.get(w.id)!;
          return (
            <tr key={w.id} className="click" onClick={() => open(w.id)}>
              <td><MasteryDot p={p} id={w.id} /></td>
              <td className="de">{w.noun && <span className={`art-${w.noun.gender ?? 'f'}`}>{articleFor(w.noun.gender, 'Nom')} </span>}{w.lemma}</td>
              <td>{w.senses.map((s) => s.en[0]).join(', ')}</td>
              <td className="small muted">{h.topic.name} › Set {h.setOrder + 1}</td><td className="mono small">{w.level ?? ''}</td>
            </tr>
          );
        })}
      </tbody></table>
      {!list.length && <div className="small muted" style={{ padding: 12 }}>No words match.</div>}
    </div>
  );
}

// ------------------------------------------------------------------ history
export function History({ id }: { id: string }) {
  const { idx, path } = useCore();
  useStore((s) => s.attempts);
  const atts = attemptsFor(id);
  const node = path.byId.get(id);
  const [openN, setOpenN] = useState<number | null>(null);
  const title = node ? `${node.name}${node.level === 'set' ? ' · ' + (idx.setById.get(node.scopeId)?.name ?? '') : ''}` : id;
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="screen-head"><h3>Node history · {title}</h3><span className="counter">{atts.length} attempt{atts.length === 1 ? '' : 's'}</span></div>
      {!atts.length ? <p className="muted">No attempts yet.</p> : (
        <table className="tbl"><thead><tr><th>#</th><th>Date</th><th>Set</th><th>Score</th><th>Time</th><th /><th /></tr></thead><tbody>
          {atts.map((a, i) => (
            <tr key={i} className={openN === i ? 'click sel-row' : ''}>
              <td className="mono">{a.nodeId.startsWith('recheck') ? 'R' : a.attempt}</td><td className="mono">{fmtDate(a.startedAt)}</td><td className="mono">{a.setCount}</td>
              <td className="mono" style={{ color: a.passed ? 'var(--green-ink)' : 'var(--red-ink)' }}>{pct(a.score)}</td><td className="mono">{fmtDur(a.durationMs)}</td>
              <td><span className={`tag ${a.passed ? 'green' : 'red'}`}>{a.passed ? 'passed' : 'failed'}</span>{a.nodeId.startsWith('recheck') && <> <span className="tag cyan">recheck</span></>}{a.replay && <> <span className="tag">replay</span></>}</td>
              <td style={{ textAlign: 'right' }}><button className="btn" style={{ padding: '2px 10px', fontSize: 13 }} onClick={() => setOpenN(openN === i ? null : i)}>{openN === i ? 'Hide answers' : 'Show answers'}</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
      {openN !== null && atts[openN] && (
        <>
          <div className="label" style={{ marginTop: 14 }}>Attempt {atts[openN].attempt} · every item</div>
          <table className="tbl" style={{ marginTop: 6 }}><thead><tr><th>Prompt</th><th>You</th><th>Answer</th></tr></thead><tbody>
            {atts[openN].items.length === 0 && <tr><td colSpan={3} className="muted">no items (introduce / pass-through node)</td></tr>}
            {atts[openN].items.map((it, k) => (
              <tr key={k} className={it.correct ? '' : 'miss'}><td className="de">{it.prompt}</td>
                <td className={`de ${it.correct ? '' : 'x'}`}>{it.given || '—'}</td><td className="de y">{it.correct ? '' : it.expected}{it.note ? <span className="small muted"> · {it.note}</span> : null}</td></tr>
            ))}
          </tbody></table>
        </>
      )}
      <div style={{ marginTop: 14 }}><button className="btn ghost" onClick={() => history.back()}>← Back</button></div>
    </div>
  );
}

// ------------------------------------------------------------------ settings
export function SettingsPage() {
  const p = useStore((s) => s.progress);
  const s = p.settings;
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Settings>) => mutateProgress((pp) => { pp.settings = { ...pp.settings, ...patch }; });
  const num = (k: keyof Settings, label: string, hint: string, step = 0.1, scale = 1, min = 0) => (
    <tr><td>{label}<div className="small muted">{hint}</div></td><td style={{ width: 160 }}>
      <input className="input sm" type="number" step={step} min={min} value={Math.round((s[k] as number) * scale * 100) / 100}
        onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) set({ [k]: v / scale } as Partial<Settings>); }} /></td></tr>
  );
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="screen-head"><h3>Settings</h3><span className="counter">saved automatically</span></div>
      <table className="tbl"><tbody>
        {num('recogThreshold', 'German → English gate (s)', 'average time to first key, per round', 0.1)}
        {num('prodThreshold', 'English → German gate (s)', 'average time to first key, per round', 0.1)}
        {num('passTest', 'Test pass mark (%)', 'set, group, topic tests and rechecks', 1, 100, 1)}
        {num('backlogLimit', 'Review backlog limit (cards)', 'above this a catch-up review is inserted', 1, 1, 1)}
        {num('leechThreshold', 'Leech threshold (misses)', 'a drill is inserted when a card reaches this', 1, 1, 1)}
        {num('reviewMix', 'Earlier-set share in set quizzes', '0.25 = a quarter of the items come from earlier sets', 0.05, 1, 0)}
        <tr><td>Read German aloud<div className="small muted">browser German voice, if available</div></td><td><label className="row"><input type="checkbox" checked={s.tts} onChange={(e) => set({ tts: e.target.checked })} /> {s.tts ? 'on' : 'off'}</label></td></tr>
      </tbody></table>
      <div className="row" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => set({ ...DEFAULT_SETTINGS })}>Restore defaults</button></div>
      <div className="label" style={{ marginTop: 24 }}>Danger zone</div>
      <div className="row" style={{ marginTop: 8 }}>
        {!confirm ? <button className="btn danger" onClick={() => setConfirm(true)}>Reset progress</button> : (
          <><span className="small">This clears the path, cards, XP and history. A backup is kept in records/backups. Sure?</span>
            <button className="btn danger" onClick={async () => { await resetAll(); setConfirm(false); go('/'); }}>Yes, reset</button><button className="btn" onClick={() => setConfirm(false)}>Cancel</button></>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ problems
export function Problems() {
  const b = useStore((s) => s.bundle)!;
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="screen-head"><h3>Data problems</h3><span className="counter">{b.problems.length}</span></div>
      {!b.problems.length ? <p className="muted">No problems — all data files validate.</p> : (
        <table className="tbl"><thead><tr><th>File</th><th>Message</th></tr></thead><tbody>
          {b.problems.map((pr, i) => <tr key={i} className="miss"><td className="mono small" style={{ whiteSpace: 'nowrap' }}>{pr.file}</td><td>{pr.message}</td></tr>)}
        </tbody></table>
      )}
      <p className="annot">Bad files or entries are skipped; everything else still loads. The page updates as soon as a file changes. Same list: <span>npm run validate</span></p>
    </div>
  );
}
