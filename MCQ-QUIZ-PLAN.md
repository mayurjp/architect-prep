# MCQ Quiz / Question Paper — Implementation Plan

Status: **planning only, not yet started.** Captured 2026-08-28 for later execution.
Sibling doc: `VOICE-INTERVIEW-PLAN.md`.

## Context

The site (`c:\Python\Claude\Architect_Prep`, static, deployed to GitHub Pages) has 3,002
open-ended interview questions with prose answers across 38 topics, browsable and searchable.
Users want an **assessment** mode: pick topics (one, several, or all) + a question count, get a
**mixed multiple-choice question paper**, answer it, and get a score with a per-topic breakdown,
explanations, and links back to the full source questions.

The knowledgebase has no multiple-choice data — every MCQ (stem + 4 options + 1 correct + 3
distractors + explanation) must be created. Decisions taken:

- **Source of MCQs:** one-time **LLM pre-generation** run locally with an API key, output
  committed to the repo, plus a **no-AI "match the answer" fallback** so every question is
  quizzable immediately and any generation gap is covered. CI stays key-free and deterministic.
  Runtime BYOK generation is deferred (would reuse `llm.js`/`keystore.js` from
  `VOICE-INTERVIEW-PLAN.md`, not yet built).
- **Format:** build **exam / paper mode first** (mixed paper → answer all → submit once → score
  + printable paper). Practice mode (one-at-a-time, instant feedback) is a later phase.

---

## Architecture

```
  LOCAL, MANUAL (keyed)                 BUILD (CI, keyless, deterministic)        RUNTIME (browser)
  scripts/gen-mcq.js                    scripts/build.js                          docs/quiz.html
  reads content/*.md                    reads content/mcq/*.json (committed)      fetch data/mcq/*.json
  calls Claude, 1 MCQ/question   ─────▶ + synthesises no-AI fallback for gaps ──▶ sample by topic/level/count
  hash-cached, validated               writes docs/data/mcq/<topic>.json         shuffle options, score,
  writes content/mcq/<topic>.json      + docs/data/mcq/index.json                per-topic breakdown, print
  (TRACKED)                            (git-ignored, CI-only)
```

- `content/mcq/` is **committed** (curated source data, hand-editable).
- `docs/data/mcq/` is **generated**, git-ignored, produced fresh in CI like the rest of `docs/data/`.
- CI workflow (`.github/workflows/build-deploy.yml`) needs **no change** — `content/**` is already
  a trigger path, and `docs/data/mcq/` rides along in the uploaded `docs/` artifact.

---

## 1. Data shapes

### 1a. Committed cache — `content/mcq/<topic>.json` (TRACKED, one file per topic)

Array, sorted by level order (`beginner, intermediate, advanced, scenario`) then `seq`,
pretty-printed 2-space (matches `build.js`).

```json
[
  {
    "sourceId": "rest__beginner__1",
    "sourceHash": "sha256:ab12…",
    "promptVersion": 1,
    "model": "claude-…",
    "generatedAt": "2026-08-28T10:00:00.000Z",
    "status": "ok",
    "mcq": {
      "stem": "Which statement best describes why HTTP is called a stateless protocol?",
      "options": ["…", "…", "…", "…"],
      "correctIndex": 0,
      "explanation": "2–4 sentences: why the key is right, why the distractors are wrong.",
      "conceptTag": "http-statelessness"
    },
    "error": null
  }
]
```

- `status`: `"ok" | "failed" | "needs_review"`. `build.js` treats anything but `"ok"` as "use fallback".
- `sourceHash = sha256(JSON.stringify({ q: question, a: answerPlainText, f: followUps, pv: PROMPT_VERSION, model: MODEL }))`.
  Any change to those regenerates that one item; nothing else.
- Hand-editable: a reviewer fixes a bad key and sets `"status": "ok"`; regen won't touch it unless
  the hash changes or `MCQ_FORCE=1`.

### 1b. Runtime — `docs/data/mcq/<topic>.json` (GENERATED, git-ignored)

Only UI fields; canonical option order (correct sits at `correctIndex`, client re-shuffles).

