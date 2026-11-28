import { describe, expect, it } from 'vitest';
import { buildTree, canMoveFolder, depthOf, folderList, joinPath, nameOf, parentOf, remapId, searchNotebooks, type Meta } from './tree';

const nb = (id: string, title: string): Meta => ({ id, title, folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '', created: '', updated: '' });

describe('notebook tree', () => {
  const folders = ['Grammatik', 'Grammatik/Verben', 'Leer', 'Ärger'];
  const notebooks = [nb('top-1', 'zeta'), nb('Grammatik/a-1', 'Rektion'), nb('Grammatik/Verben/b-1', 'Starke Verben'), nb('Grammatik/Verben/c-1', 'Modalverben'), nb('top-2', 'Alpha')];
  const root = buildTree(folders, notebooks);
  it('nests folders and counts notebooks including nested ones', () => {
    expect(root.folders.map((f) => f.name)).toEqual(['Ärger', 'Grammatik', 'Leer']);   // alphabetical, umlauts sorted sensibly
    const g = root.folders.find((f) => f.name === 'Grammatik')!;
    expect(g.folders.map((f) => f.path)).toEqual(['Grammatik/Verben']);
    expect(g.notebooks.map((n) => n.title)).toEqual(['Rektion']);
    expect(g.count).toBe(3); expect(root.count).toBe(5); expect(root.folders.find((f) => f.name === 'Leer')!.count).toBe(0);
  });
  it('sorts notebooks by title, ignoring case', () => { expect(root.notebooks.map((n) => n.title)).toEqual(['Alpha', 'zeta']); });
  it('creates missing parent folders implicitly', () => {
    const t = buildTree([], [nb('A/B/x-1', 'x')]);
    expect(t.folders[0].path).toBe('A'); expect(t.folders[0].folders[0].path).toBe('A/B'); expect(t.folders[0].folders[0].notebooks).toHaveLength(1);
  });
  it('lists folders in tree order', () => { expect(folderList(root)).toEqual(['Ärger', 'Grammatik', 'Grammatik/Verben', 'Leer']); });
  it('path helpers', () => {
    expect(parentOf('A/B/C')).toBe('A/B'); expect(parentOf('A')).toBe(''); expect(nameOf('A/B/C')).toBe('C'); expect(joinPath('', 'X')).toBe('X'); expect(joinPath('A', 'X')).toBe('A/X');
    expect(depthOf('')).toBe(0); expect(depthOf('A/B')).toBe(2);
  });
  it('knows which folder moves are allowed', () => {
    expect(canMoveFolder('Grammatik', '')).toBe(false);                    // already there
    expect(canMoveFolder('Grammatik/Verben', '')).toBe(true);
    expect(canMoveFolder('Grammatik', 'Leer')).toBe(true);
    expect(canMoveFolder('Grammatik', 'Grammatik')).toBe(false);           // into itself
    expect(canMoveFolder('Grammatik', 'Grammatik/Verben')).toBe(false);    // into its own child
    expect(canMoveFolder('Gram', 'Grammatik')).toBe(true);                 // a name prefix is not a parent
  });
  it('remaps ids after a folder rename or move', () => {
    expect(remapId('A/B/x-1', 'A', 'Z')).toBe('Z/B/x-1'); expect(remapId('A/B/x-1', 'A/B', 'C/B')).toBe('C/B/x-1');
    expect(remapId('AB/x-1', 'A', 'Z')).toBe('AB/x-1'); expect(remapId('top-1', 'A', 'Z')).toBe('top-1');
  });
  it('searches titles and folder names', () => {
    expect(searchNotebooks(notebooks, 'verben').map((n) => n.title)).toEqual(['Modalverben', 'Starke Verben']);
    expect(searchNotebooks(notebooks, 'gramm')).toHaveLength(3);
    expect(searchNotebooks(notebooks, '  ')).toEqual([]);
  });
});
