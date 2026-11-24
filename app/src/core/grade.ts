// Grading an item once the learner has answered.
import type { Item, ItemResult } from './types';
import type { CheckResult } from './check';
import { checkField, checkNoun, checkWord } from './check';

export interface Grade { correct: boolean; alt: boolean; perField: CheckResult[]; note?: string; given: string; expected: string }

export function gradeFields(item: Item, given: string[]): Grade {
  const fields = item.fields ?? [];
  const typed = fields.map((f, i) => (f.locked ? f.expected : given[i] ?? ''));
  const perField = fields.map((f, i) => (f.locked ? ({ ok: true, kind: 'ok' } as CheckResult) : checkField(f, typed[i])));
  let alt = false;
  if (item.altWords?.length && fields.length === 1 && !perField[0].ok) {
    const g = typed[0];
    for (const a of item.altWords) {
      const r = a.display.includes(' ') && /^(der|die|das) /.test(a.display) ? checkNoun(g, a.display) : checkWord(g, a.display);
      if (r.ok) { alt = true; perField[0] = { ok: false, kind: 'alt', note: 'Valid, but we want another word — try again' }; break; }
    }
  }
  const real = fields.map((f, i) => ({ f, i })).filter(({ f }) => !f.locked);
  const correct = !alt && real.every(({ i }) => perField[i].ok);
  const note = perField.find((r) => r.note)?.note;
  const given_ = real.map(({ i }) => typed[i]).join(' · ');
  const expected = real.map(({ f }) => f.expected).join(' · ');
  return { correct, alt, perField, note, given: given_, expected };
}

export function gradeChoice(item: Item, idx: number | null): Grade {
  const correct = idx === item.answerIdx;
  return {
    correct, alt: false, perField: [], note: undefined,
    given: idx == null ? '' : item.choices![idx], expected: item.choices![item.answerIdx!],
  };
}

export function promptText(item: Item): string {
  return [item.label, item.main, item.sentence, item.sub].filter(Boolean).join(' · ');
}

export function toResult(item: Item, g: Grade, firstKeyMs: number | null): ItemResult {
  return { item, wordId: item.wordId, card: item.card, correct: g.correct, given: g.given, expected: g.expected, note: g.note, firstKeyMs };
}

/** Match boards produce one result per word: wrong picks mark that word as missed. */
export function matchResults(item: Item, missed: Set<string>): ItemResult[] {
  return item.board!.left.map((l) => {
    const right = item.board!.right.find((r) => r.id === l.id)!;
    const ok = !missed.has(l.id);
    return { item, wordId: l.id, card: 'de-en' as const, correct: ok, given: ok ? right.text : '(wrong pick)', expected: right.text, firstKeyMs: null, note: undefined };
  });
}
