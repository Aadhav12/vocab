import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, ItemResult } from '../core/types';
import { isPrintable } from '../core/check';
import { gradeChoice, gradeFields, matchResults, toResult, type Grade } from '../core/grade';
import { Art, SentenceWithGaps, speak, artClass, ART } from './common';
import { useStore } from '../store';

// ------------------------------------------------------------------ item view
interface ItemViewProps {
  item: Item; instant: boolean;
  onResult: (r: ItemResult[]) => void; onNext: () => void;
}

const UML = ['ä', 'ö', 'ü', 'ß'];

export function ItemView({ item, instant, onResult, onNext }: ItemViewProps) {
  const tts = useStore((s) => s.progress.settings.tts);
  const [phase, setPhase] = useState<'answer' | 'fb'>('answer');
  const phaseRef = useRef<'answer' | 'fb'>('answer');
  const t0 = useRef(performance.now());
  const firstKey = useRef<number | null>(null);
  const [vals, setVals] = useState<string[]>(() => (item.fields ?? []).map((f) => f.prefill ?? ''));
  const [grade, setGrade] = useState<Grade | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [alt, setAlt] = useState<string | null>(null);
  const inputs = useRef<(HTMLElement | null)[]>([]);
  const lastFocus = useRef(0);
  const nextRef = useRef(onNext); nextRef.current = onNext;
  const setPh = (p: 'answer' | 'fb') => { phaseRef.current = p; setPhase(p); };

  useEffect(() => { (window as any).__item = item; }, [item]); // lets the e2e script read the current item

  const markKey = () => { if (firstKey.current === null) firstKey.current = Math.round(performance.now() - t0.current); };

  // focus the first editable field
  useEffect(() => {
    if (item.mode === 'fields') {
      const i = (item.fields ?? []).findIndex((f) => !f.locked);
      setTimeout(() => inputs.current[i]?.focus(), 0);
    }
  }, [item]);

  const finish = (results: ItemResult[]) => {
    onResult(results);
    if (instant) setPh('fb'); else nextRef.current();
  };

  const submitFields = useCallback((v: string[]) => {
    const g = gradeFields(item, v);
    if (g.alt) {
      setAlt(g.note ?? 'Valid, but we want another word — try again');
      setVals((x) => x.map(() => ''));
      setTimeout(() => inputs.current[0]?.focus(), 0);
      return;
    }
    setAlt(null); setGrade(g);
    finish([toResult(item, g, firstKey.current)]);
  }, [item, instant]); // eslint-disable-line

  const pickChoice = useCallback((i: number) => {
    if (phaseRef.current !== 'answer') return;
    markKey(); setSel(i);
    const g = gradeChoice(item, i);
    setGrade(g);
    finish([toResult(item, g, firstKey.current)]);
  }, [item, instant]); // eslint-disable-line

  // global keys: Enter continues, digits pick
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.repeat || (e as any).__handled) return;
      if (phaseRef.current === 'fb' && e.key === 'Enter') { e.preventDefault(); nextRef.current(); return; }
      if (item.mode === 'choice' && phaseRef.current === 'answer' && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < item.choices!.length) pickChoice(i);
      }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [item, pickChoice]);

  const insertChar = (ch: string) => {
    const i = lastFocus.current;
    const el = inputs.current[i];
    if (!(el instanceof HTMLInputElement) || phase !== 'answer') return;
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
    const nv = el.value.slice(0, s) + ch + el.value.slice(e);
    setVals((v) => v.map((x, j) => (j === i ? nv : x)));
    markKey();
    setTimeout(() => { el.focus(); el.setSelectionRange(s + 1, s + 1); }, 0);
  };

  const fields = item.fields ?? [];
  const typed = fields.filter((f) => !f.locked && f.check !== 'choice');
  const needsUml = typed.some((f) => f.check !== 'en');
  // every editable field (typed or picked) can be reached and answered from the keyboard
  const focusable = fields.map((f, i) => (!f.locked ? i : -1)).filter((i) => i >= 0);
  const focusNext = (i: number): boolean => {
    const k = focusable.indexOf(i);
    if (k >= 0 && k < focusable.length - 1) { inputs.current[focusable[k + 1]]?.focus(); return true; }
    return false;
  };
  const enterOn = (i: number, e: React.KeyboardEvent<HTMLElement>) => {
    if (phaseRef.current !== 'answer') return; // the window handler continues
    e.preventDefault(); (e.nativeEvent as any).__handled = true;
    if (!focusNext(i)) submitFields(vals);
  };
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') enterOn(i, e);
    else if (isPrintable(e.nativeEvent)) markKey();
  };
  /** Choice field: 1–9 or the first letter picks (and moves on), ←/→ cycle, Enter moves on / submits. */
  const onChoiceKey = (i: number, choices: string[], e: React.KeyboardEvent<HTMLElement>) => {
    if (phaseRef.current !== 'answer') return;
    if (e.key === 'Enter') { enterOn(i, e); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const pick = (c: string, advance: boolean) => {
      e.preventDefault(); markKey();
      setVals((v) => v.map((x, j) => (j === i ? c : x)));
      if (advance) focusNext(i);
    };
    if (/^[1-9]$/.test(e.key) && choices[+e.key - 1]) pick(choices[+e.key - 1], true);
    else if (e.key.length === 1 && /[a-zäöü]/i.test(e.key)) {
      const c = choices.find((x) => x.toLowerCase().startsWith(e.key.toLowerCase()));
      if (c) pick(c, true);
    } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      const cur = choices.indexOf(vals[i]);
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      pick(choices[(cur + dir + choices.length) % choices.length], false);
    }
  };

  // ------- prompt block
  const prompt = (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {item.section && <div className="tag" style={{ marginBottom: 8 }}>{item.section}</div>}
          <div className="prompt-label">{item.label}</div>
          {item.main && <div className="prompt-main">{item.mainArt && <span className={artClass(item.mainArt)}>{ART[item.mainArt]} </span>}{item.main}</div>}
          {item.sentence && <div className="prompt-sent" style={{ marginTop: item.main ? 10 : 0 }}><SentenceWithGaps text={item.sentence} /></div>}
          {item.translation && <div className="prompt-sub">{item.translation}</div>}
          {item.sub && <div className="prompt-sub">{item.sub}</div>}
          {item.hint && <div className="prompt-hint">{item.hint}</div>}
        </div>
        {item.card === 'de-en' && item.speak && <button className="btn ghost" onClick={() => speak(item.speak!, tts)} title="listen">♪</button>}
      </div>
    </div>
  );

  // ------- feedback line
  const secs = firstKey.current !== null ? ` · ${(firstKey.current / 1000).toFixed(1)} s` : '';
  const fb = phase === 'fb' && grade && item.mode !== 'match' && (
    grade.correct
      ? <div className="fb ok"><span>✓ Correct{item.mode === 'fields' && fields.length === 1 ? secs : ''}</span><span className="go">⏎ continue</span></div>
      : <div className="fb bad">
        <span>{item.mode === 'fields' && fields.length > 1
          ? `✗ ${fields.filter((f, i) => !f.locked && grade.perField[i]?.ok).length} of ${fields.filter((f) => !f.locked).length}`
          : <>✗ Not quite — <b>{grade.expected}</b></>}</span><span className="go">⏎ continue</span></div>
  );
  const fbNote = phase === 'fb' && grade && (grade.note || item.contrast) && !grade.correct && (
    <div className="callout" style={{ marginTop: 8 }}>{grade.note}{grade.note && item.contrast ? ' · ' : ''}{item.contrast}</div>
  );
  const fbContrast = phase === 'fb' && grade?.correct && item.contrast ? <div className="callout" style={{ marginTop: 8 }}>{item.contrast}</div> : null;

  let body: React.ReactNode = null;
  if (item.mode === 'fields') {
    const multi = fields.length > 1;
    if (!multi) {
      const f = fields[0];
      const cls = phase === 'fb' ? (grade?.correct ? 'ok' : 'bad') : 'focus';
      body = (
        <div style={{ marginTop: 14 }}>
          <input ref={(el) => (inputs.current[0] = el)} className={`input ${cls}`} value={vals[0]} readOnly={phase === 'fb'} placeholder={f.check === 'en' ? 'English…' : 'Deutsch…'}
            autoComplete="off" autoCapitalize="off" spellCheck={false} onFocus={() => (lastFocus.current = 0)}
            onChange={(e) => setVals([e.target.value])} onKeyDown={(e) => onKey(0, e)} />
          {alt && <div className="callout" style={{ marginTop: 8 }}>{alt}</div>}
        </div>
      );
    } else {
      body = (
        <div className="fields dyn" style={{ marginTop: 14, gridTemplateColumns: item.tree ? '230px 1fr' : phase === 'fb' ? '150px 1fr 140px' : '150px 1fr' }}>
          {fields.map((f, i) => {
            const r = grade?.perField[i];
            const st = phase === 'fb' && !f.locked ? (r?.ok ? 'ok' : 'bad') : '';
            return [
              <span key={`k${i}`} className="k" style={{ paddingLeft: 10 + (f.indent ?? 0) * 22 }}>{f.indent !== undefined && '└ '}{f.label}</span>,
              <span key={`v${i}`} className={`v ${st}`} style={{ textDecoration: 'none', color: st === 'bad' ? 'var(--red-ink)' : undefined }}>
                {f.check === 'choice' ? (
                  <span className="seg" style={{ marginTop: 0 }} tabIndex={phase === 'answer' ? 0 : -1} role="radiogroup" aria-label={f.label}
                    ref={(el) => (inputs.current[i] = el)} onFocus={() => (lastFocus.current = i)} onKeyDown={(e) => onChoiceKey(i, f.choices!, e)}>
                    {f.choices!.map((c, ci) => (
                      <span key={c} className={vals[i] === c ? (phase === 'fb' ? (c === f.expected ? 'ok' : 'bad') : 'sel') : phase === 'fb' && c === f.expected ? 'ok' : ''}
                        style={{ cursor: phase === 'answer' ? 'pointer' : 'default' }}
                        onClick={() => { if (phase === 'answer') { markKey(); setVals((v) => v.map((x, j) => (j === i ? c : x))); } }}><i className="kn">{ci + 1}</i>{c}</span>
                    ))}
                  </span>
                ) : f.locked ? <span>{f.prefill}</span> : (
                  <input ref={(el) => (inputs.current[i] = el)} value={vals[i]} readOnly={phase === 'fb'} autoComplete="off" autoCapitalize="off" spellCheck={false}
                    style={{ textDecoration: st === 'bad' ? 'line-through' : 'none', color: 'inherit' }}
                    onFocus={() => (lastFocus.current = i)} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={(e) => onKey(i, e)} />
                )}
              </span>,
              phase === 'fb' && !item.tree ? <span key={`r${i}`} className="r">{!f.locked && !r?.ok ? f.expected : ''}</span> : null,
              phase === 'fb' && item.tree && !f.locked && !r?.ok ? null : null,
            ];
          })}
        </div>
      );
      if (item.tree && phase === 'fb' && grade && !grade.correct) {
        body = <>{body}<div className="callout red" style={{ marginTop: 10 }}>{fields.filter((f, i) => !f.locked && !grade.perField[i]?.ok).map((f) => <div key={f.key} className="serif">{f.expected}</div>)}</div></>;
      }
    }
    body = (
      <>
        {body}
        {needsUml && (
          <div className="umlauts">
            {UML.map((c) => <span key={c} style={{ cursor: 'pointer' }} onMouseDown={(e) => { e.preventDefault(); insertChar(c); }}>{c}</span>)}
            <span className="muted small mono" style={{ width: 'auto', border: 'none', paddingLeft: 6 }}>or ae oe ue ss</span>
          </div>
        )}
        {phase === 'answer' && <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => submitFields(vals)}>Check ⏎</button></div>}
      </>
    );
  } else if (item.mode === 'choice') {
    body = (
      <div style={{ marginTop: 14 }}>
        {item.choices!.map((c, i) => {
          let cls = '';
          if (phase === 'fb') cls = i === item.answerIdx ? 'ok' : i === sel ? 'bad' : 'dim';
          return (
            <div key={i} className={`choice ${cls}`} style={{ cursor: phase === 'answer' ? 'pointer' : 'default' }} onClick={() => pickChoice(i)}>
              <span className="kbd">{i + 1}</span>{c}
            </div>
          );
        })}
      </div>
    );
  } else {
    body = <MatchBoard item={item} instant={instant} onDone={(res) => { setGrade({ correct: res.every((r) => r.correct), alt: false, perField: [], given: '', expected: '' }); setMatchRes(res); finish(res); }} done={phase === 'fb'} />;
  }
  const [matchRes, setMatchRes] = useState<ItemResult[]>([]);
  const matchFb = phase === 'fb' && item.mode === 'match' && (
    matchRes.every((r) => r.correct)
      ? <div className="fb ok"><span>✓ All matched</span><span className="go">⏎ continue</span></div>
      : <div className="fb bad"><span>✗ Missed: {matchRes.filter((r) => !r.correct).map((r) => item.board!.left.find((l) => l.id === r.wordId)!.text).join(', ')}</span><span className="go">⏎ continue</span></div>
  );

  const content = (
    <>
      {prompt}{body}{fb}{matchFb}{fbNote}{fbContrast}
      {phase === 'fb' && <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => nextRef.current()}>Continue ⏎</button></div>}
    </>
  );
  if (item.passage) {
    return (
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div className="reading">
          <div style={{ font: '600 20px var(--serif)', marginBottom: 8 }}>{item.passage.title}</div>
          {item.passage.paragraphs.map((p, i) => <p key={i}><span className="mono small muted">{i + 1} </span>{p}</p>)}
        </div>
        <div>{content}</div>
      </div>
    );
  }
  return content;
}

