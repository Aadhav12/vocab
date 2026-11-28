// Shared types: data files, records, exercise items.

export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | 'conj' | 'phrase';
export type Gender = 'm' | 'f' | 'n';
export type Case = 'Nom' | 'Akk' | 'Dat' | 'Gen';

export interface Sense { en: string[]; hint?: string; domain?: string; register?: string }
export interface Derivation { from: string; type: 'prefix-verb' | 'nominalisation' | 'agent' | 'adjective' | 'adverb' | 'compound' | 'other' }
export interface RektionSlot { prep: string | null; case: Case; obj?: string }
export interface Rektion { pattern: string; slots: RektionSlot[]; en: string; example?: string }
export interface SynonymLink { id: string; contrast: string; example: string }
export interface Collocation { de: string; en: string; type?: 'noun-verb' | 'funktionsverbgefuege' | 'other' }
export interface Example { de: string; en: string; sense?: number }

export interface NounBlock {
  gender: Gender | null; plural: string | null; genitive?: string;
  declension?: 'strong' | 'weak-n' | 'adjectival' | 'mixed';
  number?: 'both' | 'singular-only' | 'plural-only';
  compound?: string[];
  forms?: Record<string, string>;
}
export interface VerbBlock {
  class?: 'strong' | 'weak' | 'mixed' | 'modal' | 'irregular';
  separable?: boolean; prefix?: string;
  reflexive?: 'none' | 'akk' | 'dat' | 'optional';
  transitive?: boolean; conjugatesLike?: string;
  principal?: { praesens3sg?: string; praeteritum?: string; partizip2?: string; aux?: 'haben' | 'sein' | 'haben/sein' };
  praesens?: { du?: string; er?: string };
  konjunktiv2?: string; imperativ?: { du?: string; ihr?: string };
  irregular?: string[];
}
export interface AdjBlock { komparativ?: string; superlativ?: string; noComparison?: boolean; use?: 'both' | 'attributive-only' | 'predicative-only'; irregular?: boolean | string[] }
export interface PrepBlock {
  cases: Case[]; contractions?: string[]; position?: 'pre' | 'post';
  fill?: { de: string; en: string }[];
}
export interface ConjBlock {
  kind?: 'subordinating' | 'coordinating' | 'adverb' | 'two-part';
  verbPosition?: 'end' | 'second' | 'inverted'; pair?: string;
  drills?: { correct: string; distractors: string[] }[];
}
export interface PhraseBlock { governs?: Case; fixed?: boolean }

export interface Word {
  id: string; lemma: string; pos: Pos; level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  senses: Sense[]; derivation?: Derivation; rektion?: Rektion[];
  synonyms?: SynonymLink[]; antonyms?: string[]; collocations?: Collocation[];
  examples: Example[]; notes?: string | string[]; aliases?: string[]; topics?: string[];
  noun?: NounBlock; verb?: VerbBlock; adj?: AdjBlock; prep?: PrepBlock; conj?: ConjBlock; phrase?: PhraseBlock;
}

export type QuestionType =
  | { type: 'rfn'; prompt: string; answer: 'richtig' | 'falsch' | 'nicht_im_text' }
  | { type: 'mc'; prompt: string; options: string[]; answer: number }
  | { type: 'heading'; paragraph: number; options: string[]; answer: number };

export interface TextFile {
  id: string; title: string; paragraphs: string[]; uses?: string[]; questions: QuestionType[];
}

export interface SetData { id: string; name: string; words: Word[]; text?: TextFile; file: string }
export interface GroupData { id: string; name: string; description?: string; sets: SetData[]; texts: TextFile[] }
export interface TopicData { id: string; name: string; description?: string; groups: GroupData[]; texts: TextFile[] }
export interface Problem { file: string; message: string }
export interface DataBundle { topics: TopicData[]; problems: Problem[]; version: number }

// ---------- records ----------
export interface Settings {
  recogThreshold: number; prodThreshold: number; passTest: number; backlogLimit: number;
  leechThreshold: number; reviewMix: number; tts: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  recogThreshold: 1.5, prodThreshold: 2.0, passTest: 0.9, backlogLimit: 150, leechThreshold: 6, reviewMix: 0.25, tts: true,
};

