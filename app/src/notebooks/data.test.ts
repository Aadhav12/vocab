import { describe, expect, it } from 'vitest';
import { buildIndex } from '../core/index';
import { emptyProgress, type Attempt } from '../core/types';
import { introduceWord } from '../core/srs';
import { loadData } from '../../server/loader';
import { dataDir } from '../../server/config';
import { buildTable, resolveScope, type Ctx } from './data';

const idx = buildIndex(loadData(dataDir));
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ idx, progress: emptyProgress(), attempts: [], ...over });
const ids = (s: { words: { id: string }[] }) => s.words.map((w) => w.id);
const set1 = idx.sets[0].set;

describe('scope language', () => {
  it('finds sets by number, name and id', () => {
    expect(ids(resolveScope(ctx(), 'set 1'))).toEqual(set1.words.map((w) => w.id));
    expect(ids(resolveScope(ctx(), 'set Zunahme und Abnahme'))).toEqual(ids(resolveScope(ctx(), 'set 1')));
    expect(ids(resolveScope(ctx(), 'set zunahme-abnahme'))).toEqual(ids(resolveScope(ctx(), 'set 1')));
    expect(ids(resolveScope(ctx(), '1'))).toEqual(ids(resolveScope(ctx(), 'set 1')));         // a bare number is a set
    expect(ids(resolveScope(ctx(), 'zunahme'))).toEqual(ids(resolveScope(ctx(), 'set 1')));    // a bare name too
  });
  it('groups and topics, ignoring case and umlaut spelling', () => {
    const g = resolveScope(ctx(), 'group veraenderungen');
    expect(g.words.length).toBe(idx.groupById.get('veraenderungen-beschreiben')!.sets.flatMap((s) => s.words).length);
    expect(ids(resolveScope(ctx(), 'TOPIC grafiken'))).toEqual(idx.topicById.get('grafiken-statistik')!.groups.flatMap((x) => x.sets.flatMap((s) => s.words)).map((w) => w.id));
    expect(resolveScope(ctx(), 'topic 2').label).toContain('Arbeit');
  });
  it('adds containers up, and limits', () => {
    expect(resolveScope(ctx(), 'set 1 + set 2').words.length).toBe(idx.sets[0].set.words.length + idx.sets[1].set.words.length);
    const lim = resolveScope(ctx(), 'set 1 | 5');
    expect(lim.words).toHaveLength(5); expect(lim.limit).toBe(5);
  });
  it('filters by state', () => {
    const p = emptyProgress();
    for (const w of set1.words.slice(0, 4)) introduceWord(p, w.id, ['de-en', 'en-de']);
    const c = ctx({ progress: p });
    expect(resolveScope(c, 'set 1 + started').words).toHaveLength(4);
    expect(resolveScope(c, 'set 1 + new').words).toHaveLength(set1.words.length - 4);
    expect(resolveScope(c, 'set 1 + learning').words).toHaveLength(4);
    expect(resolveScope(c, 'set 1 + mastered').words).toHaveLength(0);
    expect(resolveScope(c, 'started').words).toHaveLength(4);
    p.setCount = 1;                                                   // the 4 cards created at set count 0 are due now
    expect(resolveScope(c, 'due').words).toHaveLength(4);
  });
  it('weak = words with misses, worst first', () => {
    const p = emptyProgress();
    const [a, b, c3] = set1.words;
    for (const w of [a, b, c3]) introduceWord(p, w.id, ['de-en']);
    p.cards[`${a.id}|de-en`].misses = 1; p.cards[`${b.id}|de-en`].misses = 5;
    const s = resolveScope(ctx({ progress: p }), 'set 1 + weak');
    expect(ids(s)).toEqual([b.id, a.id]); expect(s.weak).toBe(true);
  });
  it('knows when a scope is exactly one container (for practice links)', () => {
    expect(resolveScope(ctx(), 'set 3').single).toEqual({ level: 'set', id: idx.sets[2].set.id });
    expect(resolveScope(ctx(), 'set 3 + weak').single).toBeUndefined();
    expect(resolveScope(ctx(), 'set 1 + set 2').single).toBeUndefined();
  });
  it('reports what it did not understand', () => {
    const e = resolveScope(ctx(), 'set 99');
    expect(e.error).toMatch(/Don't know “set 99”/); expect(e.error).toMatch(/weak/);
    expect(resolveScope(ctx(), 'blah blah').error).toBeTruthy();
  });
  it('empty scope = everything', () => { expect(resolveScope(ctx(), '').words).toHaveLength(idx.words.length); });
});

describe('tables', () => {
  it('words: German with article, English, set, level — and misses for weak', () => {
    const t = buildTable('words', 'set 1', ctx());
    expect(t.columns).toEqual(['German', 'English', 'Set', 'Level']);
    expect(t.rows).toHaveLength(set1.words.length);
    const anstieg = t.rows.find((r) => r[0].w === 'der-anstieg')!;
    expect(anstieg[0]).toMatchObject({ t: 'Anstieg', art: 'm' }); expect(anstieg[1].t).toContain('rise'); expect(anstieg[2].t).toBe('Set 1'); expect(anstieg[3]).toMatchObject({ t: 'new', dot: 0 });
    expect(buildTable('words', 'set 1 + weak', ctx()).columns).toContain('Misses');
    expect(t.caption).toContain('Words'); expect(t.caption).toContain('Zunahme und Abnahme'); expect(t.caption).toMatch(/· \d+$/);
  });
  it('nouns: plural and genitive; plural-only nouns have no plural cell', () => {
    const t = buildTable('nouns', 'set 1', ctx());
    const row = t.rows.find((r) => r[0].w === 'der-anstieg')!;
    expect(row[1].t).toBe('die Anstiege'); expect(row[2].t).toBe('Anstiegs');
    expect(t.rows.every((r) => r[0].art !== undefined)).toBe(true);
  });
  it('verbs and irregular verbs, with irregular cells flagged', () => {
    const all = buildTable('verbs', 'set 1', ctx());
    const irr = buildTable('irregular', 'set 1', ctx());
    expect(irr.rows.length).toBeGreaterThan(0); expect(irr.rows.length).toBeLessThan(all.rows.length);   // weak verbs are not irregular
    const steigen = irr.rows.find((r) => r[0].w === 'steigen')!;
    expect(steigen.slice(1, 5).map((c) => c.t)).toEqual(['steigt', 'stieg', 'gestiegen', 'sein']);
    expect(steigen[2].irr).toBe(true); expect(steigen[4].irr).toBe(true);
    expect(irr.rows.find((r) => r[0].w === 'zunehmen')![1].t).toBe('nimmt zu');
  });
  it('rektion, synonyms and opposites', () => {
    const rk = buildTable('rektion', 'set 1', ctx());
    expect(rk.rows.some((r) => r[0].w === 'zunehmen' && /um \(Akk\)/.test(r[1].t))).toBe(true);
    const sy = buildTable('synonyms', 'set 1', ctx());
    expect(sy.rows.some((r) => r[0].w === 'abnehmen' && r[1].w === 'sinken' && /sein/.test(r[2].t))).toBe(true);
    const op = buildTable('opposites', 'set 1', ctx());
    const pairs = op.rows.map((r) => [r[0].w, r[1].w].sort().join('|'));
    expect(pairs.filter((x) => x === ['der-anstieg', 'der-rueckgang'].sort().join('|'))).toHaveLength(1);   // each pair once
  });
  it('mistakes: newest first, limited, optionally scoped', () => {
    const mk = (end: string, node: string, items: [string, boolean][]): Attempt => ({
      nodeId: node, attempt: 1, startedAt: end, endedAt: end, durationMs: 1, setCount: 0, replay: false, score: 0, passMark: 1, passed: false,
      items: items.map(([wordId, correct]) => ({ format: 'flash', wordId, card: 'de-en', prompt: `prompt ${wordId}`, expected: `exp ${wordId}`, given: correct ? 'ok' : `wrong ${wordId}`, correct })),
    });
    const attempts = [mk('2026-01-01T10:00:00Z', 'a', [['nehmen', false], ['steigen', true]]), mk('2026-01-02T10:00:00Z', 'b', [['der-anstieg', false], ['text:t1', false]])];
    const t = buildTable('mistakes', '', ctx({ attempts }));
    expect(t.rows.map((r) => r[1].t)).toEqual(['prompt der-anstieg', 'prompt text:t1', 'prompt nehmen']);   // newest attempt first, only wrong answers
    expect(t.rows[1][1].w).toBeUndefined();                                                                   // reading questions have no word to open
    expect(buildTable('mistakes', '2', ctx({ attempts })).rows).toHaveLength(2);
    expect(buildTable('mistakes', 'set 1 | 1', ctx({ attempts })).rows.map((r) => r[1].t)).toEqual(['prompt der-anstieg']);
    expect(buildTable('mistakes', '', ctx()).note).toMatch(/No mistakes/);
  });
  it('a limit applies to the rows of the table, not to the words searched', () => {
    const all = buildTable('irregular', 'set 1', ctx()).rows.length;
    const lim = buildTable('irregular', 'set 1 | 3', ctx());
    expect(lim.rows).toHaveLength(3); expect(lim.caption).toContain(`3 of ${all}`);
    expect(buildTable('words', 'set 1 | 4', ctx()).rows).toHaveLength(4);
  });
  it('shows an error for a scope it does not understand, and a note for an empty result', () => {
    expect(buildTable('words', 'set 99', ctx()).error).toBeTruthy();
    expect(buildTable('words', 'mastered', ctx()).note).toBe('Nothing matches.');
  });
});
