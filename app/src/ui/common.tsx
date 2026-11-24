import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Gender, Word } from '../core/types';
import { mastery } from '../core/srs';
import type { Progress } from '../core/types';

// ---------- hash routing ----------
export function useHash(): string {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => { const f = () => setH(location.hash.slice(1) || '/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
}
export const go = (to: string) => { location.hash = to; };
export const nodeHref = (id: string) => `#/node/${encodeURIComponent(id)}`;
export const historyHref = (id: string) => `#/history/${encodeURIComponent(id)}`;

// ---------- word modal ----------
export const WordOpenCtx = createContext<(id: string) => void>(() => {});
export const useOpenWord = () => useContext(WordOpenCtx);

// ---------- small bits ----------
export const ART: Record<Gender, string> = { m: 'der', f: 'die', n: 'das' };
export const artClass = (g?: Gender | null) => (g ? `art-${g}` : 'art-f');
export function Art({ w }: { w: Word }) {
  return w.noun ? <><span className={artClass(w.noun.gender)}>{ART[w.noun.gender ?? 'f']}</span>{' '}</> : null;
}
export const fmtSec = (ms: number | null | undefined) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(2)} s` : '—');
export const fmtDur = (ms: number) => { const s = Math.round(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function SentenceWithGaps({ text }: { text: string }) {
  const parts = text.split('___');
  return <>{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <span className="gap" />}</span>)}</>;
}

export function MasteryDot({ p, id }: { p: Progress; id: string }) {
  const m = mastery(p, id);
  return <span className={`sd m${m}`} title={['new', 'learning', 'familiar', 'solid', 'mastered'][m]} />;
}

export function MasteryBar({ counts, total }: { counts: number[]; total: number }) {
  return (
    <div className="mbar">
      {[4, 3, 2, 1, 0].map((m) => <i key={m} className={`m${m}`} style={{ width: `${total ? (counts[m] / total) * 100 : 0}%` }} />)}
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [onClose]);
  return <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal">{children}</div></div>;
}

export function speak(text: string, enabled: boolean) {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith('de'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* no voice available */ }
}