export interface CardState { step: number; due: number; reps: number; misses: number; promotedAt: number; leechClearedAt?: number }
export interface Insert {
  id: string; kind: 'recheck' | 'leech' | 'catchup'; level?: 'set' | 'group' | 'topic'; scopeId?: string;
  dueAt: number; wordIds?: string[]; cards?: string[]; after?: string;
}
export interface PassedInfo { bestScore: number; attempts: number; firstPassedAt: string }
export interface Progress {
  schemaVersion: 1; setCount: number;
  passed: Record<string, PassedInfo>;
  introduced: Record<string, number>;
  cards: Record<string, CardState>;
  inserts: Insert[];
  xp: number; streak: { last: string | null; count: number };
  settings: Settings;
  /** end time of the newest attempt folded into this file; lets `npm run recover` find attempts that never got saved */
  lastAttemptAt?: string;
}
export function emptyProgress(): Progress {
  return { schemaVersion: 1, setCount: 0, passed: {}, introduced: {}, cards: {}, inserts: [], xp: 0, streak: { last: null, count: 0 }, settings: { ...DEFAULT_SETTINGS } };
}

export interface AttemptItem {
  format: string; wordId: string; card: string; prompt: string; expected: string; given: string;
  correct: boolean; note?: string; firstKeyMs?: number | null; section?: string;
}
export interface Attempt {
  nodeId: string; attempt: number; startedAt: string; endedAt: string; durationMs: number; setCount: number; replay: boolean;
  score: number; passMark: number; passed: boolean;
  items: AttemptItem[];
  clickedWords?: string[];
  rounds?: { round: number; misses: number; avgRecogMs: number | null; avgProdMs: number | null; chunk?: number }[];
  sections?: { name: string; correct: number; total: number }[];
}

// ---------- exercises ----------
export const FORMATS = [
  'article', 'plural', 'declension', 'match', 'opposites', 'principal', 'comparison', 'rektion', 'case',
  'collocation', 'tree', 'formation', 'synonyms', 'connectors',
] as const;
export type Format = typeof FORMATS[number];
export type AnyFormat = Format | 'flash' | 'reading';

export const FORMAT_NAMES: Record<AnyFormat, string> = {
  flash: 'Flashcards', article: 'Article blitz', plural: 'Plural', declension: 'Declension', match: 'Match the following',
  opposites: 'Opposites', principal: 'Principal parts', comparison: 'Comparison', rektion: 'Rektion', case: 'Case government',
  collocation: 'Collocations', tree: 'Build the tree', formation: 'Word formation',
  synonyms: 'Near-synonyms', connectors: 'Connectors', reading: 'Reading',
};

export type CardType =
  | 'de-en' | 'en-de' | 'article' | 'plural' | 'declension' | 'principal' | 'comparison' | 'rektion' | 'case'
  | 'collocation' | 'family' | 'formation' | 'synonym' | 'connector' | 'opposite';
export const CORE_CARDS: CardType[] = ['de-en', 'en-de', 'article', 'plural', 'principal', 'rektion'];

export type CheckKind = 'en' | 'noun' | 'word' | 'plural' | 'prep' | 'choice';
export interface Field {
  key: string; label: string; expected: string; check: CheckKind; accept?: string[];
  choices?: string[]; indent?: number; prefill?: string; locked?: boolean; art?: Gender;
}
export interface PassageRef { title: string; paragraphs: string[]; textId: string }
export interface Item {
  id: string; format: AnyFormat; wordId: string; card: CardType; section?: string;
  mode: 'fields' | 'choice' | 'match';
  label: string; main?: string; mainArt?: Gender; sub?: string; sentence?: string; translation?: string; hint?: string;
  fields?: Field[];
  choices?: string[]; answerIdx?: number; keyed?: boolean;
  board?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] };
  contrast?: string; speak?: string; passage?: PassageRef; tree?: boolean;
  /** english→german: other valid german words (id -> German with article) for the alt check */
  altWords?: { wordId: string; display: string }[];
  weak?: boolean; promptText?: string;
}

export interface ItemResult {
  item: Item; wordId: string; card: CardType; correct: boolean; given: string; expected: string; note?: string; firstKeyMs: number | null;
}