// ------------------------------------------------------------------ match board
function MatchBoard({ item, onDone, done }: { item: Item; instant: boolean; onDone: (r: ItemResult[]) => void; done: boolean }) {
  const b = item.board!;
  const [l, setL] = useState<string | null>(null);
  const [r, setR] = useState<string | null>(null);
  const [ok, setOk] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const t0 = useRef(performance.now());

  const attempt = (lid: string, rid: string) => {
    if (lid === rid) {
      const n = new Set(ok); n.add(lid); setOk(n);
      if (n.size === b.left.length) {
        const res = matchResults(item, missed).map((x) => ({ ...x, firstKeyMs: Math.round(performance.now() - t0.current) }));
        setTimeout(() => onDone(res), 250);
      }
    } else {
      const m = new Set(missed); m.add(lid); setMissed(m);
      setFlash(rid); setTimeout(() => setFlash(null), 450);
    }
    setL(null); setR(null);
  };
  const clickL = (id: string) => { if (done || ok.has(id)) return; if (r) attempt(id, r); else setL(id === l ? null : id); };
  const clickR = (id: string) => { if (done || ok.has(id)) return; if (l) attempt(l, id); else setR(id === r ? null : id); };
  // keyboard: 1–7 picks a German word, A–G picks a meaning (in either order)
  const latest = useRef({ clickL, clickR, done });
  latest.current = { clickL, clickR, done };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (latest.current.done || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      if (/^[1-9]$/.test(e.key)) { const x = b.left[+e.key - 1]; if (x) latest.current.clickL(x.id); }
      else if (/^[a-z]$/i.test(e.key)) { const x = b.right[e.key.toLowerCase().charCodeAt(0) - 97]; if (x) latest.current.clickR(x.id); }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [b]);
  return (
    <div style={{ marginTop: 14 }}>
      <div className="match">
        <div className="col">{b.left.map((x, i) => <div key={x.id} className={`choice ${ok.has(x.id) ? 'ok' : l === x.id ? 'sel' : ''}`} style={{ cursor: 'pointer' }} onClick={() => clickL(x.id)}><span className="kbd">{i + 1}</span>{x.text}</div>)}</div>
        <div className="col">{b.right.map((x, i) => <div key={x.id} className={`choice ${ok.has(x.id) ? 'ok' : flash === x.id ? 'bad' : r === x.id ? 'sel' : ''}`} style={{ cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 15 }} onClick={() => clickR(x.id)}><span className="kbd">{String.fromCharCode(65 + i)}</span>{x.text}</div>)}</div>
      </div>
      <div className="annot">keys: 1–7 pick a German word, A–G pick its meaning · cyan = selected · red flash = wrong pair, counted as a miss</div>
    </div>
  );
}

