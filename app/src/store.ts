// Client state: data bundle, records, and everything that happens when an attempt ends.
import { useSyncExternalStore } from 'react';
import type { Attempt, AttemptItem, CardType, DataBundle, ItemResult, Progress, Word } from './core/types';
import { emptyProgress } from './core/types';
import { buildIndex, type DataIndex } from './core/index';
import { buildPath, insertNode, isTestType, syncInserts, type Path, type PathNode } from './core/path';
import { applyAnswer, bookRechecks, clearLeech, introduceWord, markWeak } from './core/srs';
import { applicable } from './core/generate';
import { promptText } from './core/grade';

export interface State {
  loaded: boolean; error?: string; bundle: DataBundle | null; idx: DataIndex | null; path: Path | null;
  progress: Progress; attempts: Attempt[]; histVersion: number;
}
let state: State = { loaded: false, bundle: null, idx: null, path: null, progress: emptyProgress(), attempts: [], histVersion: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };
export const getState = () => state;
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(state));
}

// ---------- loading ----------
async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** Records follow words through renames: ids that are aliases are rewritten to the canonical id. */
function normalizeAliases(p: Progress, idx: DataIndex): boolean {
  let changed = false;
  const canon = (id: string) => idx.byId.get(id)?.id ?? id;
  for (const k of Object.keys(p.introduced)) { const c = canon(k); if (c !== k) { p.introduced[c] = Math.min(p.introduced[c] ?? Infinity, p.introduced[k]); delete p.introduced[k]; changed = true; } }
  for (const k of Object.keys(p.cards)) {
    const i = k.indexOf('|'); const c = canon(k.slice(0, i));
    if (c !== k.slice(0, i)) { const nk = c + k.slice(i); p.cards[nk] = p.cards[nk] ?? p.cards[k]; delete p.cards[k]; changed = true; }
  }
  return changed;
}

export async function init() {
  try {
    const [bundle, rec] = await Promise.all([jget<DataBundle>('/api/data'), jget<{ progress: Progress; attempts: Attempt[] }>('/api/records')]);
    const idx = buildIndex(bundle);
    const path = buildPath(idx);
    const progress = rec.progress;
    const ch = normalizeAliases(progress, idx);
    const ins = syncInserts(idx, path, progress);
    set({ loaded: true, bundle, idx, path, progress: { ...progress }, attempts: rec.attempts, histVersion: state.histVersion + 1, error: undefined });
    if (ch || ins) persist(true);
    listenEvents();
  } catch (e: any) { set({ error: e.message, loaded: true }); }
}

let es: EventSource | undefined;
function listenEvents() {
  if (es || typeof EventSource === 'undefined') return;
  es = new EventSource('/api/events');
  es.addEventListener('data', async () => {
    try {
      const bundle = await jget<DataBundle>('/api/data');
      const idx = buildIndex(bundle);
      const path = buildPath(idx);
      const progress = { ...state.progress };
      normalizeAliases(progress, idx);
      set({ bundle, idx, path, progress });
    } catch { /* ignore */ }
  });
}

// ---------- persistence ----------
let timer: ReturnType<typeof setTimeout> | undefined;
export function persist(now = false) {
  clearTimeout(timer);
  const run = () => { fetch('/api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.progress), keepalive: true }).catch(() => {}); };
  if (now) run(); else timer = setTimeout(run, 250);
}

export function mutateProgress(fn: (p: Progress) => void) {
  const p: Progress = structuredClone(state.progress);
  fn(p);
  set({ progress: p });
  persist();
}

export async function resetAll() {
  const r = await fetch('/api/reset', { method: 'POST' });
  const p = (await r.json()) as Progress;
  set({ progress: p, attempts: [], histVersion: state.histVersion + 1 });
}

// ---------- history ----------
let histCache: { v: number; map: Map<string, Map<string, { answers: boolean[]; keys: number[]; misses: number }>> } | null = null;
export function wordHistory(wordId: string) {
  if (!histCache || histCache.v !== state.histVersion) {
    const map = new Map<string, Map<string, { answers: boolean[]; keys: number[]; misses: number }>>();
    for (const a of state.attempts) for (const it of a.items) {
      let w = map.get(it.wordId); if (!w) map.set(it.wordId, (w = new Map()));
      const e = w.get(it.card) ?? { answers: [], keys: [], misses: 0 };
      e.answers.push(it.correct); if (!it.correct) e.misses++;
      if (typeof it.firstKeyMs === 'number') e.keys.push(it.firstKeyMs);
      w.set(it.card, e);
    }
    histCache = { v: state.histVersion, map };
  }
  return histCache.map.get(wordId) ?? new Map<string, { answers: boolean[]; keys: number[]; misses: number }>();
}

export function attemptsFor(nodeId: string): Attempt[] {
  // rechecks of a test are listed with the test's own history
  const m = /^(set|group|topic):(.+):test$/.exec(nodeId);
  const prefix = m ? `recheck:${m[1]}:${m[2]}:` : null;
  return state.attempts.filter((a) => a.nodeId === nodeId || (prefix !== null && a.nodeId.startsWith(prefix)));
}

// ---------- finishing an attempt ----------
export const coreCardsFor = (w: Word, idx: DataIndex): CardType[] => {
  const out: CardType[] = ['de-en', 'en-de'];
  if (applicable('article', w, idx)) out.push('article');
  if (applicable('plural', w, idx)) out.push('plural');
  if (applicable('principal', w, idx)) out.push('principal');
  if (applicable('rektion', w, idx)) out.push('rektion');
  return out;
};

export interface Commit {
  node: PathNode | null;          // null = practice
  nodeId: string;
  results: ItemResult[];
  startedAt: number;
  passMark: number;
  clickedWords?: string[];
  rounds?: Attempt['rounds'];
  introWords?: string[];
  scoreOverride?: number;
  xpItems?: number;
  sections?: Attempt['sections'];
}
export interface Outcome { attempt: Attempt; passed: boolean; firstPass: boolean; replay: boolean; setCountUp: boolean; xp: number }

const today = () => new Date().toLocaleDateString('en-CA');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); };

