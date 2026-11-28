// Notebooks: one plain markdown file per notebook in records/notebooks/<id>.md
//
//   ---
//   title: "My notes"
//   created: 2026-11-28T10:00:00.000Z
//   updated: 2026-11-28T10:05:00.000Z
//   ---
//
//   markdown body …
//
// Plain files keep notebooks portable (copy records/) and readable in any editor.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { recordsDir } from './config';

export interface NotebookMeta { id: string; title: string; created: string; updated: string }
export interface Notebook extends NotebookMeta { body: string }

const dir = () => path.join(recordsDir, 'notebooks');
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const file = (id: string) => path.join(dir(), `${id}.md`);

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
  return { id, title, created, updated, body };
}

export function serializeNotebook(n: Notebook): string {
  return `---\ntitle: ${JSON.stringify(n.title)}\ncreated: ${n.created}\nupdated: ${n.updated}\n---\n\n${n.body}`;
}

const slug = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function read(id: string): Notebook | null {
  if (!ID.test(id)) return null;
  try {
    const text = fs.readFileSync(file(id), 'utf8');
    const n = parseNotebook(id, text);
    if (!n.created || !n.updated) { const st = fs.statSync(file(id)); n.created ||= st.birthtime.toISOString(); n.updated ||= st.mtime.toISOString(); }
    return n;
  } catch { return null; }
}

/** atomic write: temp file, then rename */
function write(n: Notebook) {
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = file(n.id) + '.tmp';
  fs.writeFileSync(tmp, serializeNotebook(n));
  fs.renameSync(tmp, file(n.id));
}

export function listNotebooks(): NotebookMeta[] {
  if (!fs.existsSync(dir())) return [];
  return fs.readdirSync(dir()).filter((f) => f.endsWith('.md')).map((f) => read(f.slice(0, -3))).filter(Boolean)
    .map((n) => ({ id: n!.id, title: n!.title, created: n!.created, updated: n!.updated }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export const notebookRouter = express.Router();

notebookRouter.get('/', (_req, res) => res.json(listNotebooks()));

notebookRouter.post('/', (req, res) => {
  const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : 'Untitled';
  const now = new Date().toISOString();
  let id = '';
  do { id = `${slug(title) || 'notebook'}-${Math.random().toString(36).slice(2, 6)}`; } while (fs.existsSync(file(id)));
  const n: Notebook = { id, title, created: now, updated: now, body: typeof req.body?.body === 'string' ? req.body.body : '' };
  write(n);
  res.json(n);
});

notebookRouter.get('/:id', (req, res) => {
  const n = read(req.params.id);
  if (!n) return res.status(404).json({ error: 'not found' });
  res.json(n);
});

notebookRouter.put('/:id', (req, res) => {
  const n = read(req.params.id);
  if (!n) return res.status(404).json({ error: 'not found' });
  if (typeof req.body?.title === 'string') n.title = req.body.title.slice(0, 200) || 'Untitled';
  if (typeof req.body?.body === 'string') n.body = req.body.body;
  n.updated = new Date().toISOString();
  write(n);
  res.json({ ok: true, updated: n.updated });
});

// "delete" keeps a copy in records/backups/notebooks/ so a slip is recoverable
notebookRouter.delete('/:id', (req, res) => {
  if (!ID.test(req.params.id) || !fs.existsSync(file(req.params.id))) return res.status(404).json({ error: 'not found' });
  const bdir = path.join(recordsDir, 'backups', 'notebooks');
  fs.mkdirSync(bdir, { recursive: true });
  fs.renameSync(file(req.params.id), path.join(bdir, `${req.params.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`));
  res.json({ ok: true });
});
