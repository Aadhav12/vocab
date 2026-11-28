// The notebook folder tree: built from the flat lists the server sends.
export interface Meta { id: string; title: string; folder: string; created: string; updated: string }
export interface FolderNode { path: string; name: string; folders: FolderNode[]; notebooks: Meta[]; count: number }   // count: notebooks inside, nested ones too

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
export const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const joinPath = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);
export const depthOf = (p: string) => (p ? p.split('/').length : 0);

export function buildTree(folders: string[], notebooks: Meta[]): FolderNode {
  const root: FolderNode = { path: '', name: '', folders: [], notebooks: [], count: 0 };
  const byPath = new Map<string, FolderNode>([['', root]]);
  const ensure = (p: string): FolderNode => {
    const have = byPath.get(p);
    if (have) return have;
    const node: FolderNode = { path: p, name: nameOf(p), folders: [], notebooks: [], count: 0 };
    byPath.set(p, node);
    ensure(parentOf(p)).folders.push(node);
    return node;
  };
  for (const f of folders) ensure(f);
  for (const n of notebooks) ensure(n.folder).notebooks.push(n);
  const finish = (node: FolderNode): number => {
    node.folders.sort((a, b) => cmp(a.name, b.name));
    node.notebooks.sort((a, b) => cmp(a.title || 'Untitled', b.title || 'Untitled'));
    node.count = node.notebooks.length + node.folders.reduce((a, f) => a + finish(f), 0);
    return node.count;
  };
  finish(root);
  return root;
}

/** Every folder path in tree order, for a "move to" menu. */
export function folderList(root: FolderNode): string[] {
  const out: string[] = [];
  const walk = (n: FolderNode) => { for (const f of n.folders) { out.push(f.path); walk(f); } };
  walk(root);
  return out;
}

/** A folder may move to the top level or into any folder that is not itself or one of its own subfolders. */
export const canMoveFolder = (path: string, toParent: string) => toParent !== path && !toParent.startsWith(path + '/') && parentOf(path) !== toParent;

/** The id a notebook gets after its folder (or one of the folders above it) was renamed or moved. */
export function remapId(id: string, from: string, to: string): string {
  return id === from || id.startsWith(from + '/') ? to + id.slice(from.length) : id;
}

export function searchNotebooks(notebooks: Meta[], q: string): Meta[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return notebooks.filter((n) => (n.title || 'Untitled').toLowerCase().includes(t) || n.folder.toLowerCase().includes(t)).sort((a, b) => cmp(a.title, b.title));
}
