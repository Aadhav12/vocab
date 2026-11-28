// Notebook directives, written in the markdown itself:
//   [[showwords]] … [[/showwords]]   vocabulary words inside get the reading-text underline; click = word card
//   [[indent]] … [[/indent]]         everything inside is indented (they nest)
//   [[embed:der Anstieg]]            the word card, in place (alone in its block)
//   [[embed:der Anstieg#Notes]]      one section of the card
//   [[word:der Anstieg]]             an inline word chip (anywhere in a sentence); click = word card
//   [[words:set 3 + weak | 10]] …    tables, a dashboard, mistakes, reading texts, practice buttons: see DIRECTIVE_KINDS
// Regions may span many blocks, so every block is rendered knowing the state it starts in.
import type { DataIndex } from '../core/index';
import { tokenize } from '../core/index';
import { findWordByText } from '../core/lookup';
import { articleFor } from '../core/forms';
import { finishMath, renderBlock, renderBlockRaw } from './markdown';

export interface State { show: boolean; indent: number }
export const START: State = { show: false, indent: 0 };
/** Directives that make a whole block (one per line): they show live data from the app. */
export const DIRECTIVE_KINDS = ['embed', 'words', 'nouns', 'verbs', 'irregular', 'rektion', 'synonyms', 'opposites', 'mistakes', 'progress', 'reading', 'practice'] as const;
export type DirectiveKind = typeof DIRECTIVE_KINDS[number];
export interface Directive { kind: DirectiveKind; arg: string; word?: string; section?: string }   // word/section: for embed
export interface Rendered {
  html: string; end: State;
  indent: number;             // indent depth of the block's content
  marker: boolean;            // the block holds only region markers (shown as an invisible, clickable strip)
  directives?: Directive[];   // the block is made of directive lines ([[embed:…]], [[words:…]], …)
}

const SHOW_OPEN = /\[\[\s*showwords\s*\]\]/gi;
const SHOW_CLOSE = /\[\[\s*\/\s*showwords\s*\]\]/gi;
const IND_OPEN = /\[\[\s*indent\s*\]\]/gi;
const IND_CLOSE = /\[\[\s*\/\s*indent\s*\]\]/gi;
const HAS_MARKER = /\[\[\s*(\/?\s*(showwords|indent)\s*\]\]|word\s*:)/i;
const WORD_CHIP = /\[\[\s*word\s*:\s*([^\]|]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]/gi;
const [P_SHOW_OPEN, P_SHOW_CLOSE, P_IND_OPEN, P_IND_CLOSE] = ['', '', '', ''];   // stand-ins that survive markdown
const DIRECTIVE_LINE = new RegExp(`^\\[\\[\\s*(${DIRECTIVE_KINDS.join('|')})\\s*(?::\\s*(.*?))?\\s*\\]\\]$`, 'i');
const INDENT_PX = 28;
export const indentPadding = (depth: number) => 12 + depth * INDENT_PX;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** A block made only of directive lines (one per line), or null. */
export function parseDirectives(src: string): Directive[] | null {
  const lines = src.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const out: Directive[] = [];
  for (const l of lines) {
    const m = DIRECTIVE_LINE.exec(l);
    if (!m) return null;
    const kind = m[1].toLowerCase() as DirectiveKind;
    const arg = (m[2] ?? '').trim();
    if (kind === 'embed') {
      if (!arg) return null;
      const hash = arg.indexOf('#');
      out.push({ kind, arg, word: (hash < 0 ? arg : arg.slice(0, hash)).trim(), ...(hash >= 0 && arg.slice(hash + 1).trim() ? { section: arg.slice(hash + 1).trim() } : {}) });
    } else out.push({ kind, arg });
  }
  return out;
}

/** [[word:der Anstieg]] / [[word:der Anstieg|Anstiege]] -> a clickable chip; unknown words show in red. */
function chip(refHtml: string, labelHtml: string | undefined, idx: DataIndex): string {
  const ref = unesc(refHtml);
  const w = findWordByText(idx, ref);
  const label = labelHtml !== undefined && labelHtml !== '' ? esc(unesc(labelHtml)) : w ? `${w.noun ? `<span class="art-${w.noun.gender ?? 'f'}">${articleFor(w.noun.gender, 'Nom')}</span> ` : ''}${esc(w.lemma)}` : esc(ref);
  return w ? `<span class="tok nb-word" data-w="${esc(w.id)}">${label}</span>` : `<span class="nb-missing" title="No word “${esc(ref)}” in the vocabulary">${label}</span>`;
}
function withChips(textHtml: string, show: boolean, idx: DataIndex): string {
  let out = '', last = 0;
  for (const m of textHtml.matchAll(WORD_CHIP)) {
    const before = textHtml.slice(last, m.index);
    out += show && before ? annotate(before, idx) : before;
    out += chip(m[1], m[2], idx);
    last = m.index! + m[0].length;
  }
  const rest = textHtml.slice(last);
  return out + (show && rest ? annotate(rest, idx) : rest);
}

function annotate(textHtml: string, idx: DataIndex): string {
  return tokenize(idx, unesc(textHtml)).map((t) => (t.wordId ? `<span class="tok" data-w="${esc(t.wordId)}">${esc(t.text)}</span>` : esc(t.text))).join('');
}

/**
 * Render one block. `start` is the state carried over from the blocks above; the result carries `end` to the next one.
 * Code, links and form controls are never annotated, and markers inside code stay literal.
 */
export function renderBlockEx(src: string, start: State, idx: DataIndex): Rendered {
  const directives = parseDirectives(src);
  if (directives) return { html: '', end: start, indent: start.indent, marker: false, directives };
  if (!start.show && !HAS_MARKER.test(src)) return { html: renderBlock(src), end: start, indent: start.indent, marker: false };

  const raw = renderBlockRaw(src.replace(SHOW_OPEN, P_SHOW_OPEN).replace(SHOW_CLOSE, P_SHOW_CLOSE).replace(IND_OPEN, P_IND_OPEN).replace(IND_CLOSE, P_IND_CLOSE));
  const html = raw.html;
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
      return piece ? withChips(piece, show, idx) : piece;
    }).join('');
  }).join('');
  const done = finishMath(out, raw.math);

  const visible = out.replace(/<[^>]+>/g, '').trim() !== '' || /<(hr|img|table|pre|input)\b/i.test(out);
  const end = { show, indent };
  if (!visible && sawMarker) return { html: '', end, indent, marker: true };
  return { html: done, end, indent: firstIndent ?? start.indent, marker: false };
}
