// Finding a word from text a person typed: "der Anstieg", "Anstieg", "anstieg", "der-anstieg", "Rueckgang" …
import type { DataIndex } from './index';
import type { Word } from './types';
import { expectedGerman } from './check';

const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
const ART = /^(der|die|das)\s+/;

export function findWordByText(idx: DataIndex, text: string): Word | null {
  const t = fold(text);
  if (!t) return null;
  const direct = idx.byId.get(t.replace(/ /g, '-')) ?? idx.byId.get(text.trim());
  if (direct) return direct;
  const full = idx.words.find((w) => fold(expectedGerman(w)) === t);   // article + lemma ("der anstieg", "sich bewerben")
  if (full) return full;
  const bare = t.replace(ART, '');
  const sameLemma = idx.words.filter((w) => fold(w.lemma) === bare);
  if (!sameLemma.length) return null;
  const art = ART.exec(t)?.[1];
  return sameLemma.find((w) => w.noun && art && fold(expectedGerman(w)).startsWith(art)) ?? sameLemma[0];
}
