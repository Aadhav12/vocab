import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, ItemResult, TextFile, Word } from '../core/types';
import { readingItems } from '../core/generate';
import { tokenize } from '../core/index';
import { gradeChoice, toResult } from '../core/grade';
import { markWeak } from '../core/srs';
import { mutateProgress, useStore } from '../store';
import { useOpenWord } from './common';

export function Reading({ text, targets, onDone, onBack }: { text: TextFile; targets: Word[]; onDone: (r: ItemResult[], clicked: string[], startedAt: number) => void; onBack: () => void }) {
  const idx = useStore((s) => s.idx)!, p = useStore((s) => s.progress);
  const open = useOpenWord();
  const [started, setStarted] = useState(false);
  const [t0] = useState(Date.now());
  const items: Item[] = useMemo(() => readingItems(text), [text]);
  const [ans, setAns] = useState<(number | null)[]>(() => items.map(() => null));
  const [clicked, setClicked] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const segs = useRef<(HTMLElement | null)[]>([]);
  const checkBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (started) setTimeout(() => segs.current[0]?.focus(), 0); }, [started]);
  const learned = targets.filter((w) => p.introduced[w.id] !== undefined).length;
  const toks = useMemo(() => text.paragraphs.map((para) => tokenize(idx, para)), [text, idx]);

  if (!started) {
    return (
      <div className="card">
        <div className="screen-head"><h3>Reading</h3><span className="counter">{text.title}</span></div>
        <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}><div className="score">{learned}/{targets.length}</div><div className="small muted" style={{ paddingBottom: 6 }}>target words learned</div></div>
        <div className="bar cyan" style={{ margin: '12px 0' }}><i style={{ width: `${targets.length ? (learned / targets.length) * 100 : 100}%` }} /></div>
        <p className="small muted">Underlined words are in your vocabulary — click one to look it up. It is then added to your review.</p>
        <div className="row" style={{ justifyContent: 'space-between' }}><button className="btn ghost" onClick={onBack}>← Back</button><button className="btn primary" autoFocus onClick={() => setStarted(true)}>Start reading</button></div>
      </div>
    );
  }
  const click = (id: string) => {
    open(id);
    if (!clicked.includes(id)) setClicked([...clicked, id]);
    mutateProgress((pp) => markWeak(pp, id));
  };
  const submit = () => {
    setChecked(true);
    const res = items.map((it, i) => toResult(it, gradeChoice(it, ans[i]), null));
    setTimeout(() => onDone(res, clicked, t0), 700);
  };
  const answered = ans.filter((a) => a !== null).length;
  /** keyboard: 1–9 picks an option and moves to the next question; ←/→ cycle; Tab moves between questions */
  const onQKey = (qi: number, n: number, e: React.KeyboardEvent<HTMLElement>) => {
    if (checked || e.ctrlKey || e.metaKey || e.altKey) return;
    const set = (v: number, advance: boolean) => {
      e.preventDefault();
      const next = ans.map((a, j) => (j === qi ? v : a));
      setAns(next);
      if (advance) {
        if (qi + 1 < items.length) segs.current[qi + 1]?.focus();
        else if (next.every((a) => a !== null)) setTimeout(() => checkBtn.current?.focus(), 0);
      }
    };
    if (/^[1-9]$/.test(e.key) && +e.key <= n) set(+e.key - 1, true);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') set(((ans[qi] ?? -1) + 1) % n, false);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') set(((ans[qi] ?? 0) - 1 + n) % n, false);
  };
  return (
    <div className="card">
      <div className="screen-head"><h3>Reading</h3><span className="counter">{learned} / {targets.length} target words learned · pass: all correct</span></div>
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div className="reading">
          <div style={{ font: '600 20px var(--serif)', marginBottom: 8 }}>{text.title}</div>
          {toks.map((para, pi) => (
            <p key={pi}>{para.map((t, k) => t.wordId
              ? <span key={k} className={`tok ${clicked.includes(t.wordId) ? 'hit' : ''}`} style={{ cursor: 'pointer' }} onClick={() => click(t.wordId!)}>{t.text}</span>
              : <span key={k}>{t.text}</span>)}</p>
          ))}
          <div className="annot">dotted = known word, click to look up · cyan = clicked, added to review · questions: 1–3 or ← → to answer, Tab to move</div>
        </div>
        <div>
          <div className="label">Questions</div>
          {items.map((it, qi) => (
            <div className="q" key={it.id}>
              <div>{qi + 1}. {it.sentence}</div>
              <div className={`seg ${it.choices!.some((c) => c.length > 16) ? 'v' : ''}`} tabIndex={checked ? -1 : 0} ref={(el) => (segs.current[qi] = el)} onKeyDown={(e) => onQKey(qi, it.choices!.length, e)}>
                {it.choices!.map((c, ci) => {
                  let cls = ans[qi] === ci ? 'sel' : '';
                  if (checked) cls = ci === it.answerIdx ? 'ok' : ans[qi] === ci ? 'bad' : '';
                  return <span key={ci} className={cls} style={{ cursor: checked ? 'default' : 'pointer' }} onClick={() => !checked && setAns(ans.map((a, j) => (j === qi ? ci : a)))}><i className="kn">{ci + 1}</i>{c}</span>;
                })}
              </div>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span className="mono small muted">{answered} / {items.length} answered</span>
            <button className="btn primary" ref={checkBtn} disabled={answered < items.length || checked} onClick={submit}>Check answers</button>
          </div>
        </div>
      </div>
    </div>
  );
}
