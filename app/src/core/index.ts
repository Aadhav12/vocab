// Index over the loaded data bundle: homes, families, aliases, lexicon.
import type { DataBundle, GroupData, SetData, TextFile, TopicData, Word } from './types';
import { nounForms, verbForms, stripSich } from './forms';

export interface WordHome { topic: TopicData; group: GroupData; set: SetData; setOrder: number }
export interface FamilyNode { id: string; depth: number }

export interface DataIndex {
  bundle: DataBundle;
  words: Word[];
  byId: Map<string, Word>;       // includes aliases
  home: Map<string, WordHome>;   // keyed by canonical id
  children: Map<string, string[]>;
  sets: { set: SetData; group: GroupData; topic: TopicData; order: number }[];
  setById: Map<string, SetData>;
  groupById: Map<string, GroupData>;
  topicById: Map<string, TopicData>;
  textById: Map<string, TextFile>;
  lexicon: Map<string, string[]>;
  extraTopics: Map<string, Set<string>>; // word -> extra topic ids
}

export function buildIndex(bundle: DataBundle): DataIndex {
  const words: Word[] = [];
  const byId = new Map<string, Word>();
  const home = new Map<string, WordHome>();
  const sets: DataIndex['sets'] = [];
  const setById = new Map<string, SetData>(), groupById = new Map<string, GroupData>(), topicById = new Map<string, TopicData>();
  const textById = new Map<string, TextFile>();
  let order = 0;
  for (const t of bundle.topics) {
    topicById.set(t.id, t);
    t.texts.forEach((x) => textById.set(x.id, x));
    for (const g of t.groups) {
      groupById.set(g.id, g);
      g.texts.forEach((x) => textById.set(x.id, x));
      for (const s of g.sets) {
        setById.set(s.id, s);
        if (s.text) textById.set(s.text.id, s.text);
        sets.push({ set: s, group: g, topic: t, order });
        for (const w of s.words) {
          words.push(w); byId.set(w.id, w);
          for (const a of w.aliases ?? []) if (!byId.has(a)) byId.set(a, w);
          home.set(w.id, { topic: t, group: g, set: s, setOrder: order });
        }
        order++;
      }
    }
  }
  const children = new Map<string, string[]>();
  for (const w of words) {
    const from = w.derivation?.from;
    if (from) {
      const p = byId.get(from);
      if (p) children.set(p.id, [...(children.get(p.id) ?? []), w.id]);
    }
  }
  const extraTopics = new Map<string, Set<string>>();
  for (const w of words) if (w.topics?.length) extraTopics.set(w.id, new Set(w.topics));
  const idx: DataIndex = { bundle, words, byId, home, children, sets, setById, groupById, topicById, textById, lexicon: new Map(), extraTopics };
  idx.lexicon = buildLexicon(idx);
  return idx;
}

export interface TopicSection { name: string | null; topics: { topic: TopicData; index: number }[] }
/**
 * Topics under their `topicGroup` headings, one section after another, in the order each group first appears.
 * Without any topicGroup there is a single unnamed section; topics without one go under "Other topics".
 */
export function groupTopics(topics: TopicData[]): TopicSection[] {
  if (!topics.some((t) => t.topicGroup?.trim())) return [{ name: null, topics: topics.map((topic, index) => ({ topic, index })) }];
  const sections: TopicSection[] = [];
  const byKey = new Map<string, TopicSection>();
  topics.forEach((topic, index) => {
    const name = topic.topicGroup?.trim() || 'Other topics';
    const key = name.toLowerCase();
    let s = byKey.get(key);
    if (!s) { s = { name, topics: [] }; byKey.set(key, s); sections.push(s); }
    s.topics.push({ topic, index });
  });
  return sections;
}

export function resolveId(idx: DataIndex, id: string): string | undefined { return idx.byId.get(id)?.id; }

