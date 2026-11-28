import { describe, expect, it } from 'vitest';
import { checkEnglish, checkNoun, checkPlural, checkWord, germanEq, normEn, checkEnToDe } from './check';
import { adjForms, nounForms, verbForms } from './forms';
import { applyAnswer, bookRechecks, dueCards, introduceWord, mastery, LADDER, markWeak, leechCards, clearLeech } from './srs';
import { buildIndex, lookupToken, familyRoot, familyTree } from './index';
import { buildPath, position, topicStats, syncInserts, insertNode } from './path';
import { FORMATS, emptyProgress } from './types';
import type { Word } from './types';
import { applicable, itemsForFormat, readingItems, parseBrackets, translationItem } from './generate';
import { gradeFields, gradeChoice, matchResults } from './grade';
import { buildRun, sampleWords, scopeWords } from './session';
import { applyToProgress } from './apply';
import { loadData } from '../../server/loader';
import { dataDir } from '../../server/config';

const bundle = loadData(dataDir);
const idx = buildIndex(bundle);
const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const W = (id: string) => idx.byId.get(id)!;

describe('answer checking', () => {
  it('accepts ae/oe/ue/ss for umlauts only where expected has them', () => {
    expect(germanEq('Rueckgang', 'Rückgang')).toBe(true);
    expect(germanEq('Strasse', 'Straße')).toBe(true);
    expect(germanEq('Masse', 'Maße')).toBe(true); // ss accepted where the answer has ß
    expect(germanEq('Maße', 'Masse')).toBe(false); // never converted elsewhere
    expect(germanEq('Maße', 'Maße')).toBe(true);
  });
  it('nouns need article and capital', () => {
    expect(checkNoun('die Bewerbung', 'die Bewerbung').ok).toBe(true);
    expect(checkNoun('Bewerbung', 'die Bewerbung').ok).toBe(false);
    expect(checkNoun('der Bewerbung', 'die Bewerbung').ok).toBe(false);
    expect(checkNoun('die bewerbung', 'die Bewerbung').ok).toBe(false);
    expect(checkNoun('die bewerbung', 'die Bewerbung').note).toMatch(/capital/);
    expect(checkNoun('die Bewerbng', 'die Bewerbung').note).toMatch(/one letter/);
    expect(checkNoun('die Rueckgaenge', 'die Rückgänge').ok).toBe(true);
  });
  it('english ignores case, to/the/a, parentheses, punctuation', () => {
    expect(normEn('To increase (by)')).toBe('increase');
    expect(checkEnglish('The Rise.', ['rise', 'increase']).ok).toBe(true);
    expect(checkEnglish('increase', ['to increase']).ok).toBe(true);
    expect(checkEnglish('decrease', ['to increase']).ok).toBe(false);
  });
  it('plural with or without die', () => {
    expect(checkPlural('die Rückgänge', 'die Rückgänge').ok).toBe(true);
    expect(checkPlural('Rueckgaenge', 'die Rückgänge').ok).toBe(true);
    expect(checkPlural('rückgänge', 'Rückgänge').ok).toBe(false);
  });
  it('reflexive verbs need sich', () => {
    expect(checkWord('bewerben', 'sich bewerben').ok).toBe(false);
    expect(checkWord('sich bewerben', 'sich bewerben').ok).toBe(true);
  });
  it('en→de: a different valid word is "alt", not wrong', () => {
    const r = checkEnToDe('ansteigen', W('steigen'), idx.words);
    expect(r.kind).toBe('alt');
    expect(checkEnToDe('steigen', W('steigen'), idx.words).ok).toBe(true);
  });
});

