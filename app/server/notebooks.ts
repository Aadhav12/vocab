// Notebooks: plain markdown files in real folders under records/notebooks/
//
//   records/notebooks/Grammatik/Rektion/um-oder-auf-k3f2.md
//
//   ---
//   title: "Um oder auf?"
//   created: 2026-11-28T10:00:00.000Z
//   updated: 2026-11-28T10:05:00.000Z
//   ---
//
//   markdown body …
//
// A notebook's id is its path without ".md" ("Grammatik/Rektion/um-oder-auf-k3f2"); a folder's id is its path.
// Real files and folders keep notebooks portable (copy records/) and readable in any editor or file manager.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { recordsDir } from './config';

export interface NotebookMeta { id: string; title: string; folder: string; created: string; updated: string }
export interface Notebook extends NotebookMeta { body: string }
export class NbError extends Error { constructor(public status: number, message: string) { super(message); } }

// ---------------------------------------------------------------- file format
export function parseNotebook(id: string, text: string): Notebook {
  const t = text.replace(/\r\n?/g, '\n');
  let title = 'Untitled', created = '', updated = '', body = t;
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
  if (m) {
    body = t.slice(m[0].length).replace(/^\n/, '');
    for (const line of m[1].split('\n')) {
      const kv = /^(\w+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      let v = kv[2].trim();
      if (kv[1] === 'title') { try { v = JSON.parse(v); } catch { /* plain text title */ } title = String(v); }
      if (kv[1] === 'created') created = v;
      if (kv[1] === 'updated') updated = v;
    }
  }
  return { id, title, folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '', created, updated, body };
}
export function serializeNotebook(n: Pick<Notebook, 'title' | 'created' | 'updated' | 'body'>): string {
  return `---\ntitle: ${JSON.stringify(n.title)}\ncreated: ${n.created}\nupdated: ${n.updated}\n---\n\n${n.body}`;
}

// ---------------------------------------------------------------- names
const BAD = /[\/\\:*?"<>|\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;   // not allowed as file names on Windows
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** One folder name: no separators or characters Windows rejects, no leading dot, no trailing dot or space. */
export function cleanSegment(s: string): string | null {
  const t = s.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || BAD.test(t) || t.startsWith('.') || t.endsWith('.') || RESERVED.test(t)) return null;
  return t;
}
/** A folder path "A/B/C" ('' = top level), or null if any part is not allowed. */
export function cleanFolder(p: string): string | null {
  const parts = p.split('/').map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) { const c = cleanSegment(part); if (!c) return null; out.push(c); }
  return out.join('/');
}
const slug = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ---------------------------------------------------------------- the store
export function createStore(root: () => string, backups: () => string) {
  const abs = (rel: string) => {
    const full = path.resolve(root(), ...rel.split('/').filter(Boolean));
    const base = path.resolve(root());
    if (full !== base && !full.startsWith(base + path.sep)) throw new NbError(400, 'path outside the notebooks folder');
    return full;
  };
  const parseId = (id: string): { folder: string; slug: string } => {
    const i = id.lastIndexOf('/');
    const folder = cleanFolder(i < 0 ? '' : id.slice(0, i));
    const sl = i < 0 ? id : id.slice(i + 1);
    if (folder === null || !SLUG.test(sl)) throw new NbError(400, 'bad notebook id');
    return { folder, slug: sl };
  };
  const fileOf = (id: string) => { const p = parseId(id); return abs(`${p.folder ? p.folder + '/' : ''}${p.slug}`) + '.md'; };
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = () => { fs.mkdirSync(backups(), { recursive: true }); return backups(); };

  const read = (id: string): Notebook | null => {
    let f: string; try { f = fileOf(id); } catch { return null; }
    try {
      const n = parseNotebook(id, fs.readFileSync(f, 'utf8'));
      if (!n.created || !n.updated) { const st = fs.statSync(f); n.created ||= st.birthtime.toISOString(); n.updated ||= st.mtime.toISOString(); }
      return n;
    } catch { return null; }
  };
  const writeFile = (id: string, n: Pick<Notebook, 'title' | 'created' | 'updated' | 'body'>) => {
    const f = fileOf(id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, serializeNotebook(n));
    fs.renameSync(tmp, f);
  };

  function list(): { folders: string[]; notebooks: NotebookMeta[] } {
    const folders: string[] = [], notebooks: NotebookMeta[] = [];
    const walk = (rel: string) => {
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(abs(rel), { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (cleanSegment(e.name)) { folders.push(r); walk(r); } }
        else if (e.name.endsWith('.md')) {
          const n = read(r.slice(0, -3));
          if (n) notebooks.push({ id: n.id, title: n.title, folder: n.folder, created: n.created, updated: n.updated });
        }
      }
    };
    walk('');
    return { folders: folders.sort((a, b) => a.localeCompare(b)), notebooks };
  }

  function folderExists(p: string) { try { return fs.statSync(abs(p)).isDirectory(); } catch { return false; } }
  /** a sibling with the same name in another letter case would collide on Windows/macOS */
  function siblingClash(parent: string, name: string, except?: string): boolean {
    try { return fs.readdirSync(abs(parent)).some((x) => x.toLowerCase() === name.toLowerCase() && x !== except); } catch { return false; }
  }

  function create(title: string, folder: string, body = ''): Notebook {
    const f = cleanFolder(folder);
    if (f === null) throw new NbError(400, 'bad folder name');
    const t = title.trim().slice(0, 200) || 'Untitled';
    const now = new Date().toISOString();
    let id = '';
    do { const sl = `${slug(t) || 'notebook'}-${Math.random().toString(36).slice(2, 6)}`; id = f ? `${f}/${sl}` : sl; } while (fs.existsSync(fileOf(id)));
    writeFile(id, { title: t, created: now, updated: now, body });
    return { id, title: t, folder: f, created: now, updated: now, body };
  }
  function update(id: string, patch: { title?: string; body?: string }): string {
    const n = read(id);
    if (!n) throw new NbError(404, 'not found');
    if (typeof patch.title === 'string') n.title = patch.title.slice(0, 200) || 'Untitled';
    if (typeof patch.body === 'string') n.body = patch.body;
    n.updated = new Date().toISOString();
    writeFile(id, n);
    return n.updated;
  }
  function remove(id: string) {                     // "delete" keeps a copy in backups
    const f = fileOf(id);
    if (!fs.existsSync(f)) throw new NbError(404, 'not found');
    fs.renameSync(f, path.join(backupDir(), `${id.replace(/\//g, '__')}-${stamp()}.md`));
  }
  function move(id: string, folder: string): string {
    const f = cleanFolder(folder);
    if (f === null) throw new NbError(400, 'bad folder name');
    const { slug: sl } = parseId(id);
    const from = fileOf(id);
    if (!fs.existsSync(from)) throw new NbError(404, 'not found');
    let newSlug = sl, newId = f ? `${f}/${sl}` : sl;
    if (newId === id) return id;
    while (fs.existsSync(fileOf(newId))) { newSlug = `${sl}-${Math.random().toString(36).slice(2, 5)}`; newId = f ? `${f}/${newSlug}` : newSlug; }
    fs.mkdirSync(path.dirname(fileOf(newId)), { recursive: true });
    fs.renameSync(from, fileOf(newId));
    return newId;
  }

  function createFolder(p: string): string {
    const f = cleanFolder(p);
    if (!f) throw new NbError(400, 'bad folder name');
    const i = f.lastIndexOf('/');
    const parent = i < 0 ? '' : f.slice(0, i), name = f.slice(i + 1);
    if (parent && !folderExists(parent)) throw new NbError(404, 'parent folder not found');
    if (siblingClash(parent, name)) throw new NbError(409, `“${name}” already exists here`);
    fs.mkdirSync(abs(f), { recursive: true });
    return f;
  }
  /** rename and/or move a folder: `to` is its complete new path */
  function renameFolder(p: string, to: string): string {
    const from = cleanFolder(p), dest = cleanFolder(to);
    if (!from || !dest) throw new NbError(400, 'bad folder name');
    if (!folderExists(from)) throw new NbError(404, 'folder not found');
    if (dest === from) return from;
    if (dest.startsWith(from + '/')) throw new NbError(400, 'a folder cannot go inside itself');
    const i = dest.lastIndexOf('/');
    const parent = i < 0 ? '' : dest.slice(0, i), name = dest.slice(i + 1);
    if (parent && !folderExists(parent)) throw new NbError(404, 'target folder not found');
    const sameName = from.slice(from.lastIndexOf('/') + 1);
    const sameParent = (from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '') === parent;
    if (siblingClash(parent, name, sameParent ? sameName : undefined)) throw new NbError(409, `“${name}” already exists there`);
    fs.renameSync(abs(from), abs(dest));
    return dest;
  }
  function removeFolder(p: string) {                // moves the whole folder to backups
    const f = cleanFolder(p);
    if (!f) throw new NbError(400, 'bad folder name');
    if (!folderExists(f)) throw new NbError(404, 'folder not found');
    fs.renameSync(abs(f), path.join(backupDir(), `${f.replace(/\//g, '__')}-${stamp()}`));
  }
  return { read, list, create, update, remove, move, createFolder, renameFolder, removeFolder };
}