// ------------------------------------------------------------------ runner
export interface RunnerProps {
  items: Item[]; title: string; instant?: boolean; backLabel?: string;
  onDone: (results: ItemResult[], startedAt: number) => void; onBack: () => void; note?: string;
}
export function Runner({ items, title, instant = true, onDone, onBack, note }: RunnerProps) {
  const [i, setI] = useState(0);
  const results = useRef<ItemResult[]>([]);
  const started = useRef(Date.now());
  const [marks, setMarks] = useState<('ok' | 'bad')[]>([]);
  const cur = items[i];
  const onResult = (r: ItemResult[]) => {
    results.current.push(...r);
    setMarks((m) => [...m, r.every((x) => x.correct) ? 'ok' : 'bad']);
  };
  const next = () => {
    if (i + 1 >= items.length) onDone(results.current, started.current);
    else setI(i + 1);
  };
  if (!cur) return null;
  return (
    <div className="card">
      <div className="screen-head"><h3>{title}</h3><span className="counter">{i + 1} / {items.length}</span></div>
      {note && <div className="small muted" style={{ marginBottom: 6 }}>{note}</div>}
      <div className="ticks" style={{ marginBottom: 16 }}>
        {items.map((_, k) => <i key={k} className={k < marks.length ? marks[k] : k === i ? 'cur' : ''} />)}
      </div>
      <ItemView key={cur.id} item={cur} instant={instant} onResult={onResult} onNext={next} />
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-start' }}><button className="btn ghost" onClick={onBack}>← Leave</button></div>
    </div>
  );
}

