// Live views behind the notebook directives ([[embed:…]], [[words:…]], [[progress]], [[mistakes]], [[reading:…]], [[practice:…]]).
import { useMemo } from 'react';
import { useCore, useStore } from '../store';
import { findWordByText } from '../core/lookup';
import { tokenize } from '../core/index';
import { dueCards, mastery, MASTERY_NAMES } from '../core/srs';
import { topicStats } from '../core/path';
import { buildTable, resolveScope, type Cell, type TableKind } from '../notebooks/data';
import type { Directive } from '../notebooks/directives';
import { ART, MasteryBar, artClass, pct, useOpenWord } from './common';
import { WORD_SECTIONS, WordCard, sectionId } from './WordCard';

const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();

export function DirectiveView({ d }: { d: Directive }) {
  switch (d.kind) {
    case 'embed': return <Embed d={d} />;
    case 'progress': return <ProgressView />;
    case 'reading': return <ReadingView arg={d.arg} />;
    case 'practice': return <PracticeButton arg={d.arg} />;
    default: return <DataTable kind={d.kind as TableKind} arg={d.arg} />;
  }
}

/** [[embed:der Anstieg]] / [[embed:der Anstieg#Notes]]: the real word card, in the notebook. */
function Embed({ d }: { d: Directive }) {
  const idx = useStore((x) => x.idx)!;
  const w = findWordByText(idx, d.word ?? '');
  if (!w) return <div className="callout red">No word “{d.word}” in the vocabulary.</div>;
  if (!d.section) return <WordCard w={w} />;
  const sec = sectionId(d.section);
  if (!sec) return <div className="callout red">Unknown section “{d.section}”. Available: {Object.values(WORD_SECTIONS).map((n) => n[0]).join(', ')}.</div>;
  return <WordCard w={w} only={sec} />;
}

function CellView({ c }: { c: Cell }) {
  const open = useOpenWord();
  const art = c.art !== undefined
    ? <><span className={artClass(c.art === 'pl' || c.art === null ? 'f' : c.art)}>{c.art === 'pl' || c.art === null ? 'die' : ART[c.art]}</span>{' '}</>
    : null;
  const inner = <>{c.dot !== undefined && <span className={`sd m${c.dot}`} style={{ marginRight: 8 }} />}{art}{c.t}</>;
  return c.w ? <span className="wc-link nb-ref" onClick={() => open(c.w!)}>{inner}</span> : inner;
}

/** words / nouns / verbs / irregular / rektion / synonyms / opposites / mistakes */
function DataTable({ kind, arg }: { kind: TableKind; arg: string }) {
  const { idx, progress } = useCore();
  const attempts = useStore((s) => s.attempts);
  const t = useMemo(() => buildTable(kind, arg, { idx, progress, attempts }), [kind, arg, idx, progress, attempts]);
  if (t.error) return <div className="callout red">{t.error}</div>;
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>{t.caption}</div>
      {t.rows.length > 0 && (
        <table className="tbl"><thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => (
            <tr key={i}>{r.map((c, k) => <td key={k} className={`${c.w && c.art !== undefined ? 'de' : ''} ${c.mono ? 'mono small' : ''} ${c.muted ? 'muted' : ''} ${c.irr ? 'irr' : ''}`}><CellView c={c} /></td>)}</tr>
          ))}</tbody></table>
      )}
      {t.note && <div className="annot">{t.note}</div>}
    </div>
  );
}

/** [[progress]]: the overview numbers, the mastery bar and the health of each topic, live. */
function ProgressView() {
  const { idx, path, progress: p } = useCore();
  const counts = [0, 0, 0, 0, 0];
  idx.words.forEach((w) => counts[mastery(p, w.id)]++);
  const setsDone = path.nodes.filter((n) => n.type === 'test' && p.passed[n.id]).length;
  const started = Object.keys(p.introduced).filter((id) => idx.byId.has(id)).length;
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>Progress</div>
      <table className="tbl"><thead><tr><th>Sets done</th><th>Words started</th><th>Cards due</th><th>XP</th><th>Day streak</th></tr></thead>
        <tbody><tr>{[String(setsDone), `${started}/${idx.words.length}`, String(dueCards(p).length), p.xp.toLocaleString(), String(p.streak.count)].map((v, i) => <td key={i} className="mono">{v}</td>)}</tr></tbody></table>
      <div style={{ margin: '12px 0 4px' }}><MasteryBar counts={counts} total={idx.words.length} />
        <div className="legend">{[4, 3, 2, 1, 0].map((m) => <span key={m} style={{ ['--c' as string]: ['var(--paper)', 'var(--g-200)', 'var(--cyan-20)', 'var(--cyan)', 'var(--ink)'][m] }}>{MASTERY_NAMES[m]} {counts[m]}</span>)}</div></div>
      <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>Topic</th><th>Steps</th><th>Health</th><th style={{ width: '35%' }} /></tr></thead>
        <tbody>{idx.bundle.topics.map((t) => { const st = topicStats(idx, path, p, t.id); return (
          <tr key={t.id}><td>{t.name}</td><td className="mono">{st.done}/{st.total}</td><td className="mono">{pct(st.health)}</td><td><div className="bar cyan" style={{ height: 6 }}><i style={{ width: pct(st.health) }} /></div></td></tr>); })}</tbody></table>
    </div>
  );
}

/** [[reading:arbeitsmarkt]]: a reading text from the app, its vocabulary underlined and clickable. */
function ReadingView({ arg }: { arg: string }) {
  const idx = useStore((s) => s.idx)!;
  const open = useOpenWord();
  const want = fold(arg);
  const texts = [...idx.textById.values()];
  const t = want ? (texts.find((x) => fold(x.id) === want) ?? texts.find((x) => fold(x.title).includes(want)) ?? texts.find((x) => fold(x.id).includes(want))) : undefined;
  if (!t) return <div className="callout red">{want ? `No reading text “${arg}”.` : 'Say which text: [[reading:title or id]].'} Available: {texts.map((x) => x.title).join(' · ')}.</div>;
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>Reading · {t.title}</div>
      <div className="reading">
        {t.paragraphs.map((para, pi) => (
          <p key={pi}>{tokenize(idx, para).map((tok, k) => (tok.wordId
            ? <span key={k} className="tok wc-link" style={{ cursor: 'pointer' }} onClick={() => open(tok.wordId!)}>{tok.text}</span>
            : <span key={k}>{tok.text}</span>))}</p>
        ))}
      </div>
    </div>
  );
}

/** [[practice:set 3]]: a button that opens Practice on that set, group or topic. */
function PracticeButton({ arg }: { arg: string }) {
  const { idx, progress, } = useCore();
  const attempts = useStore((s) => s.attempts);
  const a = arg.trim();
  if (!a || a.toLowerCase() === 'all') return <a className="btn primary wc-link" href="#/practice">Practice · everything →</a>;
  const sc = resolveScope({ idx, progress, attempts }, a);
  if (sc.error) return <div className="callout red">{sc.error}</div>;
  if (!sc.single) return <div className="callout red">Practice needs one set, group or topic, for example [[practice:set 3]].</div>;
  return <a className="btn primary wc-link" href={`#/practice?level=${sc.single.level}&id=${encodeURIComponent(sc.single.id)}`}>Practice · {sc.label} →</a>;
}