describe('form generation', () => {
  const f = (id: string) => verbForms(W(id), idx.byId)!;
  it('weak verbs', () => {
    expect([f('stellen').praesens3sg, f('stellen').praeteritum, f('stellen').partizip2]).toEqual(['stellt', 'stellte', 'gestellt']);
    const arbeiten = { id: 'x', lemma: 'arbeiten', pos: 'verb', senses: [], examples: [], verb: { class: 'weak' } } as unknown as Word;
    const g = verbForms(arbeiten, idx.byId)!;
    expect([g.praesens3sg, g.praeteritum, g.partizip2]).toEqual(['arbeitet', 'arbeitete', 'gearbeitet']);
    const stud = { id: 'y', lemma: 'studieren', pos: 'verb', senses: [], examples: [], verb: { class: 'weak' } } as unknown as Word;
    expect(verbForms(stud, idx.byId)!.partizip2).toBe('studiert');
    expect(f('sich-verringern').partizip2).toBe('verringert');
  });
  it('separable conjugatesLike', () => {
    expect([f('ansteigen').praesens3sg, f('ansteigen').praeteritum, f('ansteigen').partizip2, f('ansteigen').aux]).toEqual(['steigt an', 'stieg an', 'angestiegen', 'sein']);
    expect(f('zunehmen').praesens3sg).toBe('nimmt zu');
    expect(f('einstellen').partizip2).toBe('eingestellt');
    expect(f('hervorgehen').aux).toBe('sein');
  });
  it('inseparable conjugatesLike drops ge-', () => {
    expect([f('betragen').praesens3sg, f('betragen').praeteritum, f('betragen').partizip2]).toEqual(['beträgt', 'betrug', 'betragen']);
    expect(f('sich-bewerben').partizip2).toBe('beworben');
    expect(f('befragen').partizip2).toBe('befragt');
    expect(f('ergeben').praeteritum).toBe('ergab');
  });
  it('irregular flags are inherited and aux sein is highlighted', () => {
    expect(f('zunehmen').irregular.has('praeteritum')).toBe(true);
    expect(f('wachsen').irregular.has('aux')).toBe(true);
  });
  it('weak-n, adjectival and strong nouns', () => {
    expect(nounForms(W('der-kollege'))!.Dat[0]).toBe('Kollegen');
    expect(nounForms(W('der-befragte'))!.Dat[0]).toBe('Befragten');
    expect(nounForms(W('der-anstieg'))!.Gen[0]).toBe('Anstiegs');
  });
  it('comparison', () => {
    expect(adjForms(W('stark'))!.komparativ).toBe('stärker');
    expect(adjForms(W('deutlich'))!.superlativ).toBe('am deutlichsten');
  });
});

describe('spaced repetition', () => {
  it('ladder, one promotion per set, reset on miss', () => {
    const p = emptyProgress();
    introduceWord(p, 'a', ['de-en', 'en-de']);
    applyAnswer(p, 'a', 'de-en', true);
    expect(p.cards['a|de-en'].step).toBe(0); // created this set
    p.setCount = 1;
    applyAnswer(p, 'a', 'de-en', true); applyAnswer(p, 'a', 'de-en', true);
    expect(p.cards['a|de-en'].step).toBe(1);
    expect(p.cards['a|de-en'].due).toBe(1 + LADDER[1]);
    p.setCount = 2; applyAnswer(p, 'a', 'de-en', false);
    expect(p.cards['a|de-en'].step).toBe(0);
    expect(p.cards['a|de-en'].misses).toBe(1);
  });
  it('due uses set count, not days; mastery follows the lower card', () => {
    const p = emptyProgress();
    introduceWord(p, 'a', ['de-en', 'en-de']);
    expect(dueCards(p)).toHaveLength(0);
    p.setCount = 1;
    expect(dueCards(p)).toHaveLength(2);
    expect(mastery(p, 'a')).toBe(1);
    p.cards['a|de-en'].step = 4; p.cards['a|en-de'].step = 2;
    expect(mastery(p, 'a')).toBe(3);
    expect(mastery(p, 'zzz')).toBe(0);
  });
  it('clicked words become due, leeches clear', () => {
    const p = emptyProgress(); introduceWord(p, 'a', ['de-en']); p.setCount = 3; p.cards['a|de-en'].due = 9;
    markWeak(p, 'a'); expect(p.cards['a|de-en'].due).toBe(3); expect(p.cards['a|de-en'].misses).toBe(0);
    p.cards['a|de-en'].misses = 6; expect(leechCards(p)).toHaveLength(1);
    clearLeech(p, 'a'); expect(leechCards(p)).toHaveLength(0);
  });
  it('books rechecks at the right set counts', () => {
    const p = emptyProgress(); p.setCount = 1; bookRechecks(p, 'set', 's');
    expect(p.inserts.map((i) => i.dueAt)).toEqual([3, 7, 16]);
    p.inserts = []; bookRechecks(p, 'group', 'g'); expect(p.inserts.map((i) => i.dueAt)).toEqual([9, 26]);
    p.inserts = []; bookRechecks(p, 'topic', 't'); expect(p.inserts.map((i) => i.dueAt)).toEqual([21, 61]);
  });
});

