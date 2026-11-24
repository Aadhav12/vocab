import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const appRoot = path.resolve(here, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(appRoot, 'config.json'), 'utf8'));

export const dataDir = path.resolve(appRoot, process.env.DATA_DIR ?? cfg.dataDir);
export const recordsDir = path.resolve(appRoot, process.env.RECORDS_DIR ?? cfg.recordsDir);
export const port = Number(process.env.PORT ?? cfg.port);
export const schemaDir = path.join(appRoot, 'schema');
