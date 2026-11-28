import { useState } from 'react';
import type { Word } from '../core/types';
import { WordCard } from './WordCard';
import { speak } from './common';
import { useStore } from '../store';
import { useEffect } from 'react';

export function Intro({ words, onFinish, onBack }: { words: Word[]; onFinish: () => void; onBack: () => void }) {
  const [i, setI] = useState(0);
  const tts = useStore((s) => s.progress.settings.tts);
  const w = words[i];
  const last = i === words.length - 1;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { if (i < words.length - 1) setI(i + 1); }
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      if (e.key === 'Enter' && !/^(INPUT|BUTTON|SELECT|A|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) { e.preventDefault(); if (i < words.length - 1) setI(i + 1); else onFinish(); }
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [i, words.length, onFinish]);
  if (!w) return <div className="card">No words in this set.</div>;
  return (
    <div className="card">
      <div className="screen-head"><h3>Introduce{w.pos === 'verb' ? ' · verb' : ''}</h3><span className="counter">word {i + 1} / {words.length} · ← → or ⏎</span></div>
      <div className="bar" style={{ marginBottom: 14 }}><i style={{ width: `${((i + 1) / words.length) * 100}%` }} /></div>
      <WordCard key={w.id} w={w} />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <span className="row"><button className="btn ghost" onClick={() => (i === 0 ? onBack() : setI(i - 1))}>← {i === 0 ? 'Leave' : 'Back'}</button>
          <button className="btn ghost" onClick={() => speak(w.noun ? `${w.lemma}` : w.lemma, tts)}>♪</button></span>
        {last ? <button className="btn accent" onClick={onFinish}>Finish — add {words.length} words to review</button> : <button className="btn primary" onClick={() => setI(i + 1)}>Next →</button>}
      </div>
    </div>
  );
}