describe('path', () => {
  const path = buildPath(idx);
  it('orders warm-up, intro, flashcards, formats, reading, test per set', () => {
    const ids = path.nodes.filter((n) => n.setId === 'zunahme-abnahme').map((n) => n.id);
    expect(ids.slice(0, 3)).toEqual(['set:zunahme-abnahme:warmup', 'set:zunahme-abnahme:intro', 'set:zunahme-abnahme:flash']);
    expect(ids[ids.length - 1]).toBe('set:zunahme-abnahme:test');
    expect(ids[ids.length - 2]).toBe('set:zunahme-abnahme:reading');
    expect(ids).toContain('set:zunahme-abnahme:fmt:article');
    const fmts = ids.filter((i) => i.includes(':fmt:')).map((i) => i.split(':').pop());
    expect(fmts).toEqual(FORMATS.filter((f) => fmts.includes(f)));
  });
  it('group and topic rounds follow the last set', () => {
    const i = path.nodes.findIndex((n) => n.id === 'group:veraenderungen-beschreiben:quiz');
    expect(path.nodes[i - 1].id).toBe('set:werte-staende:test');
    expect(path.nodes.map((n) => n.id)).toContain('topic:grafiken-statistik:test');
    expect(path.nodes.filter((n) => n.type === 'greading').length).toBe(4);
  });
  it('current node is the first not passed; inserts come first', () => {
    const p = emptyProgress();
    expect(position(idx, path, p).node!.id).toBe('set:zunahme-abnahme:warmup');
    p.passed['set:zunahme-abnahme:warmup'] = { bestScore: 1, attempts: 1, firstPassedAt: '' };
    bookRechecks(p, 'set', 'zunahme-abnahme');
    expect(position(idx, path, p).inserts).toHaveLength(0);
    p.setCount = 2;
    expect(position(idx, path, p).inserts).toHaveLength(1);
    expect(topicStats(idx, path, p, 'grafiken-statistik').done).toBe(1);
  });
  it('inserts a catch-up when more than the limit are due at Introduce', () => {
    const p = emptyProgress(); p.passed['set:zunahme-abnahme:warmup'] = { bestScore: 1, attempts: 1, firstPassedAt: '' };
    p.settings.backlogLimit = 3;
    for (let i = 0; i < 5; i++) { p.introduced['w' + i] = 0; p.cards[`w${i}|de-en`] = { step: 0, due: 0, reps: 0, misses: 0, promotedAt: 0 }; }
    expect(syncInserts(idx, path, p)).toBe(true);
    expect(p.inserts.some((i) => i.kind === 'catchup')).toBe(true);
  });
});

describe('leech drills', () => {
  const path = buildPath(idx);
  it('inserts a leech drill at 6 misses and drills the stubborn card', () => {
    const p = emptyProgress();
    introduceWord(p, 'der-anstieg', ['de-en', 'en-de', 'article']);
    p.cards['der-anstieg|article'].misses = 6;
    expect(syncInserts(idx, path, p)).toBe(true);
    const ins = p.inserts.find((i) => i.kind === 'leech')!;
    expect(ins.wordIds).toEqual(['der-anstieg']);
    expect(syncInserts(idx, path, p)).toBe(false); // not inserted twice
    const node = insertNode(idx, ins);
    const run = buildRun(node, idx, p, rng);
    expect(run.items.some((i) => i.card === 'article')).toBe(true);
    expect(run.passMark).toBe(1);
    clearLeech(p, 'der-anstieg');
    expect(leechCards(p)).toHaveLength(0);
  });
});

describe('families and reading lexicon', () => {
  it('trees cut across sets and topics', () => {
    expect(familyRoot(idx, 'die-zunahme')).toBe('nehmen');
    const ids = familyTree(idx, 'stellen').map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['darstellen', 'einstellen', 'sich-vorstellen', 'die-vorstellung', 'das-vorstellungsgespraech']));
  });
  it('finds inflected forms in texts', () => {
    expect(lookupToken(idx, 'Anstieg')).toBe('der-anstieg');
    expect(lookupToken(idx, 'zugenommen')).toBe('zunehmen');
    expect(lookupToken(idx, 'Rückgänge')).toBe('der-rueckgang');
    expect(lookupToken(idx, 'wuchs')).toBe('wachsen');
    expect(lookupToken(idx, 'Mieten')).toBeNull();
  });
});