```json
[
  {
    "id": "rest__beginner__1", "topic": "rest", "level": "beginner", "seq": 1,
    "sourceQuestion": "What is HTTP, and what are its core components?",
    "stem": "…", "options": ["…","…","…","…"], "correctIndex": 0,
    "explanation": "…", "origin": "generated"
  }
]
```

`origin`: `"generated"` (LLM) or `"fallback"` (no-AI, synthesised in `build.js`).

### 1c. Availability index — `docs/data/mcq/index.json` (GENERATED, git-ignored)

```json
{ "rest": { "total": 71, "byLevel": { "beginner": 20, "…": 0 },
            "generated": 68, "fallback": 3, "unquizzable": 0 } }
```

`unquizzable` = answered questions where even the fallback can't assemble 4 distinct options
(tiny level pools); excluded from the quiz pool. Setup-screen counts come from this file.

---

## 2. `scripts/gen-mcq.js` (NEW — local, manual, keyed; never run by CI)

`package.json`:
```jsonc
"scripts": { "build": "node scripts/build.js", "gen:mcq": "node scripts/gen-mcq.js" },
"devDependencies": { "@anthropic-ai/sdk": "^0.x" }
```
(`npm ci` installs the devDep in CI; nothing imports it there — note this in the workflow comment.)

Env vars: `ANTHROPIC_API_KEY` (required), `MCQ_MODEL` (default mid-tier Claude),
`MCQ_CONCURRENCY` (default 4), `MCQ_TOPICS` (comma list), `MCQ_LIMIT` (cap this run),
`MCQ_FORCE` (`1` = ignore cache / re-roll `failed`).

**Question data source:** refactor `scripts/build.js` to `module.exports = { parseContentFile, loadTopics, snippetFromHtml }` behind an `if (require.main === module)` guard, so `gen-mcq.js`
parses `content/*.md` directly (the `docs/data/questions/*.json` files are git-ignored / CI-only).
De-tag answers with the existing `replace(/<[^>]+>/g, " ")` approach, cap ~1,500 tokens, append follow-ups.

**Flow:**
1. Per topic, load existing `content/mcq/<topic>.json` into `Map<sourceId, entry>`.
2. For every **answered** question compute `sourceHash`.
3. Skip if cached with same hash and (`status: ok`, or `status: failed` without `MCQ_FORCE`).
   Otherwise call the model.
