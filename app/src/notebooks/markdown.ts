// Pure helpers for the notebook editor. A document is a list of markdown *blocks* (paragraph, heading, list,
// quote, table, fenced code …). The block being typed in is shown as raw markdown; all others are rendered.
import { Marked } from 'marked';
import katex from 'katex';

// ---------------------------------------------------------------- blocks
// a "fence" is ``` / ~~~ code, or a $$ line that opens a multi-line display-math block
const OPENER = /^\s{0,3}(`{3,}|~{3,}|\$\$(?=[ \t]*$))/;
const closerFor = (fence: string) => (fence === '$$' ? /^\s{0,3}\$\$[ \t]*$/ : new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`));

/** Split markdown into blocks: separated by blank lines; a fenced code block is always one block. */
export function splitBlocks(md: string): string[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let cur: string[] = [];
  let fence: string | null = null;
  const flush = () => { if (cur.length) { out.push(cur.join('\n')); cur = []; } };
  for (const line of lines) {
    if (fence) {
      cur.push(line);
      if (closerFor(fence).test(line)) { fence = null; flush(); }
      continue;
    }
    const m = OPENER.exec(line);
    if (m) { flush(); fence = m[1]; cur.push(line); continue; }
    if (line.trim() === '') { flush(); continue; }
    cur.push(line);
  }
  flush();
  return out;
}

export function joinBlocks(blocks: string[]): string {
  const b = blocks.filter((x) => x.trim() !== '');
  return b.length ? b.join('\n\n') + '\n' : '';
}

/** The fence marker still open at the end of the text (an unclosed ``` block), if any. */
export function openFence(text: string): string | null {
  let fence: string | null = null;
  for (const line of text.split('\n')) {
    if (fence) { if (closerFor(fence).test(line)) fence = null; continue; }
    const m = OPENER.exec(line);
    if (m) fence = m[1];
  }
  return fence;
}
/** An unclosed fence would swallow the blocks after it, so close it when the block is left. */
export function closeFences(text: string): string {
  const f = openFence(text);
  return f ? `${text}\n${f}` : text;
}

