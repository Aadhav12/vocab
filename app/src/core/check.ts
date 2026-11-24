// Answer checking for all typed exercises.
import type { CheckKind, Field, Word } from './types';
import { articleFor } from './forms';

export interface CheckResult { ok: boolean; kind: 'ok' | 'wrong' | 'alt'; note?: string }

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const ESC = /[.*+?^${}()|[\]\\]/g;
/** Build a regex that accepts ae/oe/ue/ss wherever the expected answer has ä/ö/ü/ß. */
export function germanRegex(expected: string): RegExp {
  let out = '';
  for (const ch of clean(expected)) {
    if (ch === 'ä') out += '(?:ä|ae)'; else if (ch === 'ö') out += '(?:ö|oe)'; else if (ch === 'ü') out += '(?:ü|ue)';
    else if (ch === 'ß') out += '(?:ß|ss)';
    else if (ch === 'Ä') out += '(?:Ä|Ae)'; else if (ch === 'Ö') out += '(?:Ö|Oe)'; else if (ch === 'Ü') out += '(?:Ü|Ue)';
    else out += ch.replace(ESC, '\\$&');
  }
  return new RegExp(`^${out}$`);
}
export function germanEq(given: string, expected: string): boolean { return germanRegex(expected).test(clean(given)); }
/** Case-insensitive variant used to detect capitalisation near-misses. */
export function germanEqLoose(given: string, expected: string): boolean {
  return new RegExp(germanRegex(expected).source, 'i').test(clean(given));
}
const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

export function normEn(s: string): string {
  return s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[.,;:!?"'’]/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^(to|the|a|an)\s+/, '').trim();
}
export function checkEnglish(given: string, accepted: string[]): CheckResult {
  const g = normEn(given);
  if (!g) return { ok: false, kind: 'wrong' };
  for (const a of accepted) if (normEn(a) === g) return { ok: true, kind: 'ok' };
  for (const a of accepted) if (levenshtein(normEn(a), g) === 1 && g.length > 3) return { ok: false, kind: 'wrong', note: `Near miss — one letter off from “${a}”` };
  return { ok: false, kind: 'wrong' };
}

const ARTS = ['der', 'die', 'das'];

/** Noun answer: article + capitalised lemma, e.g. "die Bewerbung". */
export function checkNoun(given: string, expected: string): CheckResult {
  const g = clean(given), [eArt, ...rest] = expected.split(' ');
  const eLem = rest.join(' ');
  if (germanEq(g, expected)) return { ok: true, kind: 'ok' };
  const parts = g.split(' ');
  const gArt = parts[0]?.toLowerCase();
  if (!ARTS.includes(gArt)) {
    if (germanEqLoose(g, eLem) || germanEqLoose(g, expected)) {
      return { ok: false, kind: 'wrong', note: germanEq(g, eLem) ? 'Nouns need the article' : 'Nouns need a capital letter' };
    }
    if (levenshtein(fold(g), fold(eLem)) === 1) return { ok: false, kind: 'wrong', note: 'Near miss — one letter off' };
    return { ok: false, kind: 'wrong' };
  }
  const gLem = parts.slice(1).join(' ');
  if (germanEq(gLem, eLem)) return { ok: false, kind: 'wrong', note: gArt === eArt ? undefined : `Wrong article — it is ${eArt}` };
  if (germanEqLoose(gLem, eLem)) return { ok: false, kind: 'wrong', note: 'Nouns need a capital letter' };
  if (levenshtein(fold(gLem), fold(eLem)) === 1) return { ok: false, kind: 'wrong', note: 'Near miss — one letter off' };
  return { ok: false, kind: 'wrong' };
}

/** Generic German word/phrase check (case-sensitive, umlaut-lenient). */
export function checkWord(given: string, expected: string, accept: string[] = []): CheckResult {
  const g = clean(given);
  if (!g) return { ok: false, kind: 'wrong' };
  for (const e of [expected, ...accept]) if (germanEq(g, e)) return { ok: true, kind: 'ok' };
  for (const e of [expected, ...accept]) {
    if (germanEqLoose(g, e)) return { ok: false, kind: 'wrong', note: 'Check the capitalisation' };
  }
  for (const e of [expected, ...accept]) if (e.length > 3 && levenshtein(fold(g), fold(e)) === 1) return { ok: false, kind: 'wrong', note: 'Near miss — one letter off' };
  return { ok: false, kind: 'wrong' };
}

/** Plural: with or without the leading "die". */
export function checkPlural(given: string, expected: string): CheckResult {
  const g = clean(given).replace(/^die\s+/, '');
  const e = expected.replace(/^die\s+/, '');
  if (germanEq(g, e)) return { ok: true, kind: 'ok' };
  if (germanEqLoose(g, e)) return { ok: false, kind: 'wrong', note: 'Check the capitalisation' };
  if (levenshtein(fold(g), fold(e)) === 1) return { ok: false, kind: 'wrong', note: 'Near miss — one letter off' };
  return { ok: false, kind: 'wrong' };
}

export function checkField(f: Field, given: string): CheckResult {
  const kind: CheckKind = f.check;
  switch (kind) {
    case 'en': return checkEnglish(given, f.accept ?? [f.expected]);
    case 'noun': {
      const rs = [f.expected, ...(f.accept ?? [])].map((e) => checkNoun(given, e));
      return rs.find((r) => r.ok) ?? rs[0];
    }
    case 'plural': return checkPlural(given, f.expected);
    case 'prep': return checkWord(given.toLowerCase(), f.expected, f.accept);
    case 'choice': return given === f.expected ? { ok: true, kind: 'ok' } : { ok: false, kind: 'wrong' };
    default: return checkWord(given, f.expected, f.accept);
  }
}

/** German lemma with article as the learner is expected to type it. */
export function expectedGerman(w: Word): string {
  return w.pos === 'noun' && w.noun ? `${articleFor(w.noun.gender, 'Nom')} ${w.lemma}` : w.lemma;
}

export function allEnglish(w: Word): string[] { return w.senses.flatMap((s) => s.en); }

/** English → German: a different valid German word whose English overlaps counts as "alt". */
export function checkEnToDe(given: string, target: Word, candidates: Word[]): CheckResult {
  const expected = expectedGerman(target);
  const r = checkNoun0(given, target, expected);
  if (r.ok) return r;
  const myEn = new Set(allEnglish(target).map(normEn));
  for (const c of candidates) {
    if (c.id === target.id) continue;
    if (!allEnglish(c).some((e) => myEn.has(normEn(e)))) continue;
    if (checkNoun0(given, c, expectedGerman(c)).ok) return { ok: false, kind: 'alt', note: 'Valid, but we want another word — try again' };
  }
  return r;
}
function checkNoun0(given: string, w: Word, expected: string): CheckResult {
  return w.pos === 'noun' ? checkNoun(given, expected) : checkWord(given, expected);
}

/** Is this a printable keystroke (for first-key timing)? */
export function isPrintable(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}
