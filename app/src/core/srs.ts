// Spaced repetition: clock = completed sets. Pure functions over Progress.
import type { Attempt, CardState, CardType, Insert, Progress } from './types';
import { CORE_CARDS } from './types';

export const LADDER = [1, 3, 7, 15, 30, 60, 120];
export const RECHECKS = { set: [2, 6, 15], group: [8, 25], topic: [20, 60] } as const;

export const cardKey = (wordId: string, card: CardType | string) => `${wordId}|${card}`;
export const splitKey = (k: string): [string, CardType] => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1) as CardType]; };

export function newCard(setCount: number): CardState {
  return { step: 0, due: setCount + LADDER[0], reps: 0, misses: 0, promotedAt: setCount };
}

export function introduceWord(p: Progress, wordId: string, applicable: CardType[]): void {
  p.introduced[wordId] = p.introduced[wordId] ?? p.setCount;
  for (const c of CORE_CARDS) {
    if (!applicable.includes(c)) continue;
    const k = cardKey(wordId, c);
    if (!p.cards[k]) p.cards[k] = newCard(p.setCount);
  }
}

/** Apply an answer to a card; creates the card on first answer. Returns true if a miss was counted. */
export function applyAnswer(p: Progress, wordId: string, card: CardType | string, correct: boolean): void {
  const k = cardKey(wordId, card);
  let c = p.cards[k];
  if (!c) {
    c = newCard(p.setCount);
    p.cards[k] = c;
    if (correct) { c.reps++; return; }
  }
  c.reps++;
  if (correct) {
    if (c.promotedAt !== p.setCount) {
      c.step = Math.min(c.step + 1, LADDER.length - 1);
      c.promotedAt = p.setCount;
    }
    c.due = p.setCount + LADDER[c.step];
  } else {
    c.step = 0; c.misses++; c.due = p.setCount + LADDER[0]; c.promotedAt = p.setCount;
  }
}

/** A clicked word in reading: German→English becomes due now, no miss. */
export function markWeak(p: Progress, wordId: string): void {
  if (p.introduced[wordId] === undefined) return;
  const k = cardKey(wordId, 'de-en');
  const c = p.cards[k] ?? newCard(p.setCount);
  c.due = p.setCount;
  p.cards[k] = c;
}

export const isDue = (c: CardState, setCount: number) => c.due <= setCount;

export function dueCards(p: Progress): { wordId: string; card: CardType; state: CardState }[] {
  const out: { wordId: string; card: CardType; state: CardState }[] = [];
  for (const [k, state] of Object.entries(p.cards)) {
    if (!isDue(state, p.setCount)) continue;
    const [wordId, card] = splitKey(k);
    if (p.introduced[wordId] === undefined) continue;
    out.push({ wordId, card, state });
  }
  // most overdue first, then the ones with more misses
  return out.sort((a, b) => a.state.due - b.state.due || b.state.misses - a.state.misses);
}

export type Mastery = 0 | 1 | 2 | 3 | 4; // new, learning, familiar, solid, mastered
export function mastery(p: Progress, wordId: string): Mastery {
  if (p.introduced[wordId] === undefined) return 0;
  const a = p.cards[cardKey(wordId, 'de-en')], b = p.cards[cardKey(wordId, 'en-de')];
  if (!a || !b) return 1;
  const s = Math.min(a.step, b.step);
  return s <= 0 ? 1 : s === 1 ? 2 : s <= 3 ? 3 : 4;
}
export const MASTERY_NAMES = ['new', 'learning', 'familiar', 'solid', 'mastered'];

/** Leech: misses since the last clear reached the threshold. */
export function leechCards(p: Progress): { wordId: string; card: CardType }[] {
  const out: { wordId: string; card: CardType }[] = [];
  for (const [k, c] of Object.entries(p.cards)) {
    if (c.misses - (c.leechClearedAt ?? 0) >= p.settings.leechThreshold) {
      const [wordId, card] = splitKey(k);
      out.push({ wordId, card });
    }
  }
  return out;
}
export function clearLeech(p: Progress, wordId: string): void {
  for (const [k, c] of Object.entries(p.cards)) if (k.startsWith(wordId + '|')) c.leechClearedAt = c.misses;
}

/** Book rechecks after a test is first passed. */
export function bookRechecks(p: Progress, level: 'set' | 'group' | 'topic', scopeId: string): void {
  for (const d of RECHECKS[level]) {
    const dueAt = p.setCount + d;
    p.inserts.push({ id: `recheck:${level}:${scopeId}:${dueAt}`, kind: 'recheck', level, scopeId, dueAt });
  }
}

/** Inserts that are active now (rechecks whose time has come, leech and catch-up). */
export function activeInserts(p: Progress): Insert[] {
  return p.inserts.filter((i) => i.kind !== 'recheck' || i.dueAt <= p.setCount).sort((a, b) => a.dueAt - b.dueAt);
}

export function wordSummary(attempts: Attempt[], wordId: string) {
  const per = new Map<string, { answers: boolean[]; keys: number[]; misses: number }>();
  for (const a of attempts) for (const it of a.items) {
    if (it.wordId !== wordId) continue;
    const e = per.get(it.card) ?? { answers: [], keys: [], misses: 0 };
    e.answers.push(it.correct); if (!it.correct) e.misses++;
    if (typeof it.firstKeyMs === 'number') e.keys.push(it.firstKeyMs);
    per.set(it.card, e);
  }
  return per;
}