/** How the raw block should look while editing (matches the rendered size so nothing jumps). */
export function blockKind(text: string): string {
  const h = /^(#{1,6})\s/.exec(text);
  if (h) return `h${h[1].length}`;
  const o = OPENER.exec(text.split('\n')[0]);
  if (o) return o[1] === '$$' ? 'math' : 'code';
  return '';
}

// ---------------------------------------------------------------- Enter, lists, quotes, tables, code
export type EnterResult =
  | { kind: 'default' }                                   // let the textarea insert a plain newline
  | { kind: 'edit'; value: string; caret: number }        // replace the block's text
  | { kind: 'split'; before: string; after: string };     // end this block, start a new one

const LIST = /^(\s*)([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/;
const QUOTE = /^\s{0,3}(?:>[ \t]?)+/;
const TABLE_EMPTY = /^\s*\|(\s*\|)*\s*$/;

function lineBounds(value: string, pos: number): [number, number] {
  const s = value.lastIndexOf('\n', pos - 1) + 1;
  let e = value.indexOf('\n', pos);
  if (e < 0) e = value.length;
  return [s, e];
}
const exitBlock = (value: string, ls: number, le: number): EnterResult => ({
  kind: 'split', before: value.slice(0, ls).replace(/\n$/, ''), after: le < value.length ? value.slice(le + 1) : '',
});

export function handleEnter(value: string, start: number, end: number): EnterResult {
  if (start !== end) { value = value.slice(0, start) + value.slice(end); end = start; }
  const [ls, le] = lineBounds(value, start);
  const line = value.slice(ls, le);
  const atEnd = start === le;

  // fenced code: the opener line gets its closing fence; inside code Enter is a plain newline
  let fence: string | null = null;
  const before = value.slice(0, ls).split('\n');
  if (ls > 0 || before.length) {
    for (const l of (ls === 0 ? [] : before)) {
      if (fence) { if (closerFor(fence).test(l)) fence = null; continue; }
      const m = OPENER.exec(l); if (m) fence = m[1];
    }
  }
  if (fence) {
    if (closerFor(fence).test(line) && atEnd) return { kind: 'split', before: value.slice(0, le), after: value.slice(le + 1) };
    return { kind: 'default' };
  }
  const op = OPENER.exec(line);
  if (op) {
    const rest = value.slice(le + 1);
    const closed = rest.split('\n').some((l) => closerFor(op[1]).test(l));
    if (!closed && atEnd) return { kind: 'edit', value: `${value.slice(0, start)}\n\n${op[1]}${value.slice(start)}`, caret: start + 1 };
    return { kind: 'default' };
  }

  // lists (bullets, numbers, task items)
  const lm = LIST.exec(line);
  if (lm) {
    if (start < ls + lm[0].length) return { kind: 'default' };
    if (line.slice(lm[0].length).trim() === '' && atEnd) return exitBlock(value, ls, le);
    const marker = /^\d/.test(lm[2]) ? `${parseInt(lm[2], 10) + 1}${lm[2].slice(-1)}` : lm[2];
    const prefix = `${lm[1]}${marker} ${lm[3] ? '[ ] ' : ''}`;
    return { kind: 'edit', value: `${value.slice(0, start)}\n${prefix}${value.slice(start)}`, caret: start + 1 + prefix.length };
  }
  // block quotes
  const qm = QUOTE.exec(line);
  if (qm) {
    if (start < ls + qm[0].length) return { kind: 'default' };
    if (line.slice(qm[0].length).trim() === '' && atEnd) return exitBlock(value, ls, le);
    const prefix = qm[0].endsWith(' ') ? qm[0] : qm[0] + ' ';
    return { kind: 'edit', value: `${value.slice(0, start)}\n${prefix}${value.slice(start)}`, caret: start + 1 + prefix.length };
  }
  // tables: after a header row Enter adds the separator; later rows continue the table; an empty row ends it
  if (/^\s*\|/.test(line) && atEnd) {
    if (TABLE_EMPTY.test(line)) return exitBlock(value, ls, le);
    // Enter after a lone header row writes the |---| separator and starts the first body row
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').length;
    if (ls === 0 && !value.includes('\n') && cells >= 1 && line.trim().length > 1) {
      const add = `\n|${'---|'.repeat(cells)}\n| `;
      return { kind: 'edit', value: value + add, caret: value.length + add.length };
    }
    return { kind: 'edit', value: `${value.slice(0, start)}\n| ${value.slice(start)}`, caret: start + 3 };
  }
  return { kind: 'split', before: value.slice(0, start), after: value.slice(start) };
}

/** Tab / Shift+Tab inside a list: indent or outdent the selected lines. null = not in a list, use the default. */
export function indentLines(value: string, start: number, end: number, outdent: boolean): { value: string; start: number; end: number } | null {
  const [s0] = lineBounds(value, start);
  const [, e1] = lineBounds(value, Math.max(start, end));
  const lines = value.slice(s0, e1).split('\n');
  if (!LIST.test(lines[0])) return null;
  let firstDelta = 0, total = 0;
  const out = lines.map((l, i) => {
    let d = 0, r = l;
    if (outdent) { const m = /^( {1,2}|\t)/.exec(l); if (m) { r = l.slice(m[0].length); d = -m[0].length; } }
    else { r = '  ' + l; d = 2; }
    if (i === 0) firstDelta = d;
    total += d;
    return r;
  });
  return { value: value.slice(0, s0) + out.join('\n') + value.slice(e1), start: Math.max(s0, start + firstDelta), end: Math.max(s0, end + total) };
}

/** Ctrl+B / Ctrl+I: wrap the selection (or unwrap it if it is already wrapped). */
export function wrapSelection(value: string, start: number, end: number, mark: string): { value: string; start: number; end: number } {
  const n = mark.length;
  if (start === end) return { value: value.slice(0, start) + mark + mark + value.slice(end), start: start + n, end: start + n };
  if (value.slice(start - n, start) === mark && value.slice(end, end + n) === mark) {
    return { value: value.slice(0, start - n) + value.slice(start, end) + value.slice(end + n), start: start - n, end: end - n };
  }
  return { value: value.slice(0, start) + mark + value.slice(start, end) + mark + value.slice(end), start: start + n, end: end + n };
}

// ---------------------------------------------------------------- clicking into a rendered block
/** Map a position in the rendered text back to a caret position in the markdown source. */
export function mapClickToSource(raw: string, rendered: string, offset: number): number {
  let i = 0;
  for (let j = 0; j < Math.min(offset, rendered.length); j++) {
    const ch = rendered[j];
    if (/\s/.test(ch)) { continue; }
    const k = raw.indexOf(ch, i);
    if (k < 0) break;
    i = k + 1;
  }
  if (offset > 0 && /\s/.test(rendered[offset - 1] ?? '') && /[ \t]/.test(raw[i] ?? '')) i++;
  return Math.min(i, raw.length);
}

/** Flip the n-th task-list checkbox in a block's markdown. */
export function toggleCheckbox(raw: string, n: number): string {
  let k = -1;
  return raw.replace(/^(\s*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/gm, (m, pre: string, c: string) => {
    k++;
    return k === n ? `${pre}[${c === ' ' ? 'x' : ' '}]` : m;
  });
}

// ---------------------------------------------------------------- rendering
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- LaTeX (KaTeX): $x$ and \(x\) inline, $$x$$ and \[x\] display, and a multi-line block between two `$$` lines.
// Rendered math is kept aside and put back after the HTML is built, so later passes (word underlining) never see it.
let mathStore: string[] | null = null;
const PH_OPEN = '\uE020', PH_CLOSE = '\uE021';
function stash(tex: string, display: boolean, block = false): string {
  let inner: string;
  try { inner = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false }); }
  catch { inner = `<span class="nb-mathfail">${esc(tex)}</span>`; }
  const tag = block ? 'div' : 'span';
  const store = mathStore ?? (mathStore = []);
  store.push(`<${tag} class="nb-math${display ? ' nb-math-display' : ''}" data-tex="${esc(tex)}">${inner}</${tag}>`);
  return `${PH_OPEN}${store.length - 1}${PH_CLOSE}`;
}
const INLINE_MATH: [RegExp, boolean][] = [
  [/^\$\$([\s\S]+?)\$\$/, true],
  [/^\\\[([\s\S]+?)\\\]/, true],
  [/^\\\(([\s\S]+?)\\\)/, false],
  [/^\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/, false],   // "$5 and $10" is money, not math
];

const md = new Marked({ gfm: true, breaks: true });
md.use({
  extensions: [
    {
      name: 'mathBlock', level: 'block',
      start(src: string) { const m = /(?:^|\n)\$\$[ \t]*\n/.exec(src); return m ? m.index + (m[0].startsWith('\n') ? 1 : 0) : undefined; },
      tokenizer(src: string) { const m = /^\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src); if (m) return { type: 'mathBlock', raw: m[0], tex: m[1].trim() }; },
      renderer(t: any) { return stash(t.tex, true, true); },
    },
    {
      name: 'mathInline', level: 'inline',
      start(src: string) { const i = src.search(/\$|\\\(|\\\[/); return i < 0 ? undefined : i; },
      tokenizer(src: string) {
        for (const [re, display] of INLINE_MATH) { const m = re.exec(src); if (m) return { type: 'mathInline', raw: m[0], tex: m[1].trim(), display }; }
      },
      renderer(t: any) { return stash(t.tex, t.display); },
    },
  ],
});
md.use({
  renderer: {
    // raw HTML in notes is shown as text, never executed
    html(token) { return esc(token.text); },
    checkbox({ checked }) { return `<input type="checkbox" data-nbcheck${checked ? ' checked' : ''}> `; },
    link(this: any, { href, title, tokens }) {
      const safe = /^\s*(javascript|data|vbscript):/i.test(href) ? '#' : href;
      return `<a href="${esc(safe)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener noreferrer">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

/** HTML with math still as placeholders (see finishMath). */
export function renderBlockRaw(src: string): { html: string; math: string[] } {
  mathStore = [];
  try {
    const html = (md.parse(src, { async: false }) as string).replace(/<table>/g, '<table class="tbl">');   // tables reuse the site's table style
    return { html, math: mathStore };
  } finally { mathStore = null; }
}
export const finishMath = (html: string, math: string[]) => html.replace(/\uE020(\d+)\uE021/g, (_, n) => math[+n] ?? '');

export function renderBlock(src: string): string {
  if (!src.trim()) return '';
  const r = renderBlockRaw(src);
  return finishMath(r.html, r.math);
}
