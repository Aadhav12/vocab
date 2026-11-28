import { describe, expect, it } from 'vitest';
import { parseNotebook, serializeNotebook } from './notebooks';

describe('notebook files', () => {
  it('round-trips title, dates and body', () => {
    const n = { id: 'x-1', title: 'Wörter: "Zahlen"', created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z', body: '# Hi\n\n- a\n' };
    expect(parseNotebook('x-1', serializeNotebook(n))).toEqual(n);
  });
  it('reads a plain markdown file without a header', () => {
    const n = parseNotebook('p', '# Just text\n');
    expect(n.body).toBe('# Just text\n'); expect(n.title).toBe('Untitled');
  });
  it('keeps a body that itself contains ---', () => {
    const n = { id: 'a', title: 't', created: 'c', updated: 'u', body: 'above\n\n---\n\nbelow\n' };
    expect(parseNotebook('a', serializeNotebook(n)).body).toBe(n.body);
  });
});
