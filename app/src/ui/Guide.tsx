import { useCore } from '../store';
import { LADDER, MASTERY_NAMES, mastery } from '../core/srs';
import { topicStats } from '../core/path';
import { MasteryBar, pct } from './common';

const SW = ['m0', 'm1', 'm2', 'm3', 'm4'] as const;
const Sw = ({ m }: { m: number }) => <span className={`sd ${SW[m]}`} style={{ marginRight: 8 }} />;

export function Guide() {
  const { idx, path, progress: p } = useCore();
  const counts = [0, 0, 0, 0, 0];
  idx.words.forEach((w) => counts[mastery(p, w.id)]++);
  const leech = p.settings.leechThreshold;
  return (
    <div className="guide">
      <div className="sec" style={{ marginTop: 24 }}>
        <div className="sec-h"><span className="n">00</span><h2>Guide</h2><span className="note">how mastery and health work</span></div>
        <p style={{ maxWidth: '72ch' }}>Every word you learn is tracked by small review <b>cards</b>. How well those cards are doing decides a word's <b>mastery</b> colour; how many of them have been left waiting decides a topic's <b>health</b>. Time is measured in <b>completed sets</b>, never in days, so a break never piles up reviews.</p>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="n">01</span><h2>The clock: completed sets</h2></div>
        <p style={{ maxWidth: '72ch' }}>The <b>set count</b> goes up by one each time you pass a <b>set test for the first time</b> (the “sets done” number in the top bar). Group and topic tests, rechecks, replays and Practice do not change it. Everything below — due dates, overdue cards, rechecks — is counted in set counts.</p>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="n">02</span><h2>Cards and the ladder</h2></div>
        <p style={{ maxWidth: '72ch' }}>Each word has several cards: <b>German → English</b> and <b>English → German</b> (always), plus article, plural, principal parts and rektion where they apply; the others (declension, collocation, family, word formation, …) appear the first time you answer them. Every card sits on a ladder of seven steps. The step decides <b>how many sets later it is due again</b>.</p>
        <table className="tbl" style={{ maxWidth: 560 }}>
          <thead><tr><th>Step</th><th>Next review after</th><th>If both translation cards are here, the word is</th></tr></thead>
          <tbody>
            {LADDER.map((n, i) => {
              const m = i === 0 ? 1 : i === 1 ? 2 : i <= 3 ? 3 : 4;
              return <tr key={i}><td className="mono">{i}</td><td className="mono">{n} set{n === 1 ? '' : 's'}</td><td><Sw m={m} />{MASTERY_NAMES[m]}</td></tr>;
            })}
          </tbody>
        </table>
        <ul style={{ maxWidth: '72ch' }}>
          <li>A card <b>starts at step 0</b> when the word is introduced (or the first time you answer it).</li>
          <li>A <b>correct answer</b> moves it up one step — but <b>at most once per completed set</b>. Ten correct answers inside one set still count as one step, so heavy cramming cannot inflate a word.</li>
          <li>A <b>wrong answer</b> sends the card back to step 0 and counts a miss. It is due again after the next set test.</li>
          <li>A card is <b>due</b> when its due set count has been reached. Warm-ups contain the due cards (up to {p.settings.backlogLimit}); tests, quizzes, format nodes and Practice also ask about words and move cards up when you answer correctly.</li>
        </ul>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="n">03</span><h2>Mastery: the five levels</h2><span className="note">shown on the path, trees, word list and topic cards</span></div>
        <p style={{ maxWidth: '72ch' }}>A word's mastery is decided by the <b>weaker of its two translation cards</b> (German → English and English → German). The other cards do not change the colour — but they do matter for health (section 04). Both translation cards have to reach a level; one strong direction is not enough.</p>
        <table className="tbl">
          <thead><tr><th style={{ width: 140 }}>Level</th><th style={{ width: 150 }}>Weaker translation card</th><th>How to get there</th></tr></thead>
          <tbody>
            <tr><td><Sw m={0} />new</td><td className="mono">—</td><td>You have not been through the word's <b>Introduce</b> node yet.</td></tr>
            <tr><td><Sw m={1} />learning</td><td className="mono">step 0</td><td>Finish the set's <b>Introduce</b> node: the word's cards are created at step 0. You also drop back here whenever you get either translation card wrong.</td></tr>
            <tr><td><Sw m={2} />familiar</td><td className="mono">step 1</td><td>Answer <b>both</b> translation cards correctly in a <b>later set</b> than the one that created them — normally in the next set's warm-up (right after the introducing set's test).</td></tr>
            <tr><td><Sw m={3} />solid</td><td className="mono">steps 2–3</td><td>Keep answering both correctly as they come due: once about 3 sets later (step 2), and again about 7 sets after that (step 3).</td></tr>
            <tr><td><Sw m={4} />mastered</td><td className="mono">step 4 or higher</td><td>Both cards survive the 15-set gap and are answered correctly again — roughly 25 completed sets after the word was introduced if you only review when due.</td></tr>
          </tbody>
        </table>

        <div className="label" style={{ margin: '20px 0 8px' }}>Example: a word introduced in set 5, never missed, reviewed exactly when due</div>
        <table className="tbl" style={{ maxWidth: 640 }}>
          <thead><tr><th>Completed sets after the introducing set</th><th>Card moves to</th><th>Word is</th><th>Next due</th></tr></thead>
          <tbody>
            <tr><td className="mono">0 (set 5's test just passed)</td><td className="mono">step 0</td><td><Sw m={1} />learning</td><td className="mono">now</td></tr>
            <tr><td className="mono">1 — next set's warm-up</td><td className="mono">step 1</td><td><Sw m={2} />familiar</td><td className="mono">+3 sets</td></tr>
            <tr><td className="mono">4</td><td className="mono">step 2</td><td><Sw m={3} />solid</td><td className="mono">+7 sets</td></tr>
            <tr><td className="mono">11</td><td className="mono">step 3</td><td><Sw m={3} />solid</td><td className="mono">+15 sets</td></tr>
            <tr><td className="mono">26</td><td className="mono">step 4</td><td><Sw m={4} />mastered</td><td className="mono">+30 sets</td></tr>
            <tr><td className="mono">56 / 116</td><td className="mono">steps 5 / 6</td><td><Sw m={4} />mastered</td><td className="mono">+60 / +120 sets</td></tr>
          </tbody>
        </table>
        <div className="callout" style={{ marginTop: 12, maxWidth: '72ch' }}>This is the slow, steady pace. Because a correct answer lifts a card <i>whenever</i> you give it (not only on its due date), meeting a word again in a test, quiz, format node or Practice lifts it one step per set — so it can climb faster, never more than one step per completed set.</div>

        <div className="label" style={{ margin: '20px 0 8px' }}>Falling back, leeches and look-ups</div>
        <ul style={{ maxWidth: '72ch' }}>
          <li><b>A wrong answer</b> on a translation card drops that card to step 0, so the word falls back to <b>learning</b>.</li>
          <li><b>Leech:</b> when one card reaches <b>{leech} misses</b>, a <b>leech drill</b> of that word is inserted on the path. After the drill its miss counter starts again.</li>
          <li><b>Clicking a word</b> in a reading text makes its German → English card due right now. It is not counted as a miss and does not move the card down.</li>
        </ul>

        <div className="label" style={{ margin: '20px 0 8px' }}>Your words right now</div>
        <div style={{ maxWidth: 560 }}><MasteryBar counts={counts} total={idx.words.length} />
          <div className="legend">{[4, 3, 2, 1, 0].map((m) => <span key={m} style={{ ['--c' as string]: ['var(--paper)', 'var(--g-200)', 'var(--cyan-20)', 'var(--cyan)', 'var(--ink)'][m] }}>{MASTERY_NAMES[m]} {counts[m]}</span>)}</div></div>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="n">04</span><h2>Topic health</h2><span className="note">the percentage on each topic card</span></div>
        <p style={{ maxWidth: '72ch' }}>Health says how well you are keeping up with reviews in a topic. It is calculated like this:</p>
        <ol style={{ maxWidth: '72ch' }}>
          <li>Take the words of the topic that you have <b>already been introduced to</b>. Words you have not met yet are ignored.</li>
          <li>A word is <b>overdue</b> if <b>any one</b> of its cards — translation, article, plural, principal parts, rektion, collocation and so on — is due at an <b>earlier</b> set count than the current one. A card that is due <i>right now</i> is not yet overdue; it becomes overdue once you complete another set test without reviewing it.</li>
          <li><b>Health = words that are not overdue ÷ words you have met.</b> A topic with no words met yet shows 100%.</li>
          <li>Then <b>10 points are subtracted</b> for every recheck of that topic that has come due and is still waiting to be passed (down to a minimum of 0%).</li>
        </ol>
        <p style={{ maxWidth: '72ch' }}><b>To raise it:</b> do the warm-up at the start of each set (it holds every due card, up to {p.settings.backlogLimit}); clear any inserted recheck, leech drill or catch-up review before moving on. Health recovers as soon as the overdue cards are answered correctly again. A card you get wrong comes due after the next set test and only counts as overdue if it is still unreviewed after the set test following that.</p>
        <table className="tbl" style={{ maxWidth: 560 }}>
          <thead><tr><th>Topic</th><th>Health now</th><th style={{ width: '45%' }} /></tr></thead>
          <tbody>
            {idx.bundle.topics.map((t) => { const st = topicStats(idx, path, p, t.id); return (
              <tr key={t.id}><td>{t.name}</td><td className="mono">{pct(st.health)}</td><td><div className="bar cyan" style={{ height: 6 }}><i style={{ width: pct(st.health) }} /></div></td></tr>); })}
          </tbody>
        </table>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="n">05</span><h2>Rechecks, catch-up and leech drills</h2></div>
        <p style={{ maxWidth: '72ch' }}>Some nodes are <b>inserted</b> into the path at your current position and must be done before it continues.</p>
        <table className="tbl" style={{ maxWidth: 640 }}>
          <thead><tr><th>Inserted node</th><th>When it appears</th><th>Pass mark</th></tr></thead>
          <tbody>
            <tr><td>Recheck of a set test</td><td>2, 6 and 15 completed sets after you first passed it</td><td className="mono">{pct(p.settings.passTest)}</td></tr>
            <tr><td>Recheck of a group test</td><td>8 and 25 sets after</td><td className="mono">{pct(p.settings.passTest)}</td></tr>
            <tr><td>Recheck of a topic test</td><td>20 and 60 sets after</td><td className="mono">{pct(p.settings.passTest)}</td></tr>
            <tr><td>Leech drill</td><td>a card reaches {leech} misses</td><td className="mono">every answer</td></tr>
            <tr><td>Catch-up review</td><td>more than {p.settings.backlogLimit} cards are due when you reach a new set's Introduce node</td><td className="mono">every answer</td></tr>
          </tbody>
        </table>
        <p style={{ maxWidth: '72ch' }}>A failed recheck stays in place until you pass it, and while it waits it lowers the health of its topic.</p>
      </div>

      <div className="sec">
        <div className="sec-h"><span className="n">06</span><h2>In short</h2></div>
        <ul style={{ maxWidth: '72ch' }}>
          <li><b>Finish sets</b> — passing the set test is what moves the clock.</li>
          <li><b>Do every warm-up</b> — it is where due cards are answered, which lifts words to familiar, solid and mastered and keeps health up.</li>
          <li><b>Both directions count</b> — a word is only as mastered as its weaker translation card.</li>
          <li><b>Clear inserted nodes</b> when they appear; they protect health.</li>
          <li><b>Use Practice</b> for extra work: it updates your cards (one step per set at most) without touching the path.</li>
        </ul>
      </div>
    </div>
  );
}
