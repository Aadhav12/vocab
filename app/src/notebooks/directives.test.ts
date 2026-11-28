import { describe, expect, it } from 'vitest';
import { buildIndex } from '../core/index';
import { findWordByText } from '../core/lookup';
import { loadData } from '../../server/loader';
import { dataDir } from '../../server/config';
import { START, indentPadding, parseDirectives, renderBlockEx } from './directives';
import { sectionId } from '../ui/WordCard';

const idx = buildIndex(loadData(dataDir));
const R = (src: string, st = START) => renderBlockEx(src, st, idx);
const words = (html: string) => [...html.matchAll(/data-w="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2]]);

describe('[[showwords]]', () => {
  it('leaves ordinary blocks alone', () => {
    const r = R('Der Anstieg der Preise');
    expect(r.html).not.toContain('class="tok"'); expect(r.end).toEqual(START);
  });
  it('underlines vocabulary words only between the markers, in the same block', () => {
    const r = R('Der Anstieg [[showwords]]Der Anstieg der Preise[[/showwords]] Anstieg');
    expect(words(r.html)).toEqual([['der-anstieg', 'Anstieg']]);
    expect(r.html).not.toContain('[['); expect(r.end.show).toBe(false);
  });
  it('finds inflected forms like the reading texts do', () => {
    const ids = words(R('[[showwords]]Die Zahl ist gestiegen und die Rückgänge nahmen zu.[[/showwords]]').html).map((w) => w[0]);
    expect(ids).toEqual(expect.arrayContaining(['die-zahl', 'steigen', 'der-rueckgang']));
  });
  it('a region can span several blocks; marker-only lines become invisible strips', () => {
    const a = R('[[showwords]]');
    expect(a.marker).toBe(true); expect(a.html).toBe(''); expect(a.end.show).toBe(true);
    const b = R('Der Anstieg wächst.\n\n- der Rückgang', a.end);
    expect(words(b.html).map((w) => w[0])).toEqual(expect.arrayContaining(['der-anstieg', 'der-rueckgang']));
    const c = R('[[/showwords]]', b.end);
    expect(c.marker).toBe(true); expect(c.end.show).toBe(false);
    expect(R('Anstieg', c.end).html).not.toContain('class="tok"');
  });
  it('an unclosed region stays open', () => { expect(R('[[showwords]]Anstieg').end.show).toBe(true); });
  it('never annotates code or links; markers in code stay literal', () => {
    const r = R('[[showwords]]`Anstieg` [Anstieg](https://x.org) Anstieg[[/showwords]]');
    expect(words(r.html)).toEqual([['der-anstieg', 'Anstieg']]);
    const f = R('```\n[[showwords]] Anstieg\n```');
    expect(f.html).toContain('[[showwords]]'); expect(f.end.show).toBe(false); expect(f.html).not.toContain('class="tok"');
  });
  it('formatting and escaping', () => {
    const r = R('[[showwords]]**Anstieg** & <b>x</b>[[/showwords]]');
    expect(r.html).toContain('<strong><span class="tok" data-w="der-anstieg">Anstieg</span></strong>');
    expect(r.html).toContain('&amp;'); expect(r.html).not.toContain('<b>');
    expect(R('[[ ShowWords ]]Anstieg[[ /showwords ]]').html).toContain('data-w="der-anstieg"');
  });
});

describe('[[indent]]', () => {
  it('marker lines are invisible and carry the depth to the blocks below', () => {
    const open = R('[[indent]]');
    expect(open.marker).toBe(true); expect(open.html).toBe(''); expect(open.end.indent).toBe(1);
    const text = R('Eingerückter Text', open.end);
    expect(text.indent).toBe(1); expect(text.html).toContain('Eingerückter Text');
    const close = R('[[/indent]]', text.end);
    expect(close.end.indent).toBe(0);
    expect(R('Wieder normal', close.end).indent).toBe(0);
  });
  it('nests, and closing never goes below zero', () => {
    const a = R('[[indent]]'), b = R('[[indent]]', a.end);
    expect(R('x', b.end).indent).toBe(2);
    expect(R('[[/indent]]', R('[[/indent]]', START).end).end.indent).toBe(0);
  });
  it('markers at the start of a block indent that block; markers after its text only affect what follows', () => {
    expect(R('[[indent]]\nText').indent).toBe(1);
    const r = R('Text\n[[indent]]');
    expect(r.indent).toBe(0); expect(r.end.indent).toBe(1);
  });
  it('indent and showwords combine', () => {
    const r = R('[[indent]][[showwords]]Anstieg');
    expect(r.indent).toBe(1); expect(r.end).toEqual({ show: true, indent: 1 }); expect(r.html).toContain('data-w="der-anstieg"');
  });
  it('padding grows with the depth', () => { expect(indentPadding(0)).toBe(12); expect(indentPadding(2)).toBeGreaterThan(indentPadding(1)); });
});

describe('block directives', () => {
  it('parses embeds: word and optional section; only blocks made of directive lines', () => {
    expect(parseDirectives('[[embed:der Anstieg]]')).toEqual([{ kind: 'embed', arg: 'der Anstieg', word: 'der Anstieg' }]);
    expect(parseDirectives('[[embed: der Anstieg # Notes ]]')).toEqual([{ kind: 'embed', arg: 'der Anstieg # Notes', word: 'der Anstieg', section: 'Notes' }]);
    expect(parseDirectives('[[embed:a]]\n[[embed:b#Plural]]')?.map((d) => d.section)).toEqual([undefined, 'Plural']);
    expect(parseDirectives('text [[embed:a]]')).toBeNull();
    expect(parseDirectives('[[embed:a]]\nand more')).toBeNull();
    expect(parseDirectives('[[embed:]]')).toBeNull();
    expect(parseDirectives('')).toBeNull();
  });
  it('parses the data directives, with or without an argument', () => {
    expect(parseDirectives('[[words:set 3 + weak | 10]]')).toEqual([{ kind: 'words', arg: 'set 3 + weak | 10' }]);
    expect(parseDirectives('[[progress]]')).toEqual([{ kind: 'progress', arg: '' }]);
    expect(parseDirectives('[[ Mistakes : 15 ]]')).toEqual([{ kind: 'mistakes', arg: '15' }]);
    expect(parseDirectives('[[words:a]]\n[[verbs:b]]')).toHaveLength(2);
    expect(parseDirectives('[[nonsense:a]]')).toBeNull();
    expect(parseDirectives('[[indent]]')).toBeNull();
  });
  it('a directive block renders as directives, not html, and keeps the state', () => {
    const r = R('[[embed:der Anstieg#Notes]]', { show: true, indent: 1 });
    expect(r.directives).toEqual([{ kind: 'embed', arg: 'der Anstieg#Notes', word: 'der Anstieg', section: 'Notes' }]); expect(r.html).toBe(''); expect(r.end).toEqual({ show: true, indent: 1 });
  });
  it('finds words the way people write them', () => {
    for (const t of ['der Anstieg', 'Anstieg', 'anstieg', 'DER ANSTIEG', 'der-anstieg']) expect(findWordByText(idx, t)?.id, t).toBe('der-anstieg');
    expect(findWordByText(idx, 'Rueckgang')?.id).toBe('der-rueckgang');
    expect(findWordByText(idx, 'die Rückgang')?.id).toBe('der-rueckgang');   // wrong article still finds the word
    expect(findWordByText(idx, 'sich bewerben')?.id).toBe('sich-bewerben');
    expect(findWordByText(idx, 'zunehmen')?.id).toBe('zunehmen');
    expect(findWordByText(idx, 'gibtesnicht')).toBeNull();
    expect(findWordByText(idx, '  ')).toBeNull();
  });
  it('knows the section names (and aliases)', () => {
    expect(sectionId('Notes')).toBe('notes'); expect(sectionId('ANTONYMS')).toBe('opposites'); expect(sectionId('example')).toBe('examples');
    expect(sectionId('Family')).toBe('family'); expect(sectionId('nonsense')).toBeNull();
  });
});

describe('[[word:…]] chips', () => {
  it('turns a word reference into a clickable chip anywhere in a sentence', () => {
    const r = R('Merke dir [[word:der Anstieg]] und [[word:zunehmen]].');
    expect(r.html).toContain('<span class="tok nb-word" data-w="der-anstieg"><span class="art-m">der</span> Anstieg</span>');
    expect(r.html).toContain('data-w="zunehmen">zunehmen</span>');
    expect(r.html).not.toContain('[[');
  });
  it('takes a custom label, and shows unknown words as such', () => {
    expect(R('[[word:der Anstieg|Anstiege]]').html).toContain('data-w="der-anstieg">Anstiege</span>');
    const u = R('[[word:gibtesnicht]]').html;
    expect(u).toContain('nb-missing'); expect(u).toContain('gibtesnicht'); expect(u).not.toContain('data-w');
  });
  it('works inside showwords regions and formatting, but not in code', () => {
    const r = R('[[showwords]]Der **Anstieg** [[word:zunehmen]] Rückgang[[/showwords]]');
    expect(r.html).toContain('data-w="zunehmen"'); expect(r.html).toContain('data-w="der-rueckgang"');
    expect(R('`[[word:zunehmen]]`').html).not.toContain('data-w');
  });
});
