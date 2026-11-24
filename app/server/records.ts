// Reading and writing records/: atomic progress.json with rolling backups, append-only attempts.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { recordsDir } from './config';
import { emptyProgress, type Attempt, type Progress } from '../src/core/types';

const progressFile = () => path.join(recordsDir, 'progress.json');
const attemptsFile = () => path.join(recordsDir, 'attempts.jsonl');
const backupsDir = () => path.join(recordsDir, 'backups');
let lastBackup = 0;

export function ensureDirs() { fs.mkdirSync(backupsDir(), { recursive: true }); }

export function readProgress(): Progress {
  try {
    const p = JSON.parse(fs.readFileSync(progressFile(), 'utf8')) as Progress;
    const e = emptyProgress();
    return { ...e, ...p, settings: { ...e.settings, ...p.settings }, streak: { ...e.streak, ...p.streak } };
  } catch { return emptyProgress(); }
}

export function readAttempts(): Attempt[] {
  try {
    return fs.readFileSync(attemptsFile(), 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as Attempt]; } catch { return []; } });
  } catch { return []; }
}

function backup(force = false) {
  const f = progressFile();
  if (!fs.existsSync(f)) return;
  const now = Date.now();
  if (!force && now - lastBackup < 60_000) return;
  lastBackup = now;
  fs.mkdirSync(backupsDir(), { recursive: true });
  fs.copyFileSync(f, path.join(backupsDir(), `progress-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`));
  const all = fs.readdirSync(backupsDir()).filter((x) => x.startsWith('progress-')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 10))) fs.rmSync(path.join(backupsDir(), old));
}

export function writeProgress(p: Progress, force = false) {
  ensureDirs();
  backup(force);
  const tmp = progressFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2));
  fs.renameSync(tmp, progressFile());
}

export function appendAttempt(a: Attempt) {
  ensureDirs();
  fs.appendFileSync(attemptsFile(), JSON.stringify(a) + '\n');
}

/** Reset: keep a copy of everything, keep settings. */
export function resetProgress(): Progress {
  ensureDirs();
  const old = readProgress();
  backup(true);
  if (fs.existsSync(attemptsFile())) fs.renameSync(attemptsFile(), path.join(backupsDir(), `attempts-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`));
  const fresh = emptyProgress();
  fresh.settings = old.settings;
  writeProgress(fresh, false);
  return fresh;
}
