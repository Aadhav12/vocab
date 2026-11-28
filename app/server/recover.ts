// `npm run recover`: rebuild progress.json from attempts.jsonl.
// attempts.jsonl is append-only and always complete; progress.json is only as good as the last save that succeeded.
// This replays every attempt newer than the progress file (same code the app uses) and writes the result.
// The old progress.json is copied to records/backups/ first. Add --dry-run to only print what would happen.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, recordsDir } from './config';
import { loadData } from './loader';
import { readAttempts, readProgress, writeProgress } from './records';
import { buildIndex } from '../src/core/index';
import { buildPath, insertNode } from '../src/core/path';
import { applyToProgress } from '../src/core/apply';

const dry = process.argv.includes('--dry-run');
const idx = buildIndex(loadData(dataDir));
const pathNodes = buildPath(idx);
const p = readProgress();
const attempts = readAttempts();

const newestPass = Object.values(p.passed).map((x) => x.firstPassedAt).sort().pop() ?? '';
const since = p.lastAttemptAt ?? newestPass;
const todo = attempts.filter((a) => a.endedAt > since).sort((a, b) => a.endedAt.localeCompare(b.endedAt));
console.log(`${attempts.length} attempts on record; progress.json is current up to ${since || '(nothing)'}`);
if (!todo.length) { console.log('Nothing to recover — progress.json already contains every attempt.'); process.exit(0); }

const before = { passed: Object.keys(p.passed).length, introduced: Object.keys(p.introduced).length, cards: Object.keys(p.cards).length, xp: p.xp, setCount: p.setCount };
const seen = new Map<string, number>();
for (const a of attempts) if (a.endedAt <= since) seen.set(a.nodeId, (seen.get(a.nodeId) ?? 0) + 1);

for (const a of todo) {
  let node = pathNodes.byId.get(a.nodeId) ?? null;
  if (!node) { const ins = p.inserts.find((i) => i.id === a.nodeId); if (ins) node = insertNode(idx, ins); }
  if (!node && a.nodeId !== 'practice') { console.log(`  skipped ${a.nodeId}: node no longer exists in data`); continue; }
  const introWords = node?.type === 'intro' ? idx.setById.get(node.scopeId)?.words.map((w) => w.id) : undefined;
  // flashcards give xp only for the first round of the (single) chunk
  const xpItems = node?.type === 'flash' ? a.items.slice(0, 2 * (idx.setById.get(node.scopeId)?.words.length ?? 0)).filter((i) => i.correct).length : undefined;
  const prev = seen.get(a.nodeId) ?? 0;
  seen.set(a.nodeId, prev + 1);
  const r = applyToProgress(p, idx, pathNodes, {
    node, nodeId: a.nodeId, results: a.items, score: a.score, passMark: a.passMark, prevAttempts: prev, clickedWords: a.clickedWords, introWords, xpItems, at: new Date(a.endedAt),
  });
  console.log(`  ${a.endedAt.slice(0, 19)} ${a.nodeId}  ${r.passed ? 'passed' : 'failed'}${r.firstPass ? '  (first pass)' : ''}`);
}
p.lastAttemptAt = todo[todo.length - 1].endedAt;
const after = { passed: Object.keys(p.passed).length, introduced: Object.keys(p.introduced).length, cards: Object.keys(p.cards).length, xp: p.xp, setCount: p.setCount };
console.log('\nbefore', before, '\nafter ', after);
if (dry) { console.log('\n--dry-run: nothing written.'); process.exit(0); }
writeProgress(p, true);
console.log(`\nWritten ${path.join(recordsDir, 'progress.json')} (previous version kept in records/backups/).`);
