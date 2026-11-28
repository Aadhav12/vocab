import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { blockKind, closeFences, handleEnter, indentLines, joinBlocks, mapClickToSource, splitBlocks, toggleCheckbox, wrapSelection } from '../notebooks/markdown';
import { indentPadding, renderBlockEx, START, type EmbedRef, type Rendered, type State } from '../notebooks/directives';
import { findWordByText } from '../core/lookup';
import { WORD_SECTIONS, WordCard, sectionId } from './WordCard';
import { useStore } from '../store';
import { fmtDate, go, useOpenWord } from './common';

interface Meta { id: string; title: string; created: string; updated: string }
interface Snap { blocks: string[]; active: number | null; caret: number }

const api = async <T,>(url: string, method = 'GET', body?: unknown): Promise<T> => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`server answered ${r.status}`);
  return r.json();
};
const LAST = 'testdaf-last-notebook';
const remember = (id: string) => { try { localStorage.setItem(LAST, id); } catch { /* optional */ } };
const recall = () => { try { return localStorage.getItem(LAST); } catch { return null; } };

// ====================================================================== embeds
/** [[embed:der Anstieg]] / [[embed:der Anstieg#Notes]]: the real word card, in the notebook. */
function Embed({ r }: { r: EmbedRef }) {
  const idx = useStore((x) => x.idx)!;
  const w = findWordByText(idx, r.word);
  if (!w) return <div className="callout red">No word “{r.word}” in the vocabulary.</div>;
  if (!r.section) return <WordCard w={w} />;
  const sec = sectionId(r.section);
  if (!sec) return <div className="callout red">Unknown section “{r.section}”. Available: {Object.values(WORD_SECTIONS).map((n) => n[0]).join(', ')}.</div>;
  return <WordCard w={w} only={sec} />;
}

// ====================================================================== editor
interface EditorApi { focusFirst(): void }

/**
 * Live-preview markdown editor. The document is a list of blocks; the block being typed in shows its raw
 * markdown, every other block is rendered. Enter starts a new block, Shift+Enter a line break inside one.
 */
