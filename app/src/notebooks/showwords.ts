// [[showwords]] … [[/showwords]]: inside such a region every word that is in the vocabulary gets the same dotted
// underline as in the reading texts; clicking it opens the word card. A region may span many blocks.
import type { DataIndex } from '../core/index';
import { tokenize } from '../core/index';
import { renderBlock } from './markdown';

const OPEN = /\[\[\s*showwords\s*\]\]/gi;
const CLOSE = /\[\[\s*\/\s*showwords\s*\]\]/gi;
const HAS_MARKER = /\[\[\s*\/?\s*showwords\s*\]\]/i;
const P_OPEN = '', P_CLOSE = '';     // private-use stand-ins that survive markdown rendering

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export interface Rendered { html: string; endOpen: boolean }

/** Wrap known words of one piece of (escaped) text. */
function annotate(textHtml: string, idx: DataIndex): string {
  return tokenize(idx, unesc(textHtml)).map((t) => (t.wordId ? `<span class="tok" data-w="${esc(t.wordId)}">${esc(t.text)}</span>` : esc(t.text))).join('');
}

const bar = (kind: 'open' | 'close') => kind === 'open'
  ? '<div class="nb-marker"><span class="tag cyan">show words</span><i></i></div>'
  : '<div class="nb-marker"><span class="tag">end show words</span><i></i></div>';

/**
 * Render one block. `startOpen` says whether a region from an earlier block is still open; the result says whether
 * one is still open at the end of this block. Code, links and form controls are never annotated.
 */
export function renderWithWords(src: string, startOpen: boolean, idx: DataIndex): Rendered {
  if (!startOpen && !HAS_MARKER.test(src)) return { html: renderBlock(src), endOpen: false };
  const html = renderBlock(src.replace(OPEN, P_OPEN).replace(CLOSE, P_CLOSE));
  let open = startOpen, skip = 0;
  const seq: ('open' | 'close')[] = [];
  const out = html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      const m = /^<(\/?)(code|pre|a)\b/i.exec(part);
      if (m) skip += m[1] ? -1 : 1;
      return part;
    }
    if (skip > 0) return part.replace(//g, '[[showwords]]').replace(//g, '[[/showwords]]'); // markers in code stay literal
    return part.split(/([])/).map((piece) => {
      if (piece === P_OPEN) { open = true; seq.push('open'); return ''; }
      if (piece === P_CLOSE) { open = false; seq.push('close'); return ''; }
      return open && piece ? annotate(piece, idx) : piece;
    }).join('');
  }).join('');
  // a line that holds only a marker would vanish: show a small bar so it can still be seen and clicked
  const visible = out.replace(/<[^>]+>/g, '').trim() !== '' || /<(hr|img|table|pre|input)\b/i.test(out);
  if (!visible && seq.length) return { html: seq.map(bar).join(''), endOpen: open };
  return { html: out, endOpen: open };
}
