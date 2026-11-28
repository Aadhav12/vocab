// Loads data/ from disk, validates it against the schemas and the semantic checks.
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import type { DataBundle, GroupData, Problem, SetData, TextFile, TopicData, Word } from '../src/core/types';
import { semanticCheck } from '../src/core/validate';
import { schemaDir } from './config';

const ajv = new Ajv({ allErrors: true, strict: false });
for (const f of fs.readdirSync(schemaDir)) if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')));
const v = (name: string) => ajv.getSchema(`${name}.schema.json`)!;

function errs(validate: ReturnType<typeof v>): string[] {
  return (validate.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}${e.params && 'allowedValues' in e.params ? ` (${(e.params as any).allowedValues.join(', ')})` : ''}`);
}

const byPrefix = (a: string, b: string) => {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
};

function readJson(file: string, rel: string, problems: Problem[]): any | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e: any) { problems.push({ file: rel, message: `invalid JSON: ${e.message}` }); return null; }
}

function loadText(file: string, rel: string, problems: Problem[], embedded = false): TextFile | null {
  const j = embedded ? file : readJson(file, rel, problems);
  if (!j) return null;
  if (!embedded && j.schemaVersion !== 1) problems.push({ file: rel, message: 'schemaVersion must be 1' });
  const val = v('text');
  if (!val(j)) { errs(val).forEach((m) => problems.push({ file: rel, message: `text: ${m}` })); return null; }
  return j as TextFile;
}

function loadTexts(dir: string, relDir: string, problems: Problem[]): TextFile[] {
  const td = path.join(dir, '_texts');
  if (!fs.existsSync(td)) return [];
  return fs.readdirSync(td).filter((f) => f.endsWith('.json')).sort(byPrefix)
    .map((f) => loadText(path.join(td, f), `${relDir}/_texts/${f}`, problems)).filter(Boolean) as TextFile[];
}

function loadSet(file: string, rel: string, problems: Problem[]): SetData | null {
  const j = readJson(file, rel, problems);
  if (!j) return null;
  const { words, text, ...shell } = j;
  const sv = v('set');
  // validate the shell on its own so that one bad word doesn't discard the whole set
  if (!sv({ ...shell, words: [] })) { errs(sv).forEach((m) => problems.push({ file: rel, message: m })); return null; }
  const wv = v('word');
  const good: Word[] = [];
  (Array.isArray(words) ? words : []).forEach((w: any, i: number) => {
    if (wv(w)) good.push(w);
    else errs(wv).forEach((m) => problems.push({ file: rel, message: `word ${w?.id ?? '#' + (i + 1)}: ${m}` }));
  });
  const t = text ? loadText(text, rel, problems, true) : undefined;
  return { id: j.id, name: j.name, words: good, text: t ?? undefined, file: rel };
}

function loadHeader<T>(file: string, rel: string, kind: 'topic' | 'group', problems: Problem[]): T | null {
  if (!fs.existsSync(file)) { problems.push({ file: rel, message: 'missing file' }); return null; }
  const j = readJson(file, rel, problems);
  if (!j) return null;
  const val = v(kind);
  if (!val(j)) { errs(val).forEach((m) => problems.push({ file: rel, message: m })); return null; }
  return j as T;
}

export function loadData(dataDir: string, version = 0): DataBundle {
  const problems: Problem[] = [];
  const topics: TopicData[] = [];
  if (!fs.existsSync(dataDir)) return { topics, version, problems: [{ file: dataDir, message: 'data directory not found' }] };
  const dirs = (d: string) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map((e) => e.name).sort(byPrefix);
  for (const td of dirs(dataDir)) {
    const tdir = path.join(dataDir, td);
    const th = loadHeader<{ id: string; name: string; description?: string; topicGroup?: string }>(path.join(tdir, '_topic.json'), `${td}/_topic.json`, 'topic', problems);
    if (!th) continue;
    const groups: GroupData[] = [];
    for (const gd of dirs(tdir)) {
      const gdir = path.join(tdir, gd);
      const gh = loadHeader<{ id: string; name: string; description?: string }>(path.join(gdir, '_group.json'), `${td}/${gd}/_group.json`, 'group', problems);
      if (!gh) continue;
      const sets: SetData[] = [];
      for (const f of fs.readdirSync(gdir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort(byPrefix)) {
        const s = loadSet(path.join(gdir, f), `${td}/${gd}/${f}`, problems);
        if (s) sets.push(s);
      }
      groups.push({ id: gh.id, name: gh.name, description: gh.description, sets, texts: loadTexts(gdir, `${td}/${gd}`, problems) });
    }
    topics.push({ id: th.id, name: th.name, description: th.description, ...(th.topicGroup?.trim() ? { topicGroup: th.topicGroup.trim() } : {}), groups, texts: loadTexts(tdir, td, problems) });
  }
  const bundle: DataBundle = { topics, problems, version };
  problems.push(...semanticCheck(bundle));
  return bundle;
}
