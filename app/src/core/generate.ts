// Exercise item generation for every format.
import type { AnyFormat, CardType, Field, Format, Item, TextFile, Word, Gender } from './types';
import { FORMATS } from './types';
import type { DataIndex } from './index';
import { familyRoot, familyTree } from './index';
import { adjForms, articleFor, isIrregularAdj, isIrregularVerb, nounForms, verbForms, withArticle } from './forms';
import { allEnglish, expectedGerman, normEn } from './check';

export type Rng = () => number;
export const defaultRng: Rng = Math.random;

export function shuffle<T>(a: readonly T[], rng: Rng = defaultRng): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
export const pick = <T,>(a: readonly T[], rng: Rng = defaultRng): T => a[Math.floor(rng() * a.length)];

export interface Ctx { idx: DataIndex; rng: Rng }

let counter = 0;
const nid = (p: string) => `${p}#${++counter}`;

// ---------- bracket parsing ----------
export interface Seg { text: string; gap: boolean }
export function parseBrackets(de: string): Seg[] {
  const out: Seg[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(de))) {
    if (m.index > last) out.push({ text: de.slice(last, m.index), gap: false });
    out.push({ text: m[1], gap: true });
    last = m.index + m[0].length;
  }
  if (last < de.length) out.push({ text: de.slice(last), gap: false });
  return out;
}
export const hasGap = (de: string) => /\[[^\]]+\]/.test(de);
export const plain = (de: string) => de.replace(/[[\]]/g, '');

const senseEn = (w: Word) => w.senses[0]?.en[0] ?? '';
const POS_NAME: Record<string, string> = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', phrase: 'phrase' };
const gen = (w: Word): Gender | undefined => w.noun?.gender ?? undefined;

// ---------- applicability ----------
export function antonymsOf(idx: DataIndex, w: Word): Word[] {
  const out = new Map<string, Word>();
  for (const a of w.antonyms ?? []) { const x = idx.byId.get(a); if (x) out.set(x.id, x); }
  for (const o of idx.words) if (o.antonyms?.some((a) => idx.byId.get(a)?.id === w.id)) out.set(o.id, o);
  return [...out.values()];
}

export interface SynPair { host: Word; other: Word; contrast: string; example: string }
export function synonymPairs(idx: DataIndex): SynPair[] {
  const out: SynPair[] = [];
  for (const w of idx.words) for (const s of w.synonyms ?? []) {
    const o = idx.byId.get(s.id);
    if (o && hasGap(s.example)) out.push({ host: w, other: o, contrast: s.contrast, example: s.example });
  }
  return out;
}

export function familySize(idx: DataIndex, w: Word): number { return familyTree(idx, familyRoot(idx, w.id)).length; }

export function applicable(f: Format | 'flash', w: Word, idx: DataIndex): boolean {
  switch (f) {
    case 'flash': return w.senses.length > 0;
    case 'article': return w.pos === 'noun' && !!w.noun?.gender;
    case 'plural': return w.pos === 'noun' && !!w.noun?.plural && (w.noun.number ?? 'both') === 'both';
    case 'declension': return w.pos === 'noun' && ['weak-n', 'adjectival', 'mixed'].includes(w.noun?.declension ?? '') && declCases(w).length > 0;
    case 'match': return w.senses.length > 0;
    case 'opposites': return antonymsOf(idx, w).length > 0;
    case 'principal': return isIrregularVerb(w, idx.byId);
    case 'comparison': return isIrregularAdj(w) && !!adjForms(w);
    case 'rektion': return !!w.rektion?.some((r) => r.slots.length > 0);
    case 'case': return (w.pos === 'prep' && !!w.prep?.cases?.length) || (w.pos === 'phrase' && !!w.phrase?.governs);
    case 'cloze': return w.examples.some((e) => hasGap(e.de));
    case 'collocation': return !!w.collocations?.some((c) => hasGap(c.de));
    case 'tree': return familySize(idx, w) >= 3;
    case 'formation': return !!w.derivation && ['nominalisation', 'agent', 'adjective', 'adverb', 'prefix-verb'].includes(w.derivation.type) && !!idx.byId.get(w.derivation.from);
    case 'synonyms': return synonymPairs(idx).some((p) => p.host.id === w.id || p.other.id === w.id);
    case 'connectors': return !!w.conj?.drills?.length;
  }
}
export const formatsFor = (w: Word, idx: DataIndex): Format[] => FORMATS.filter((f) => applicable(f, w, idx));

