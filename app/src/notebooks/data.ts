// Pure logic behind the notebook's data directives: which words a "scope" means, and the tables built from them.
//
//   scope   := term ( "+" term )* ( "|" limit )?
//   term    := "set 3" | "set Zunahme und Abnahme" | "group <name>" | "topic <name>"      (where the words live)
//            | started | new | learning | familiar | solid | mastered | due | weak | all   (what state they are in)
// set/group/topic terms add up (union); the state terms narrow the result (all of them must hold).
import type { DataIndex } from '../core/index';
import type { Attempt, Gender, Progress, Word } from '../core/types';
import { dueCards, mastery, MASTERY_NAMES } from '../core/srs';
import { antonymsOf, synonymPairs } from '../core/generate';
import { articleFor, isIrregularVerb, verbForms, nounForms } from '../core/forms';

const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
export const STATE_TERMS = ['all', 'started', 'new', 'learning', 'familiar', 'solid', 'mastered', 'due', 'weak'] as const;

export interface Ctx { idx: DataIndex; progress: Progress; attempts: Attempt[] }
export interface Scope {
  words: Word[];           // after the limit (use for plain word lists)
  all: Word[];             // before the limit (tables apply the limit to their own rows)
  label: string; limit?: number; weak: boolean;
  single?: { level: 'set' | 'group' | 'topic'; id: string };     // exactly one container and no state terms
  error?: string;
}

function pickByName<T>(items: T[], ref: string, id: (t: T) => string, name: (t: T) => string): T | undefined {
  const r = fold(ref);
  return items.find((t) => fold(id(t)) === r || fold(name(t)) === r)
    ?? items.find((t) => fold(name(t)).startsWith(r)) ?? items.find((t) => fold(name(t)).includes(r));
}

export function resolveScope(ctx: Ctx, text: string): Scope {
  const { idx, progress: p } = ctx;
  let body = text.trim(), limit: number | undefined;
  const bar = body.lastIndexOf('|');
  if (bar >= 0 && /^\d+$/.test(body.slice(bar + 1).trim())) { limit = parseInt(body.slice(bar + 1), 10); body = body.slice(0, bar).trim(); }
  const topics = idx.bundle.topics;
  const groups = topics.flatMap((t) => t.groups);
  const sets = idx.sets.map((x) => x.set);

  const containers: { level: 'set' | 'group' | 'topic'; id: string; name: string; words: Word[] }[] = [];
  const states: string[] = [];
  const fail = (m: string): Scope => ({ words: [], all: [], label: '', weak: false, error: m });
  const hint = 'Try: set 3, group <name>, topic <name>, started, due, weak, new, learning, familiar, solid, mastered — combine with +, limit with | 10.';

  for (const raw of body.split('+').map((t) => t.trim()).filter(Boolean)) {
    const lower = raw.toLowerCase();
    if ((STATE_TERMS as readonly string[]).includes(lower)) { if (lower !== 'all') states.push(lower); continue; }
    const m = /^(set|group|topic)\s+(.+)$/i.exec(raw);
    const level = (m ? m[1].toLowerCase() : null) as 'set' | 'group' | 'topic' | null;
    const ref = m ? m[2].trim() : raw;
    const num = /^\d+$/.test(ref) ? parseInt(ref, 10) : null;
    const tryLevel = (lv: 'set' | 'group' | 'topic') => {
      if (lv === 'set') { const s = num !== null ? sets[num - 1] : pickByName(sets, ref, (x) => x.id, (x) => x.name); return s && { level: lv, id: s.id, name: `Set ${idx.sets.findIndex((x) => x.set.id === s.id) + 1} · ${s.name}`, words: s.words }; }
      if (lv === 'group') { const g = num !== null ? groups[num - 1] : pickByName(groups, ref, (x) => x.id, (x) => x.name); return g && { level: lv, id: g.id, name: g.name, words: g.sets.flatMap((s) => s.words) }; }
      const t = num !== null ? topics[num - 1] : pickByName(topics, ref, (x) => x.id, (x) => x.name);
      return t && { level: lv, id: t.id, name: t.name, words: t.groups.flatMap((g) => g.sets.flatMap((s) => s.words)) };
    };
    const found = level ? tryLevel(level) : num !== null ? tryLevel('set') : (tryLevel('set') ?? tryLevel('group') ?? tryLevel('topic'));
    if (!found) return fail(`Don't know “${raw}”. ${hint}`);
    containers.push(found);
  }

  let words = containers.length ? [...new Map(containers.flatMap((c) => c.words).map((w) => [w.id, w])).values()] : [...idx.words];
  const dueIds = new Set(dueCards(p).map((d) => d.wordId));
  const misses = (id: string) => Object.entries(p.cards).reduce((a, [k, c]) => (k.startsWith(id + '|') ? a + c.misses : a), 0);
  const level = ['new', 'learning', 'familiar', 'solid', 'mastered'];
  for (const s of states) {
    if (s === 'started') words = words.filter((w) => p.introduced[w.id] !== undefined);
    else if (s === 'due') words = words.filter((w) => dueIds.has(w.id));
    else if (s === 'weak') words = words.filter((w) => misses(w.id) > 0);
    else words = words.filter((w) => mastery(p, w.id) === level.indexOf(s));
  }
  const weak = states.includes('weak');
  if (weak) words = [...words].sort((a, b) => misses(b.id) - misses(a.id));
  const label = [...containers.map((c) => c.name), ...states].join(' + ') || 'everything';
  const single = containers.length === 1 && !states.length ? { level: containers[0].level, id: containers[0].id } : undefined;
  return { words: limit !== undefined ? words.slice(0, limit) : words, all: words, label, limit, weak, single };
}

