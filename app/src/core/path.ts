// Path building: one linear path over the data, plus inserted nodes.
import type { DataIndex } from './index';
import type { Format, Insert, Progress, Word } from './types';
import { FORMATS, FORMAT_NAMES } from './types';
import { itemsForFormat } from './generate';
import { activeInserts, dueCards, leechCards } from './srs';

export type NodeType =
  | 'warmup' | 'intro' | 'flash' | 'fmt' | 'reading' | 'test'
  | 'gquiz' | 'greading' | 'gtest' | 'tflash' | 'tquiz' | 'treading' | 'ttest'
  | 'recheck' | 'leech' | 'catchup';
export type Level = 'set' | 'group' | 'topic';

export interface PathNode {
  id: string; type: NodeType; name: string; sub: string; glyph: string; boss: boolean;
  level: Level; scopeId: string; topicId: string; groupId?: string; setId?: string;
  format?: Format; textId?: string; section: string; passKind: 'all' | 'test';
  inserted?: Insert;
}

export const isTestType = (t: NodeType) => t === 'test' || t === 'gtest' || t === 'ttest' || t === 'recheck';

export interface Path { nodes: PathNode[]; byId: Map<string, PathNode> }

export function buildPath(idx: DataIndex): Path {
  const nodes: PathNode[] = [];
  const push = (n: Omit<PathNode, 'passKind'> & { passKind?: PathNode['passKind'] }) =>
    nodes.push({ passKind: isTestType(n.type) ? 'test' : 'all', ...n });
  for (const topic of idx.bundle.topics) {
    for (const group of topic.groups) {
      for (const s of group.sets) {
        const info = idx.sets.find((x) => x.set.id === s.id)!;
        const section = `${group.name} · Set ${info.order + 1} · ${s.name}`;
        // a format step exists only if it can produce questions for a learner who has met every word up to this set
        const known = (id: string) => (idx.home.get(idx.byId.get(id)?.id ?? id)?.setOrder ?? 0) <= info.order;
        const base = { level: 'set' as const, scopeId: s.id, topicId: topic.id, groupId: group.id, setId: s.id, section };
        push({ ...base, id: `set:${s.id}:warmup`, type: 'warmup', name: 'Warm-up', sub: 'review due cards', glyph: '↺', boss: false });
        push({ ...base, id: `set:${s.id}:intro`, type: 'intro', name: 'Introduce', sub: `${s.words.length} new words`, glyph: '✦', boss: false });
        push({ ...base, id: `set:${s.id}:flash`, type: 'flash', name: 'Flashcards', sub: 'clean + fast', glyph: '⌨', boss: false });
        for (const f of FORMATS) {
          if (itemsForFormat(f, s.words, { idx, rng: () => 0.5, known }).length > 0) {
            push({ ...base, id: `set:${s.id}:fmt:${f}`, type: 'fmt', format: f, name: FORMAT_NAMES[f], sub: 'every answer correct', glyph: '◆', boss: false });
          }
        }
        if (s.text) push({ ...base, id: `set:${s.id}:reading`, type: 'reading', name: 'Reading', sub: s.text.title, glyph: '¶', boss: false, textId: s.text.id });
        push({ ...base, id: `set:${s.id}:test`, type: 'test', name: 'Set test', sub: '90% to pass', glyph: '★', boss: true });
      }
      const gs = { level: 'group' as const, scopeId: group.id, topicId: topic.id, groupId: group.id, section: `${group.name} · Group round` };
      push({ ...gs, id: `group:${group.id}:quiz`, type: 'gquiz', name: 'Group quizzes', sub: 'all formats mixed', glyph: '◆', boss: false });
      for (const t of group.texts) push({ ...gs, id: `group:${group.id}:reading:${t.id}`, type: 'greading', name: 'Group reading', sub: t.title, glyph: '¶', boss: false, textId: t.id });
      push({ ...gs, id: `group:${group.id}:test`, type: 'gtest', name: 'Group test', sub: '90% to pass', glyph: '★', boss: true });
    }
    const ts = { level: 'topic' as const, scopeId: topic.id, topicId: topic.id, section: `${topic.name} · Topic round` };
    push({ ...ts, id: `topic:${topic.id}:flash`, type: 'tflash', name: 'Topic flashcards', sub: 'chunks of ~12 words', glyph: '⌨', boss: false });
    push({ ...ts, id: `topic:${topic.id}:quiz`, type: 'tquiz', name: 'Topic quizzes', sub: 'all formats mixed', glyph: '◆', boss: false });
    for (const t of topic.texts) push({ ...ts, id: `topic:${topic.id}:reading:${t.id}`, type: 'treading', name: 'Topic reading', sub: t.title, glyph: '¶', boss: false, textId: t.id });
    push({ ...ts, id: `topic:${topic.id}:test`, type: 'ttest', name: 'Topic test', sub: '90% to pass', glyph: '★', boss: true });
  }
  return { nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
}

export function insertNode(idx: DataIndex, ins: Insert): PathNode {
  const sc = ins.scopeId ?? '';
  const topicOf = (level: string, id: string) =>
    level === 'topic' ? id : level === 'group' ? idx.bundle.topics.find((t) => t.groups.some((g) => g.id === id))?.id ?? '' : idx.sets.find((x) => x.set.id === id)?.topic.id ?? '';
  if (ins.kind === 'recheck') {
    const nm = ins.level === 'set' ? idx.setById.get(sc)?.name : ins.level === 'group' ? idx.groupById.get(sc)?.name : idx.topicById.get(sc)?.name;
    return {
      id: ins.id, type: 'recheck', name: `Recheck · ${nm ?? sc}`, sub: `${ins.level} test`, glyph: '↻', boss: true, level: ins.level ?? 'set', scopeId: sc,
      topicId: topicOf(ins.level ?? 'set', sc), section: 'Review inserted here', passKind: 'test', inserted: ins,
    };
  }
  if (ins.kind === 'leech') {
    return { id: ins.id, type: 'leech', name: 'Leech drill', sub: `${ins.wordIds?.length ?? 0} stubborn words`, glyph: '⚑', boss: false, level: 'set', scopeId: '', topicId: '', section: 'Review inserted here', passKind: 'all', inserted: ins };
  }
  return { id: ins.id, type: 'catchup', name: 'Catch-up review', sub: 'too many cards due', glyph: '↻', boss: false, level: 'set', scopeId: '', topicId: '', section: 'Review inserted here', passKind: 'all', inserted: ins };
}

export interface Position { inserts: PathNode[]; node: PathNode | null; index: number }
export function position(idx: DataIndex, path: Path, p: Progress): Position {
  const index = path.nodes.findIndex((n) => !p.passed[n.id]);
  const node = index >= 0 ? path.nodes[index] : null;
  return { inserts: activeInserts(p).map((i) => insertNode(idx, i)), node, index };
}

/** Keeps leech and catch-up inserts in sync with the records. Returns true if anything changed. */
export function syncInserts(idx: DataIndex, path: Path, p: Progress): boolean {
  let changed = false;
  // leeches
  const leeches = leechCards(p);
  const have = new Set(p.inserts.filter((i) => i.kind === 'leech').flatMap((i) => i.wordIds ?? []));
  const fresh = [...new Set(leeches.map((l) => l.wordId))].filter((w) => !have.has(w) && idx.byId.has(w));
  if (fresh.length) {
    p.inserts.push({
      id: `leech:${p.setCount}:${Date.now()}`, kind: 'leech', dueAt: p.setCount, wordIds: fresh,
      cards: leeches.filter((l) => fresh.includes(l.wordId)).map((l) => `${l.wordId}|${l.card}`),
    });
    changed = true;
  }
  // catch-up
  const cur = path.nodes.find((n) => !p.passed[n.id]);
  const hasCatch = p.inserts.some((i) => i.kind === 'catchup');
  if (cur?.type === 'intro' && !hasCatch && dueCards(p).length > p.settings.backlogLimit) {
    p.inserts.push({ id: `catchup:${p.setCount}:${Date.now()}`, kind: 'catchup', dueAt: p.setCount, after: cur.id });
    changed = true;
  }
  return changed;
}

export interface TopicStats { total: number; done: number; words: number; sets: number; groups: number; health: number; unlocked: boolean; done100: boolean }
export function topicStats(idx: DataIndex, path: Path, p: Progress, topicId: string): TopicStats {
  const topic = idx.topicById.get(topicId)!;
  const nodes = path.nodes.filter((n) => n.topicId === topicId);
  const done = nodes.filter((n) => p.passed[n.id]).length;
  const ws: Word[] = topic.groups.flatMap((g) => g.sets.flatMap((s) => s.words));
  const intro = ws.filter((w) => p.introduced[w.id] !== undefined);
  let health = 1;
  if (intro.length) {
    const overdue = new Set<string>();
    for (const [k, c] of Object.entries(p.cards)) if (c.due < p.setCount) { const id = k.slice(0, k.indexOf('|')); overdue.add(id); }
    health = intro.filter((w) => !overdue.has(w.id)).length / intro.length;
  }
  const failed = p.inserts.filter((i) => i.kind === 'recheck' && i.dueAt <= p.setCount && insertNode(idx, i).topicId === topicId).length;
  health = Math.max(0, health - 0.1 * failed);
  const firstIdx = path.nodes.findIndex((n) => n.topicId === topicId);
  const unlocked = firstIdx <= 0 || path.nodes.slice(0, firstIdx).every((n) => p.passed[n.id]);
  return { total: nodes.length, done, words: ws.length, sets: topic.groups.reduce((a, g) => a + g.sets.length, 0), groups: topic.groups.length, health, unlocked, done100: done === nodes.length && nodes.length > 0 };
}