describe('exercise generation', () => {
  const ctx = { idx, rng };
  const all = idx.words;
  for (const f of FORMATS) {
    it(`format ${f} yields valid items`, () => {
      const items = itemsForFormat(f, all, ctx);
      expect(items.length, `no items for ${f}`).toBeGreaterThan(0);
      for (const it of items) {
        expect(it.wordId && it.card && it.label).toBeTruthy();
        if (it.mode === 'choice') { expect(it.choices!.length).toBeGreaterThan(1); expect(it.answerIdx).toBeGreaterThanOrEqual(0); }
        if (it.mode === 'fields') { expect(it.fields!.length).toBeGreaterThan(0); for (const fl of it.fields!) expect(fl.expected, `${f}:${it.wordId}`).toBeTruthy(); }
        if (it.mode === 'match') expect(it.board!.left.length).toBeGreaterThanOrEqual(3);
      }
    });
  }
  it('every format applies somewhere in the sample data', () => {
    for (const f of FORMATS) expect(all.some((w) => applicable(f, w, idx)), f).toBe(true);
  });
  it('translation items grade correctly', () => {
    const w = W('der-anstieg');
    const de = translationItem(w, 'de-en', ctx);
    expect(gradeFields(de, ['the rise']).correct).toBe(true);
    expect(gradeFields(de, ['fall']).correct).toBe(false);
    const en = translationItem(w, 'en-de', ctx);
    expect(gradeFields(en, ['der Anstieg']).correct).toBe(true);
    expect(gradeFields(en, ['Anstieg']).correct).toBe(false);
  });
  it('principal parts grade and show du where it changes', () => {
    const it = itemsForFormat('principal', [W('wachsen')], ctx)[0];
    expect(it.fields!.map((f) => f.key)).toEqual(['du', 'p3', 'pret', 'p2', 'aux']);
    const r = gradeFields(it, ['wächst', 'wächst', 'wachste', 'gewachsen', 'sein']);
    expect(r.correct).toBe(false);
    expect(r.perField.map((x) => x.ok)).toEqual([true, true, false, true, true]);
  });
  it('near-synonym blanks only the longest bracket and keeps the clue', () => {
    const it = itemsForFormat('synonyms', [W('abnehmen')], ctx)[0];
    expect(it.sentence).toBe('Der Anteil der Raucher hat stark ___.');
    expect(it.choices![it.answerIdx!]).toBe('abnehmen');
    expect(it.contrast).toMatch(/sein/);
    expect(gradeChoice(it, it.answerIdx!).correct).toBe(true);
  });
  it('match boards mark missed words', () => {
    const [b] = itemsForFormat('match', idx.words.slice(0, 20), ctx);
    const res = matchResults(b, new Set([b.board!.left[0].id]));
    expect(res.filter((r) => !r.correct)).toHaveLength(1);
  });
  it('parses brackets', () => {
    expect(parseBrackets('Der Verkehr [nimmt] jedes Jahr [zu].').filter((s) => s.gap).map((s) => s.text)).toEqual(['nimmt', 'zu']);
  });
  it('reading questions turn into choice items', () => {
    const t = idx.setById.get('zunahme-abnahme')!.text!;
    const its = readingItems(t);
    expect(its).toHaveLength(4);
    expect(gradeChoice(its[0], its[0].answerIdx!).correct).toBe(true);
  });
});