// ---------------------------------------------------------------- tables
export interface Cell { t: string; w?: string; art?: Gender | null | 'pl'; dot?: number; irr?: boolean; mono?: boolean; muted?: boolean }
export interface Table { caption: string; columns: string[]; rows: Cell[][]; note?: string; error?: string }
export type TableKind = 'words' | 'nouns' | 'verbs' | 'irregular' | 'rektion' | 'synonyms' | 'opposites' | 'mistakes';
export const TABLE_KINDS: TableKind[] = ['words', 'nouns', 'verbs', 'irregular', 'rektion', 'synonyms', 'opposites', 'mistakes'];
const MAX_ROWS = 300;

const gerCell = (w: Word): Cell => ({ t: w.lemma, w: w.id, art: w.noun ? (w.noun.gender ?? 'pl') : undefined });
const english = (w: Word) => w.senses.map((s) => s.en[0]).slice(0, 3).join(', ');
const misses = (p: Progress, id: string) => Object.entries(p.cards).reduce((a, [k, c]) => (k.startsWith(id + '|') ? a + c.misses : a), 0);
const setName = (idx: DataIndex, w: Word) => { const h = idx.home.get(w.id); return h ? `Set ${h.setOrder + 1}` : ''; };
const rektionText = (r: NonNullable<Word['rektion']>[number]) => r.pattern.replace(/\{(\d+)\}/g, (_, n) => (r.slots[+n]?.prep ? `${r.slots[+n].prep} (${r.slots[+n].case})` : `(${r.slots[+n]?.case})`));