export function familyRoot(idx: DataIndex, id: string): string {
  let cur = idx.byId.get(id);
  const seen = new Set<string>();
  while (cur?.derivation?.from && !seen.has(cur.id)) {
    seen.add(cur.id);
    const p = idx.byId.get(cur.derivation.from);
    if (!p) break;
    cur = p;
  }
  return cur?.id ?? id;
}

/** Depth-first family listing starting at a root (root included, depth 0). */
export function familyTree(idx: DataIndex, rootId: string): FamilyNode[] {
  const out: FamilyNode[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return; seen.add(id);
    out.push({ id, depth });
    for (const c of idx.children.get(id) ?? []) walk(c, depth + 1);
  };
  walk(rootId, 0);
  return out;
}

export function wordTopicIds(idx: DataIndex, w: Word): string[] {
  const h = idx.home.get(w.id);
  return [h?.topic.id, ...(idx.extraTopics.get(w.id) ?? [])].filter(Boolean) as string[];
}

// ---------- lexicon for reading texts ----------
const ENDINGS = ['', 'e', 'en', 'n', 's', 'es', 'er', 'em', 'te', 'ten', 't', 'st', 'et', 'ete', 'ung', 'ungen'];

export function buildLexicon(idx: DataIndex): Map<string, string[]> {
  const lex = new Map<string, string[]>();
  const add = (form: string | undefined, id: string) => {
    if (!form) return;
    for (const part of form.split(/[\s/]+/)) {
      const k = part.toLowerCase().replace(/[^a-zäöüß]/g, '');
      if (k.length < 2) continue;
      const arr = lex.get(k) ?? [];
      if (!arr.includes(id)) arr.push(id);
      lex.set(k, arr);
    }
  };
  for (const w of idx.words) {
    const lem = stripSich(w.lemma);
    if (w.pos === 'phrase' || w.lemma.includes(' ') && w.pos !== 'verb') {
      // multi-word items: index each long-enough word
      for (const p of w.lemma.split(' ')) if (p.length > 4) add(p, w.id);
      continue;
    }
    add(lem, w.id);
    if (w.pos === 'noun') {
      const nf = nounForms(w);
      if (nf) for (const c of Object.values(nf)) { add(c[0], w.id); add(c[1], w.id); }
    }
    if (w.pos === 'verb') {
      const f = verbForms(w, idx.byId);
      if (f) {
        add(f.praesens3sg.split(' ')[0], w.id); add(f.praeteritum.split(' ')[0], w.id);
        add(f.partizip2, w.id); add(f.du?.split(' ')[0], w.id);
        const pre = f.praesens3sg.split(' ')[1];
        // pretérito of separable verbs: also the stem forms
        if (pre) add(f.partizip2, w.id);
      }
    }
    if (w.pos === 'adj' && w.adj) { add(w.adj.komparativ, w.id); add(w.adj.superlativ?.replace(/^am /, ''), w.id); }
  }
  return lex;
}

export function lookupToken(idx: DataIndex, token: string): string | null {
  const t = token.toLowerCase().replace(/[^a-zäöüß]/g, '');
  if (t.length < 2) return null;
  const direct = idx.lexicon.get(t);
  if (direct) return direct[0];
  // strip a simple ending and retry, then try adding/removing endings
  for (const e of ENDINGS.slice(1)) {
    if (t.length > e.length + 3 && t.endsWith(e)) {
      const stem = t.slice(0, -e.length);
      for (const e2 of ENDINGS) {
        const hit = idx.lexicon.get(stem + e2);
        if (hit) return hit[0];
      }
    }
  }
  return null;
}

/** Split a paragraph into tokens with the word each maps to. */
export function tokenize(idx: DataIndex, text: string): { text: string; wordId: string | null }[] {
  const parts = text.split(/([A-Za-zÄÖÜäöüß]+)/);
  return parts.filter((p) => p !== '').map((p) => (/^[A-Za-zÄÖÜäöüß]+$/.test(p) ? { text: p, wordId: lookupToken(idx, p) } : { text: p, wordId: null }));
}
