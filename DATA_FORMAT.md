# Data format (`data/`)

Everything the app teaches comes from JSON files in `data/`. The app only reads them. It watches the folder: save a file and the open page refreshes, no restart. Run `npm run validate` (inside `app/`) or open the **Data problems** page to see mistakes.

The JSON Schemas in `app/schema/` are the machine-readable version of this document. Every file points at one with `"$schema"`, so an editor such as VS Code autocompletes and underlines mistakes. **Unknown keys are errors**: a misspelt field is rejected, not ignored.

---

## 1. Folder layout and naming

```
data/
├── 01-grafiken-statistik/                 topic folder
│   ├── _topic.json                        topic header          (required)
│   ├── _texts/                            topic reading texts   (optional)
│   │   └── 01-zahlen-lesen.json
│   └── 01-veraenderungen-beschreiben/     group folder
│       ├── _group.json                    group header          (required)
│       ├── _texts/                        group reading texts   (optional)
│       │   └── 01-arbeitsmarkt.json
│       ├── 01-zunahme-abnahme.json        set file
│       └── 02-schwankungen.json
└── 02-arbeit-berufe/ ...
```

* **Order** of topics, groups and sets = the **numeric prefix** of the folder / file name (`01-`, `02-` …). Files in `_texts/` are ordered the same way.
* **Names do not matter, `id`s do.** The `id` inside the file is what progress records refer to. You may rename a folder or file freely; you may **never** change an `id` (see *Renaming a word*, §4.15).
* Folders and files starting with `_` or `.` are not content, except the fixed names `_topic.json`, `_group.json` and `_texts/`.
* Every file is UTF-8 JSON (no comments, no trailing commas).
* A broken file or entry is **skipped** (listed on Data problems); everything else still loads.

### The `$schema` line

Every file starts with `"$schema"` (relative path to the schema) and `"schemaVersion": 1`.