// ---------- translation (flashcards) ----------
const enIndex = new WeakMap<DataIndex, Map<string, Word[]>>();
function englishIndex(idx: DataIndex): Map<string, Word[]> {
  let m = enIndex.get(idx);
  if (!m) {
    m = new Map();
    for (const w of idx.words) for (const e of allEnglish(w)) { const k = normEn(e); m.set(k, [...(m.get(k) ?? []), w]); }
    enIndex.set(idx, m);
  }
  return m;
}

export function translationItem(w: Word, dir: 'de-en' | 'en-de', ctx: Ctx, format: AnyFormat = 'flash'): Item {
  const art = gen(w);
  if (dir === 'de-en') {
    return {
      id: nid('de-en'), format, wordId: w.id, card: 'de-en', mode: 'fields', label: 'German → English',
      main: art ? w.lemma : w.lemma, mainArt: art, sub: POS_NAME[w.pos], speak: withArticle(w),
      fields: [{ key: 'a', label: 'English', expected: allEnglish(w).slice(0, 3).join(' / '), check: 'en', accept: allEnglish(w) }],
    };
  }
  const sense = w.senses.length > 1 ? pick(w.senses, ctx.rng) : w.senses[0];
  const cands = new Map<string, Word>();
  for (const e of sense.en) for (const o of englishIndex(ctx.idx).get(normEn(e)) ?? []) if (o.id !== w.id) cands.set(o.id, o);
  return {
    id: nid('en-de'), format, wordId: w.id, card: 'en-de', mode: 'fields', label: 'English → German',
    main: sense.en.slice(0, 2).join(', '), sub: POS_NAME[w.pos], hint: sense.hint, speak: expectedGerman(w),
    fields: [{ key: 'a', label: 'Deutsch', expected: expectedGerman(w), check: w.pos === 'noun' ? 'noun' : 'word' }],
    altWords: [...cands.values()].map((o) => ({ wordId: o.id, display: expectedGerman(o) })),
  };
}