// ------------------------------------------------------------------ result screen
export interface ResultProps {
  title: string; results: ItemResult[]; passMark: number; attempt: number; isTest?: boolean; passed: boolean;
  primary?: { label: string; onClick: () => void }; onRetake?: () => void; onBack: () => void; replay?: boolean; xp?: number; info?: string;
}
export function ResultScreen({ title, results, passMark, attempt, isTest, passed, primary, onRetake, onBack, replay, xp, info }: ResultProps) {
  const total = results.length, correct = results.filter((r) => r.correct).length;
  const score = total ? correct / total : 1;
  const sections = useMemo(() => {
    const m = new Map<string, { c: number; t: number }>();
    for (const r of results) { const s = r.item.section ?? (r.item.format === 'reading' ? 'Reading' : ''); if (!s) continue; const e = m.get(s) ?? { c: 0, t: 0 }; e.t++; if (r.correct) e.c++; m.set(s, e); }
    return [...m.entries()];
  }, [results]);
  const misses = results.filter((r) => !r.correct);
  const weak = [...new Set(misses.filter((r) => !r.wordId.startsWith('text:')).map((r) => r.wordId))];
  const idx = useStore((s) => s.idx)!;
  const label = isTest ? `${Math.round(score * 100)}%` : `${correct}/${total}`;
  return (
    <div className="card">
      <div className="screen-head"><h3>{isTest ? `${title} · result` : `Node result · ${title}`}</h3><span className="counter">attempt {attempt}{replay ? ' · replay' : ''}</span></div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}>
        <div className="score" style={{ color: passed ? 'var(--green-ink)' : 'var(--red-ink)' }}>{label}</div>
        <div style={{ paddingBottom: 6 }}>
          <span className={`tag ${passed ? 'green' : 'red'}`}>{passed ? 'passed' : 'not passed'}</span>{' '}
          <span className="small muted">{passMark >= 1 ? 'needs every answer correct' : `pass mark ${Math.round(passMark * 100)}%`}{xp ? ` · +${xp} xp` : ''}</span>
        </div>
      </div>
      <div className="ticks" style={{ margin: '12px 0' }}>{results.map((r, k) => <i key={k} className={r.correct ? 'ok' : 'bad'} />)}</div>
      {info && <div className="callout" style={{ marginBottom: 12 }}>{info}</div>}
      {isTest && sections.length > 0 && (
        <table className="tbl" style={{ marginBottom: 14 }}><thead><tr><th>Section</th><th>Score</th><th style={{ width: '45%' }} /></tr></thead>
          <tbody>{sections.map(([n, e]) => (
            <tr key={n}><td>{n}</td><td className="mono">{e.c}/{e.t}</td><td><div className="bar" style={{ height: 6 }}><i style={{ width: `${(e.c / e.t) * 100}%`, background: e.c / e.t >= passMark ? 'var(--green)' : 'var(--red)' }} /></div></td></tr>
          ))}</tbody></table>
      )}
      {misses.length > 0 && (
        <table className="tbl"><thead><tr><th>#</th><th>Prompt</th><th>You</th><th>Answer</th></tr></thead>
          <tbody>{misses.map((r, k) => (
            <tr key={k} className="miss"><td className="mono">{results.indexOf(r) + 1}</td>
              <td className="de">{r.item.mode === 'match' ? `${r.item.board!.left.find((l) => l.id === r.wordId)?.text}` : [r.item.main, r.item.sentence, r.item.sub].filter(Boolean).join(' · ')}</td>
              <td className="de"><span className="x">{r.given || '—'}</span></td><td className="de"><span className="y">{r.expected}</span></td></tr>
          ))}</tbody></table>
      )}
      {isTest && weak.length > 0 && (
        <><div className="label" style={{ marginTop: 14 }}>Words to work on</div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>{weak.map((id) => { const w = idx.byId.get(id); return w ? <span key={id} className="tag red">{w.noun ? ART[w.noun.gender ?? 'f'] + ' ' : ''}{w.lemma}</span> : null; })}</div></>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn ghost" onClick={onBack}>Back to path</button>
        <span className="row">
          {onRetake && <button className={`btn ${passed ? '' : 'primary'}`} onClick={onRetake} autoFocus={!primary}>{passed ? 'Replay' : 'Retake'}</button>}
          {primary && <button className="btn primary" onClick={primary.onClick} autoFocus>{primary.label}</button>}
        </span>
      </div>
    </div>
  );
}

export { Art };
