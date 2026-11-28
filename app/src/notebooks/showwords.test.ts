import { describe, expect, it } from 'vitest';
import { buildIndex } from '../core/index';
import { loadData } from '../../server/loader';
import { dataDir } from '../../server/config';
import { renderWithWords } from './showwords';

const idx = buildIndex(loadData(dataDir));
const words = (html: string) => [...html.matchAll(/data-w="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2]]);

describe('[[showwords]]', () => {
  it('leaves ordinary blocks alone', () => {
    const r = renderWithWords('Der Anstieg der Preise', false, idx);
    expect(r.html).not.toContain('class="tok"'); expect(r.endOpen).toBe(false);
  });
  it('underlines vocabulary words only between the markers, in the same block', () => {
    const r = renderWithWords('Der Anstieg [[showwords]]Der Anstieg der Preise[[/showwords]] Anstieg', false, idx);
    expect(words(r.html)).toEqual([['der-anstieg', 'Anstieg']]);          // only the one inside
    expect(r.html).not.toContain('[[');
    expect(r.endOpen).toBe(false);
  });
  it('finds inflected forms like the reading texts do', () => {
    const r = renderWithWords('[[showwords]]Die Zahl ist gestiegen und die Rückgänge nahmen zu.[[/showwords]]', false, idx);
    const ids = words(r.html).map((w) => w[0]);
    expect(ids).toEqual(expect.arrayContaining(['die-zahl', 'steigen', 'der-rueckgang']));
  });
  it('a region can span several blocks', () => {
    const a = renderWithWords('[[showwords]]', false, idx);
    expect(a.endOpen).toBe(true);
    expect(a.html).toContain('nb-marker'); expect(a.html).toContain('show words');   // a marker-only line stays visible
    const b = renderWithWords('Der Anstieg wächst.\n\n- der Rückgang', true, idx);
    expect(words(b.html).map((w) => w[0])).toEqual(expect.arrayContaining(['der-anstieg', 'der-rueckgang']));
    expect(b.endOpen).toBe(true);
    const c = renderWithWords('[[/showwords]]', true, idx);
    expect(c.endOpen).toBe(false); expect(c.html).toContain('end show words');
    expect(renderWithWords('Anstieg', c.endOpen, idx).html).not.toContain('class="tok"');
  });
  it('an unclosed region stays open to the end', () => {
    expect(renderWithWords('[[showwords]]Anstieg', false, idx).endOpen).toBe(true);
  });
  it('never annotates code, links or fenced code, and keeps markers in code literal', () => {
    const r = renderWithWords('[[showwords]]`Anstieg` [Anstieg](https://x.org) Anstieg[[/showwords]]', false, idx);
    expect(words(r.html)).toEqual([['der-anstieg', 'Anstieg']]);          // only the plain one
    const f = renderWithWords('```\n[[showwords]] Anstieg\n```', false, idx);
    expect(f.html).toContain('[[showwords]]'); expect(f.endOpen).toBe(false); expect(f.html).not.toContain('class="tok"');
  });
  it('works with formatting and escapes text safely', () => {
    const r = renderWithWords('[[showwords]]**Anstieg** & <b>x</b> "Rückgang"[[/showwords]]', false, idx);
    expect(r.html).toContain('<strong><span class="tok" data-w="der-anstieg">Anstieg</span></strong>');
    expect(r.html).toContain('&amp;'); expect(r.html).not.toContain('<b>');
  });
  it('accepts spaces and capitals in the marker', () => {
    expect(renderWithWords('[[ ShowWords ]]Anstieg[[ /showwords ]]', false, idx).html).toContain('data-w="der-anstieg"');
  });
});
