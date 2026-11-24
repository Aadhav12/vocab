// Form generation: verb principal parts, noun case forms, adjective comparison.
import type { Case, Word } from './types';

export type WordIndex = Map<string, Word>;

export interface VerbForms {
  du?: string;
  praesens3sg: string; praeteritum: string; partizip2: string; aux: string;
  irregular: Set<'praesens3sg' | 'praeteritum' | 'partizip2' | 'aux' | 'du'>;
  likeId?: string; likeLemma?: string;
}

const INSEPARABLE = ['be', 'emp', 'ent', 'er', 'ge', 'miss', 'ver', 'zer'];

export function isSeparable(w: Word, base?: Word): boolean {
  const v = w.verb;
  if (!v) return false;
  if (v.separable !== undefined) return v.separable;
  const lem = stripSich(w.lemma);
  if (INSEPARABLE.some((p) => lem.startsWith(p) && lem.length > p.length + 2) && !v.prefix) return false;
  return !!v.prefix || !!(base && lem !== base.lemma && lem.endsWith(stripSich(base.lemma)));
}

export function stripSich(s: string): string { return s.replace(/^sich\s+/, ''); }

function weakStem(inf: string): string {
  if (inf.endsWith('eln') || inf.endsWith('ern')) return inf.slice(0, -1);
  return inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1);
}
function needsE(stem: string): boolean {
  return /[dt]$|[bcdfgkpqstvwxzß][mn]$|chn$/.test(stem);
}

/** Weak verb forms for an infinitive without prefix handling. */
function weakBase(inf: string, hasGe: boolean): { p3: string; pret: string; p2: string } {
  const stem = weakStem(inf);
  const e = needsE(stem) ? 'e' : '';
  const lel = inf.endsWith('eln') || inf.endsWith('ern');
  const p3 = lel ? stem + 't' : stem + e + 't';
  const pret = lel ? stem + 'te' : stem + e + 'te';
  const p2 = (hasGe ? 'ge' : '') + (lel ? stem + 't' : stem + e + 't');
  return { p3, pret, p2 };
}

function splitPrefix(lemma: string, baseLemma: string): string {
  const l = stripSich(lemma), b = stripSich(baseLemma);
  return l.endsWith(b) ? l.slice(0, l.length - b.length) : '';
}

export function verbForms(w: Word, idx: WordIndex, depth = 0): VerbForms | null {
  const v = w.verb;
  if (w.pos !== 'verb' || !v || depth > 6) return null;
  const lemma = stripSich(w.lemma);
  const given = v.principal ?? {};
  const irregular = new Set<VerbForms['irregular'] extends Set<infer T> ? T : never>();
  let p3 = '', pret = '', p2 = '', aux = '', du: string | undefined;
  let likeId: string | undefined, likeLemma: string | undefined;
  const cls = v.class;

  if (v.conjugatesLike) {
    const base = idx.get(v.conjugatesLike);
    const bf = base ? verbForms(base, idx, depth + 1) : null;
    if (base && bf) {
      likeId = base.id; likeLemma = base.lemma;
      const prefix = v.prefix ?? splitPrefix(w.lemma, base.lemma);
      const sep = v.separable !== undefined ? v.separable : !INSEPARABLE.includes(prefix) && !!prefix;
      if (sep) {
        p3 = `${bf.praesens3sg} ${prefix}`; pret = `${bf.praeteritum} ${prefix}`; p2 = prefix + bf.partizip2;
        du = bf.du ? `${bf.du} ${prefix}` : undefined;
      } else {
        const strip = (s: string) => s.replace(/^ge/, '');
        p3 = prefix + bf.praesens3sg; pret = prefix + bf.praeteritum; p2 = prefix + strip(bf.partizip2);
        du = bf.du ? prefix + bf.du : undefined;
      }
      aux = bf.aux;
      bf.irregular.forEach((x) => irregular.add(x));
    }
  } else if (cls === 'weak' || (!cls && !given.praeteritum)) {
    const prefix = v.prefix ?? '';
    const sep = !!prefix && v.separable !== false;
    const inseparable = !sep && (v.separable === false || INSEPARABLE.some((p) => lemma.startsWith(p) && lemma.length > p.length + 3) || lemma.endsWith('ieren'));
    const core = sep ? lemma.slice(prefix.length) : lemma;
    const b = weakBase(core, !inseparable && !core.endsWith('ieren'));
    if (sep) { p3 = `${b.p3} ${prefix}`; pret = `${b.pret} ${prefix}`; p2 = prefix + b.p2; }
    else { p3 = b.p3; pret = b.pret; p2 = b.p2; }
    aux = 'haben';
  }
  // explicit data overrides everything
  if (given.praesens3sg) p3 = given.praesens3sg;
  if (given.praeteritum) pret = given.praeteritum;
  if (given.partizip2) p2 = given.partizip2;
  if (given.aux) aux = given.aux;
  if (v.praesens?.du) du = v.praesens.du;
  if (!aux) aux = 'haben';
  if (!p3 && !pret && !p2) return null;
  for (const k of v.irregular ?? []) irregular.add(k as never);
  if (cls && cls !== 'weak') {
    if (!v.irregular && !v.conjugatesLike) { irregular.add('praeteritum'); irregular.add('partizip2'); }
  }
  if (aux === 'sein' || aux === 'haben/sein') irregular.add('aux');
  return { du, praesens3sg: p3, praeteritum: pret, partizip2: p2, aux, irregular, likeId, likeLemma };
}

