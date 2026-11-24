// Building the content of a node run: items for warm-ups, format nodes, quizzes and tests.
import type { DataIndex } from './index';
import type { Format, Item, Progress, TextFile, Word } from './types';
import { FORMATS, FORMAT_NAMES } from './types';
import type { Ctx, Rng } from './generate';
import { applicable, itemForCard, itemsForFormat, readingItems, shuffle, translationItem } from './generate';
import { dueCards, splitKey } from './srs';
import type { PathNode } from './path';

/** Warm-ups pass at 90% (all other practice nodes need every answer correct). */
export const WARMUP_PASS = 0.9;

export type RunKind = 'warmup' | 'intro' | 'flash' | 'items' | 'reading';
export interface Run {
  kind: RunKind; title: string; passMark: number; items: Item[]; words: Word[]; chunks?: Word[][]; text?: TextFile;
  empty?: boolean; sectioned?: boolean; instant?: boolean; levelLabel?: string; targetWords?: Word[];
}

export function scopeWords(idx: DataIndex, level: 'set' | 'group' | 'topic', id: string): Word[] {
  if (level === 'set') return idx.setById.get(id)?.words ?? [];
  if (level === 'group') return idx.groupById.get(id)?.sets.flatMap((s) => s.words) ?? [];
  return idx.topicById.get(id)?.groups.flatMap((g) => g.sets.flatMap((s) => s.words)) ?? [];
}

export function weakness(p: Progress, wordId: string): number {
  let w = 1;
  for (const [k, c] of Object.entries(p.cards)) {
    if (!k.startsWith(wordId + '|')) continue;
    w += c.misses * 1.5 + (c.step < 2 ? 0.7 : 0);
  }
  return w;
}