export function commitAttempt(c: Commit): Outcome {
  const s = state;
  const idx = s.idx!, path = s.path!;
  const p: Progress = structuredClone(s.progress);
  const node = c.node;
  const isPractice = !node;
  const insertId = node?.inserted ? node.id : null;
  const alreadyPassed = !isPractice && !insertId && !!p.passed[c.nodeId];
  const replay = isPractice || alreadyPassed;
  const startSet = p.setCount;

  const total = c.results.length;
  const correct = c.results.filter((r) => r.correct).length;
  const score = c.scoreOverride ?? (total ? correct / total : 1);
  const passed = score + 1e-9 >= c.passMark;
  const prevAttempts = s.attempts.filter((a) => a.nodeId === c.nodeId).length;

  // introduce
  if (c.introWords) for (const id of c.introWords) { const w = idx.byId.get(id); if (w) introduceWord(p, w.id, coreCardsFor(w, idx)); }
  // cards
  for (const r of c.results) {
    if (r.wordId.startsWith('text:')) continue;
    applyAnswer(p, r.wordId, r.card, r.correct);
  }
  for (const w of c.clickedWords ?? []) markWeak(p, w);

  // xp
  let xp = 0;
  if (!replay) {
    xp += c.xpItems ?? correct;
  }
  let firstPass = false, setCountUp = false;
  const att: Attempt = {
    nodeId: c.nodeId, attempt: prevAttempts + 1, startedAt: new Date(c.startedAt).toISOString(), endedAt: new Date().toISOString(),
    durationMs: Date.now() - c.startedAt, setCount: startSet, replay, score, passMark: c.passMark, passed,
    items: c.results.map((r): AttemptItem => ({
      format: r.item.format, wordId: r.wordId, card: r.card, prompt: r.item.mode === 'match' ? `${r.item.label}: ${r.item.board!.left.find((l) => l.id === r.wordId)?.text}` : promptText(r.item),
      expected: r.expected, given: r.given, correct: r.correct, ...(r.note ? { note: r.note } : {}), firstKeyMs: r.firstKeyMs, ...(r.item.section ? { section: r.item.section } : {}),
    })),
    ...(c.clickedWords?.length ? { clickedWords: c.clickedWords } : {}), ...(c.rounds ? { rounds: c.rounds } : {}), ...(c.sections ? { sections: c.sections } : {}),
  };

  if (passed && !isPractice) {
    if (insertId) {
      const ins = p.inserts.find((i) => i.id === insertId);
      p.inserts = p.inserts.filter((i) => i.id !== insertId);
      if (ins?.kind === 'leech') for (const w of ins.wordIds ?? []) clearLeech(p, w);
      if (!replay) xp += 10 + (ins?.kind === 'recheck' ? 40 : 0);
    } else if (!alreadyPassed) {
      firstPass = true;
      p.passed[c.nodeId] = { bestScore: score, attempts: prevAttempts + 1, firstPassedAt: new Date().toISOString() };
      xp += 10 + (node && isTestType(node.type) ? 40 : 0);
      if (node?.type === 'test') { p.setCount += 1; setCountUp = true; bookRechecks(p, 'set', node.scopeId); }
      if (node?.type === 'gtest') bookRechecks(p, 'group', node.scopeId);
      if (node?.type === 'ttest') bookRechecks(p, 'topic', node.scopeId);
    }
  }
  if (alreadyPassed && p.passed[c.nodeId]) {
    p.passed[c.nodeId].attempts = prevAttempts + 1;
    p.passed[c.nodeId].bestScore = Math.max(p.passed[c.nodeId].bestScore, score);
  }
  p.xp += xp;
  if (passed) {
    const t = today();
    if (p.streak.last !== t) { p.streak = { last: t, count: p.streak.last === yesterday() ? p.streak.count + 1 : 1 }; }
  }
  syncInserts(idx, path, p);
  set({ progress: p, attempts: [...s.attempts, att], histVersion: s.histVersion + 1 });
  persist(true);
  fetch('/api/attempts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(att), keepalive: true }).catch(() => {});
  return { attempt: att, passed, firstPass, replay, setCountUp, xp };
}

export function nodeFromId(id: string): PathNode | null {
  const { path, idx, progress } = state;
  if (!path || !idx) return null;
  const n = path.byId.get(id);
  if (n) return n;
  const ins = progress.inserts.find((i) => i.id === id);
  return ins ? insertNode(idx, ins) : null;
}

/** Stable bundle of the loaded core state (selectors must not return fresh objects). */
export function useCore() {
  const idx = useStore((s) => s.idx)!, path = useStore((s) => s.path)!, progress = useStore((s) => s.progress);
  return { idx, path, progress };
}
