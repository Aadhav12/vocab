import { useEffect, useState } from 'react';
import { init, useStore } from '../store';
import { dueCards } from '../core/srs';
import { History, Overview, Problems, SettingsPage, TopicPage, Words } from './Pages';
import { NodeScreen } from './NodeScreen';
import { Practice } from './Practice';
import { Guide } from './Guide';
import { Notebooks } from './Notebooks';
import { Modal, WordOpenCtx, useHash } from './common';
import { toggleTheme, useTheme } from '../theme';
import { WordCard, WordHistory } from './WordCard';

export function App() {
  const loaded = useStore((s) => s.loaded);
  const error = useStore((s) => s.error);
  const idx = useStore((s) => s.idx);
  const bundle = useStore((s) => s.bundle);
  const p = useStore((s) => s.progress);
  const path = useStore((s) => s.path);
  const saveError = useStore((s) => s.saveError);
  const hash = useHash();
  const theme = useTheme();
  const [wordId, setWordId] = useState<string | null>(null);
  useEffect(() => { init(); }, []);
  if (!loaded) return <div className="wrap"><p className="mono muted" style={{ marginTop: 40 }}>loading…</p></div>;
  if (error || !idx || !bundle || !path) return <div className="wrap"><div className="callout red" style={{ marginTop: 40 }}>Could not reach the server: {error}. Is <span className="mono">npm start</span> running?</div></div>;

  const setsDone = path.nodes.filter((n) => n.type === 'test' && p.passed[n.id]).length;
  const due = dueCards(p).length;
  const route = hash.split('?')[0];   // a query (#/practice?level=set&id=…) is not part of the route
  const [, a, b] = route.split('/');
  const rest = route.split('/').slice(2).join('/');
  const section = a || '';
  const nav = [['', 'Path', '#/'], ['practice', 'Practice', '#/practice'], ['words', 'Words', '#/words'], ['notebooks', 'Notebooks', '#/notebooks'], ['guide', 'Guide', '#/guide'], ['settings', 'Settings', '#/settings']] as const;
  const activeKey = ['topic', 'node', 'history', ''].includes(section) ? '' : section;
  const w = wordId ? idx.byId.get(wordId) : null;

  let page: React.ReactNode;
  if (section === 'topic') page = <TopicPage id={decodeURIComponent(b ?? '')} />;
  else if (section === 'node') page = <div style={{ marginTop: 24 }}><NodeScreen key={decodeURIComponent(rest)} id={decodeURIComponent(rest)} /></div>;
  else if (section === 'history') page = <History id={decodeURIComponent(rest)} />;
  else if (section === 'practice') page = <div style={{ marginTop: 24 }}><Practice key={hash} /></div>;
  else if (section === 'words') page = <Words />;
  else if (section === 'settings') page = <SettingsPage />;
  else if (section === 'guide') page = <Guide />;
  else if (section === 'notebooks') page = <Notebooks id={b ? decodeURIComponent(b) : undefined} />;
  else if (section === 'problems') page = <Problems />;
  else page = <Overview />;

  return (
    <WordOpenCtx.Provider value={setWordId}>
      <header className="top">
        <a className="brand" href="#/" style={{ textDecoration: 'none', color: 'inherit' }}><i />TestDaF <span>Vocab</span></a>
        <nav className="nav">{nav.map(([k, label, href]) => <a key={k} href={href} className={activeKey === k ? 'on' : ''}>{label}</a>)}</nav>
        <div className="stats">
          {bundle.problems.length > 0 && <a href="#/problems" className="prob"><b>{bundle.problems.length}</b> data problem{bundle.problems.length === 1 ? '' : 's'}</a>}
          <span><b>{setsDone}</b> sets done</span><span className="due"><b>{due}</b> due</span><span><b>{p.xp.toLocaleString()}</b> xp</span><span><b>{p.streak.count}</b> day streak</span>
        </div>
        <button className="themebtn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? '☀ light' : '☾ dark'}</button>
      </header>
      {saveError && <div className="savewarn">Your progress could not be saved ({saveError}). Retrying automatically — keep this tab open and make sure the server is still running.</div>}
      <div className="wrap">{page}</div>
      {w && (
        <Modal onClose={() => setWordId(null)}>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setWordId(null)}>Close ✕</button></div>
          <WordCard key={w.id} w={w} />
          <div className="label" style={{ marginTop: 18 }}>Answer history</div>
          <WordHistory w={w} />
        </Modal>
      )}
    </WordOpenCtx.Provider>
  );
}