export function buildTable(kind: TableKind, arg: string, ctx: Ctx): Table {
  const { idx, progress: p } = ctx;
  let text = arg;
  let limitOnly: number | undefined;
  if (kind === 'mistakes' && /^\d+$/.test(arg.trim())) { limitOnly = parseInt(arg, 10); text = ''; }
  const sc = resolveScope(ctx, text);
  if (sc.error) return { caption: '', columns: [], rows: [], error: sc.error };
  const limit = limitOnly ?? sc.limit;
  const inScope = new Set(sc.all.map((w) => w.id));
  const scoped = !!text.trim();
  const title = (name: string) => `${name} · ${sc.label}`;
  let rows: Cell[][] = [], columns: string[] = [], caption = '';

  switch (kind) {
    case 'words': {
      columns = ['German', 'English', 'Set', 'Level', ...(sc.weak ? ['Misses'] : [])];
      rows = sc.all.map((w) => [gerCell(w), { t: english(w) }, { t: setName(idx, w), mono: true, muted: true }, { t: MASTERY_NAMES[mastery(p, w.id)], dot: mastery(p, w.id) }, ...(sc.weak ? [{ t: String(misses(p, w.id)), mono: true }] : [])]);
      caption = title('Words'); break;
    }
    case 'nouns': {
      const ws = sc.all.filter((w) => w.pos === 'noun' && w.noun);
      columns = ['German', 'Plural', 'Genitive', 'English'];
      rows = ws.map((w) => { const nf = nounForms(w); return [gerCell(w), { t: !w.noun!.plural || w.noun!.number === 'singular-only' ? '—' : `die ${w.noun!.plural}`, muted: !w.noun!.plural }, { t: nf ? nf.Gen[0] : '—' }, { t: english(w) }]; });
      caption = title('Nouns'); break;
    }
    case 'verbs': case 'irregular': {
      const ws = sc.all.filter((w) => w.pos === 'verb' && (kind === 'verbs' || isIrregularVerb(w, idx.byId)));
      columns = ['Infinitive', 'er/sie/es', 'Präteritum', 'Partizip II', 'Hilfsverb', 'English'];
      rows = ws.flatMap((w) => {
        const f = verbForms(w, idx.byId); if (!f) return [];
        const irr = (k: string) => f.irregular.has(k as never);
        return [[gerCell(w), { t: f.praesens3sg, irr: irr('praesens3sg') }, { t: f.praeteritum, irr: irr('praeteritum') }, { t: f.partizip2, irr: irr('partizip2') }, { t: f.aux, irr: irr('aux') }, { t: english(w) }]];
      });
      caption = title(kind === 'verbs' ? 'Verbs' : 'Irregular verbs'); break;
    }
    case 'rektion': {
      columns = ['Word', 'Pattern', 'Meaning'];
      rows = sc.all.flatMap((w) => (w.rektion ?? []).map((r) => [gerCell(w), { t: rektionText(r) }, { t: r.en, muted: true }]));
      caption = title('Rektion'); break;
    }
    case 'synonyms': {
      columns = ['Word', 'Instead of', 'Difference'];
      const seen = new Set<string>();
      for (const pr of synonymPairs(idx)) {
        if (!inScope.has(pr.host.id) && !inScope.has(pr.other.id)) continue;
        const k = `${pr.host.id}|${pr.other.id}`; if (seen.has(k)) continue; seen.add(k);
        rows.push([gerCell(pr.host), gerCell(pr.other), { t: pr.contrast, muted: true }]);
      }
      caption = title('Near-synonyms'); break;
    }
    case 'opposites': {
      columns = ['Word', 'Opposite'];
      const seen = new Set<string>();
      for (const w of sc.all) for (const o of antonymsOf(idx, w)) {
        const k = [w.id, o.id].sort().join('|'); if (seen.has(k)) continue; seen.add(k);
        rows.push([gerCell(w), gerCell(o)]);
      }
      caption = title('Opposites'); break;
    }
    case 'mistakes': {
      const n = limit ?? 10;
      const missed = ctx.attempts.flatMap((a) => a.items.filter((i) => !i.correct && (!scoped || inScope.has(i.wordId))).map((i) => ({ a, i })));
      missed.sort((x, y) => y.a.endedAt.localeCompare(x.a.endedAt));
      columns = ['When', 'Prompt', 'You wrote', 'Answer'];
      rows = missed.slice(0, n).map(({ a, i }) => [{ t: new Date(a.endedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), mono: true, muted: true }, { t: i.prompt, w: i.wordId.startsWith('text:') ? undefined : i.wordId }, { t: i.given || '—' }, { t: i.expected }]);
      caption = `Recent mistakes${scoped ? ` · ${sc.label}` : ''} · ${rows.length}`;
      if (!rows.length) return { caption, columns, rows, note: 'No mistakes recorded — nice.' };
      return { caption, columns, rows };
    }
  }
  const total = rows.length;
  if (limit !== undefined) rows = rows.slice(0, limit);
  const t: Table = { caption: `${caption} · ${Math.min(rows.length, MAX_ROWS)}${total > rows.length ? ` of ${total}` : ''}`, columns, rows: rows.slice(0, MAX_ROWS) };
  if (rows.length > MAX_ROWS) t.note = `Showing the first ${MAX_ROWS} of ${rows.length}. Add “| 50” to limit it.`;
  if (!rows.length) t.note = 'Nothing matches.';
  return t;
}