/** Does the verb need to be learned (principal parts exercise)? */
export function isIrregularVerb(w: Word, idx: WordIndex): boolean {
  if (w.pos !== 'verb' || !w.verb) return false;
  const f = verbForms(w, idx);
  if (!f) return false;
  return f.irregular.size > 0 && (f.irregular.has('praeteritum') || f.irregular.has('partizip2') || f.irregular.has('praesens3sg') || f.irregular.has('du') || f.aux !== 'haben');
}

// ---------- nouns ----------
export type Num = 'sg' | 'pl';
export interface NounForms { Nom: [string, string]; Akk: [string, string]; Dat: [string, string]; Gen: [string, string] }

export function articleFor(gender: 'm' | 'f' | 'n' | 'pl', c: Case): string {
  const t: Record<string, Record<Case, string>> = {
    m: { Nom: 'der', Akk: 'den', Dat: 'dem', Gen: 'des' },
    f: { Nom: 'die', Akk: 'die', Dat: 'der', Gen: 'der' },
    n: { Nom: 'das', Akk: 'das', Dat: 'dem', Gen: 'des' },
    pl: { Nom: 'die', Akk: 'die', Dat: 'den', Gen: 'der' },
  };
  return t[gender][c];
}

export function nounForms(w: Word): NounForms | null {
  const n = w.noun;
  if (w.pos !== 'noun' || !n) return null;
  const lem = w.lemma;
  const pl = n.plural ?? lem;
  const decl = n.declension ?? 'strong';
  const f = n.forms ?? {};
  const nEnd = (s: string) => (s.endsWith('e') ? s + 'n' : s + 'en');
  const out: NounForms = { Nom: [lem, pl], Akk: [lem, pl], Dat: [lem, pl], Gen: [lem, pl] };
  if (decl === 'weak-n') {
    out.Akk[0] = nEnd(lem); out.Dat[0] = nEnd(lem); out.Gen[0] = n.genitive ?? nEnd(lem);
  } else if (decl === 'mixed') {
    out.Akk[0] = n.genitive ? n.genitive.replace(/s$/, '') : nEnd(lem);
    out.Dat[0] = out.Akk[0]; out.Gen[0] = n.genitive ?? out.Akk[0] + 's';
  } else if (decl === 'adjectival') {
    // after the definite article (weak adjective endings)
    if (n.gender === 'm') { out.Akk[0] = lem + 'n'; out.Dat[0] = lem + 'n'; out.Gen[0] = lem + 'n'; }
    else { out.Dat[0] = lem + 'n'; out.Gen[0] = lem + 'n'; }
    out.Nom[1] = out.Akk[1] = pl; out.Dat[1] = out.Gen[1] = pl.endsWith('n') ? pl : pl + 'n';
  } else {
    out.Gen[0] = n.genitive ?? lem + (/(s|ß|x|z|sch)$/.test(lem) ? 'es' : 's');
  }
  if (decl !== 'adjectival') {
    out.Dat[1] = /(n|s)$/.test(pl) ? pl : pl + 'n';
    out.Gen[1] = pl; out.Akk[1] = pl; out.Nom[1] = pl;
  }
  for (const [k, v] of Object.entries(f)) {
    const m = /^(Nom|Akk|Dat|Gen)(Sg|Pl)$/i.exec(k);
    if (m) out[m[1] as Case][m[2].toLowerCase() === 'sg' ? 0 : 1] = v;
  }
  return out;
}

export function genderOf(w: Word): 'm' | 'f' | 'n' | null { return w.noun?.gender ?? null; }

export function withArticle(w: Word): string {
  if (w.pos === 'noun' && w.noun) return `${articleFor(w.noun.gender, 'Nom')} ${w.lemma}`;
  return w.lemma;
}

// ---------- adjectives ----------
export function adjForms(w: Word): { komparativ: string; superlativ: string; regular: boolean } | null {
  if (w.pos !== 'adj' || w.adj?.noComparison) return null;
  const a = w.adj ?? {};
  const l = w.lemma;
  let k = a.komparativ, s = a.superlativ;
  const regular = !(a.komparativ && a.superlativ);
  if (!k) k = l.endsWith('e') ? l + 'r' : /(el|er)$/.test(l) ? l.replace(/e([lr])$/, '$1') + 'er' : l + 'er';
  if (!s) s = `am ${l}${/(d|t|s|ß|z|x|sch)$/.test(l) ? 'esten' : 'sten'}`;
  return { komparativ: k, superlativ: s, regular };
}
export function isIrregularAdj(w: Word): boolean {
  return w.pos === 'adj' && !!w.adj && !w.adj.noComparison && w.adj.irregular === true;
}
