// Semantic validation on top of JSON-schema validation. Pure; works on the assembled bundle.
import type { DataBundle, Problem, TextFile, Word } from './types';

const hasGap = (s: string) => /\[[^\]]+\]/.test(s);

export function checkWordLocal(w: Word): string[] {
  const errs: string[] = [];
  const at = `word “${w.id}”`;
  if (w.pos === 'noun' && !w.noun?.gender && w.noun?.number !== 'plural-only') errs.push(`${at}: noun without gender`);
  if (w.pos === 'noun' && w.noun && w.noun.plural === undefined) errs.push(`${at}: noun.plural missing (use null if there is none)`);
  if (w.pos === 'verb') {
    const v = w.verb;
    if (!v) errs.push(`${at}: verb without a verb block`);
    else if (['strong', 'irregular', 'mixed', 'modal'].includes(v.class ?? '') && !v.conjugatesLike) {
      const p = v.principal;
      if (!p?.praeteritum || !p.partizip2 || !p.praesens3sg || !p.aux) errs.push(`${at}: ${v.class} verb without full principal parts (praesens3sg, praeteritum, partizip2, aux) and no conjugatesLike`);
    }
  }
  if (w.pos === 'prep' && !w.prep?.cases?.length) errs.push(`${at}: preposition without prep.cases`);
  if (w.pos === 'conj' && !w.conj) errs.push(`${at}: conjunction without a conj block`);
  w.examples.forEach((e, i) => { if (!hasGap(e.de)) errs.push(`${at}: example ${i + 1} has no [gap]`); });
  w.collocations?.forEach((c, i) => { if (!hasGap(c.de)) errs.push(`${at}: collocation ${i + 1} has no [gap]`); });
  w.synonyms?.forEach((s, i) => { if (!hasGap(s.example)) errs.push(`${at}: synonym ${i + 1} (${s.id}) example has no [gap]`); });
  w.rektion?.forEach((r, i) => {
    const n = (r.pattern.match(/\{\d+\}/g) ?? []).length;
    if (n !== r.slots.length) errs.push(`${at}: rektion ${i + 1} pattern has ${n} slot markers but ${r.slots.length} slots`);
  });
  return errs;
}

export function checkText(t: TextFile, file: string): Problem[] {
  const out: Problem[] = [];
  t.questions.forEach((q, i) => {
    const n = i + 1;
    if (q.type === 'mc' || q.type === 'heading') {
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) out.push({ file, message: `question ${n}: answer ${q.answer} is not a valid option index (0–${q.options.length - 1})` });
    }
    if (q.type === 'heading' && (q.paragraph < 1 || q.paragraph > t.paragraphs.length)) out.push({ file, message: `question ${n}: paragraph ${q.paragraph} does not exist` });
  });
  return out;
}

/** Cross-file checks. Mutates the bundle: drops duplicate/invalid words and dangling references. */
export function semanticCheck(bundle: DataBundle): Problem[] {
  const problems: Problem[] = [];
  const seen = new Map<string, string>(); // id or alias -> file
  const claim = (id: string, file: string, what: string): boolean => {
    const prev = seen.get(id);
    if (prev) { problems.push({ file, message: `duplicate id “${id}” (${what}) — already used in ${prev}` }); return false; }
    seen.set(id, file); return true;
  };
  const containers = new Map<string, string>();
  for (const t of bundle.topics) {
    if (containers.has('topic:' + t.id)) problems.push({ file: t.id, message: `duplicate topic id “${t.id}”` });
    containers.set('topic:' + t.id, t.id);
    for (const g of t.groups) {
      if (containers.has('group:' + g.id)) problems.push({ file: `${t.id}/${g.id}`, message: `duplicate group id “${g.id}”` });
      containers.set('group:' + g.id, g.id);
      for (const s of g.sets) {
        if (containers.has('set:' + s.id)) problems.push({ file: s.file, message: `duplicate set id “${s.id}”` });
        containers.set('set:' + s.id, s.id);
        s.words = s.words.filter((w) => {
          const local = checkWordLocal(w);
          local.forEach((m) => problems.push({ file: s.file, message: m }));
          if (local.length) return false;
          if (!claim(w.id, s.file, 'word')) return false;
          for (const a of w.aliases ?? []) claim(a, s.file, `alias of ${w.id}`);
          return true;
        });
      }
    }
  }
  const all = new Map<string, Word>();
  const fileOf = new Map<string, string>();
  for (const t of bundle.topics) for (const g of t.groups) for (const s of g.sets) for (const w of s.words) {
    all.set(w.id, w); fileOf.set(w.id, s.file);
    for (const a of w.aliases ?? []) all.set(a, w);
  }
  const ref = (id: string, file: string, where: string): boolean => {
    if (all.has(id)) return true;
    problems.push({ file, message: `${where}: unknown id “${id}”` });
    return false;
  };
  for (const w of new Set(all.values())) {
    const f = fileOf.get(w.id)!;
    const at = `word “${w.id}”`;
    if (w.derivation && !ref(w.derivation.from, f, `${at} derivation.from`)) delete w.derivation;
    if (w.verb?.conjugatesLike && !ref(w.verb.conjugatesLike, f, `${at} conjugatesLike`)) delete w.verb.conjugatesLike;
    if (w.synonyms) w.synonyms = w.synonyms.filter((s) => ref(s.id, f, `${at} synonyms`));
    if (w.antonyms) w.antonyms = w.antonyms.filter((a) => ref(a, f, `${at} antonyms`));
    if (w.noun?.compound) w.noun.compound = w.noun.compound.filter((c) => ref(c, f, `${at} compound`));
  }
  // derivation cycles
  for (const w of new Set(all.values())) {
    const path = new Set<string>([w.id]);
    let cur: Word | undefined = w;
    while (cur?.derivation) {
      const p: Word | undefined = all.get(cur.derivation.from);
      if (!p) break;
      if (path.has(p.id)) {
        problems.push({ file: fileOf.get(w.id)!, message: `derivation cycle through “${w.id}” → “${p.id}”` });
        delete cur.derivation; break;
      }
      path.add(p.id); cur = p;
    }
  }
  // texts
  const checkT = (t: TextFile | undefined, file: string): TextFile | undefined => {
    if (!t) return t;
    problems.push(...checkText(t, file));
    if (t.uses) t.uses = t.uses.filter((u) => ref(u, file, `text “${t.id}” uses`));
    return t;
  };
  for (const tp of bundle.topics) {
    tp.texts.forEach((t) => checkT(t, `${tp.id}/_texts`));
    for (const g of tp.groups) {
      g.texts.forEach((t) => checkT(t, `${tp.id}/${g.id}/_texts`));
      for (const s of g.sets) checkT(s.text, s.file);
    }
  }
  return problems;
}
