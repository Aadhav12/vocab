import { useEffect, useRef, useState } from 'react';
import { canMoveFolder, joinPath, nameOf, parentOf, searchNotebooks, type FolderNode, type Meta } from '../notebooks/tree';
import { fmtDate } from './common';

const KEY = 'testdaf-nb-collapsed';
const loadCollapsed = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return new Set(); } };
const saveCollapsed = (s: Set<string>) => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* optional */ } };
export const nbHref = (id: string) => `#/notebooks/${encodeURIComponent(id)}`;

export interface TreeProps {
  root: FolderNode; all: Meta[]; currentId?: string; activeFolder: string;
  onActive(folder: string): void;
  onNewNotebook(folder: string): void;
  onNewFolder(parent: string, name: string): Promise<void>;
  onRenameFolder(path: string, newName: string): Promise<void>;
  onMoveFolder(path: string, toParent: string): Promise<void>;
  onDeleteFolder(path: string): Promise<void>;
  onMoveNotebook(id: string, folder: string): Promise<void>;
}
type Prompt = null | { kind: 'newfolder' } | { kind: 'rename' } | { kind: 'delete' };

/** Folder tree for the notebooks: click folders to open/close and select them, drag notebooks and folders onto folders. */
export function NotebookTree(p: TreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [q, setQ] = useState('');
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{ kind: 'nb' | 'folder'; id: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (path: string, open?: boolean) => setCollapsed((c) => {
    const n = new Set(c); const isOpen = !c.has(path);
    if ((open ?? !isOpen) === true) n.delete(path); else n.add(path);
    saveCollapsed(n); return n;
  });
  // opening a notebook reveals its folder
  useEffect(() => {
    const f = p.currentId?.includes('/') ? p.currentId.slice(0, p.currentId.lastIndexOf('/')) : '';
    if (!f) return;
    setCollapsed((c) => {
      const n = new Set(c); let changed = false;
      for (let cur = f; cur; cur = parentOf(cur)) if (n.delete(cur)) changed = true;
      if (changed) saveCollapsed(n);
      return changed ? n : c;
    });
  }, [p.currentId]);
  useEffect(() => { if (prompt && prompt.kind !== 'delete') { inputRef.current?.focus(); inputRef.current?.select(); } }, [prompt]);

  const run = async (fn: () => Promise<void>) => { try { setErr(''); await fn(); } catch (e: any) { setErr(e.message ?? 'failed'); } };
  const submit = () => run(async () => {
    const name = text.trim();
    if (prompt?.kind === 'newfolder') { if (!name) return; await p.onNewFolder(p.activeFolder, name); toggle(p.activeFolder, true); }
    else if (prompt?.kind === 'rename') { if (!name || name === nameOf(p.activeFolder)) { setPrompt(null); return; } await p.onRenameFolder(p.activeFolder, name); }
    setPrompt(null); setText('');
  });
  const open = (kind: 'newfolder' | 'rename' | 'delete') => { setErr(''); setText(kind === 'rename' ? nameOf(p.activeFolder) : ''); setPrompt({ kind }); };

  // ---- drag and drop
  const dropOn = (folder: string) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(null);
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.kind === 'nb') { if (parentOf(d.id) !== folder) void run(() => p.onMoveNotebook(d.id, folder)); }
    else if (canMoveFolder(d.id, folder)) void run(() => p.onMoveFolder(d.id, folder));
  };
  const allowDrop = (folder: string) => (e: React.DragEvent) => {
    const d = drag.current;
    if (!d || (d.kind === 'folder' && !canMoveFolder(d.id, folder)) || (d.kind === 'nb' && parentOf(d.id) === folder)) return;
    e.preventDefault(); e.stopPropagation(); setOver(folder);
  };
  const startDrag = (kind: 'nb' | 'folder', id: string) => (e: React.DragEvent) => { drag.current = { kind, id }; e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); };
  const endDrag = () => { drag.current = null; setOver(null); };

  // plain render functions, not components: a component defined here would be re-created on every hover and cancel the drag in progress
  const notebookRow = (n: Meta, depth: number, showPath = false) => (
    <a key={n.id} href={nbHref(n.id)} draggable onDragStart={startDrag('nb', n.id)} onDragEnd={endDrag}
      className={`choice nb-item ${n.id === p.currentId ? 'sel' : ''}`} style={{ marginLeft: depth * 14 }} title={showPath && n.folder ? `${n.folder} / ${n.title}` : n.title}>
      <span className="nb-item-t">{n.title || 'Untitled'}{showPath && n.folder && <span className="nb-item-path"> · {n.folder}</span>}</span>
      <span className="nb-item-d mono">{n.updated ? fmtDate(n.updated) : ''}</span>
    </a>
  );

  const folderRow = (f: FolderNode, depth: number): React.ReactNode => {
    const isOpen = !collapsed.has(f.path);
    const act = () => { toggle(f.path); p.onActive(f.path); };
    return (
      <div key={f.path}>
        <div className={`nb-folder ${p.activeFolder === f.path ? 'sel' : ''} ${over === f.path ? 'drop' : ''}`} style={{ marginLeft: depth * 14 }}
          role="treeitem" aria-expanded={isOpen} tabIndex={0} draggable onDragStart={startDrag('folder', f.path)} onDragEnd={endDrag}
          onDragOver={allowDrop(f.path)} onDragLeave={() => setOver((o) => (o === f.path ? null : o))} onDrop={dropOn(f.path)} onClick={act}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); toggle(f.path, true); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); toggle(f.path, false); }
          }}>
          <span className="nb-caret mono">{isOpen ? '▾' : '▸'}</span>
          <span className="nb-folder-name">{f.name}</span>
          <span className="nb-count mono">{f.count}</span>
        </div>
        {isOpen && (
          <>
            {f.folders.map((c) => folderRow(c, depth + 1))}
            {f.notebooks.map((n) => notebookRow(n, depth + 1))}
            {!f.folders.length && !f.notebooks.length && <div className="nb-empty small muted" style={{ marginLeft: (depth + 1) * 14 + 8 }}>empty</div>}
          </>
        )}
      </div>
    );
  };

  const hits = searchNotebooks(p.all, q);
  const inFolder = p.activeFolder ? p.activeFolder.split('/').join(' / ') : 'top level';
  const delCount = (function find(n: FolderNode): number { if (n.path === p.activeFolder) return n.count; for (const c of n.folders) { const r = find(c); if (r >= 0) return r; } return -1; })(p.root);

  return (
    <div className="nb-treebox">
      <button className="btn primary nb-new" onClick={() => p.onNewNotebook(p.activeFolder)}>+ New notebook</button>
      <div className="nb-ctx">
        <span className="mono small muted nb-ctx-l" title={inFolder}>in {inFolder}</span>
        <span className="nb-ctx-b">
          <button className="btn ghost nb-mini" onClick={() => open('newfolder')} title="New folder inside the selected folder">+ Folder</button>
          {p.activeFolder && <button className="btn ghost nb-mini" onClick={() => open('rename')} title="Rename the selected folder">Rename</button>}
          {p.activeFolder && <button className="btn ghost nb-mini" onClick={() => open('delete')} title="Delete the selected folder">Delete</button>}
        </span>
      </div>
      {prompt && prompt.kind !== 'delete' && (
        <form className="nb-prompt" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input ref={inputRef} className="input sm" value={text} maxLength={80} placeholder={prompt.kind === 'newfolder' ? 'Folder name' : 'New name'} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setPrompt(null); setErr(''); } }} />
          <button className="btn primary nb-mini" type="submit">{prompt.kind === 'newfolder' ? 'Create' : 'Rename'}</button>
        </form>
      )}
      {prompt?.kind === 'delete' && (
        <div className="nb-prompt nb-confirm">
          <span className="small">Delete “{nameOf(p.activeFolder)}”{delCount > 0 ? ` and its ${delCount} notebook${delCount === 1 ? '' : 's'}` : ''}? A copy is kept in records/backups.</span>
          <span className="row" style={{ gap: 6 }}><button className="btn danger nb-mini" onClick={() => void run(async () => { await p.onDeleteFolder(p.activeFolder); setPrompt(null); })}>Delete</button><button className="btn nb-mini" onClick={() => setPrompt(null)}>Keep</button></span>
        </div>
      )}
      {err && <div className="callout red" style={{ margin: '8px 0', fontSize: 13 }}>{err}</div>}
      <input className="input sm nb-search" value={q} placeholder="Search notebooks…" onChange={(e) => setQ(e.target.value)} />
      {q.trim() ? (
        <div className="nb-list">
          {hits.map((n) => notebookRow(n, 0, true))}
          {!hits.length && <div className="small muted">Nothing found.</div>}
        </div>
      ) : (
        <div className={`nb-list nb-tree ${over === '' ? 'drop' : ''}`} role="tree" onDragOver={allowDrop('')} onDragLeave={() => setOver((o) => (o === '' ? null : o))} onDrop={dropOn('')}>
          <div className={`nb-folder nb-rootrow ${p.activeFolder === '' ? 'sel' : ''}`} role="treeitem" tabIndex={0} onClick={() => p.onActive('')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onActive(''); } }}
            onDragOver={allowDrop('')} onDrop={dropOn('')}>
            <span className="nb-caret mono">▾</span><span className="nb-folder-name">All notebooks</span><span className="nb-count mono">{p.root.count}</span>
          </div>
          {p.root.folders.map((f) => folderRow(f, 1))}
          {p.root.notebooks.map((n) => notebookRow(n, 1))}
          {!p.root.count && !p.root.folders.length && <div className="small muted" style={{ padding: '8px 4px' }}>No notebooks yet.</div>}
        </div>
      )}
      <div className="annot" style={{ marginTop: 8 }}>Drag notebooks and folders onto a folder to move them.</div>
    </div>
  );
}
export { joinPath };
