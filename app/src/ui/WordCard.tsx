import { useStore, wordHistory } from '../store';
import type { Word, Progress } from '../core/types';
import type { DataIndex } from '../core/index';
import { familyRoot, familyTree } from '../core/index';
import { adjForms, articleFor, nounForms, verbForms } from '../core/forms';
import { mastery } from '../core/srs';
import { parseBrackets, antonymsOf } from '../core/generate';
import { Art, artClass, MasteryDot, speak, useOpenWord, fmtSec } from './common';

const POS: Record<string, string> = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', phrase: 'phrase' };

function Gapped({ text, cls = '' }: { text: string; cls?: string }) {
  return <span className={cls}>{parseBrackets(text).map((s, i) => (s.gap ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>))}</span>;
}

function Tree({ w, idx, p }: { w: Word; idx: DataIndex; p: Progress }) {
  const open = useOpenWord();
  const root = familyRoot(idx, w.id);
  const nodes = familyTree(idx, root);
  if (nodes.length < 2) return null;
  const homeSet = idx.home.get(w.id)?.set.id;
  return (
    <div className="wc-row"><span className="k">FAMILY</span>
      <div className="tree">
        {nodes.map((n) => {
          const m = idx.byId.get(n.id)!;
          const h = idx.home.get(m.id);
          const locked = p.introduced[m.id] === undefined && h?.set.id !== homeSet;
          const mm = mastery(p, m.id);
          const cls = `w ${m.id === w.id ? 'self' : ''} ${locked ? 'lock' : mm >= 2 ? `m${mm}` : ''}`;
          return (
            <div key={n.id} style={{ paddingLeft: n.depth * 18 }}>
              {n.depth > 0 && <span className="br">└</span>}
              <span className={cls} style={{ cursor: 'pointer' }} onClick={() => open(m.id)}>{m.noun ? `${articleFor(m.noun.gender, 'Nom')} ` : ''}{m.lemma}</span>
              <span className="gl">{m.id === w.id ? 'this word' : locked ? `locked · Set ${(h?.setOrder ?? 0) + 1}` : m.senses[0]?.en[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WordCard({ w, compact = false }: { w: Word; compact?: boolean }) {
  const idx = useStore((s) => s.idx)!, p = useStore((s) => s.progress);
  const open = useOpenWord();
  const h = idx.home.get(w.id);
  const nf = nounForms(w);
  const vf = verbForms(w, idx.byId);
  const af = adjForms(w);
  const ants = antonymsOf(idx, w);
  const syns = new Map<string, { w: Word; contrast: string }>();
  for (const s of w.synonyms ?? []) { const o = idx.byId.get(s.id); if (o) syns.set(o.id, { w: o, contrast: s.contrast }); }
  for (const o of idx.words) for (const s of o.synonyms ?? []) if (idx.byId.get(s.id)?.id === w.id) syns.set(o.id, { w: o, contrast: s.contrast });
  const irr = (k: string) => (vf?.irregular.has(k as never) ? 'irr' : '');
  const showForms = w.noun && w.noun.declension && w.noun.declension !== 'strong';
  const row = (k: string, v: React.ReactNode) => <div className="wc-row"><span className="k">{k}</span><div>{v}</div></div>;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="wc-lemma"><Art w={w} />{w.lemma}</div>
          <div style={{ fontSize: 17, color: 'var(--g-600)' }}>{w.senses.map((s) => s.en.join(', ')).join(' · ')}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="tag">{POS[w.pos]}</span>{w.level && <span className="tag">{w.level}</span>}
          <span className="tag" style={{ cursor: 'pointer' }} onClick={() => speak(w.noun ? `${articleFor(w.noun.gender, 'Nom')} ${w.lemma}` : w.lemma, true)}>♪ listen</span>
        </div>
      </div>
      {h && <div className="annot" style={{ marginTop: 4 }}>{h.topic.name} › {h.group.name} › Set {h.setOrder + 1} · {h.set.name} · <MasteryDot p={p} id={w.id} /></div>}
      {w.senses.length > 1 && !compact && w.senses.some((s) => s.hint) && row('SENSES', <div>{w.senses.map((s, i) => <div key={i}>{s.en.join(', ')}{s.hint && <span className="muted small"> — {s.hint}</span>}</div>)}</div>)}
      <div style={{ marginTop: 12 }}>
        {w.noun && row('PLURAL', <span className="serif" style={{ fontSize: 17 }}>{w.noun.number === 'singular-only' || !w.noun.plural ? <span className="muted">no plural</span> : `die ${w.noun.plural}`}{w.noun.genitive && <span className="muted small"> · Gen. {w.noun.genitive}</span>}</span>)}
        {showForms && nf && (
          <div className="wc-row"><span className="k">{w.noun!.declension!.toUpperCase()}</span>
            <table className="forms"><thead><tr><th>Nom</th><th>Akk</th><th>Dat</th><th>Gen</th></tr></thead>
              <tbody><tr>{(['Nom', 'Akk', 'Dat', 'Gen'] as const).map((c) => <td key={c} className={nf[c][0] !== nf.Nom[0] ? 'irr' : ''}>{articleFor(w.noun!.gender, c)} {nf[c][0]}</td>)}</tr></tbody></table>
          </div>
        )}
        {vf && (
          <div className="wc-row"><span className="k">FORMS</span>
            <div>
              <table className="forms"><thead><tr>{vf.du && <th>du</th>}<th>er/sie/es</th><th>Präteritum</th><th>Partizip II</th><th>Hilfsverb</th></tr></thead>
                <tbody><tr>{vf.du && <td className={irr('du') || 'irr'}>{vf.du}</td>}<td className={irr('praesens3sg')}>{vf.praesens3sg}</td><td className={irr('praeteritum')}>{vf.praeteritum}</td><td className={irr('partizip2')}>{vf.partizip2}</td><td className={irr('aux')}>{vf.aux}</td></tr></tbody></table>
              {vf.likeLemma && <div className="annot">conjugates like <i className="serif">{vf.likeLemma}</i></div>}
              {w.verb?.reflexive && w.verb.reflexive !== 'none' && <div className="annot">reflexive ({w.verb.reflexive})</div>}
            </div>
          </div>
        )}
        {af && (
          <div className="wc-row"><span className="k">COMPARISON</span>
            <table className="forms"><thead><tr><th>Positiv</th><th>Komparativ</th><th>Superlativ</th></tr></thead>
              <tbody><tr><td>{w.lemma}</td><td className={w.adj?.irregular ? 'irr' : ''}>{af.komparativ}</td><td className={w.adj?.irregular ? 'irr' : ''}>{af.superlativ}</td></tr></tbody></table>
          </div>
        )}
        {w.prep && row('CASE', <span>{w.prep.cases.join(' / ')}{w.prep.position === 'post' ? ' · postposition' : ''}{w.prep.contractions?.length ? ` · ${w.prep.contractions.join(', ')}` : ''}</span>)}
        {w.conj && row('CONJUNCTION', <span>{w.conj.kind}{w.conj.verbPosition ? ` · verb position: ${w.conj.verbPosition}` : ''}{w.conj.pair ? ` · ${w.conj.pair}` : ''}</span>)}
        {w.phrase?.governs && row('GOVERNS', <span>{w.phrase.governs}</span>)}
        {w.rektion?.map((r, i) => row(i === 0 ? 'REKTION' : '', <span><span className="serif" style={{ fontSize: 17 }}>{r.pattern.replace(/\{(\d+)\}/g, (_, n) => (r.slots[+n]?.prep ? `${r.slots[+n].prep} (${r.slots[+n].case})` : `(${r.slots[+n]?.case})`))}</span> <span className="muted small">— {r.en}</span></span>))}
        {w.examples.map((e, i) => <div className="wc-row" key={i}><span className="k">{i === 0 ? 'EXAMPLE' : ''}</span><div className="ex" style={{ marginTop: 0 }}><Gapped text={e.de} /><small>{e.en}</small></div></div>)}
        {w.collocations?.length ? row('COLLOCATIONS', <div>{w.collocations.map((c, i) => <div key={i}><Gapped text={c.de} cls="serif" /> <span className="muted small">— {c.en}</span></div>)}</div>) : null}
        {syns.size > 0 && row('SYNONYMS', <div>{[...syns.values()].map(({ w: o, contrast }) => <div key={o.id}><span className="tag cyan" style={{ cursor: 'pointer' }} onClick={() => open(o.id)}>{o.lemma}</span> <span className="muted small">{contrast}</span></div>)}</div>)}
        {ants.length > 0 && row('OPPOSITES', <span className="row" style={{ gap: 6 }}>{ants.map((o) => <span key={o.id} className="tag" style={{ cursor: 'pointer' }} onClick={() => open(o.id)}>{o.noun ? articleFor(o.noun.gender, 'Nom') + ' ' : ''}{o.lemma}</span>)}</span>)}
        {w.notes && row('NOTES', <span>{w.notes}</span>)}
        <Tree w={w} idx={idx} p={p} />
      </div>
    </div>
  );
}

export function WordHistory({ w }: { w: Word }) {
  const p = useStore((s) => s.progress);
  useStore((s) => s.histVersion);
  const hist = wordHistory(w.id);
  const keys = [...new Set([...hist.keys(), ...Object.keys(p.cards).filter((k) => k.startsWith(w.id + '|')).map((k) => k.slice(w.id.length + 1))])];
  if (!keys.length) return <div className="small muted" style={{ marginTop: 14 }}>No answers recorded yet.</div>;
  const NAME: Record<string, string> = { 'de-en': 'German → English', 'en-de': 'English → German', article: 'Article', plural: 'Plural', declension: 'Declension', principal: 'Principal parts', comparison: 'Comparison', rektion: 'Rektion', case: 'Case government', cloze: 'Cloze', collocation: 'Collocation', family: 'Family', formation: 'Word formation', synonym: 'Near-synonym', connector: 'Connector', opposite: 'Opposites' };
  return (
    <table className="tbl" style={{ marginTop: 14 }}>
      <thead><tr><th>Card</th><th>Last answers</th><th>Avg first key</th><th>Interval</th><th>Next due</th><th>Misses</th></tr></thead>
      <tbody>
        {keys.map((c) => {
          const e = hist.get(c); const st = p.cards[`${w.id}|${c}`];
          const avg = e && e.keys.length ? e.keys.reduce((a, b) => a + b, 0) / e.keys.length : null;
          return (
            <tr key={c}>
              <td>{NAME[c] ?? c}</td>
              <td><span className="dots">{(e?.answers.slice(-5) ?? []).map((a, i) => <i key={i} className={a ? 'ok' : 'bad'} />)}</span></td>
              <td className="mono">{avg === null ? '—' : fmtSec(avg)}</td>
              <td className="mono">{st ? `${[1, 3, 7, 15, 30, 60, 120][st.step]} set${st.step === 0 ? '' : 's'}` : '—'}</td>
              <td className="mono">{st ? `set ${st.due}` : '—'}</td>
              <td className="mono" style={{ color: (st?.misses ?? e?.misses ?? 0) > 1 ? 'var(--red-ink)' : undefined }}>{st?.misses ?? e?.misses ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