// ---------------------------------------------------------------- HTTP
const store = createStore(() => path.join(recordsDir, 'notebooks'), () => path.join(recordsDir, 'backups', 'notebooks'));
export const notebookRouter = express.Router();
const wrap = (fn: (req: express.Request, res: express.Response) => unknown): express.RequestHandler => (req, res) => {
  try { res.json(fn(req, res)); }
  catch (e) { if (e instanceof NbError) res.status(e.status).json({ error: e.message }); else { console.error(e); res.status(500).json({ error: 'server error' }); } }
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');

notebookRouter.get('/', wrap(() => store.list()));
notebookRouter.post('/', wrap((req) => store.create(str(req.body?.title), str(req.body?.folder), str(req.body?.body))));
notebookRouter.get('/item', wrap((req) => { const n = store.read(str(req.query.id)); if (!n) throw new NbError(404, 'not found'); return n; }));
notebookRouter.put('/item', wrap((req) => ({ ok: true, updated: store.update(str(req.query.id), { title: typeof req.body?.title === 'string' ? req.body.title : undefined, body: typeof req.body?.body === 'string' ? req.body.body : undefined }) })));
notebookRouter.delete('/item', wrap((req) => { store.remove(str(req.query.id)); return { ok: true }; }));
notebookRouter.post('/move', wrap((req) => ({ id: store.move(str(req.body?.id), str(req.body?.folder)) })));
notebookRouter.post('/folders', wrap((req) => ({ path: store.createFolder(str(req.body?.path)) })));
notebookRouter.put('/folders', wrap((req) => ({ path: store.renameFolder(str(req.body?.path), str(req.body?.to)) })));
notebookRouter.delete('/folders', wrap((req) => { store.removeFolder(str(req.query.path)); return { ok: true }; }));
