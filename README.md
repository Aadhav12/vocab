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