/** Sampling weighted toward weak words, plus a uniform spread of the rest. */
export function sampleWords(words: Word[], n: number, p: Progress, rng: Rng): Word[] {
  if (n >= words.length) return shuffle(words, rng);
  const nWeighted = Math.ceil(n * 0.6);
  const pool = [...words];
  const out: Word[] = [];
  while (out.length < nWeighted && pool.length) {
    const ws = pool.map((w) => weakness(p, w.id));
    let r = rng() * ws.reduce((a, b) => a + b, 0), i = 0;
    for (; i < pool.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  out.push(...shuffle(pool, rng).slice(0, n - out.length));
  return shuffle(out, rng);
}

const chunk = <T,>(a: T[], size: number): T[][] => { const r: T[][] = []; for (let i = 0; i < a.length; i += size) r.push(a.slice(i, i + size)); return r; };
export function flashChunks(words: Word[], rng: Rng, size = 12): Word[][] {
  if (words.length <= size + 4) return [words];
  const n = Math.ceil(words.length / size);
  const per = Math.ceil(words.length / n);
  return chunk(shuffle(words, rng), per);
}

function itemsFromDue(idx: DataIndex, p: Progress, ctx0: Ctx, limit: number): Item[] {
  const ctx: Ctx = { ...ctx0, known: (id) => p.introduced[id] !== undefined };
  const items: Item[] = [];
  const treeSeen = new Set<string>();
  for (const d of dueCards(p).slice(0, limit)) {
    const w = idx.byId.get(d.wordId);
    if (!w) continue;
    if (d.card === 'family') { if (treeSeen.has(w.id)) continue; treeSeen.add(w.id); }
    const it = itemForCard(w, d.card, ctx);
    if (it) items.push({ ...it, weak: true });
  }
  return items;
}

function reviewExtras(fmt: Format | 'flash', beforeOrder: number, count: number, idx: DataIndex, p: Progress, ctx: Ctx): Item[] {
  if (count <= 0) return [];
  const cand = idx.words.filter((w) => (idx.home.get(w.id)?.setOrder ?? 0) < beforeOrder && p.introduced[w.id] !== undefined && applicable(fmt, w, idx));
  if (!cand.length) return [];
  const chosen = sampleWords(cand, Math.min(cand.length, count + 2), p, ctx.rng);
  return itemsForFormat(fmt, chosen, { ...ctx, known: (id) => p.introduced[id] !== undefined }).slice(0, Math.max(1, count));
}

const BASE_COUNTS: Record<string, number> = {
  translation: 16, article: 5, plural: 4, declension: 2, match: 1, opposites: 2, principal: 3, comparison: 2, rektion: 3, case: 2,
  collocation: 2, tree: 1, formation: 3, synonyms: 2, connectors: 2,
};

/** Mixed quiz/test over a scope. */
export function mixedItems(words: Word[], p: Progress, ctx: Ctx, mult: number, opts: { reading?: TextFile[]; per?: number } = {}): Item[] {
  const items: Item[] = [];
  const scale = (n: number) => Math.max(1, Math.round(n * mult));
  const section = (name: string, its: Item[]) => its.forEach((i) => (i.section = name));
  // translation
  const nT = scale(BASE_COUNTS.translation);
  const half = Math.ceil(nT / 2);
  const a = sampleWords(words, Math.min(half, words.length), p, ctx.rng);
  const b = sampleWords(words, Math.min(nT - half, words.length), p, ctx.rng);
  const tr = [...a.map((w) => translationItem(w, 'de-en', ctx, 'flash')), ...b.map((w) => translationItem(w, 'en-de', ctx, 'flash'))];
  section('Translation', tr); items.push(...shuffle(tr, ctx.rng));
  for (const f of FORMATS) {
    const ok = words.filter((w) => applicable(f, w, ctx.idx));
    if (!ok.length) continue;
    const n = scale(BASE_COUNTS[f] ?? 2);
    let its: Item[];
    if (f === 'match') its = itemsForFormat('match', sampleWords(ok, Math.min(ok.length, 7 * n), p, ctx.rng), ctx).slice(0, n);
    else if (f === 'tree') its = itemsForFormat('tree', words, ctx).slice(0, n);
    else if (f === 'synonyms') its = shuffle(itemsForFormat('synonyms', ok, ctx), ctx.rng).slice(0, n);
    else its = itemsForFormat(f, sampleWords(ok, Math.min(ok.length, n), p, ctx.rng), ctx);
    section(FORMAT_NAMES[f], its); items.push(...its);
  }
  for (const t of opts.reading ?? []) {
    const r = readingItems(t, 'Reading'); items.push(...r);
  }
  return items;
}

export function buildRun(node: PathNode, idx: DataIndex, p: Progress, rng: Rng): Run {
  const ctx: Ctx = { idx, rng };
  const pass = node.passKind === 'test' ? p.settings.passTest : 1;
  const set = node.setId ? idx.setById.get(node.setId) : undefined;
  switch (node.type) {
    case 'warmup': {
      const items = itemsFromDue(idx, p, ctx, p.settings.backlogLimit);
      return { kind: 'warmup', title: 'Warm-up', passMark: WARMUP_PASS, items: shuffle(items, rng), words: [], empty: items.length === 0 };
    }
    case 'catchup': return { kind: 'items', title: 'Catch-up review', passMark: 1, items: shuffle(itemsFromDue(idx, p, ctx, p.settings.backlogLimit), rng), words: [] };
    case 'leech': {
      const ins = node.inserted!;
      const items: Item[] = [];
      for (const k of ins.cards ?? []) {
        const [wid, card] = splitKey(k);
        const w = idx.byId.get(wid); if (!w) continue;
        const it = itemForCard(w, card, { ...ctx, known: (id) => p.introduced[id] !== undefined }); if (it) items.push(it);
      }
      for (const id of ins.wordIds ?? []) {
        const w = idx.byId.get(id); if (!w) continue;
        for (const d of ['de-en', 'en-de'] as const) if (!items.some((i) => i.wordId === id && i.card === d)) items.push(translationItem(w, d, ctx, 'flash'));
      }
      return { kind: 'items', title: 'Leech drill', passMark: 1, items: shuffle(items, rng), words: [] };
    }
    case 'intro': return { kind: 'intro', title: 'Introduce', passMark: 1, items: [], words: set?.words ?? [] };
    case 'flash': return { kind: 'flash', title: 'Flashcards', passMark: 1, items: [], words: set?.words ?? [], chunks: [set?.words ?? []] };
    case 'gflash': case 'tflash': {
      const ws = scopeWords(idx, node.level, node.scopeId);
      return { kind: 'flash', title: node.name, passMark: 1, items: [], words: ws, chunks: flashChunks(ws, rng) };
    }
    case 'fmt': {
      const f = node.format!;
      const own = new Set((set?.words ?? []).map((w) => w.id));
      const base = itemsForFormat(f, set?.words ?? [], { ...ctx, known: (id) => own.has(id) || p.introduced[id] !== undefined });
      const info = idx.sets.find((x) => x.set.id === set?.id);
      const extras = reviewExtras(f, info?.order ?? 0, Math.round(base.length * p.settings.reviewMix / Math.max(0.01, 1 - p.settings.reviewMix)), idx, p, ctx);
      return { kind: 'items', title: FORMAT_NAMES[f], passMark: 1, items: shuffle([...base, ...extras], rng), words: set?.words ?? [] };
    }
    case 'reading': case 'greading': case 'treading': {
      const text = idx.textById.get(node.textId!)!;
      const ws = scopeWords(idx, node.level, node.scopeId);
      const targets = (text.uses ?? []).map((id) => idx.byId.get(id)).filter(Boolean) as Word[];
      return { kind: 'reading', title: 'Reading', passMark: 1, items: readingItems(text), words: ws, text, targetWords: targets };
    }
    case 'gquiz': case 'tquiz': {
      const ws = scopeWords(idx, node.level, node.scopeId);
      return { kind: 'items', title: node.name, passMark: 1, items: mixedItems(ws, p, ctx, node.level === 'group' ? 0.6 : 0.8), words: ws, sectioned: true };
    }
    case 'test': case 'gtest': case 'ttest': case 'recheck': {
      const ws = scopeWords(idx, node.level, node.scopeId);
      const mult = node.level === 'set' ? 1 : node.level === 'group' ? 1.5 : 2;
      const texts: TextFile[] = node.level === 'set' ? (idx.setById.get(node.scopeId)?.text ? [idx.setById.get(node.scopeId)!.text!] : [])
        : node.level === 'group' ? idx.groupById.get(node.scopeId)?.texts ?? [] : idx.topicById.get(node.scopeId)?.texts ?? [];
      const title = node.type === 'recheck' ? node.name : node.name;
      return { kind: 'items', title, passMark: pass, items: mixedItems(ws, p, ctx, mult, { reading: texts }), words: ws, sectioned: true };
    }
  }
}

export interface PracticeOptions {
  level: 'all' | 'topic' | 'group' | 'set'; scopeId?: string; formats: (Format | 'flash')[]; count: number; startedOnly: boolean; testMode: boolean;
}
export function buildPractice(o: PracticeOptions, idx: DataIndex, p: Progress, rng: Rng): Item[] {
  const ctx: Ctx = { idx, rng };
  let ws = o.level === 'all' ? idx.words : scopeWords(idx, o.level, o.scopeId ?? '');
  if (o.startedOnly) ws = ws.filter((w) => p.introduced[w.id] !== undefined);
  const per = Math.max(1, Math.ceil(o.count / Math.max(1, o.formats.length)));
  let items: Item[] = [];
  for (const f of o.formats) {
    const ok = ws.filter((w) => applicable(f, w, idx));
    if (!ok.length) continue;
    const chosen = f === 'match' ? ok : sampleWords(ok, Math.min(ok.length, per), p, rng);
    let its = itemsForFormat(f, f === 'flash' ? chosen : chosen, ctx);
    if (f === 'flash') its = shuffle(its, rng);
    items.push(...its.slice(0, f === 'match' ? Math.max(1, Math.round(per / 7)) : per).map((i) => ({ ...i, section: FORMAT_NAMES[f] })));
  }
  items = shuffle(items, rng).slice(0, o.count);
  return o.testMode ? items.sort((a, b) => FORMAT_ORDER(a) - FORMAT_ORDER(b)) : items;
}
const FORMAT_ORDER = (i: Item) => (i.format === 'flash' ? -1 : FORMATS.indexOf(i.format as Format));