// ---------- per-format generators (one item per word unless noted) ----------
function articleItem(w: Word): Item {
  const g = w.noun!.gender;
  return {
    id: nid('article'), format: 'article', wordId: w.id, card: 'article', mode: 'choice', label: 'Article', main: w.lemma, sub: senseEn(w),
    choices: ['der', 'die', 'das'], answerIdx: ['m', 'f', 'n'].indexOf(g as string), keyed: true,
  };
}
function pluralItem(w: Word): Item {
  return {
    id: nid('plural'), format: 'plural', wordId: w.id, card: 'plural', mode: 'fields', label: 'Plural', main: w.lemma, mainArt: gen(w), sub: senseEn(w),
    fields: [{ key: 'a', label: 'Plural', expected: `die ${w.noun!.plural}`, check: 'plural', accept: [] }],
  };
}
export function declCases(w: Word): ('Akk' | 'Dat' | 'Gen')[] {
  const f = nounForms(w);
  if (!f) return [];
  return (['Akk', 'Dat', 'Gen'] as const).filter((c) => f[c][0] !== f.Nom[0]);
}
function declensionItem(w: Word, ctx: Ctx): Item {
  const c = pick(declCases(w), ctx.rng);
  const f = nounForms(w)!;
  const prep = { Akk: 'für', Dat: 'mit', Gen: 'wegen' }[c];
  const art = articleFor(w.noun!.gender, c);
  return {
    id: nid('declension'), format: 'declension', wordId: w.id, card: 'declension', mode: 'fields', label: `Put it in the ${c === 'Akk' ? 'accusative' : c === 'Dat' ? 'dative' : 'genitive'}`,
    sentence: `${prep} ${art} ___`, main: undefined, sub: `(${withArticle(w)} · ${senseEn(w)})`,
    fields: [{ key: 'a', label: 'Form', expected: f[c][0], check: 'word' }],
  };
}
function oppositeItem(w: Word, ctx: Ctx): Item {
  const ants = antonymsOf(ctx.idx, w);
  const first = pick(ants, ctx.rng);
  return {
    id: nid('opposites'), format: 'opposites', wordId: w.id, card: 'opposite', mode: 'fields', label: 'Type the opposite', main: w.lemma, mainArt: gen(w), sub: senseEn(w),
    fields: [{ key: 'a', label: 'Opposite', expected: expectedGerman(first), check: first.pos === 'noun' ? 'noun' : 'word', accept: ants.filter((x) => x !== first).map(expectedGerman) }],
  };
}
function principalItem(w: Word, ctx: Ctx): Item {
  const f = verbForms(w, ctx.idx.byId)!;
  const fields: Field[] = [];
  if (f.du) fields.push({ key: 'du', label: 'du', expected: f.du, check: 'word' });
  fields.push({ key: 'p3', label: 'er/sie/es', expected: f.praesens3sg, check: 'word' });
  fields.push({ key: 'pret', label: 'Präteritum', expected: f.praeteritum, check: 'word' });
  fields.push({ key: 'p2', label: 'Partizip II', expected: f.partizip2, check: 'word' });
  fields.push({ key: 'aux', label: 'Hilfsverb', expected: f.aux, check: 'word', accept: f.aux === 'haben/sein' ? ['sein/haben', 'haben / sein', 'sein / haben'] : [] });
  return { id: nid('principal'), format: 'principal', wordId: w.id, card: 'principal', mode: 'fields', label: 'Principal parts', main: w.lemma, sub: senseEn(w), fields };
}
function comparisonItem(w: Word): Item {
  const f = adjForms(w)!;
  return {
    id: nid('comparison'), format: 'comparison', wordId: w.id, card: 'comparison', mode: 'fields', label: 'Comparison', main: w.lemma, sub: senseEn(w),
    fields: [
      { key: 'k', label: 'Komparativ', expected: f.komparativ, check: 'word' },
      { key: 's', label: 'Superlativ', expected: f.superlativ, check: 'word', accept: [f.superlativ.replace(/^am /, '')] },
    ],
  };
}
export function rektionPattern(pattern: string, slots: { prep: string | null }[]): string {
  return pattern.replace(/\{(\d+)\}/g, (_, n) => (slots[+n]?.prep ? '___' : '')).replace(/\s{2,}/g, ' ').trim();
}
function rektionItem(w: Word, ctx: Ctx): Item {
  const r = pick(w.rektion!.filter((x) => x.slots.length > 0), ctx.rng);
  const fields: Field[] = [];
  r.slots.forEach((s, i) => {
    if (s.prep) fields.push({ key: `p${i}`, label: `Gap ${i + 1} · preposition`, expected: s.prep, check: 'prep' });
    fields.push({ key: `c${i}`, label: s.prep ? `Gap ${i + 1} · case` : `Object ${i + 1} · case`, expected: s.case, check: 'choice', choices: ['Akk', 'Dat', 'Gen'] });
  });
  return { id: nid('rektion'), format: 'rektion', wordId: w.id, card: 'rektion', mode: 'fields', label: 'Fill in the prepositions and pick the case', main: w.lemma, mainArt: gen(w), sub: r.en, sentence: rektionPattern(r.pattern, r.slots), fields };
}
const CASE_CHOICES = ['Akk', 'Dat', 'Gen', 'Akk or Dat'];
function caseItems(w: Word, ctx: Ctx): Item[] {
  const items: Item[] = [];
  const cases = w.pos === 'prep' ? w.prep!.cases : [w.phrase!.governs!];
  const label = cases.length > 1 ? cases.join(' or ') : cases[0];
  const choices = [...new Set([...CASE_CHOICES, label])];
  items.push({
    id: nid('case'), format: 'case', wordId: w.id, card: 'case', mode: 'choice', label: 'Which case does it take?', main: w.lemma, sub: senseEn(w),
    choices, answerIdx: choices.indexOf(label),
  });
  const fills = w.prep?.fill ?? [];
  if (fills.length) {
    const f = pick(fills, ctx.rng);
    const segs = parseBrackets(f.de);
    items.push({
      id: nid('case'), format: 'case', wordId: w.id, card: 'case', mode: 'fields', label: 'Fill in the article after the preposition', main: w.lemma,
      sentence: segs.map((s) => (s.gap ? '___' : s.text)).join(''), translation: f.en,
      fields: segs.filter((s) => s.gap).map((s, i) => ({ key: `g${i}`, label: `Gap ${i + 1}`, expected: s.text, check: 'word' as const })),
    });
  }
  return items;
}
function clozeItem(w: Word, ctx: Ctx): Item {
  const ex = pick(w.examples.filter((e) => hasGap(e.de)), ctx.rng);
  const segs = parseBrackets(ex.de);
  return {
    id: nid('cloze'), format: 'cloze', wordId: w.id, card: 'cloze', mode: 'fields', label: 'Fill the gaps',
    sentence: segs.map((s) => (s.gap ? '___' : s.text)).join(''), translation: ex.en, hint: `word: ${senseEn(w)}`,
    fields: segs.filter((s) => s.gap).map((s, i) => ({ key: `g${i}`, label: `Gap ${i + 1}`, expected: s.text, check: 'word' as const })),
  };
}
function collocationItem(w: Word, ctx: Ctx): Item {
  const c = pick(w.collocations!.filter((x) => hasGap(x.de)), ctx.rng);
  const segs = parseBrackets(c.de);
  return {
    id: nid('collocation'), format: 'collocation', wordId: w.id, card: 'collocation', mode: 'fields', label: 'Complete the fixed pairing',
    sentence: segs.map((s) => (s.gap ? '___' : s.text)).join(''), translation: c.en,
    fields: segs.filter((s) => s.gap).map((s, i) => ({ key: `g${i}`, label: `Gap ${i + 1}`, expected: s.text, check: 'word' as const })),
  };
}
const FORMATION_LABEL: Record<string, string> = {
  nominalisation: 'The noun from this word', agent: 'The person who does it', adjective: 'The adjective from this word',
  adverb: 'The adverb from this word', 'prefix-verb': 'The verb built on this one',
};
function formationItem(w: Word, ctx: Ctx): Item {
  const from = ctx.idx.byId.get(w.derivation!.from)!;
  return {
    id: nid('formation'), format: 'formation', wordId: w.id, card: 'formation', mode: 'fields', label: FORMATION_LABEL[w.derivation!.type],
    main: from.lemma, mainArt: gen(from), sub: `${POS_NAME[w.pos]} meaning “${senseEn(w)}”`,
    fields: [{ key: 'a', label: 'Deutsch', expected: expectedGerman(w), check: w.pos === 'noun' ? 'noun' : 'word' }],
  };
}
export function treeItem(w: Word, ctx: Ctx, pool: Set<string>): Item | null {
  const rootId = familyRoot(ctx.idx, w.id);
  const root = ctx.idx.byId.get(rootId)!;
  const tree = familyTree(ctx.idx, rootId);
  const typed = tree.filter((n) => n.depth > 0 && pool.has(n.id));
  if (typed.length < 2) return null;
  const keep = tree.filter((n) => n.depth > 0 && (pool.has(n.id) || tree.some((m) => pool.has(m.id) && isAncestor(ctx.idx, n.id, m.id))));
  const trimmed = keep.slice(0, 8);
  const fields: Field[] = trimmed.map((n, i) => {
    const m = ctx.idx.byId.get(n.id)!;
    const locked = !pool.has(n.id);
    return {
      key: `n${i}`, label: `${POS_NAME[m.pos]} · ${senseEn(m)}`, expected: expectedGerman(m), check: m.pos === 'noun' ? 'noun' : 'word',
      indent: n.depth - 1, locked, prefill: locked ? expectedGerman(m) : undefined,
    };
  });
  const first = trimmed.find((n) => pool.has(n.id))!;
  return { id: nid('tree'), format: 'tree', wordId: first.id, card: 'family', mode: 'fields', label: 'Fill in the family', main: root.lemma, mainArt: gen(root), sub: senseEn(root), fields, tree: true };
}
function isAncestor(idx: DataIndex, anc: string, desc: string): boolean {
  let cur = idx.byId.get(desc);
  const seen = new Set<string>();
  while (cur?.derivation && !seen.has(cur.id)) {
    seen.add(cur.id);
    const p = idx.byId.get(cur.derivation.from);
    if (!p) return false;
    if (p.id === anc) return true;
    cur = p;
  }
  return false;
}

