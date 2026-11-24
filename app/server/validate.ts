// `npm run validate`: prints the same list as the Data problems page.
import { dataDir } from './config';
import { loadData } from './loader';

const b = loadData(dataDir);
const words = b.topics.flatMap((t) => t.groups.flatMap((g) => g.sets.flatMap((s) => s.words))).length;
const sets = b.topics.flatMap((t) => t.groups.flatMap((g) => g.sets)).length;
console.log(`${b.topics.length} topics · ${sets} sets · ${words} words`);
if (!b.problems.length) { console.log('No problems found.'); process.exit(0); }
for (const p of b.problems) console.log(`✗ ${p.file}: ${p.message}`);
console.log(`\n${b.problems.length} problem${b.problems.length === 1 ? '' : 's'}`);
process.exit(1);
