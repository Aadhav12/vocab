import { useMemo, useRef, useState } from 'react';
import type { Attempt, Item, ItemResult, Word } from '../core/types';
import { itemsForFormat, shuffle } from '../core/generate';
import { getState } from '../store';
import { ItemView } from './Runner';
import { fmtSec } from './common';

export interface FlashDone { results: ItemResult[]; rounds: NonNullable<Attempt['rounds']>; passed: boolean; xpItems: number; startedAt: number; scoreOverride: number }

/** Typed flashcards with the speed gate. A round has every word in both directions; the gate applies per chunk. */
export function Flash({ chunks, title, onDone, onBack }: { chunks: Word[][]; title: string; onDone: (d: FlashDone) => void; onBack: () => void }) {
  const settings = getState().progress.settings;
  const [ci, setCi] = useState(0);
  const [round, setRound] = useState(1);
  const started = useRef(Date.now());
  const all = useRef<ItemResult[]>([]);
  const roundLog = useRef<NonNullable<Attempt['rounds']>>([]);
  const xpItems = useRef(0);
  const finals = useRef<ItemResult[]>([]);
  const [phase, setPhase] = useState<'play' | 'summary'>('play');
  const [pos, setPos] = useState(0);
  const cur = useRef<ItemResult[]>([]);
  const [marks, setMarks] = useState<('ok' | 'bad')[]>([]);
  const [seed, setSeed] = useState(0);

  const cards: Item[] = useMemo(() => {
    const idx = getState().idx!;
    return shuffle(itemsForFormat('flash', chunks[ci], { idx, rng: Math.random }));
  }, [ci, seed]); // eslint-disable-line

  const recogLimit = settings.recogThreshold * 1000, prodLimit = settings.prodThreshold * 1000;
  const avg = (rs: ItemResult[]) => { const k = rs.map((r) => r.firstKeyMs).filter((x): x is number => typeof x === 'number'); return k.length ? k.reduce((a, b) => a + b, 0) / k.length : null; };

  const endRound = () => {
    const rs = cur.current;
    const misses = rs.filter((r) => !r.correct);
    const a = avg(rs.filter((r) => r.card === 'de-en')), b = avg(rs.filter((r) => r.card === 'en-de'));
    roundLog.current.push({ round, misses: misses.length, avgRecogMs: a === null ? null : Math.round(a), avgProdMs: b === null ? null : Math.round(b), chunk: ci + 1 });
    if (round === 1) xpItems.current += rs.filter((r) => r.correct).length;
    all.current.push(...rs);
    setPhase('summary');
  };
  const passedRound = () => {
    const rs = cur.current;
    const a = avg(rs.filter((r) => r.card === 'de-en')), b = avg(rs.filter((r) => r.card === 'en-de'));
    return rs.every((r) => r.correct) && (a === null || a < recogLimit) && (b === null || b < prodLimit);
  };

  const next = () => {
    if (pos + 1 >= cards.length) endRound(); else setPos(pos + 1);
  };

  if (phase === 'summary') {
    const rs = cur.current;
    const misses = rs.filter((r) => !r.correct);
    const a = avg(rs.filter((r) => r.card === 'de-en')), b = avg(rs.filter((r) => r.card === 'en-de'));
    const pass = passedRound();
    const lastChunk = ci === chunks.length - 1;
    const proceed = () => {
      cur.current = []; setMarks([]); setPos(0);
      if (pass) {
        finals.current.push(...rs);
        if (lastChunk) {
          onDone({ results: all.current, rounds: roundLog.current, passed: true, xpItems: xpItems.current, startedAt: started.current, scoreOverride: 1 });
          return;
        }
        setCi(ci + 1); setRound(1); setSeed((s) => s + 1);
      } else { setRound(round + 1); setSeed((s) => s + 1); }
      setPhase('play');
    };
    const stop = () => {
      const fin = [...finals.current, ...rs];
      onDone({ results: all.current, rounds: roundLog.current, passed: false, xpItems: xpItems.current, startedAt: started.current, scoreOverride: fin.length ? fin.filter((r) => r.correct).length / fin.length : 0 });
    };
    return (
      <div className="card">
        <div className="screen-head"><h3>{title} · round result</h3><span className="counter">{chunks.length > 1 ? `chunk ${ci + 1}/${chunks.length} · ` : ''}round {round}</span></div>
        <table className="tbl" style={{ marginTop: 6 }}><thead><tr><th>Check</th><th>Result</th><th>Needed</th></tr></thead><tbody>
          <tr><td>Misses</td><td className="mono" style={{ color: misses.length ? 'var(--red-ink)' : 'var(--green-ink)' }}>{misses.length}</td><td className="mono muted">0</td></tr>
          <tr><td>German → English, avg first key</td><td className="mono" style={{ color: a === null || a < recogLimit ? 'var(--green-ink)' : 'var(--red-ink)' }}>{fmtSec(a)}</td><td className="mono muted">&lt; {settings.recogThreshold.toFixed(1)} s</td></tr>
          <tr><td>English → German, avg first key</td><td className="mono" style={{ color: b === null || b < prodLimit ? 'var(--green-ink)' : 'var(--red-ink)' }}>{fmtSec(b)}</td><td className="mono muted">&lt; {settings.prodThreshold.toFixed(1)} s</td></tr>
        </tbody></table>
        {misses.map((m, i) => <div key={i} className="callout red" style={{ marginTop: 10 }}>Missed: <span className="serif">{m.expected}</span> (typed “{m.given || '—'}”)</div>)}
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="small muted">{pass ? (lastChunk ? 'Clean and fast — flashcards passed.' : 'Chunk passed — on to the next one.') : "This round doesn't count."}</span>
          <span className="row"><button className="btn ghost" onClick={stop}>Stop for now</button>
            <button className="btn primary" onClick={proceed}>{pass ? (lastChunk ? 'Finish' : 'Next chunk') : `Start round ${round + 1}`}</button></span>
        </div>
      </div>
    );
  }

  const item = cards[pos];
  return (
    <div className="card">
      <div className="screen-head"><h3>{title}</h3><span className="counter">{pos + 1} / {cards.length}</span></div>
      <div className="row" style={{ marginBottom: 8 }}><span className="tag ink">Round {round}</span>{chunks.length > 1 && <span className="tag">chunk {ci + 1}/{chunks.length}</span>}<span className="small muted mono">timer: word appears → first key</span></div>
      <div className="ticks" style={{ marginBottom: 16 }}>{cards.map((_, k) => <i key={k} className={k < marks.length ? marks[k] : k === pos ? 'cur' : ''} />)}</div>
      <ItemView key={item.id} item={item} instant onResult={(r) => { cur.current.push(...r); setMarks((m) => [...m, r[0].correct ? 'ok' : 'bad']); }} onNext={next} />
      <div style={{ marginTop: 16 }}><button className="btn ghost" onClick={onBack}>← Leave</button></div>
    </div>
  );
}