| File | `$schema` value (from the file's own folder) |
| --- | --- |
| `data/NN-topic/_topic.json` | `"../../app/schema/topic.schema.json"` |
| `data/NN-topic/NN-group/_group.json` | `"../../../app/schema/group.schema.json"` |
| `data/NN-topic/NN-group/NN-set.json` | `"../../../app/schema/set.schema.json"` |
| `data/NN-topic/_texts/NN-text.json` | `"../../../app/schema/text.schema.json"` |
| `data/NN-topic/NN-group/_texts/NN-text.json` | `"../../../../app/schema/text.schema.json"` |

---

## 2. Topic, group and set files

`_topic.json` / `_group.json`:

```json
{
  "$schema": "../../app/schema/topic.schema.json",
  "schemaVersion": 1,
  "id": "grafiken-statistik",
  "name": "Grafiken & Statistik",
  "description": "optional one-liner"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | always `1` |
| `id` | yes | unique among topics (resp. groups). Lower-case, hyphens. |
| `name` | yes | shown in the app |
| `description` | no | |
| `topicGroup` | no | `_topic.json` only. A heading to list the topic under on the overview (see below) |

**Topic groups.** Add `"topicGroup": "Academic"` to a `_topic.json` and the overview lists that topic under an "Academic" heading. Topics that use the same name (case and spaces ignored) share one heading, headings follow the order in which their first topic appears (that is, the folder number prefixes), and the topics under a heading keep their numbering and order. Topics without a `topicGroup` go under "Other topics" once any topic has one. If no topic has a `topicGroup`, the overview is the single "Topics" list as before.

**Set file** (`NN-name.json`):

```json
{
  "$schema": "../../../app/schema/set.schema.json",
  "schemaVersion": 1,
  "id": "zunahme-abnahme",
  "name": "Zunahme und Abnahme",
  "words": [ /* word entries, §3–§4 */ ],
  "text": { /* optional reading text, §5 */ }
}
```

* A set is the unit of learning: **about 20 words**, usually 3–5 related word families. Split large families over several sets.
* A word is taught in exactly one set (its home). Put each word in one set only.
* `text` is optional. If present, the set gets a **Reading** node. Inside a set file the text needs no `schemaVersion` and no `$schema`.
* Set `id`s must be unique across the whole of `data/`.

---

## 3. Word entry: the shared fields

```json
{
  "id": "der-anstieg",
  "lemma": "Anstieg",
  "pos": "noun",
  "level": "B1",
  "senses": [{ "en": ["rise", "increase"], "hint": "noun, der …", "domain": "statistics" }],
  "derivation": { "from": "ansteigen", "type": "nominalisation" },
  "noun": { "gender": "m", "plural": "Anstiege", "genitive": "Anstiegs", "declension": "strong", "number": "both" },
  "rektion": [{ "pattern": "der Anstieg {0} etw.", "slots": [{ "prep": "um", "case": "Akk" }], "en": "a rise by sth." }],
  "antonyms": ["der-rueckgang"],
  "collocations": [{ "de": "einen Anstieg [verzeichnen]", "en": "to record a rise", "type": "noun-verb" }],
  "examples": [{ "de": "Der [Anstieg] der Preise betrug drei Prozent.", "en": "The rise in prices was three per cent." }],
  "notes": "optional usage note"
}
```

| Field | Required | Type / allowed values | Meaning |
| --- | --- | --- | --- |
| `id` | **yes** | string, unique in all of `data/` | Stable key, see §3.1 |
| `lemma` | **yes** | string | Base form **without article**: `Anstieg`, `zunehmen`, `sich bewerben` |
| `pos` | **yes** | `noun` `verb` `adj` `adv` `prep` `conj` `phrase` | Part of speech; decides which block is needed |
| `senses` | **yes**, 1+ | array of sense objects, §3.2 | One entry per meaning |
| `examples` | **yes**, 1+ | array, §3.3 | Example sentences with `[gaps]` |
| `level` | no | `A1` `A2` `B1` `B2` `C1` | Shown as a tag |
| `derivation` | no | `{ "from": wordId, "type": … }`, §3.4 | Builds the word-family tree |
| `rektion` | no | array, §4.5 | Prepositions / cases the word governs |
| `synonyms` | no | array, §4.6 | Near-synonyms with a deciding example |
| `antonyms` | no | array of word ids | Opposites (work in both directions) |
| `collocations` | no | array, §3.5 | Fixed pairings |
| `notes` | no | string **or** array of strings | Usage notes on the word card |
| `aliases` | no | array of old ids | After a rename, §4.15 |
| `topics` | no | array of topic ids | Extra topic tags (the home topic is the folder it lives in) |
| `noun` `verb` `adj` `prep` `conj` `phrase` | by `pos` | object, §4 | Grammar block |

### 3.1 Ids

* **Unique across all of `data/`**, including `aliases`. Never reused for another word.
* **Nouns include the article**: `der-anstieg`, `die-steuer`, `das-steuer` (so homographs stay distinct).
* Other words: just the lemma. Reflexive verbs keep `sich`: `sich-bewerben`.
* Convention: lower-case ASCII; write `ä ö ü ß` as `ae oe ue ss` in ids (`der-rueckgang`, `die-haelfte`, `gemaess`). Spaces become hyphens. (This is a convention only; any string works, but references must match exactly.)

### 3.2 `senses`

```json
"senses": [
  { "en": ["light"], "hint": "not heavy" },
  { "en": ["slight", "slightly"], "hint": "small (change)", "domain": "statistics" },
  { "en": ["easy"], "hint": "not difficult" }
]
```

| Field | Required | Meaning |
| --- | --- | --- |
| `en` | yes, 1+ strings | **All accepted English answers** for this meaning. Typed answers are compared ignoring case, a leading *to / the / a / an*, text in parentheses and punctuation. Put every synonym you want to accept here. |
| `hint` | no | Shown on English → German cards to tell senses apart |
| `domain` | no | e.g. `statistics`; informational |
| `register` | no | e.g. `informal`; informational |

The **first** string of the **first** sense is the English shown in match boards, tree labels and "meaning" prompts, so make it the most natural translation. English → German cards show one sense (chosen at random) and accept the German word; if the learner types a *different* valid German word whose English overlaps, they are told "valid, but we want another word" and may retry.

### 3.3 `examples`

```json
"examples": [
  { "de": "Der Verkehr [nimmt] jedes Jahr [zu].", "en": "Traffic increases every year." }
]
```

* `de` and `en` required. `sense` (index into `senses`) is optional.
* **Square brackets mark the words that are the target of the sentence.** They are underlined on the word card and used as gaps in exercises. Separable and compound tenses get several gaps: `[nimmt] … [zu]`.
* **Every example must contain at least one `[gap]`** (validator rule).
* At least one example per word.

### 3.4 `derivation`

```json
"derivation": { "from": "ansteigen", "type": "nominalisation" }
```

`from` is the id of the parent word; it may be in another set or topic. A word without `derivation` is a family root. `type`:

| `type` | Use for | Word-formation prompt shown |
| --- | --- | --- |
| `prefix-verb` | zunehmen ← nehmen | *The verb built on this one* |
| `nominalisation` | die Zunahme ← zunehmen | *The noun from this word* |
| `agent` | der Bewerber ← sich bewerben | *The person who does it* |
| `adjective` | vergleichbar ← vergleichen | *The adjective from this word* |
| `adverb` | … | *The adverb from this word* |
| `compound` | das Vorstellungsgespräch ← die Vorstellung | not tested in Word formation |
| `other` | anything else (die Umfrage ← fragen) | not tested in Word formation |

Cycles are not allowed (the loop is cut and reported).

### 3.5 `collocations`

```json
"collocations": [{ "de": "einen Antrag [stellen]", "en": "to submit an application", "type": "funktionsverbgefuege" }]
```

`de` and `en` required; `type` optional: `noun-verb`, `funktionsverbgefuege`, `other`. The `[bracketed]` word is what the learner has to supply; **a gap is required**.

---

## 4. Part-of-speech blocks

A word needs the block that matches its `pos` (nouns `noun`, verbs `verb`, prepositions `prep`, conjunctions `conj`). `adj` and `phrase` blocks are optional. Blocks other than the one for `pos` are not needed.

### 4.1 `noun` (required for nouns)

```json
"noun": { "gender": "m", "plural": "Anstiege", "genitive": "Anstiegs", "declension": "strong", "number": "both" }
```

| Field | Required | Values | Notes |
| --- | --- | --- | --- |
| `gender` | **yes** | `m` `f` `n`, or `null` | `null` **only** for plural-only nouns (*die Daten*); they then show the article *die* |
| `plural` | **yes** | string or `null` | Plural form **without** *die*. `null` when there is none. |
| `genitive` | no | string | Singular genitive. Default generated: `+s`, or `+es` after s ß x z sch |
| `declension` | no | `strong` `weak-n` `adjectival` `mixed` | default `strong`; see below |
| `number` | no | `both` `singular-only` `plural-only` | default `both` |
| `compound` | no | array of word ids | Parts of a compound |
| `forms` | no | object | Override any generated case form: keys `NomSg`, `AkkSg`, `DatSg`, `GenSg`, `NomPl`, `AkkPl`, `DatPl`, `GenPl` |

Declension (case forms are **generated** by rule; use `forms` to override):

| `declension` | Example | Generated forms |
| --- | --- | --- |
| `strong` | der Anstieg | Gen. from `genitive` / default rule; Dat. pl. +n |
| `weak-n` | der Kollege | Akk/Dat/Gen singular +n (+en if the word does not end in -e): *den / dem / des Kollegen* |
| `adjectival` | der Befragte | after the definite article: *den / dem / des Befragten*; plural *die Befragten* |
| `mixed` | der Name | Akk/Dat +n, Gen +ns: *des Namens* (give `genitive`) |

Declension exercises appear only for `weak-n`, `adjectival` and `mixed` nouns. Plural exercises need `plural` (a string) and `number` `both`. Article exercises need a `gender`.

### 4.2 `verb` (required for verbs)

```json
"verb": {
  "class": "strong",
  "principal": { "praesens3sg": "nimmt", "praeteritum": "nahm", "partizip2": "genommen", "aux": "haben" },
  "praesens": { "du": "nimmst" },
  "irregular": ["praesens3sg", "praeteritum", "partizip2"]
}
```

| Field | Values | Notes |
| --- | --- | --- |
| `class` | `strong` `weak` `mixed` `modal` `irregular` | If omitted and no `principal.praeteritum`, treated as `weak` |
| `separable` | boolean | Overrides the automatic guess |
| `prefix` | string | The separable/inseparable prefix (`zu`, `an`, `voraus`, `be` …) |
| `reflexive` | `none` `akk` `dat` `optional` | The lemma itself must then start with `sich` |
| `transitive` | boolean | informational |
| `conjugatesLike` | word id | Derive all forms from this verb + the prefix (below) |
| `principal` | `{ praesens3sg, praeteritum, partizip2, aux }` | `aux`: `haben`, `sein`, `haben/sein`. Forms **without** `sich`. |
| `praesens` | `{ du, er }` | Stem changes. `du` is asked in Principal parts only if given |
| `konjunktiv2`, `imperativ` | string / `{du, ihr}` | informational |
| `irregular` | array of `praesens3sg` `praeteritum` `partizip2` `aux` `du` | Parts highlighted **red** on the word card |

**What you must supply, by case:**

| Verb type | What to write |
| --- | --- |
| **Weak** (stellen, arbeiten, studieren) | just `"class": "weak"`. Generated: *stellt, stellte, gestellt*; -t/-d stems get -e (*arbeitet, arbeitete, gearbeitet*); -ieren and inseparable-prefix verbs get no *ge-* (*studiert*, *verdoppelt*). |
| **Weak with a separable prefix, base not in the data** (voraussetzen) | `"class": "weak", "prefix": "voraus", "separable": true` → *setzt voraus, setzte voraus, vorausgesetzt* |
| **Strong / irregular / mixed / modal, base verb** | `class` + full `principal` (all four parts) + `irregular` list. Required: the validator rejects a strong/irregular/mixed/modal verb that has neither full `principal` nor `conjugatesLike`. |
| **Prefix verb of a verb that is in the data** | `"conjugatesLike": "<base id>"` and `"prefix"` (+ `separable`). Everything else is derived. |

`conjugatesLike` rules:

* **Separable**: *steigen* → *ansteigen*: `steigt an`, `stieg an`, `angestiegen`, aux inherited (`sein`).
* **Inseparable** (prefixes *be emp ent er ge miss ver zer*, or `"separable": false`): *stehen* → *entstehen*: `entsteht`, `entstand`, `entstanden` (the base's *ge-* is dropped).
* Fields you write on the child (`principal.aux`, `irregular` …) override derived ones; the base's irregular flags are inherited. The word card shows "conjugates like *nehmen*".
* If you leave `prefix` out it is taken from the lemma (the part before the base lemma).

Principal-parts exercises are generated only for **irregular** verbs (some form is flagged irregular, or aux is *sein*). Regular weak verbs get none.

### 4.3 `adj` (optional)

```json
"adj": { "komparativ": "stärker", "superlativ": "am stärksten", "irregular": ["komparativ", "superlativ"] }
```

| Field | Notes |
| --- | --- |
| `komparativ`, `superlativ` | Only needed for irregular / umlauting adjectives. Regular ones are generated (*deutlicher, am deutlichsten*; *-esten* after d t s ß z x sch). Write `superlativ` **with** *am*. |
| `noComparison` | `true` for adjectives that have no comparison (*konstant*, *voraussichtlich*) |
| `use` | `both` `attributive-only` `predicative-only` |
| `irregular` | `true`, or a list (`["komparativ","superlativ"]`). **Only adjectives marked irregular get Comparison exercises**, and they are highlighted red on the card. |

### 4.4 `prep` (required for prepositions) and `phrase`

```json
"prep": {
  "cases": ["Dat"],
  "position": "pre",
  "contractions": ["zum", "zur"],
  "fill": [{ "de": "Gemäß [der] Umfrage nutzen die meisten ein Smartphone.", "en": "According to the survey, most people use a smartphone." }]
}
```

| Field | Notes |
| --- | --- |
| `cases` | **required**, 1+ of `Akk` `Dat` `Gen` `Nom`. Two-way prepositions: `["Akk","Dat"]` |
| `position` | `pre` or `post` |
| `contractions` | informational |
| `fill` | optional. Each item becomes a "fill in the article after the preposition" question; the `[bracketed]` word is the answer (gap required) |

Case-government exercises are made for every `prep` with `cases`, and for every `phrase` with `phrase.governs` (e.g. *im Vergleich zu* → `"phrase": { "governs": "Dat", "fixed": true }`).

### 4.5 `rektion`

```json
"rektion": [{
  "pattern": "sich {0} jdm. {1} etw. bewerben",
  "slots": [
    { "prep": "bei", "case": "Dat", "obj": "person" },
    { "prep": "um",  "case": "Akk", "obj": "thing" }
  ],
  "en": "to apply to sb. for sth.",
  "example": "Sie bewirbt sich [bei] einer Bank [um] eine Stelle."
}]
```

* `pattern`, `slots`, `en` required; `example` optional.
* **`{0}`, `{1}` … mark the slot positions in the pattern. The number of markers must equal the number of slots** (validator rule).
* A slot with `"prep": null` is a plain case object (*jdm. etw. geben* = Dat + Akk): `"pattern": "{0} jdm. {1} etw. geben"` with two slots `{ "prep": null, "case": "Dat" }`, `{ "prep": null, "case": "Akk" }`. In the exercise those markers disappear and only the case is asked.
* `case`: `Nom` `Akk` `Dat` `Gen`. `obj` is a free-text label for the role (person, thing, amount, level …); informational.
* The exercise asks for each preposition (typed) and each case (picked). A word with several `rektion` entries gets one at random per question.

### 4.6 `synonyms`

```json
"synonyms": [{
  "id": "sinken",
  "contrast": "sinken takes sein (ist gesunken); abnehmen takes haben",
  "example": "Der Anteil der Raucher hat stark [abgenommen]."
}]
```

* Declared on **one** word, counts **both ways**. The word that carries the entry is the **host**: the `example` is a sentence in which **the host fits and the partner does not**, for a grammatical reason (auxiliary, case, reflexive pronoun, particle, …) or for meaning. Without that the question would have two right answers.
* `id` must exist. `example` **must contain a `[gap]`**; `contrast` is shown as feedback.
* In the exercise, **only the longest bracketed part is blanked**; other bracketed parts are shown as plain text so the grammar clue stays visible (`Der Verkehr [nimmt] jedes Jahr [zu].` blanks *nimmt*, leaves *zu*).
* **More than two options:** give the host several `synonyms` entries with the **identical `example` string**. They become one multiple-choice question with up to 4 options (host + all of them). Only do this if the example really rules out all of them.

### 4.7 `antonyms`

`"antonyms": ["der-rueckgang"]`: ids. One declaration is enough; the link works in both directions. Opposites exercises ask for the antonym (with article for nouns); if several are listed any one is accepted.

### 4.8 `conj`

```json
"conj": {
  "kind": "subordinating",
  "verbPosition": "end",
  "pair": "entweder … oder",
  "drills": [{
    "correct": "Während die Mieten steigen, sinken die Löhne.",
    "distractors": ["Während die Mieten steigen, die Löhne sinken.", "Während steigen die Mieten, sinken die Löhne."]
  }]
}
```

`kind`: `subordinating` `coordinating` `adverb` `two-part`. `verbPosition`: `end` `second` `inverted`. `drills`: each has one `correct` sentence and 1+ `distractors` that say the **same thing with wrong word order**. Make sure a distractor is genuinely wrong. The Connectors exercise only exists for words with `drills`.

### 4.9 Which field feeds which exercise

| Exercise | A word takes part if it has … |
| --- | --- |
| Flashcards (both directions) | `senses` (everything) |
| Article blitz | `noun.gender` (not null) |
| Plural | `noun.plural` string and `number` = `both` |
| Declension | `noun.declension` = `weak-n`, `adjectival` or `mixed` |
| Match the following | `senses` (needs 3+ words with distinct first translations in a board) |
| Opposites | `antonyms` (either direction) |
| Principal parts | an irregular verb (§4.2) |
| Comparison | `adj.irregular` true / list, not `noComparison` |
| Rektion | `rektion` with at least one slot |
| Case government | `prep.cases`, or `phrase.governs` |
| Collocations | `collocations` with a `[gap]` |
| Build the tree | a family of 3+ words **and** 2+ of its members in the set / scope being tested |
| Word formation | `derivation` of type `nominalisation`, `agent`, `adjective`, `adverb` or `prefix-verb` |
| Near-synonyms | `synonyms` (either side of a pair) |
| Connectors | `conj.drills` |
| Reading | a set/group/topic `text` |

A step is added to a set's path **only if it can actually produce questions** in that set, so thin data just yields a shorter path.

### 4.10 Review trees never show unseen words

In warm-ups and review items, family trees only use words the learner has already been introduced to (and whose parents in the family are introduced too).

### 4.11 What the word card shows

Article (coloured: der cyan, die red, das green) + lemma, senses, level, home topic › group › set, plural/genitive, case forms for weak-n / adjectival / mixed nouns, the verb forms table with irregular cells in red and "conjugates like …", comparison, rektion, examples with the gap words underlined, collocations, synonyms (with `contrast`), opposites, notes and the family tree (future-set words locked with their set).

### 4.12 Answers: what counts as correct

* German typed answers accept `ae oe ue ss` for `ä ö ü ß` **only where the expected answer has those letters**.
* Nouns need the article and a capital: `die Bewerbung` correct; `Bewerbung`, `der Bewerbung`, `die bewerbung` wrong (the feedback says why). Reflexive verbs need `sich`.
* Plural answers: with or without *die*.
* Near-misses (one letter off, wrong capitalisation, missing article) are **wrong** but the feedback names the reason.

### 4.13 Gap capitalisation

Gap answers are case-sensitive. If a gap is the first word of a sentence, bracket it with the capital letter (`[Gemäß] der Erhebung …`).

### 4.14 Level of detail

Only `id`, `lemma`, `pos`, `senses`, `examples` and the block for the part of speech are required. Add the optional fields where they help; every field you add unlocks exercises (table in §4.9).

### 4.15 Renaming a word

Progress is stored by `id`. To rename a word, give it the new `id` and put the old one in `aliases`:

```json
{ "id": "die-ergebnisse-neu", "aliases": ["das-ergebnis"], … }
```

Records for the old id then follow the word. Aliases count towards the uniqueness rule. Words that disappear from `data/` keep their records; they just stop showing.

---

## 5. Reading texts

Set texts live inside the set file (`"text": { … }`). Group and topic texts are separate files in `_texts/`:

```json
{
  "$schema": "../../../app/schema/text.schema.json",
  "schemaVersion": 1,
  "id": "internationale-studierende",
  "title": "Immer mehr internationale Studierende",
  "paragraphs": ["Erster Absatz …", "Zweiter Absatz …"],
  "uses": ["zunehmen", "der-anstieg"],
  "questions": [
    { "type": "rfn", "prompt": "Die Zahl ist gestiegen.", "answer": "richtig" },
    { "type": "mc", "prompt": "Was erklärt den Rückgang?", "options": ["A", "B", "C"], "answer": 1 },
    { "type": "heading", "paragraph": 2, "options": ["Überschrift A", "Überschrift B", "Überschrift C"], "answer": 0 }
  ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | unique among texts |
| `title` | yes | |
| `paragraphs` | yes, 1+ | array of strings |
| `uses` | no | word ids the text is meant to practise. Drives "you've learned X of Y target words" before the reading starts. |
| `questions` | yes | see below; each node/test shows all of them |
| `schemaVersion` | in `_texts/` files only | `1` |

Question types:

| `type` | Fields | `answer` |
| --- | --- | --- |
| `rfn` (richtig / falsch / nicht im Text) | `prompt` | `"richtig"`, `"falsch"` or `"nicht_im_text"` |
| `mc` (multiple choice) | `prompt`, `options` (2+) | **0-based** index into `options` |
| `heading` (pick the heading for a paragraph) | `paragraph` (**1-based**, must exist), `options` (2+) | **0-based** index into `options` |

Lengths: set text ≈ 150 words, group ≈ 300, topic 450–600 (TestDaF length). 4 questions per set text is the norm.

In the reading screen every word that is in the data is underlined (found by lemma, plural, case forms and verb forms, with simple ending stripping). Clicking one opens its word card and makes its German → English card due again. Group texts add one **Group reading** node per file, topic texts one **Topic reading** node, and the questions of the scope's texts also end every test.

---

## 6. What the validator checks

On load and on every change. Each problem names the file; bad entries are skipped, the rest loads.

* schema errors (wrong type, unknown key, value not in the allowed list, missing required field)
* duplicate ids (words, aliases, sets, groups, topics)
* unknown ids in `derivation.from`, `conjugatesLike`, `synonyms[].id`, `antonyms`, `noun.compound`, text `uses` (the reference is dropped and reported)
* nouns without `gender` (except plural-only), without `plural` (use `null`)
* strong / irregular / mixed / modal verbs without full principal parts and without `conjugatesLike`
* prepositions without `prep.cases`; conjunctions without a `conj` block
* examples, collocations and synonym examples without a `[gap]`
* `rektion` pattern markers not matching the slot count
* question answers that are not valid options; `heading.paragraph` that does not exist
* derivation cycles

`npm run validate` prints the same list and exits with an error code if there is any.

---

## 7. Checklist for adding a set

1. Create `NN-name.json` in the group folder with `$schema`, `schemaVersion`, a unique `id`, `name`.
2. Aim for ~20 words. For each: unique `id`, `lemma`, `pos`, `senses` (all accepted English answers), 1+ example with `[gap]`.
3. Add the part-of-speech block (noun: gender + plural; strong verb: full principal parts or `conjugatesLike`; preposition: cases).
4. Link families with `derivation.from` (and `conjugatesLike` for prefix verbs).
5. Add `antonyms`, `rektion`, `collocations`, `synonyms` (with a deciding example) where they exist, and an irregular-comparison adjective, weak-n / adjectival noun, preposition or connector where you want those exercises.
6. Add a ~150-word `text` with 4 questions and `uses`.
7. Save, then check the **Data problems** page (or run `npm run validate`).
