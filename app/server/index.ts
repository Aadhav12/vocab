import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { appRoot, dataDir, port, recordsDir } from './config';
import { loadData } from './loader';
import { appendAttempt, ensureDirs, readAttempts, readProgress, resetProgress, writeProgress } from './records';
import type { DataBundle } from '../src/core/types';
import { notebookRouter } from './notebooks';

const app = express();
app.use(express.json({ limit: '20mb' }));

let version = 1;
let bundle: DataBundle = loadData(dataDir, version);
const clients = new Set<express.Response>();

function reload() {
  version++;
  bundle = loadData(dataDir, version);
  const msg = `event: data\ndata: ${JSON.stringify({ version, problems: bundle.problems.length })}\n\n`;
  for (const c of clients) c.write(msg);
  console.log(`[data] reloaded (v${version}): ${bundle.problems.length} problem(s)`);
}

let timer: NodeJS.Timeout | undefined;
try {
  fs.watch(dataDir, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(reload, 200); });
} catch (e) { console.warn('[data] cannot watch data dir:', (e as Error).message); }

app.get('/api/data', (_req, res) => res.json(bundle));
app.get('/api/records', (_req, res) => res.json({ progress: readProgress(), attempts: readAttempts() }));
app.put('/api/progress', (req, res) => {
  if (!req.body || req.body.schemaVersion !== 1) return res.status(400).json({ error: 'bad progress' });
  writeProgress(req.body); res.json({ ok: true });
});
app.post('/api/attempts', (req, res) => {
  if (!req.body?.nodeId) return res.status(400).json({ error: 'bad attempt' });
  appendAttempt(req.body); res.json({ ok: true });
});
app.post('/api/reset', (_req, res) => res.json(resetProgress()));
app.use('/api/notebooks', notebookRouter);
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`event: hello\ndata: ${version}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clients.delete(res); clearInterval(ping); });
});

const dist = path.join(appRoot, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

ensureDirs();
app.listen(port, () => {
  console.log(`TestDaF Vocab → http://localhost:${port}`);
  console.log(`  data:    ${dataDir}\n  records: ${recordsDir}`);
  if (bundle.problems.length) console.log(`  ${bundle.problems.length} data problem(s) — run "npm run validate"`);
});