describe('node runs and test scoring', () => {
  const path = buildPath(idx);
  it('a set test is sectioned, sized like the spec, and passes at 90%', () => {
    const p = emptyProgress();
    const node = path.byId.get('set:zunahme-abnahme:test')!;
    const run = buildRun(node, idx, p, rng);
    const bySection = (s: string) => run.items.filter((i) => i.section === s || (s === 'Reading' && i.format === 'reading')).length;
    expect(bySection('Translation')).toBe(16);
    expect(bySection('Article blitz')).toBe(5);
    expect(bySection('Plural')).toBe(4);
    expect(bySection('Reading')).toBe(4);
    expect(run.passMark).toBe(0.9);
    const order = run.items.map((i) => i.section ?? 'Reading');
    expect(order.indexOf('Translation')).toBeLessThan(order.indexOf('Article blitz'));
    expect(order[order.length - 1]).toBe('Reading');
  });
  it('format nodes require every answer; retakes draw fresh questions', () => {
    const p = emptyProgress();
    const node = path.byId.get('set:zunahme-abnahme:fmt:article')!;
    expect(buildRun(node, idx, p, rng).passMark).toBe(1);
    const a = buildRun(node, idx, p, rng).items.map((i) => i.wordId).join('|');
    let differs = false;
    for (let k = 0; k < 6 && !differs; k++) differs = buildRun(node, idx, p, rng).items.map((i) => i.wordId).join('|') !== a;
    expect(differs).toBe(true);
  });
  it('group tests are 1.5x, topic tests 2x', () => {
    const p = emptyProgress();
    const g = buildRun(path.byId.get('group:veraenderungen-beschreiben:test')!, idx, p, rng);
    const t = buildRun(path.byId.get('topic:grafiken-statistik:test')!, idx, p, rng);
    expect(g.items.filter((i) => i.section === 'Translation')).toHaveLength(24);
    expect(t.items.filter((i) => i.section === 'Translation')).toHaveLength(32);
  });
  it('review mix adds earlier-set words to later set format nodes', () => {
    const p = emptyProgress();
    for (const w of scopeWords(idx, 'set', 'zunahme-abnahme')) p.introduced[w.id] = 0;
    const node = path.byId.get('set:schwankungen-wendepunkte:fmt:article')!;
    const run = buildRun(node, idx, p, rng);
    const own = new Set(idx.setById.get('schwankungen-wendepunkte')!.words.map((w) => w.id));
    expect(run.items.some((i) => !own.has(i.wordId))).toBe(true);
  });
  it('weighted sampling prefers weak words', () => {
    const p = emptyProgress();
    const ws = scopeWords(idx, 'set', 'zunahme-abnahme');
    p.cards[`${ws[0].id}|de-en`] = { step: 0, due: 0, reps: 9, misses: 30, promotedAt: 0 };
    let hits = 0;
    for (let i = 0; i < 40; i++) if (sampleWords(ws, 3, p, rng).includes(ws[0])) hits++;
    expect(hits).toBeGreaterThan(25);
  });
  it('warm-ups pass at 90%', () => {
    expect(buildRun(path.byId.get('set:zunahme-abnahme:warmup')!, idx, emptyProgress(), rng).passMark).toBe(0.9);
  });
  it('warm-up has nothing when nothing is due', () => {
    expect(buildRun(path.byId.get('set:zunahme-abnahme:warmup')!, idx, emptyProgress(), rng).empty).toBe(true);
  });
});

describe('review never shows words that are not introduced yet', () => {
  it('family trees in warm-ups only use introduced words', () => {
    const path = buildPath(idx);
    const p = emptyProgress();
    // only nehmen, zunehmen and die Zunahme are introduced; abnehmen / die Abnahme are not
    for (const id of ['nehmen', 'zunehmen', 'die-zunahme']) { p.introduced[id] = 0; }
    p.setCount = 1;
    p.cards['zunehmen|family'] = { step: 0, due: 0, reps: 1, misses: 0, promotedAt: 0 };
    p.cards['die-zunahme|de-en'] = { step: 0, due: 0, reps: 1, misses: 0, promotedAt: 0 };
    let trees = 0;
    for (let k = 0; k < 20; k++) {
      const run = buildRun(path.byId.get('set:schwankungen-wendepunkte:warmup')!, idx, p, rng);
      for (const it of run.items.filter((i) => i.tree)) {
        const shown = [it.main, ...it.fields!.map((f) => f.expected)].join(' ');
        expect(shown).not.toMatch(/abnehmen|Abnahme/);
        trees++;
      }
    }
    expect(trees).toBeGreaterThan(0);
  });
});

