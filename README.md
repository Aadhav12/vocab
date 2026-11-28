# TestDaF Vocab

A local vocabulary trainer for TestDaF (target TDN 4). The full specification is in the task brief; this file is the short version.

```
app/       all code; nothing personal       (cd app && npm install && npm start)
data/      the vocabulary; the app only reads it
records/   everything about the learner; the app is the only writer
```

* `npm start` (inside `app/`) builds the frontend and serves it at <http://localhost:4317>.
* `npm run dev` runs the server and the Vite dev server together (<http://localhost:5173>).
* `npm run validate` prints the data problems list in the terminal (same list as the *Data problems* page).
* `npm test` runs the unit tests, `npm run typecheck` the type-check.
* `DATA_DIR`, `RECORDS_DIR` and `PORT` override `app/config.json`.

`data/` is watched: add or edit a JSON file and the open page refreshes. JSON Schemas in `app/schema/` give editors autocomplete.
`records/` is portable: copy it into another install and all progress and history come with it (records refer to words by stable ids; renamed words keep their `aliases`).

## Keyboard
Every question can be answered without the mouse.

* **Typed fields:** type, `Enter` moves to the next field and submits on the last; `Enter` again continues.
* **Case / choice fields** (Rektion): they take focus in order. `1`–`3`, or the first letter (`A`kk, `D`at, `G`en), picks and moves on; `←`/`→` cycle.
* **Multiple choice** (article, near-synonyms, connectors, case government, reading questions in tests): `1`–`9`.
* **Match the following:** `1`–`7` pick a German word, `A`–`G` pick its meaning, in either order.
* **Reading node:** `1`–`3` answers a question and jumps to the next; `Enter` on *Check answers*.
* **Introduce:** `←`/`→` or `Enter`. Result and round screens focus their main button, so `Enter` continues.

## If progress ever looks reset
`records/attempts.jsonl` is append-only and always complete; `progress.json` is a snapshot of it. If they disagree (the page shows a red "could not be saved" bar when a save fails), run:

```bash
npm run recover -- --dry-run
npm run recover
```

inside `app/`. It replays every attempt newer than `progress.json` using the same code the app uses, and keeps the old file in `records/backups/`.

## Notebooks
The **Notebooks** page keeps markdown notes. Each notebook is a plain `.md` file in `records/notebooks/` (a small `---` header with the title and dates, then your markdown), so it is portable with the rest of `records/` and can be opened in any editor. Deleting a notebook moves its file to `records/backups/notebooks/`.

The editor is live-preview: the block you are typing in shows its markdown, every other block is rendered. Blocks are separated by blank lines.

* `Enter` starts a new block (lists, task lists, quotes and tables continue; an empty item ends them; a ```` ``` ```` line gets its closing fence). `Shift+Enter` is a line break inside the block.
* `↑` / `↓` / `←` / `→` at the edge of a block move to the neighbouring block; `Backspace` at the start joins it with the one above; `Esc` renders everything.
* `Ctrl+B` / `Ctrl+I` bold / italic, `Tab` / `Shift+Tab` indent list items, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo across the whole notebook.
* Click a rendered block to edit it (the caret lands where you clicked); click a checkbox to tick it; `Ctrl`-click a link to open it. Raw HTML is shown as text, never run.

### Directives in notebooks
Directives are written in the markdown itself. The marker lines are invisible once you leave them (click the thin strip where they are, or arrow into it, to edit); everything else about the text stays plain markdown.

* `[[showwords]]` … `[[/showwords]]` — every vocabulary word inside (found the same way as in the reading texts: lemma, plural, case and verb forms) gets the dotted underline; click one to open its word card. `Ctrl`/`Cmd`/`Alt`-click an underlined word to edit the text instead. Regions can span paragraphs, lists and tables; code and links are left alone; an unclosed marker runs to the end of the notebook.
* `[[indent]]` … `[[/indent]]` — everything inside is indented; regions nest for deeper levels.
* `[[embed:der Anstieg]]` — the word card, in place (links inside it still work; click its background to edit the line). The word is found by article + lemma, lemma alone, or id, ignoring case and `ae/oe/ue/ss` spellings. An embed has to be on its own line (several embed lines in one block are fine).
* `[[embed:der Anstieg#Notes]]` — just one section of the card. Sections: `header`, `home`, `senses`, `plural`, `declension`, `forms` (also `conjugation`), `comparison`, `case`, `conjunction`, `governs`, `rektion`, `examples`, `collocations`, `synonyms`, `opposites` (also `antonyms`), `notes`, `family` (also `tree`). A missing word, an unknown section or a section the word does not have shows a short message instead.

### Your data in notebooks
These directives pull live information from the app into a note. Each one goes on its own line; they update as you learn. Click a German word in any table to open its word card; click the background of a block to edit its line. A **scope** says which words:

| Scope | Meaning |
| --- | --- |
| `set 3`, `set Zunahme und Abnahme`, `group Veränderungen`, `topic Grafiken` | where the words live (number, id or name; case and umlaut spelling don't matter; a bare `3` or a bare name also works) |
| `started` · `new` · `learning` · `familiar` · `solid` · `mastered` | what state they are in (see the Guide page) |
| `due` · `weak` | cards due now · words you have missed (worst first; adds a Misses column) |

Combine with `+` (containers add up, states narrow it down: `set 3 + weak`) and end with `| 10` to show only the first 10 rows.

| Directive | Shows |
| --- | --- |
| `[[words:set 3 + weak \| 10]]` | German with article, English, set, level |
| `[[nouns:set 3]]` | article, plural, genitive, English |
| `[[verbs:set 3]]` · `[[irregular:set 3]]` | er/sie/es, Präteritum, Partizip II, Hilfsverb; irregular forms in red (`irregular` leaves out regular verbs) |
| `[[rektion:set 3]]` | verbs/nouns with their prepositions and cases |
| `[[synonyms:set 3]]` · `[[opposites:set 3]]` | near-synonym pairs with the difference · antonym pairs |
| `[[mistakes]]` · `[[mistakes:15]]` · `[[mistakes:set 3 \| 15]]` | your most recent wrong answers (default 10) with what you wrote and the answer |
| `[[progress]]` | sets done, words started, cards due, XP, streak, mastery bar and the health of each topic |
| `[[reading:Arbeitsmarkt]]` | a reading text from the app (title or id), vocabulary underlined and clickable |
| `[[practice:set 3]]` | a button that opens Practice with that set, group or topic selected |
| `[[word:der Anstieg]]` · `[[word:der Anstieg\|Anstiege]]` | an inline chip inside a sentence, with an optional label; click for the word card |

(In the notebook the limit is a plain `|`, for example `[[words:set 3 | 10]]`; the backslashes above only keep this table intact.)
