import { useMemo, useState } from 'react';
import type { Attempt, ItemResult } from '../core/types';
import { buildRun } from '../core/session';
import { position } from '../core/path';
import { dueCards } from '../core/srs';
import { commitAttempt, getState, nodeFromId, useStore, type Outcome } from '../store';
import { Flash, type FlashDone } from './Flash';
import { Intro } from './Intro';
import { Reading } from './Reading';
import { ResultScreen, Runner } from './Runner';
import { go, historyHref, nodeHref, fmtSec } from './common';

function backTarget(topicId: string | undefined) { return topicId ? `#/topic/${topicId}` : '#/'; }

export function NodeScreen({ id }: { id: string }) {
  const s = useStore((x) => x);
  const node = nodeFromId(id);
  const [key, setKey] = useState(0);
  const [done, setDone] = useState<null | { out: Outcome; results: ItemResult[]; extra?: { flash?: FlashDone } }>(null);
  const run = useMemo(() => (node ? buildRun(node, s.idx!, getState().progress, Math.random) : null), [id, key]); // eslint-disable-line

  if (!node || !run) return <div className="card"><p>This node does not exist (any more).</p><a className="btn" href="#/">Back to path</a></div>;
  const pos = position(s.idx!, s.path!, s.progress);
  const replay = !!s.progress.passed[id];
  const isInsert = !!node.inserted;
  const runnable = replay || isInsert || (pos.node?.id === id && pos.inserts.length === 0);
  const back = () => go(backTarget(node.topicId || pos.node?.topicId));
  const goOn = () => {
    const p2 = position(getState().idx!, getState().path!, getState().progress);
    const nx = p2.inserts[0] ?? p2.node;
    if (nx) location.hash = nodeHref(nx.id).slice(1); else go('/');
  };
  const retake = () => { setDone(null); setKey((k) => k + 1); };

  if (!runnable && !done) {
    return <div className="card"><div className="screen-head"><h3>{node.name}</h3><span className="counter">locked</span></div>
      <p>{pos.inserts.length ? 'Finish the inserted review first — the path continues after it.' : 'Finish the earlier nodes first.'}</p>
      <div className="row"><a className="btn" href="#/">Back to path</a>{pos.inserts[0] && <a className="btn primary" href={nodeHref(pos.inserts[0].id)}>Go to review</a>}</div></div>;
  }

  const commit = (results: ItemResult[], startedAt: number, extra: Partial<Parameters<typeof commitAttempt>[0]> = {}) => {
    const out = commitAttempt({ node, nodeId: id, results, startedAt, passMark: run.passMark, ...extra });
    return out;
  };
  const isTest = node.passKind === 'test';
  const attemptNo = (d: Outcome) => d.attempt.attempt;

  if (done) {
    const { out, results, extra } = done;
    const st = getState();
    let info: string | undefined;
    if (out.setCountUp) info = `Set count is now ${st.progress.setCount} · rechecks booked after sets ${st.progress.inserts.filter((i) => i.kind === 'recheck' && i.scopeId === node.scopeId && i.level === 'set').map((i) => i.dueAt).join(', ')}`;
    else if (out.firstPass && (node.type === 'gtest' || node.type === 'ttest')) info = `Rechecks booked after sets ${st.progress.inserts.filter((i) => i.kind === 'recheck' && i.scopeId === node.scopeId).map((i) => i.dueAt).join(' and ')}`;
    if (extra?.flash) {
      const f = extra.flash;
      return (
        <div className="card">
          <div className="screen-head"><h3>Node result · {run.title}</h3><span className="counter">attempt {attemptNo(out)}</span></div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}><div className="score" style={{ color: out.passed ? 'var(--green-ink)' : 'var(--red-ink)' }}>{out.passed ? 'passed' : 'stopped'}</div>
            <div className="small muted" style={{ paddingBottom: 6 }}>{f.rounds.length} round{f.rounds.length === 1 ? '' : 's'}{out.xp ? ` · +${out.xp} xp` : ''}</div></div>
          <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>Round</th><th>Misses</th><th>DE → EN</th><th>EN → DE</th></tr></thead><tbody>
            {f.rounds.map((r, i) => <tr key={i}><td className="mono">{r.chunk && f.rounds.some((x) => x.chunk !== 1) ? `${r.chunk}.` : ''}{r.round}</td><td className="mono" style={{ color: r.misses ? 'var(--red-ink)' : 'var(--green-ink)' }}>{r.misses}</td><td className="mono">{fmtSec(r.avgRecogMs)}</td><td className="mono">{fmtSec(r.avgProdMs)}</td></tr>)}
          </tbody></table>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}><button className="btn ghost" onClick={back}>Back to path</button>
            <span className="row"><button className="btn" onClick={retake} autoFocus={!out.passed}>{out.passed ? 'Replay' : 'Retake'}</button>{out.passed && <button className="btn primary" onClick={goOn} autoFocus>Continue</button>}</span></div>
        </div>
      );
    }
    return (
      <>
        <ResultScreen title={run.title} results={results} passMark={run.passMark} attempt={attemptNo(out)} isTest={isTest || run.sectioned} passed={out.passed} replay={out.replay}
          xp={out.xp} info={info} onRetake={retake} onBack={back} primary={out.passed ? { label: 'Continue', onClick: goOn } : undefined} />
        <div style={{ marginTop: 10 }}><a className="small mono muted" href={historyHref(node.id)}>node history ›</a></div>
      </>
    );
  }

  if (run.kind === 'warmup' && run.empty) {
    return (
      <div className="card">
        <div className="screen-head"><h3>Warm-up</h3><span className="counter">{dueCards(s.progress).length} due</span></div>
        <p>Nothing is due right now. Reviews will appear here when cards from earlier sets come due.</p>
        <div className="row" style={{ justifyContent: 'space-between' }}><button className="btn ghost" onClick={back}>Back to path</button>
          <button className="btn primary" autoFocus onClick={() => { const out = commit([], Date.now()); setDone({ out, results: [] }); goOn(); }}>Pass and continue</button></div>
      </div>
    );
  }
  if (run.kind === 'intro') {
    return <Intro words={run.words} onBack={back} onFinish={() => {
      const out = commit([], Date.now(), { introWords: run.words.map((w) => w.id), scoreOverride: 1 });
      setDone({ out: { ...out }, results: [] });
      goOn();
    }} />;
  }
  if (run.kind === 'flash') {
    return <Flash chunks={run.chunks!} title={run.title} onBack={back} onDone={(d) => {
      const out = commit(d.results, d.startedAt, { rounds: d.rounds, scoreOverride: d.scoreOverride, xpItems: d.xpItems, passMark: d.passed ? 1 : 1 });
      setDone({ out, results: d.results, extra: { flash: d } });
    }} />;
  }
  if (run.kind === 'reading') {
    return <Reading text={run.text!} targets={run.targetWords ?? []} onBack={back} onDone={(results, clicked, t0) => {
      const out = commit(results, t0, { clickedWords: clicked });
      setDone({ out, results });
    }} />;
  }
  if (!run.items.length) return <div className="card"><p>Nothing to practise here yet.</p><button className="btn" onClick={back}>Back</button></div>;
  return <Runner items={run.items} title={run.title} onBack={back} onDone={(results, startedAt) => {
    const out = commit(results, startedAt);
    setDone({ out, results });
  }} />;
}

export type { Attempt };