describe('applying attempts to progress (shared by the app and `npm run recover`)', () => {
  const path = buildPath(idx);
  const ok = (wordId: string, card: string) => ({ wordId, card, correct: true });
  it('intro introduces words, a first pass opens the next node, a set test raises the set count', () => {
    const p = emptyProgress();
    const warm = path.byId.get('set:zunahme-abnahme:warmup')!, intro = path.byId.get('set:zunahme-abnahme:intro')!;
    applyToProgress(p, idx, path, { node: warm, nodeId: warm.id, results: [], score: 1, passMark: 0.9, prevAttempts: 0, at: new Date('2026-01-01T10:00:00Z') });
    const r = applyToProgress(p, idx, path, { node: intro, nodeId: intro.id, results: [], score: 1, passMark: 1, prevAttempts: 0, introWords: idx.setById.get('zunahme-abnahme')!.words.map((w) => w.id), at: new Date('2026-01-01T10:05:00Z') });
    expect(r.firstPass).toBe(true);
    expect(Object.keys(p.introduced)).toHaveLength(idx.setById.get('zunahme-abnahme')!.words.length);
    expect(position(idx, path, p).node!.id).toBe('set:zunahme-abnahme:flash');
    expect(p.lastAttemptAt).toBe('2026-01-01T10:05:00.000Z');
    const test = path.byId.get('set:zunahme-abnahme:test')!;
    const t = applyToProgress(p, idx, path, { node: test, nodeId: test.id, results: [ok('nehmen', 'de-en')], score: 0.95, passMark: 0.9, prevAttempts: 0, at: new Date('2026-01-01T11:00:00Z') });
    expect(t.setCountUp).toBe(true); expect(p.setCount).toBe(1);
    expect(p.inserts.filter((i) => i.kind === 'recheck').map((i) => i.dueAt)).toEqual([3, 7, 16]);
  });
  it('a failed attempt does not pass the node; a replay changes cards but not the path', () => {
    const p = emptyProgress();
    const n = path.byId.get('set:zunahme-abnahme:fmt:article')!;
    const f = applyToProgress(p, idx, path, { node: n, nodeId: n.id, results: [{ wordId: 'der-anstieg', card: 'article', correct: false }], score: 0, passMark: 1, prevAttempts: 0, at: new Date() });
    expect(f.passed).toBe(false); expect(p.passed[n.id]).toBeUndefined(); expect(p.cards['der-anstieg|article'].misses).toBe(1);
    applyToProgress(p, idx, path, { node: n, nodeId: n.id, results: [ok('der-anstieg', 'article')], score: 1, passMark: 1, prevAttempts: 1, at: new Date() });
    const xp = p.xp;
    const rp = applyToProgress(p, idx, path, { node: n, nodeId: n.id, results: [ok('der-anstieg', 'article')], score: 1, passMark: 1, prevAttempts: 2, at: new Date() });
    expect(rp.replay).toBe(true); expect(p.xp).toBe(xp);
  });
});

describe('the path never contains a step with nothing to ask', () => {
  it('every format step has questions for a learner who has met all words up to that set', () => {
    const path = buildPath(idx);
    const empty: string[] = [];
    for (const n of path.nodes.filter((x) => x.type === 'fmt')) {
      const order = idx.sets.find((x) => x.set.id === n.setId)!.order;
      const p = emptyProgress();
      for (const w of idx.words) if ((idx.home.get(w.id)?.setOrder ?? 99) <= order) p.introduced[w.id] = 0;
      if (!buildRun(n, idx, p, rng).items.length) empty.push(n.id);
    }
    expect(empty).toEqual([]);
  });
});

describe('the mastery schedule documented on the Guide page', () => {
  it('climbs familiar → solid → mastered on the documented sets when reviewed exactly when due', () => {
    const p = emptyProgress(); p.setCount = 4;
    introduceWord(p, 'w', ['de-en', 'en-de']);
    const N = p.setCount + 1; p.setCount = N;       // the introducing set's test has been passed
    const seen: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      while (p.setCount < p.cards['w|de-en'].due) p.setCount++;
      applyAnswer(p, 'w', 'de-en', true); applyAnswer(p, 'w', 'en-de', true);
      seen.push([p.setCount - N + 1, p.cards['w|de-en'].step, mastery(p, 'w')]);
    }
    expect(seen).toEqual([[1, 1, 2], [4, 2, 3], [11, 3, 3], [26, 4, 4]]);
  });
  it('health: overdue means due before the current set count; failed rechecks cost 10 points', () => {
    const path = buildPath(idx); const p = emptyProgress();
    for (const id of ['nehmen', 'zunehmen']) introduceWord(p, id, ['de-en']);
    p.setCount = 3;
    p.cards['nehmen|de-en'].due = 3;                // due now: not overdue
    p.cards['zunehmen|de-en'].due = 2;              // overdue
    expect(topicStats(idx, path, p, 'grafiken-statistik').health).toBeCloseTo(0.5);
    p.cards['zunehmen|de-en'].due = 9;
    expect(topicStats(idx, path, p, 'grafiken-statistik').health).toBeCloseTo(1);
    p.inserts.push({ id: 'recheck:set:zunahme-abnahme:3', kind: 'recheck', level: 'set', scopeId: 'zunahme-abnahme', dueAt: 3 });
    expect(topicStats(idx, path, p, 'grafiken-statistik').health).toBeCloseTo(0.9);
  });
});

describe('data validation', () => {
  it('sample data is clean', () => { expect(bundle.problems).toEqual([]); });
});
