import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanFolder, cleanSegment, createStore, NbError, parseNotebook, serializeNotebook } from './notebooks';

describe('notebook files', () => {
  it('round-trips title, dates and body', () => {
    const n = { id: 'x-1', title: 'Wörter: "Zahlen"', folder: '', created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z', body: '# Hi\n\n- a\n' };
    expect(parseNotebook('x-1', serializeNotebook(n))).toEqual(n);
  });
  it('reads a plain markdown file without a header; keeps a body that itself contains ---', () => {
    const n = parseNotebook('p', '# Just text\n');
    expect(n.body).toBe('# Just text\n'); expect(n.title).toBe('Untitled');
    const m = { id: 'a', title: 't', folder: '', created: 'c', updated: 'u', body: 'above\n\n---\n\nbelow\n' };
    expect(parseNotebook('a', serializeNotebook(m)).body).toBe(m.body);
  });
  it('knows its folder from the id', () => { expect(parseNotebook('A/B/x', '').folder).toBe('A/B'); expect(parseNotebook('x', '').folder).toBe(''); });
});

describe('folder names', () => {
  it('accepts ordinary names, umlauts and spaces', () => {
    expect(cleanSegment('Grammatik')).toBe('Grammatik'); expect(cleanSegment('  Prüfung  Teil 1 ')).toBe('Prüfung Teil 1');
    expect(cleanFolder('A/B / C')).toBe('A/B/C'); expect(cleanFolder('')).toBe(''); expect(cleanFolder('/')).toBe('');
  });
  it('rejects anything that could escape the folder or that Windows refuses', () => {
    for (const bad of ['..', '.hidden', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b', 'a\\b', 'CON', 'nul', 'com1', 'lpt3.txt', 'ends.', '', '   ', 'x'.repeat(81)]) expect(cleanSegment(bad), bad).toBeNull();
    expect(cleanFolder('a/../b')).toBeNull(); expect(cleanFolder('../x')).toBeNull(); expect(cleanFolder('a/.git')).toBeNull();
  });
});

describe('folder store', () => {
  let root: string, back: string, s: ReturnType<typeof createStore>;
  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-'));
    root = path.join(base, 'notebooks'); back = path.join(base, 'backups');
    s = createStore(() => root, () => back);
  });
  const err = (fn: () => unknown) => { try { fn(); } catch (e) { return e as NbError; } return null; };

  it('creates notebooks at the top level and in nested folders (created on demand)', () => {
    const a = s.create('Erste Notiz', '');
    const b = s.create('Rektion', 'Grammatik/Verben');
    expect(a.folder).toBe(''); expect(b.folder).toBe('Grammatik/Verben'); expect(b.id.startsWith('Grammatik/Verben/rektion-')).toBe(true);
    expect(fs.existsSync(path.join(root, 'Grammatik', 'Verben', b.id.split('/').pop() + '.md'))).toBe(true);
    const l = s.list();
    expect(l.folders).toEqual(['Grammatik', 'Grammatik/Verben']);
    expect(l.notebooks.map((n) => n.title).sort()).toEqual(['Erste Notiz', 'Rektion']);
    expect(s.read(b.id)!.title).toBe('Rektion');
  });
  it('empty folders exist and are listed; legacy flat notebooks stay at the top level', () => {
    s.createFolder('Leer'); s.createFolder('Leer/Innen');
    fs.writeFileSync(path.join(root, 'alt-1a2b.md'), '---\ntitle: "Alt"\ncreated: c\nupdated: u\n---\n\nhi\n');
    const l = s.list();
    expect(l.folders).toEqual(['Leer', 'Leer/Innen']);
    expect(l.notebooks).toEqual([{ id: 'alt-1a2b', title: 'Alt', folder: '', created: 'c', updated: 'u' }]);
  });
  it('updates title and body; leaves the id (file) alone', () => {
    const n = s.create('A', 'F'); const u = s.update(n.id, { title: 'Neu', body: 'text' });
    const r = s.read(n.id)!; expect(r.title).toBe('Neu'); expect(r.body).toBe('text'); expect(r.updated).toBe(u);
    expect(err(() => s.update('F/nope-1234', { body: 'x' }))?.status).toBe(404);
  });
  it('moves a notebook between folders, keeping content, avoiding name clashes', () => {
    const n = s.create('Wandern', 'A');
    const id2 = s.move(n.id, 'B/C');
    expect(id2.startsWith('B/C/')).toBe(true); expect(s.read(n.id)).toBeNull(); expect(s.read(id2)!.title).toBe('Wandern');
    expect(s.move(id2, 'B/C')).toBe(id2);                                       // same place: nothing happens
    expect(s.move(id2, '').includes('/')).toBe(false);                           // back to the top level
    const x = s.create('X', ''); fs.mkdirSync(path.join(root, 'D'), { recursive: true });
    fs.copyFileSync(path.join(root, x.id + '.md'), path.join(root, 'D', x.id + '.md'));   // same file name already there
    const moved = s.move(x.id, 'D'); expect(moved).not.toBe(`D/${x.id}`); expect(s.read(moved)).not.toBeNull();
  });
  it('deleting keeps a backup copy', () => {
    const n = s.create('Weg', 'F'); s.remove(n.id);
    expect(s.read(n.id)).toBeNull();
    const files = fs.readdirSync(back); expect(files).toHaveLength(1); expect(files[0].startsWith('F__')).toBe(true);
    expect(err(() => s.remove(n.id))?.status).toBe(404);
  });
  it('renames and moves folders; notebooks inside come along', () => {
    const n = s.create('Drin', 'Alt/Sub');
    expect(s.renameFolder('Alt', 'Neu')).toBe('Neu');
    expect(s.list().folders).toEqual(['Neu', 'Neu/Sub']);
    expect(s.read(n.id)).toBeNull();                                   // the id changed with the path …
    expect(s.list().notebooks[0].id).toBe(`Neu/Sub/${n.id.split('/').pop()}`);   // … and the notebook is still there
    s.createFolder('Ziel');
    expect(s.renameFolder('Neu/Sub', 'Ziel/Sub')).toBe('Ziel/Sub');
    expect(s.list().folders).toEqual(['Neu', 'Ziel', 'Ziel/Sub']);
  });
  it('folder rules: no duplicates (any letter case), no moving into itself, parents must exist', () => {
    s.createFolder('Grammatik');
    expect(err(() => s.createFolder('grammatik'))?.status).toBe(409);
    expect(err(() => s.createFolder('Grammatik'))?.status).toBe(409);
    expect(err(() => s.createFolder('Nicht/da'))?.status).toBe(404);
    s.createFolder('Grammatik/Sub');
    expect(err(() => s.renameFolder('Grammatik', 'Grammatik/Sub/Grammatik'))?.status).toBe(400);
    expect(s.renameFolder('Grammatik', 'GRAMMATIK')).toBe('GRAMMATIK');   // changing only the letter case of your own name is fine
    s.createFolder('Andere');
    expect(err(() => s.renameFolder('Andere', 'grammatik'))?.status).toBe(409);
  });
  it('deleting a folder moves it, with everything inside, to backups', () => {
    const n = s.create('Innen', 'Weg/Tief'); s.removeFolder('Weg');
    expect(s.list().folders).toEqual([]); expect(s.read(n.id)).toBeNull();
    const b = fs.readdirSync(back); expect(b).toHaveLength(1);
    expect(fs.existsSync(path.join(back, b[0], 'Tief', n.id.split('/').pop() + '.md'))).toBe(true);
    expect(err(() => s.removeFolder('Weg'))?.status).toBe(404);
  });
  it('cannot be tricked into leaving the notebooks folder', () => {
    for (const bad of ['../evil-1', 'a/../../evil-1', '/etc/passwd', 'C:/x-1']) expect(s.read(bad), bad).toBeNull();
    expect(err(() => s.create('x', '../outside'))?.status).toBe(400);
    expect(err(() => s.move('nope-1234', '../outside'))?.status).toBe(400);
    expect(err(() => s.renameFolder('A', '../B'))?.status).toBe(400);
    expect(err(() => s.removeFolder('..'))?.status).toBe(400);
    expect(fs.readdirSync(path.dirname(root)).sort()).toEqual([]);   // nothing was created next to the notebooks folder
  });
});