function synonymItem(p: SynPair, ctx: Ctx): Item {
  const segs = parseBrackets(p.example);
  const gaps = segs.filter((s) => s.gap);
  const longest = gaps.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  const sentence = segs.map((s) => (s.gap ? (s === longest ? '___' : s.text) : s.text)).join('');
  const sameExample = p.host.synonyms!.filter((s) => s.example === p.example).map((s) => ctx.idx.byId.get(s.id)!).filter(Boolean);
  const opts = shuffle([p.host, ...sameExample], ctx.rng).slice(0, 4);
  return {
    id: nid('synonyms'), format: 'synonyms', wordId: p.host.id, card: 'synonym', mode: 'choice', label: 'Which word fits here?', sentence, translation: undefined,
    choices: opts.map((o) => o.lemma), answerIdx: opts.indexOf(p.host), keyed: true, contrast: p.contrast,
  };
}
function connectorItem(w: Word, ctx: Ctx): Item {
  const d = pick(w.conj!.drills!, ctx.rng);
  const opts = shuffle([d.correct, ...d.distractors], ctx.rng);
  return {
    id: nid('connectors'), format: 'connectors', wordId: w.id, card: 'connector', mode: 'choice', label: 'Pick the sentence with the right word order', main: w.lemma,
    sub: w.conj?.verbPosition ? `verb position: ${w.conj.verbPosition}` : undefined, choices: opts, answerIdx: opts.indexOf(d.correct), keyed: true,
  };
}
export function matchItems(words: Word[], ctx: Ctx, size = 7): Item[] {
  const pool = shuffle(words.filter((w) => w.senses.length), ctx.rng);
  const boards: Item[] = [];
  for (let i = 0; i < pool.length; i += size) {
    let chunk = pool.slice(i, i + size);
    if (chunk.length < 4 && boards.length) { // merge a short tail into the previous board context by borrowing words
      const extra = pool.filter((w) => !chunk.includes(w)).slice(0, 4 - chunk.length);
      chunk = [...chunk, ...extra];
    }
    const seen = new Set<string>();
    chunk = chunk.filter((w) => { const k = normEn(senseEn(w)); if (seen.has(k)) return false; seen.add(k); return true; });
    if (chunk.length < 3) continue;
    boards.push({
      id: nid('match'), format: 'match', wordId: chunk[0].id, card: 'de-en', mode: 'match', label: 'Match the following',
      board: {
        left: shuffle(chunk, ctx.rng).map((w) => ({ id: w.id, text: withArticle(w) })),
        right: shuffle(chunk, ctx.rng).map((w) => ({ id: w.id, text: senseEn(w) })),
      },
    });
  }
  return boards;
}