4. Concurrency pool (default 4); exponential backoff + jitter on 429/5xx.
5. Validate (below). On failure, **one** corrective retry ("Your previous response failed
   validation: <reason>. Reply with ONLY the JSON object."). Second failure → `status: "failed"`, record `error`, continue.
6. Merge-write each `content/mcq/<topic>.json` sorted; prune entries whose `sourceId` no longer exists.
7. Print summary to stdout: `ok / failed / skipped / pruned`, list of failed ids, est. tokens + rough cost.

**Prompt (outline).** System: "You write single-best-answer MCQs testing conceptual understanding
for a .NET / backend architect interview. Given one reference question + authoritative answer,
produce ONE MCQ checking the key idea (not wording recall). Exactly 4 options; exactly one
unambiguously correct; 3 plausible distractors (common misconceptions), similar length/register;
no 'all/none of the above'; no option may reference 'the text/passage/answer'; stem self-contained,
≤300 chars; options ≤160 chars; explanation 2–4 sentences, plain text. Output ONLY
`{"stem","options":["","","",""],"correctIndex","explanation","conceptTag"}`." User: topic title,
level, question, de-tagged capped answer, follow-ups. `temperature: 0.3`, `max_tokens: ~700`.
`PROMPT_VERSION` constant — bumping it (or `MCQ_MODEL`) invalidates all hashes → full regen (documented).

**Validation (hard-fail → retry):** object has `stem, options, correctIndex, explanation`;
`options` is exactly 4 non-empty trimmed strings, all distinct after normalising
(lowercase / collapse whitespace / strip trailing period); `correctIndex` integer 0–3;
`stem` length 8–400 and not equal (normalised) to any option; `explanation` length ≥20;
no option matches `/^(all|none)\s+of\s+the\s+above/i`. Soft-warn only: near-duplicate options,
over-length stem/option.

**Consult the `claude-api` skill for exact model id + current token pricing before a full run.**

---

## 3. `scripts/build.js` integration

Insert **after `docs/data/topics.json` is written (~line 268), before `build-info.json`**:

```js
const mcqStats = buildMcqData(byTopic, topics);   // { total, generated, fallback, unquizzable }
```

**New `buildMcqData(byTopic, topics)`** — pure, synchronous, deterministic, no new deps:

- `MCQ_CACHE_DIR = content/mcq`, `MCQ_OUT_DIR = docs/data/mcq` (`mkdirSync` recursive).
- Per topic (in `topics` order):
  - Load `content/mcq/<topic>.json` if present → `Map<sourceId, entry>` of `status === "ok"` only.
  - `answered = byTopic.get(topic.id).filter(q => q.status === "answered")`, sorted level-order then seq.
  - Per answered `q`:
    - **generated:** cache hit → runtime object from `entry.mcq`, `origin: "generated"`.
    - **fallback:** else build a match-the-answer item —
      - correct option = `snippetFromHtml(q.answerHtml)` truncated ~160 chars;
      - distractors = snippets from other answered questions, **same topic + level** first, widen to
        same-topic / any-topic if fewer than 3; if still <3 → mark `q` **unquizzable**, skip;
      - deterministic pick (sort pool by seq, fixed stride seeded from `q.seq` — no `Math.random`);
      - `correctIndex = q.seq % 4`; splice correct into that slot;
      - `explanation`: "The correct choice is this question's own reference answer. Open the full
        question for the complete explanation."; `origin: "fallback"`.
  - Write `docs/data/mcq/<topic>.json` (pretty 2-space); accumulate `index[topic.id]`.
- Write `docs/data/mcq/index.json`; return aggregate stats.
- `console.warn` (do **not** `process.exit(1)`) if `mcqGenerated / mcqTotal < 0.9` — CI has no key
  and must still pass.

**`build-info.json`** — additive (footer.js only reads `totalQuestions/totalTopics/publishedAt`):
```json
{ "…": "…", "mcqTotal": 3002, "mcqGenerated": 2870, "mcqFallback": 128, "mcqUnquizzable": 4 }
```

**`.gitignore`** — `docs/data/*.json` is non-recursive and does **not** cover `docs/data/mcq/`. Add:
```
docs/data/mcq/
```
Leave `content/mcq/` tracked. Verify with `git check-ignore -v docs/data/mcq/rest.json` (matches)
and `git check-ignore -v content/mcq/rest.json` (no match).

---

## 4. `docs/quiz.html` (NEW — exam/paper mode first)

Self-contained, mirroring `docs/review.html`: inline `<style>` + inline `<script>`,
`theme.js` in `<head>`, `footer.js` before `</body>`, identical `<header class="site">` markup
(plus the new Quiz nav link). Copy `escapeHtml` (div helper) and Fisher–Yates `shuffle` from
`review.html`; memoise per-topic fetches in a `cache = {}` map. Client state machine:
`setup → inProgress → results`.

### Setup screen
- **Topic multi-select:** toggle-chip list from `data/topics.json` (sorted by `order`), each row
  showing `title` + quizzable count from `data/mcq/index.json`; "Select all" / "Clear all".
  Reuse `.scope-toggle button` / `.active` styling (not native `<select multiple>`).
- **Level filter:** 4 toggle buttons, all on by default, coloured with existing `.badge.<level>`.
- **Question count:** preset chips `10 / 20 / 30 / 50 / Max` + numeric input; clamp to available
  pool; show "N available".
- **Include not-yet-curated (fallback) items:** off by default (paper is all `origin: "generated"`
  unless opted in). No-op once the bank is complete.
- **Start** → generate paper. **Last attempt** banner if `localStorage.architect_quiz_last` exists.

### Paper generation
1. Selected topics → `Promise.all(fetch('data/mcq/<topic>.json'))`, memoised.
2. Pool = flatten → filter by selected levels → filter `origin === "generated"` unless opted in.
3. `shuffle(pool)`; optional round-robin re-interleave by topic so the mix is visible.
4. `take N` (clamped).
5. Per item, shuffle the 4 options and remap:
   ```js
   const order = shuffle([0,1,2,3]);
   const options = order.map(i => item.options[i]);
   const correctIndex = order.indexOf(item.correctIndex);
   ```
   Keep `{ n, id, topic, level, sourceQuestion, stem, options, correctIndex, explanation, origin, chosen: null }`
   in an in-memory `paper` array. **Never** write `correctIndex` to a pre-submit DOM attribute.

### In progress
- All N as `.card` blocks: number, `.badge <level>`, muted topic title, `stem`, 4 radio rows
  (`<label>` wrapping `<input type="radio" name="q<n>">`). No correctness shown.
- Sticky bar: "answered X / N" + **Submit** (confirm if X < N).
- **Print** here → blank exam paper (questions + options A–D, no answers).
- Optional: mirror answers to `localStorage.architect_quiz_progress`; clear on submit.

### Results
- **Overall** `score / N` + percentage, prominent.
- **Per-topic table:** topic | correct/attempted | % | mini `.progress-bar`; default sort
  weakest-% first, toggle to topic order. (Optional per-level table, same shape.)
- **Review list:** every item — number, `stem`, your answer (red if wrong / "not answered"),
  correct answer (green), `explanation`, deep link `topic.html?t=<topic>&q=<id>` ("See full
  question & answer" — `topic.html` already opens `?t=&q=` expanded + scrolled). Tag
  `origin: "fallback"` items "(match-the-answer)".
- **Actions:** **Retry wrong only** (new paper from the missed ids), **New paper** (→ setup),
  **Print** (questions + marks + explanations + trailing answer key).
- Persist `localStorage.architect_quiz_last = { at, mode, topicIds, levels, count, score, n, perTopic, wrongIds }`.

### Print CSS — `@media print`, inline in `quiz.html`
Hide `header.site`, nav, `#theme-toggle`, `.site-footer`, all controls/progress/buttons. Show a
print-only title block ("Architect Prep — Question Paper", date, selected topics), questions with
options relabelled **A–D**. Blank paper from in-progress; marked answers + explanations + an
**Answer key** section from results. Force black-on-white; `.card { break-inside: avoid;
box-shadow: none; border: 1px solid #000 }`; drop backdrop filters.

### Safety
`stem`, `options`, `explanation` are plain model text → run every one through `escapeHtml` before
injecting. Source `answerHtml` is never rendered here (only deep-linked).

---

## 5. Nav change — 5 existing pages

`<nav>` is hard-coded identically per page (no shared partial). Add
`<a href="quiz.html">Quiz</a>` immediately after the `Review` link, before `#theme-toggle`, in:
`docs/index.html`, `docs/topics.html`, `docs/topic.html`, `docs/search.html`, `docs/review.html`.
`docs/quiz.html` ships the same full nav including its own Quiz link. (Nav has no active-state.)

---

## 6. New / changed files

| File | Change |
|---|---|
| `scripts/gen-mcq.js` | NEW — local keyed generator; hash-incremental cache, validation, retry-once |
| `scripts/build.js` | add `buildMcqData()` + call in `main()`; export parse helpers; fold counts into `build-info.json` |
| `content/mcq/<topic>.json` | NEW, TRACKED — generated MCQ cache (38 files, ~1.8 MB total) |
| `docs/quiz.html` | NEW — setup / paper / results, option shuffle+remap, per-topic scoring, print CSS |
| `docs/data/mcq/*` | NEW, git-ignored — build output consumed by `quiz.html` |
| `.gitignore` | add `docs/data/mcq/` |
| `package.json` | add `gen:mcq` script + `@anthropic-ai/sdk` devDependency |
| `docs/{index,topics,topic,search,review}.html` | add `Quiz` nav link |
| `.github/workflows/build-deploy.yml` | no change (add a comment noting the unused devDep) |

---

## 7. Build order

1. **No-AI path + `quiz.html`** — `buildMcqData` fallback branch, `docs/data/mcq/` output,
   `.gitignore`, nav links, full exam/paper `quiz.html`. Works immediately, no key.
2. **`gen-mcq.js`** — refactor `build.js` exports, write the generator, test on one topic
   (`MCQ_TOPICS=rest MCQ_LIMIT=5`), verify incremental caching.
3. **Full generation run** — budget-checked, per-topic, review the failed-id list, spot-check
   ~20 MCQs for a single defensible key and non-trivial distractors.
4. **Later phases** — practice mode (one-at-a-time, instant feedback); runtime "Generate a fresh
   set" button once `VOICE-INTERVIEW-PLAN.md`'s `llm.js`/`keystore.js` exist.

---

## 8. Verification

**No-AI path (before any generation):**
1. `npm ci && npm run build` → `docs/data/mcq/` created; `index.json` + 38 `<topic>.json` valid
   arrays; every item `origin: "fallback"`; `build-info.json` has `mcq*` fields; exit 0.
2. `git check-ignore -v docs/data/mcq/rest.json` matches; `git status` shows `docs/data/mcq/`
   ignored.
3. Serve over HTTP (`npx serve docs` or `python -m http.server` in `docs/` — `file://` breaks
   `fetch`). Open `quiz.html`: pick 2 topics, count 10, Start → 10 mixed items, options shuffled,
   `correctIndex` absent from pre-submit DOM; answer some, leave some; Submit → score + per-topic
   math correct (hand-check a 3-item topic); wrong red / correct green / explanations shown; deep
   links open the right expanded question; "Retry wrong only" builds a paper of exactly the missed
   ids; reload → "last attempt" banner; `Ctrl+P` → nav/buttons hidden, cards don't split, readable.

**LLM path:**
4. `ANTHROPIC_API_KEY=… MCQ_TOPICS=rest MCQ_LIMIT=5 npm run gen:mcq` → `content/mcq/rest.json`
   has 5 valid `status: "ok"` entries. Re-run → all 5 "skipped (cached)". Edit one question in
   `content/rest.md`, re-run → only that one regenerates.
5. Full run per topic; spot-check MCQ quality.
6. `npm run build` → those ids show `origin: "generated"`; `build-info.json` `mcqGenerated` rises.
   Reload `quiz.html` with fallback off → paper is all generated items.

**CI:**
7. Push a branch → Action runs `node scripts/build.js` with no key, succeeds, artifact contains
   `docs/data/mcq/`. `content/mcq/*.json` appears in the diff; `docs/data/mcq/` never in `git status`.

---

## 9. Risks & open questions

- **MCQ quality / ambiguous keys** — model may produce two-defensible-answer items. Mitigate with
  spot-review, `status: "needs_review"` (build treats as fallback), hand-editable tracked cache,
  `MCQ_FORCE` re-roll.
- **One-time cost & rate limits** — ~3,002 calls (~1.5k in / 0.4k out each). Price against current
  rates first (`claude-api` skill). Concurrency + backoff + `MCQ_TOPICS`/`MCQ_LIMIT` make it resumable.
- **Staleness** — content edited without a `gen:mcq` re-run silently reverts that item to a weak
  fallback. Mitigate: `build.js` low-coverage `console.warn`, visible `mcqFallback` count,
  optional non-failing `scripts/check-mcq.js` in CI.
- **`build.js` export refactor** — `gen-mcq.js` needs `parseContentFile` / `loadTopics` /
  `snippetFromHtml`. Cleanest: `module.exports` + `require.main === module` guard. Fallback:
  consume `docs/data/questions/*.json` and require `npm run build` first.
- **`.gitignore` non-recursive gotcha** — `docs/data/*.json` does not hide `docs/data/mcq/*`;
  the explicit `docs/data/mcq/` line is mandatory.
- **Tiny level pools** — some `scenario` sets can't yield 4 distinct fallback options →
  `unquizzable`, excluded; setup counts must come from `index.json`.
- **Fallback pedagogy** — match-the-answer options are long and sometimes obviously wrong; keep
  tagged and default-off in paper mode.
- **Answer leakage** — `correctIndex` is reachable via devtools (the `paper` array). Acceptable
  for a study tool (same as `review.html` revealing answers); just never emit it pre-submit in the DOM.
- **Explanation formatting** — plain text, escaped; any code/markdown renders literally in v1.
- **Repo growth** — `content/mcq/` ≈ 1.8 MB across 38 files (per-topic for clean diffs).