function Editor({ initial, onChange, apiRef }: { initial: string; onChange: (md: string) => void; apiRef: React.MutableRefObject<EditorApi | null> }) {
  const [blocks, setBlocks] = useState<string[]>(() => { const b = splitBlocks(initial); return b.length ? b : ['']; });
  const [active, setActive] = useState<number | null>(() => (initial.trim() ? null : 0));
  const idx = useStore((x) => x.idx)!;
  const openWord = useOpenWord();
  const root = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const caretReq = useRef<[number, number] | null>(initial.trim() ? null : [0, 0]);
  const latest = useRef({ blocks, active });
  latest.current = { blocks, active };
  const hist = useRef<{ stack: Snap[]; i: number }>({ stack: [{ blocks, active, caret: 0 }], i: 0 });
  const typing = useRef<ReturnType<typeof setTimeout>>();
  const emitted = useRef(joinBlocks(splitBlocks(initial).map(closeFences)));

  // tell the page whenever the text really changes
  useEffect(() => {
    const md = joinBlocks(blocks.map(closeFences));
    if (md === emitted.current) return;
    emitted.current = md;
    onChange(md);
  }, [blocks]); // eslint-disable-line

  // after a state change: put the caret where it was asked to go, and size the textarea to its text
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    if (caretReq.current !== null) {
      t.focus({ preventScroll: false });
      const [a, b] = caretReq.current;
      t.setSelectionRange(Math.min(a, t.value.length), Math.min(b, t.value.length));
      caretReq.current = null;
    }
  });

  // ---- history (document-wide undo / redo)
  const pushSnap = (s: Snap) => {
    const h = hist.current;
    const top = h.stack[h.i];
    if (top && top.active === s.active && top.blocks.length === s.blocks.length && top.blocks.every((b, k) => b === s.blocks[k])) return;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push({ blocks: [...s.blocks], active: s.active, caret: s.caret });
    if (h.stack.length > 300) h.stack.shift();
    h.i = h.stack.length - 1;
  };
  const flushTyping = () => {
    if (typing.current) { clearTimeout(typing.current); typing.current = undefined; pushSnap({ ...latest.current, caret: ta.current?.selectionStart ?? 0 }); }
  };
  // flushSync: the DOM and caret must be updated before the next key arrives, however fast it is typed
  const restore = (s: Snap) => { caretReq.current = [s.caret, s.caret]; flushSync(() => { setBlocks([...s.blocks]); setActive(s.active); }); };
  const undo = () => { flushTyping(); const h = hist.current; if (h.i > 0) { h.i--; restore(h.stack[h.i]); } };
  const redo = () => { const h = hist.current; if (h.i < h.stack.length - 1) { h.i++; restore(h.stack[h.i]); } };

  /** replace the document state in one step and remember it for undo */
  const commit = (arr: string[], act: number | null, caret: number, caretEnd = caret) => {
    if (typing.current) { clearTimeout(typing.current); typing.current = undefined; }
    if (!arr.length) arr = [''];
    caretReq.current = act === null ? null : [caret, caretEnd];
    flushSync(() => { setBlocks(arr); setActive(act); });
    pushSnap({ blocks: arr, active: act, caret });
  };

  /** make block `target` the editing block (null = none); the block we leave is tidied up */
  const goto = (target: number | null, caret: number | 'end' | 'start') => {
    const arr = [...blocks];
    let t = target;
    if (active !== null && active !== target) {
      arr[active] = closeFences(arr[active]);
      if (arr[active].trim() === '' && arr.length > 1) { arr.splice(active, 1); if (t !== null && t > active) t--; }
    }
    if (t !== null && t >= arr.length) t = arr.length - 1;
    const pos = t === null ? 0 : caret === 'end' ? arr[t].length : caret === 'start' ? 0 : caret;
    commit(arr, t, pos);
  };

  apiRef.current = {
    focusFirst: () => {
      if (blocks.length === 1 && blocks[0] === '') goto(0, 0);
      else goto(0, 'end');
    },
  };

  // ---- typing
  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (active === null) return;
    const value = e.target.value;
    const caret = e.target.selectionStart;
    const parts = splitBlocks(value);
    const endsBlank = /\n[ \t]*\n[ \t]*$/.test(value) && parts.length > 0;
    if (parts.length > 1 || endsBlank) {
      // a blank line (typed or pasted) means "new block"
      const arr = [...blocks];
      const pieces = endsBlank ? [...parts, ''] : parts;
      arr.splice(active, 1, ...pieces);
      let idx = pieces.length - 1, pos = pieces[idx].length;
      if (!endsBlank) { // keep the caret in the piece it was typed in
        let from = 0;
        for (let k = 0; k < parts.length; k++) {
          const s = value.indexOf(parts[k], from);
          const eEnd = s + parts[k].length;
          if (caret <= eEnd || k === parts.length - 1) { idx = k; pos = Math.max(0, Math.min(parts[k].length, caret - s)); break; }
          from = eEnd;
        }
      } else pos = 0;
      commit(arr, active + idx, pos);
      return;
    }
    setBlocks((bs) => bs.map((b, k) => (k === active ? value : b)));
    clearTimeout(typing.current);
    typing.current = setTimeout(() => { typing.current = undefined; pushSnap({ ...latest.current, caret: ta.current?.selectionStart ?? 0 }); }, 500);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (active === null || e.nativeEvent.isComposing) return;
    const t = e.currentTarget;
    const value = t.value, s = t.selectionStart, en = t.selectionEnd;
    const mod = e.ctrlKey || e.metaKey;
    const setText = (v: string, a: number, b: number) => {
      const arr = blocks.map((x, k) => (k === active ? v : x));
      commit(arr, active, a, b);
    };

    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (k === 'y') { e.preventDefault(); redo(); return; }
      if (k === 'b' || k === 'i') { e.preventDefault(); const r = wrapSelection(value, s, en, k === 'b' ? '**' : '*'); setText(r.value, r.start, r.end); return; }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); goto(null, 0); return; }

    if (e.key === 'Enter' && !e.shiftKey) {
      const r = handleEnter(value, s, en);
      if (r.kind === 'default') return;
      e.preventDefault();
      if (r.kind === 'edit') { setText(r.value, r.caret, r.caret); return; }
      const arr = [...blocks];
      const keepBefore = r.before.trim() !== '' || arr.length === 1;
      arr.splice(active, 1, ...(keepBefore ? [r.before, r.after] : [r.after]));
      commit(arr, keepBefore ? active + 1 : active, 0);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const r = indentLines(value, s, en, e.shiftKey);
      if (r) setText(r.value, r.start, r.end);
      else if (!e.shiftKey) setText(value.slice(0, s) + '  ' + value.slice(en), s + 2, s + 2);
      return;
    }
    if (e.shiftKey || en !== s) return; // selections keep their normal behaviour
    if (e.key === 'Backspace' && s === 0 && active > 0) {
      e.preventDefault();
      const prev = blocks[active - 1];
      const arr = [...blocks];
      if (value === '') { arr.splice(active, 1); commit(arr, active - 1, prev.length); }
      else { arr.splice(active - 1, 2, prev + '\n' + value); commit(arr, active - 1, prev.length); }
      return;
    }
    if (e.key === 'Delete' && s === value.length && active < blocks.length - 1) {
      e.preventDefault();
      const arr = [...blocks];
      arr.splice(active, 2, value === '' ? blocks[active + 1] : value + '\n' + blocks[active + 1]);
      commit(arr, active, value === '' ? 0 : value.length);
      return;
    }
    const onFirstLine = value.lastIndexOf('\n', s - 1) === -1;
    const onLastLine = value.indexOf('\n', s) === -1;
    if (e.key === 'ArrowUp' && onFirstLine && active > 0) {
      e.preventDefault();
      const prev = blocks[active - 1];
      const ls = prev.lastIndexOf('\n') + 1;
      goto(active - 1, ls + Math.min(s, prev.length - ls));
    } else if (e.key === 'ArrowDown' && onLastLine && active < blocks.length - 1) {
      e.preventDefault();
      const next = blocks[active + 1];
      const nl = next.indexOf('\n');
      const col = s - (value.lastIndexOf('\n', s - 1) + 1);
      goto(active + 1, Math.min(col, nl === -1 ? next.length : nl));
    } else if (e.key === 'ArrowLeft' && s === 0 && active > 0) {
      e.preventDefault(); goto(active - 1, 'end');
    } else if (e.key === 'ArrowRight' && s === value.length && active < blocks.length - 1) {
      e.preventDefault(); goto(active + 1, 'start');
    }
  };

  const gotoRef = useRef(goto);
  gotoRef.current = goto;
  const onBlur = () => {
    setTimeout(() => {
      if (!root.current) return;
      if (!root.current.contains(document.activeElement) && document.hasFocus()) gotoRef.current(null, 0);
    }, 0);
  };

  // ---- clicking a rendered block puts the caret where you clicked
  const clickBlock = (i: number, e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const target = e.target as HTMLElement;
    // an underlined word (inside [[showwords]]) opens its card; Ctrl/Cmd/Alt-click edits the text instead
    const wordEl = target.closest('[data-w]') as HTMLElement | null;
    if (wordEl && !(e.ctrlKey || e.metaKey || e.altKey)) { openWord(wordEl.dataset.w!); return; }
    if (target.matches('input[data-nbcheck]')) {
      const boxes = [...el.querySelectorAll('input[data-nbcheck]')];
      const n = boxes.indexOf(target as HTMLInputElement);
      const arr = blocks.map((b, k) => (k === i ? toggleCheckbox(b, n) : b));
      setBlocks(arr);
      pushSnap({ blocks: arr, active, caret: ta.current?.selectionStart ?? 0 });
      return;
    }
    const link = target.closest('a');
    if (link && (e.ctrlKey || e.metaKey)) return; // ctrl/cmd-click opens the link
    if (link) e.preventDefault();
    let pos = blocks[i].length;
    const doc = document as any;
    let node: Node | null = null, off = 0;
    if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(e.clientX, e.clientY); if (p) { node = p.offsetNode; off = p.offset; } }
    else if (doc.caretRangeFromPoint) { const r = doc.caretRangeFromPoint(e.clientX, e.clientY); if (r) { node = r.startContainer; off = r.startOffset; } }
    if (node && el.contains(node)) {
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(node, off);
      pos = mapClickToSource(blocks[i], el.textContent ?? '', pre.toString().length);
    }
    goto(i, pos);
  };

  const clickTail = () => {
    if (active !== null && active === blocks.length - 1 && blocks[active].trim() === '') { ta.current?.focus(); return; }
    const last = blocks.length - 1;
    if (blocks[last].trim() === '') goto(last, 0);
    else commit([...blocks.map((b, k) => (k === active ? closeFences(b) : b)), ''], blocks.length, 0);
  };

  // rendering: blocks are rendered once and cached; each knows the [[showwords]] / [[indent]] state it starts in
  const cache = useMemo(() => new Map<string, Rendered>(), [idx]);
  const views: Rendered[] = [];
  let carried: State = START;
  for (const b of blocks) {
    const key = `${carried.show ? 1 : 0}${carried.indent}\u0000${b}`;
    let v = cache.get(key);
    if (!v) { v = renderBlockEx(b, carried, idx); if (cache.size > 800) cache.clear(); cache.set(key, v); }
    views.push(v);
    carried = v.end;
  }
  const clickEmbed = (i: number, e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.wc-link')) return;   // links inside the card still work
    goto(i, 'end');
  };

  return (
    <div className="nb-editor" ref={root}>
      {blocks.map((b, i) => {
        const kind = blockKind(b);
        const v = views[i];
        const pad = { paddingLeft: indentPadding(v.indent) };
        if (i === active) {
          return (
            <div key={i} className={`nb-block nb-active k-${kind || 'p'}`} style={pad}>
              <textarea ref={ta} value={b} rows={1} spellCheck={false} autoCapitalize="off" aria-label="Edit block"
                placeholder={blocks.length === 1 ? 'Start typing…  Markdown works: # heading, - list, [ ] task, > quote, ``` code' : ''}
                onChange={onInput} onKeyDown={onKeyDown} onBlur={onBlur} />
            </div>
          );
        }
        if (!b.trim()) return null;
        if (v.embeds) {
          return (
            <div key={i} className="nb-block nb-view nb-embeds" style={pad} onClick={(e) => clickEmbed(i, e)} title="Click to edit the embed">
              {v.embeds.map((r, k) => <div key={k} className="nb-embed"><Embed r={r} /></div>)}
            </div>
          );
        }
        if (v.marker) {   // [[showwords]] / [[indent]] lines: invisible until clicked (or reached with the arrow keys)
          return <div key={i} className="nb-block nb-view nb-hid" title={`${b.trim()} — click to edit`} onClick={() => goto(i, 'end')} />;
        }
        return (
          <div key={i} className={`nb-block nb-view k-${kind || 'p'}`} style={pad} onClick={(e) => clickBlock(i, e)}
            dangerouslySetInnerHTML={{ __html: v.html }} />
        );
      })}
      <div className="nb-tail" onClick={clickTail} title="Click to add text at the end" />
    </div>
  );
}

