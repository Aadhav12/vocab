// Notebook directives, written in the markdown itself:
//   [[showwords]] … [[/showwords]]   vocabulary words inside get the reading-text underline; click = word card
//   [[indent]] … [[/indent]]         everything inside is indented (they nest)
//   [[embed:der Anstieg]]            the word card, in place (alone in its block)
//   [[embed:der Anstieg#Notes]]      one section of the card
// Regions may span many blocks, so every block is rendered knowing the state it starts in.
import type { DataIndex } from '../core/index';
import { tokenize } from '../core/index';
import { renderBlock } from './markdown';

export interface State { show: boolean; indent: number }
export const START: State = { show: false, indent: 0 };
export interface EmbedRef { word: string; section?: string }
export interface Rendered {
  html: string; end: State;
  indent: number;        // indent depth of the block's content
  marker: boolean;       // the block holds only region markers (shown as an invisible, clickable strip)
  embeds?: EmbedRef[];   // the block is made of [[embed:…]] lines
}

const SHOW_OPEN = /\[\[\s*showwords\s*\]\]/gi;
const SHOW_CLOSE = /\[\[\s*\/\s*showwords\s*\]\]/gi;
const IND_OPEN = /\[\[\s*indent\s*\]\]/gi;
const IND_CLOSE = /\[\[\s*\/\s*indent\s*\]\]/gi;
const HAS_MARKER = /\[\[\s*\/?\s*(showwords|indent)\s*\]\]/i;
const [P_SHOW_OPEN, P_SHOW_CLOSE, P_IND_OPEN, P_IND_CLOSE] = ['', '', '', ''];   // stand-ins that survive markdown
const EMBED_LINE = /^\[\[\s*embed\s*:\s*([^\]#]+?)\s*(?:#\s*([^\]]*?)\s*)?\]\]$/i;
const INDENT_PX = 28;
export const indentPadding = (depth: number) => 12 + depth * INDENT_PX;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** A block made only of [[embed:…]] lines (one per line), or null. */
export function parseEmbeds(src: string): EmbedRef[] | null {
  const lines = src.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const refs: EmbedRef[] = [];
  for (const l of lines) {
    const m = EMBED_LINE.exec(l);
    if (!m) return null;
    refs.push({ word: m[1], ...(m[2] ? { section: m[2] } : {}) });
  }
  return refs;
}

function annotate(textHtml: string, idx: DataIndex): string {
  return tokenize(idx, unesc(textHtml)).map((t) => (t.wordId ? `<span class="tok" data-w="${esc(t.wordId)}">${esc(t.text)}</span>` : esc(t.text))).join('');
}

/**
 * Render one block. `start` is the state carried over from the blocks above; the result carries `end` to the next one.
 * Code, links and form controls are never annotated, and markers inside code stay literal.
 */
export function renderBlockEx(src: string, start: State, idx: DataIndex): Rendered {
  const embeds = parseEmbeds(src);
  if (embeds) return { html: '', end: start, indent: start.indent, marker: false, embeds };
  if (!start.show && !HAS_MARKER.test(src)) return { html: renderBlock(src), end: start, indent: start.indent, marker: false };

  const html = renderBlock(src.replace(SHOW_OPEN, P_SHOW_OPEN).replace(SHOW_CLOSE, P_SHOW_CLOSE).replace(IND_OPEN, P_IND_OPEN).replace(IND_CLOSE, P_IND_CLOSE));
  let show = start.show, indent = start.indent, skip = 0, sawMarker = false;
  let firstIndent: number | null = null;     // depth where the block's visible content begins
  const touch = (t: string) => { if (firstIndent === null && t.replace(/&nbsp;|\s/g, '') !== '') firstIndent = indent; };

  const out = html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      const m = /^<(\/?)(code|pre|a)\b/i.exec(part);
      if (m) skip += m[1] ? -1 : 1;
      if (/^<(hr|img|input)\b/i.test(part) && firstIndent === null) firstIndent = indent;
      return part;
    }
    if (skip > 0) {   // markers in code are plain text
      touch(part);
      return part.replace(//g, '[[showwords]]').replace(//g, '[[/showwords]]').replace(//g, '[[indent]]').replace(//g, '[[/indent]]');
    }
    return part.split(/([-])/).map((piece) => {
      if (piece === P_SHOW_OPEN) { show = true; sawMarker = true; return ''; }
      if (piece === P_SHOW_CLOSE) { show = false; sawMarker = true; return ''; }
      if (piece === P_IND_OPEN) { indent++; sawMarker = true; return ''; }
      if (piece === P_IND_CLOSE) { indent = Math.max(0, indent - 1); sawMarker = true; return ''; }
      touch(piece);
      return show && piece ? annotate(piece, idx) : piece;
    }).join('');
  }).join('');

  const visible = out.replace(/<[^>]+>/g, '').trim() !== '' || /<(hr|img|table|pre|input)\b/i.test(out);
  const end = { show, indent };
  if (!visible && sawMarker) return { html: '', end, indent, marker: true };
  return { html: out, end, indent: firstIndent ?? start.indent, marker: false };
}