/** Items of one format for the given words. Match produces boards; synonyms one per pair. */
export function itemsForFormat(f: Format | 'flash', words: Word[], ctx: Ctx): Item[] {
  const ok = words.filter((w) => applicable(f, w, ctx.idx));
  switch (f) {
    case 'flash': return ok.flatMap((w) => [translationItem(w, 'de-en', ctx), translationItem(w, 'en-de', ctx)]);
    case 'article': return ok.map(articleItem);
    case 'plural': return ok.map(pluralItem);
    case 'declension': return ok.map((w) => declensionItem(w, ctx));
    case 'match': return matchItems(ok, ctx);
    case 'opposites': return ok.map((w) => oppositeItem(w, ctx));
    case 'principal': return ok.map((w) => principalItem(w, ctx));
    case 'comparison': return ok.map(comparisonItem);
    case 'rektion': return ok.map((w) => rektionItem(w, ctx));
    case 'case': return ok.flatMap((w) => caseItems(w, ctx));
    case 'cloze': return ok.map((w) => clozeItem(w, ctx));
    case 'collocation': return ok.map((w) => collocationItem(w, ctx));
    case 'tree': {
      const pool = new Set(words.map((w) => w.id));
      const seenRoots = new Set<string>();
      const out: Item[] = [];
      for (const w of ok) {
        const r = familyRoot(ctx.idx, w.id);
        if (seenRoots.has(r)) continue; seenRoots.add(r);
        const it = treeItem(w, ctx, pool); if (it) out.push(it);
      }
      return out;
    }
    case 'formation': return ok.map((w) => formationItem(w, ctx));
    case 'synonyms': {
      const ids = new Set(ok.map((w) => w.id));
      const seen = new Set<string>();
      return synonymPairs(ctx.idx).filter((p) => (ids.has(p.host.id) || ids.has(p.other.id))).filter((p) => {
        const k = p.host.id + '|' + p.example; if (seen.has(k)) return false; seen.add(k); return true;
      }).map((p) => synonymItem(p, ctx));
    }
    case 'connectors': return ok.map((w) => connectorItem(w, ctx));
  }
}