// ====================================================================== page
type Status = 'saved' | 'saving' | 'error';

export function Notebooks({ id }: { id?: string }) {
  const [list, setList] = useState<Meta[] | null>(null);
  const [cur, setCur] = useState<{ id: string; title: string; body: string } | null>(null);
  const [status, setStatus] = useState<Status>('saved');
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');
  const editorApi = useRef<EditorApi | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const focusTitle = useRef(false);

  // ---- saving: debounced, one request at a time, retried until the server confirms
  const pending = useRef<{ id: string; title?: string; body?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const busy = useRef(false);
  const retry = useRef(2000);
  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (busy.current || !pending.current) return;
    const job = pending.current; pending.current = null; busy.current = true;
    setStatus('saving');
    let failed = false;
    try {
      const r = await api<{ updated: string }>(`/api/notebooks/${job.id}`, 'PUT', { title: job.title, body: job.body });
      retry.current = 2000;
      setList((l) => l && [{ ...(l.find((x) => x.id === job.id) ?? { id: job.id, title: '', created: r.updated }), ...(job.title !== undefined ? { title: job.title } : {}), updated: r.updated }, ...l.filter((x) => x.id !== job.id)]);
      setStatus(pending.current ? 'saving' : 'saved');
    } catch {
      failed = true;
      pending.current = { ...job, ...(pending.current ?? {}) };
      setStatus('error');
      timer.current = setTimeout(() => { void flush(); }, retry.current);
      retry.current = Math.min(retry.current * 2, 30000);
    } finally {
      busy.current = false;
      if (!failed && pending.current) void flush();   // edits that arrived while saving
    }
  }, []);
  const save = useCallback((job: { id: string; title?: string; body?: string }) => {
    pending.current = { ...(pending.current && pending.current.id === job.id ? pending.current : {}), ...job };
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 700);
  }, [flush]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (pending.current || busy.current || status === 'error') { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', f);
    return () => removeEventListener('beforeunload', f);
  }, [status]);
  useEffect(() => () => { void flush(); }, [flush]);   // leaving the page saves what is pending

  // ---- load the list, then the chosen notebook
  const refresh = useCallback(async () => {
    try { setList(await api<Meta[]>('/api/notebooks')); setErr(''); } catch (e: any) { setErr(e.message); setList([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (list === null) return;
    if (!id) {
      const want = recall();
      const target = list.find((n) => n.id === want) ?? list[0];
      if (target) go(`/notebooks/${target.id}`);
      else setCur(null);
      return;
    }
    let dead = false;
    void flush().then(async () => {
      try {
        const n = await api<{ id: string; title: string; body: string }>(`/api/notebooks/${id}`);
        if (!dead) { setCur(n); remember(id); setConfirmDel(false); }
      } catch { if (!dead) { setCur(null); go('/notebooks'); } }
    });
    return () => { dead = true; };
  }, [id, list === null]); // eslint-disable-line

  useEffect(() => {
    if (cur && focusTitle.current) { focusTitle.current = false; titleRef.current?.focus(); titleRef.current?.select(); }
  }, [cur?.id]); // eslint-disable-line

  const create = async () => {
    try {
      await flush();
      const n = await api<Meta & { body: string }>('/api/notebooks', 'POST', { title: 'Untitled' });
      focusTitle.current = true;
      setList((l) => [n, ...(l ?? [])]);
      go(`/notebooks/${n.id}`);
    } catch (e: any) { setErr(e.message); }
  };
  const remove = async () => {
    if (!cur) return;
    try {
      pending.current = null; clearTimeout(timer.current);
      await api(`/api/notebooks/${cur.id}`, 'DELETE');
      const rest = (list ?? []).filter((n) => n.id !== cur.id);
      setList(rest); setCur(null); setConfirmDel(false);
      go(rest[0] ? `/notebooks/${rest[0].id}` : '/notebooks');
    } catch (e: any) { setErr(e.message); }
  };
  const download = () => {
    if (!cur) return;
    const blob = new Blob([cur.body], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(cur.title || 'notebook').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '-') || 'notebook'}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const label = status === 'saved' ? 'saved' : status === 'saving' ? 'saving…' : 'not saved — retrying';

  return (
    <div className="nb-page">
      <aside className="nb-side">
        <div className="card soft">
          <div className="card-h"><span className="label">Notebooks</span><span className="small mono muted">{list?.length ?? 0}</span></div>
          <button className="btn primary nb-new" onClick={create}>+ New notebook</button>
          <div className="nb-list">
            {(list ?? []).map((n) => (
              <a key={n.id} href={`#/notebooks/${n.id}`} className={`choice nb-item ${n.id === id ? 'sel' : ''}`}>
                <span className="nb-item-t">{n.title || 'Untitled'}</span>
                <span className="nb-item-d mono">{n.updated ? fmtDate(n.updated) : ''}</span>
              </a>
            ))}
            {list && !list.length && <div className="small muted">No notebooks yet.</div>}
          </div>
        </div>
      </aside>
      <section className="nb-main">
        {err && <div className="callout red" style={{ marginBottom: 12 }}>Could not reach the server ({err}).</div>}
        {cur ? (
          <div key={cur.id}>
            <div className="sec-h nb-sech">
              <span className="n">md</span>
              <h2><input ref={titleRef} className="nb-title" value={cur.title} placeholder="Untitled" maxLength={200}
                onChange={(e) => { const title = e.target.value; setCur({ ...cur, title }); setList((l) => l && l.map((n) => (n.id === cur.id ? { ...n, title } : n))); save({ id: cur.id, title }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editorApi.current?.focusFirst(); } }} /></h2>
              <span className={`note nb-status ${status}`}>{label}</span>
            </div>
            <div className="card nb-doc">
              <div className="card-h">
                <span className="label">Markdown</span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn ghost nb-small" onClick={download} title="Download as .md">↓ .md</button>
                  {!confirmDel ? <button className="btn ghost nb-small" onClick={() => setConfirmDel(true)}>Delete</button> : (
                    <span className="row" style={{ gap: 6 }}><span className="small">Delete this notebook?</span><button className="btn danger nb-small" onClick={remove}>Delete</button><button className="btn nb-small" onClick={() => setConfirmDel(false)}>Keep</button></span>
                  )}
                </span>
              </div>
              <Editor key={cur.id} initial={cur.body} apiRef={editorApi}
                onChange={(body) => { setCur((c) => (c ? { ...c, body } : c)); save({ id: cur.id, body }); }} />
            </div>
            <div className="annot">Enter new block · Shift+Enter line break · ↑ ↓ move between blocks · Esc finish · Ctrl+B / Ctrl+I · Ctrl+Z undo<br />[[showwords]] … [[/showwords]] underlines vocabulary (click a word for its meaning, Ctrl+click to edit) · [[indent]] … [[/indent]] indents · [[embed:der Anstieg]] or [[embed:der Anstieg#Notes]] embeds a word card.</div>
          </div>
        ) : list !== null && !list.length ? (
          <div className="card" style={{ marginTop: 6 }}>
            <div className="screen-head"><h3>Notebooks</h3><span className="counter">markdown</span></div>
            <p>Write notes in Markdown. Whatever you are typing shows its markdown; everything else is rendered as you go.</p>
            <button className="btn primary" onClick={create}>Create your first notebook</button>
          </div>
        ) : <div className="mono muted small">loading…</div>}
      </section>
    </div>
  );
}
