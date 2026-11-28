// What happens to the records when an attempt ends. Shared by the app and by the recovery tool,
// so rebuilding progress from attempts.jsonl behaves exactly like playing did.
import type { CardType, Progress, Word } from './types';
import type { DataIndex } from './index';
import { isTestType, syncInserts, type Path, type PathNode } from './path';
import { applicable } from './generate';
import { applyAnswer, bookRechecks, clearLeech, introduceWord, markWeak } from './srs';

export const coreCardsFor = (w: Word, idx: DataIndex): CardType[] => {
  const out: CardType[] = ['de-en', 'en-de'];
  if (applicable('article', w, idx)) out.push('article');
  if (applicable('plural', w, idx)) out.push('plural');
  if (applicable('principal', w, idx)) out.push('principal');
  if (applicable('rektion', w, idx)) out.push('rektion');
  return out;
};

export interface ApplyArgs {
  node: PathNode | null;               // null = practice
  nodeId: string;
  results: { wordId: string; card: string; correct: boolean }[];
  score: number; passMark: number; prevAttempts: number;
  clickedWords?: string[]; introWords?: string[]; xpItems?: number;
  at: Date;
}
export interface Applied { passed: boolean; firstPass: boolean; replay: boolean; setCountUp: boolean; xp: number }

const day = (d: Date) => d.toLocaleDateString('en-CA');

export function applyToProgress(p: Progress, idx: DataIndex, path: Path, a: ApplyArgs): Applied {
  const node = a.node;
  const isPractice = !node;
  const insertId = node?.inserted ? node.id : null;
  const alreadyPassed = !isPractice && !insertId && !!p.passed[a.nodeId];
  const replay = isPractice || alreadyPassed;
  const correct = a.results.filter((r) => r.correct).length;
  const passed = a.score + 1e-9 >= a.passMark;

  if (a.introWords) for (const id of a.introWords) { const w = idx.byId.get(id); if (w) introduceWord(p, w.id, coreCardsFor(w, idx)); }
  for (const r of a.results) {
    if (r.wordId.startsWith('text:')) continue;
    applyAnswer(p, r.wordId, r.card, r.correct);
  }
  for (const w of a.clickedWords ?? []) markWeak(p, w);

  let xp = 0, firstPass = false, setCountUp = false;
  if (!replay) xp += a.xpItems ?? correct;
  if (passed && !isPractice) {
    if (insertId) {
      const ins = p.inserts.find((i) => i.id === insertId);
      p.inserts = p.inserts.filter((i) => i.id !== insertId);
      if (ins?.kind === 'leech') for (const w of ins.wordIds ?? []) clearLeech(p, w);
      if (!replay) xp += 10 + (ins?.kind === 'recheck' ? 40 : 0);
    } else if (!alreadyPassed) {
      firstPass = true;
      p.passed[a.nodeId] = { bestScore: a.score, attempts: a.prevAttempts + 1, firstPassedAt: a.at.toISOString() };
      xp += 10 + (node && isTestType(node.type) ? 40 : 0);
      if (node?.type === 'test') { p.setCount += 1; setCountUp = true; bookRechecks(p, 'set', node.scopeId); }
      if (node?.type === 'gtest') bookRechecks(p, 'group', node.scopeId);
      if (node?.type === 'ttest') bookRechecks(p, 'topic', node.scopeId);
    }
  }
  if (alreadyPassed && p.passed[a.nodeId]) {
    p.passed[a.nodeId].attempts = a.prevAttempts + 1;
    p.passed[a.nodeId].bestScore = Math.max(p.passed[a.nodeId].bestScore, a.score);
  }
  p.xp += xp;
  if (!p.lastAttemptAt || a.at.toISOString() > p.lastAttemptAt) p.lastAttemptAt = a.at.toISOString();
  if (passed) {
    const t = day(a.at);
    if (p.streak.last !== t) {
      const y = new Date(a.at); y.setDate(y.getDate() - 1);
      p.streak = { last: t, count: p.streak.last === day(y) ? p.streak.count + 1 : 1 };
    }
  }
  syncInserts(idx, path, p);
  return { passed, firstPass, replay, setCountUp, xp };
}
