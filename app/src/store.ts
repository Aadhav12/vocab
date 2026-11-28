// Client state: data bundle, records, and everything that happens when an attempt ends.
import { useSyncExternalStore } from 'react';
import type { Attempt, AttemptItem, CardType, DataBundle, ItemResult, Progress, Word } from './core/types';
import { emptyProgress } from './core/types';
import { buildIndex, type DataIndex } from './core/index';
import { buildPath, insertNode, isTestType, syncInserts, type Path, type PathNode } from './core/path';
import { applyAnswer, bookRechecks, clearLeech, introduceWord, markWeak } from './core/srs';
import { applyToProgress, coreCardsFor } from './core/apply';
import { promptText } from './core/grade';

export interface State {
  loaded: boolean; error?: string; bundle: DataBundle | null; idx: DataIndex | null; path: Path | null;
  progress: Progress; attempts: Attempt[]; histVersion: number; saveError: string | null;
}
let state: State = { loaded: false, bundle: null, idx: null, path: null, progress: emptyProgress(), attempts: [], histVersion: 0, saveError: null };
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
// Never use fetch `keepalive` here: browsers reject keepalive bodies over 64 KiB, and progress.json grows past that.
// Saves go one at a time, always send the latest state, and retry until the server confirms.
let timer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false, dirty = false, retryMs = 2000;
async function flush(): Promise<void> {
  if (saving) { dirty = true; return; }
  saving = true; dirty = false;
  try {
    const r = await fetch('/api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.progress) });
    if (!r.ok) throw new Error(`server answered ${r.status}`);
    retryMs = 2000;
    if (state.saveError) set({ saveError: null });
  } catch (e: any) {
    set({ saveError: e?.message ?? 'save failed' });
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { void flush(); }, retryMs);
    retryMs = Math.min(retryMs * 2, 30000);
  } finally {
    saving = false;
    if (dirty) void flush();
  }
}
export function persist(now = false) {
  clearTimeout(timer);
  if (now) void flush(); else timer = setTimeout(() => { void flush(); }, 250);
}
/** Append-only attempt log: retried until stored. */
function send(url: string, method: string, body: unknown, wait = 2000): void {
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { if (!r.ok) throw new Error(`server answered ${r.status}`); })
    .catch((e) => { set({ saveError: e?.message ?? 'save failed' }); setTimeout(() => send(url, method, body, Math.min(wait * 2, 30000)), wait); });
}
if (typeof window !== 'undefined') {
  addEventListener('beforeunload', (e) => { if (state.saveError || saving || dirty) { e.preventDefault(); e.returnValue = ''; } });
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
export { coreCardsFor };

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
  const total = c.results.length;
  const correct = c.results.filter((r) => r.correct).length;
  const score = c.scoreOverride ?? (total ? correct / total : 1);
  const prevAttempts = s.attempts.filter((a) => a.nodeId === c.nodeId).length;
  const startSet = p.setCount;
  const now = new Date();

  const ap = applyToProgress(p, idx, path, {
    node: c.node, nodeId: c.nodeId, results: c.results, score, passMark: c.passMark, prevAttempts,
    clickedWords: c.clickedWords, introWords: c.introWords, xpItems: c.xpItems, at: now,
  });
  const att: Attempt = {
    nodeId: c.nodeId, attempt: prevAttempts + 1, startedAt: new Date(c.startedAt).toISOString(), endedAt: now.toISOString(),
    durationMs: now.getTime() - c.startedAt, setCount: startSet, replay: ap.replay, score, passMark: c.passMark, passed: ap.passed,
    items: c.results.map((r): AttemptItem => ({
      format: r.item.format, wordId: r.wordId, card: r.card, prompt: r.item.mode === 'match' ? `${r.item.label}: ${r.item.board!.left.find((l) => l.id === r.wordId)?.text}` : promptText(r.item),
      expected: r.expected, given: r.given, correct: r.correct, ...(r.note ? { note: r.note } : {}), firstKeyMs: r.firstKeyMs, ...(r.item.section ? { section: r.item.section } : {}),
    })),
    ...(c.clickedWords?.length ? { clickedWords: c.clickedWords } : {}), ...(c.rounds ? { rounds: c.rounds } : {}), ...(c.sections ? { sections: c.sections } : {}),
  };
  set({ progress: p, attempts: [...s.attempts, att], histVersion: s.histVersion + 1 });
  persist(true);
  send('/api/attempts', 'POST', att);
  return { attempt: att, passed: ap.passed, firstPass: ap.firstPass, replay: ap.replay, setCountUp: ap.setCountUp, xp: ap.xp };
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