/** One item for a due review card. */
export function itemForCard(w: Word, card: CardType, ctx: Ctx, pool?: Set<string>): Item | null {
  switch (card) {
    case 'de-en': return translationItem(w, 'de-en', ctx);
    case 'en-de': return translationItem(w, 'en-de', ctx);
    case 'article': return applicable('article', w, ctx.idx) ? articleItem(w) : null;
    case 'plural': return applicable('plural', w, ctx.idx) ? pluralItem(w) : null;
    case 'declension': return applicable('declension', w, ctx.idx) ? declensionItem(w, ctx) : null;
    case 'principal': return applicable('principal', w, ctx.idx) ? principalItem(w, ctx) : null;
    case 'comparison': return applicable('comparison', w, ctx.idx) ? comparisonItem(w) : null;
    case 'rektion': return applicable('rektion', w, ctx.idx) ? rektionItem(w, ctx) : null;
    case 'case': return applicable('case', w, ctx.idx) ? caseItems(w, ctx)[0] : null;
    case 'cloze': return applicable('cloze', w, ctx.idx) ? clozeItem(w, ctx) : null;
    case 'collocation': return applicable('collocation', w, ctx.idx) ? collocationItem(w, ctx) : null;
    case 'family': return applicable('tree', w, ctx.idx) ? treeItem(w, ctx, pool ?? new Set(familyTree(ctx.idx, familyRoot(ctx.idx, w.id)).map((n) => n.id))) : null;
    case 'formation': return applicable('formation', w, ctx.idx) ? formationItem(w, ctx) : null;
    case 'synonym': {
      const p = synonymPairs(ctx.idx).find((x) => x.host.id === w.id || x.other.id === w.id);
      return p ? synonymItem(p, ctx) : null;
    }
    case 'connector': return applicable('connectors', w, ctx.idx) ? connectorItem(w, ctx) : null;
    case 'opposite': return applicable('opposites', w, ctx.idx) ? oppositeItem(w, ctx) : null;
  }
}

// ---------- reading ----------
export function readingItems(text: TextFile, section = 'Reading'): Item[] {
  const passage = { title: text.title, paragraphs: text.paragraphs, textId: text.id };
  return text.questions.map((q, i) => {
    const base = { id: nid('reading'), format: 'reading' as const, wordId: `text:${text.id}`, card: 'cloze' as CardType, section, passage, keyed: true };
    if (q.type === 'rfn') {
      const choices = ['richtig', 'falsch', 'nicht im Text'];
      return { ...base, mode: 'choice' as const, label: `Question ${i + 1}`, main: undefined, sentence: q.prompt, choices, answerIdx: ['richtig', 'falsch', 'nicht_im_text'].indexOf(q.answer) };
    }
    if (q.type === 'mc') return { ...base, mode: 'choice' as const, label: `Question ${i + 1}`, sentence: q.prompt, choices: q.options, answerIdx: q.answer };
    return { ...base, mode: 'choice' as const, label: `Question ${i + 1} · heading`, sentence: `Which heading fits paragraph ${q.paragraph}?`, choices: q.options, answerIdx: q.answer };
  });
}
