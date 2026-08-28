# Voice Interview Features — Implementation Plan

Status: **planning only, not yet started.** Captured 2026-08-28 for later execution.

---

## 1. Objective

Extend the existing static question-bank site with two interactive, voice-capable modes,
grounded in the curated knowledgebase (KB):

1. **Mock Interviewee** — the user asks a technical question (by voice or text); the app
   returns a high-quality answer **composed from the KB**, not from the model's own
   parametric knowledge.
2. **Mock Interviewer** — the app conducts an interview: selects questions by
   role/topic/level, listens to the user's spoken answer, grades it against the stored
   reference answer, and tracks weak areas across a session.

The existing **question bank** browsing/search stays as-is and acts as the free funnel.

---

## 2. Key decisions (from design discussion)

| Question | Decision | Why |
|---|---|---|
| Fine-tune a small model on the KB? | **No.** | Fine-tuning teaches style, not reliable facts. Small models blur/merge/hallucinate curated answers and need retraining on every KB edit. Keep the KB as retrieved data. |
| How to ground answers? | **RAG** — retrieve KB entries, model only phrases/grades. | KB stays the single source of truth; update JSON, no training loop. |
| Retrieval method | **Hybrid: keyword prefilter ∪ embedding search**, then LLM rerank/synthesise. | Keyword (`filterQuestions`) nails exact terms ("CAP theorem", "gRPC"); embeddings nail paraphrase and ASR garble. Voice input is loose, so semantic matching matters. |
| Embeddings source | **Local model at build time** (`transformers.js`, `all-MiniLM-L6-v2`, 384-dim). Same model runs in-browser to embed the spoken query. | No API key, no backend, fits static hosting. Anthropic has no embeddings API. |
| "Titles-in-context" alternative (send all 3,002 titles to Claude with prompt caching, get matching IDs) | **Keep as fallback / hybrid escalation**, not the primary path. | Better match quality but ~171K tokens (~85% of 200K window), ~1.7¢/query warm + ~64¢ cold cache write, adds a full LLM round-trip of latency. Good for solo/local use, weak for public/low-latency. |
| Hosting / cost model | **Static app + BYOK** (user pastes their own LLM API key). | Keeps GitHub Pages hosting, zero LLM cost and zero abuse risk for us. Browser calls Anthropic/OpenAI directly. |
| Edge/on-device LLM for generation | **Optional later**, difficulty-tiered. | 1–3B models paraphrase beginner/intermediate acceptably but reason shallowly on `advanced`/`scenario` (842 + 311 Qs) and grade unreliably. Use only for free tier / offline, with cloud fallback for hard cases. |
| Speech → text | Web Speech API (already wired into `docs/search.html`); optional local Whisper later. | Built-in, no key. Firefox unsupported → feature degrades to text. |
| Real live-interview use | **Explicitly out of scope.** Product is mock/practice/study only. | Ethics + positioning. |

---

## 3. Current codebase facts (baseline)

- Static site in `docs/`, hand-written HTML + vanilla JS, no framework, no bundler.
- `content/*.md` → `scripts/build.js` → `docs/data/*.json`. CI: `.github/workflows/build-deploy.yml`
  (Node 24, `npm ci`, `node scripts/build.js`, deploy `docs/` to Pages). Build never runs at request time.
- Data emitted by build:
  - `docs/data/questions/<topic>.json` — array of `{ id, topic, level, seq, question, status, answerHtml, followUps[] }`.
    `id` format: `` `${topic}__${level}__${seq}` `` e.g. `http__beginner__1`.
  - `docs/data/search-index.json` — answered questions only, `{ id, topic, level, question, snippet }` (~1.6 MB).
  - `docs/data/topics.json`, `question-ids.json`, `build-info.json`.
- Corpus: **3,002 questions, 38 topics** — beginner 926 / intermediate 923 / advanced 842 / scenario 311.
  Avg question title ~189 chars. All titles as one block ≈ **171K tokens**. All `answerHtml` ≈ 8.5 MB (~2M+ tokens).
- Existing client search: `docs/assets/js/search.js` → `filterQuestions(questions, query)` does
  `terms.every(t => haystack.includes(t))` over `question + topic + level + snippet`. Brittle for paraphrase.
- Voice search already added to `docs/search.html` (Web Speech API mic button + `setupVoiceSearch()`), CSS in
  `docs/assets/css/style.css` under `/* Voice search */`.

---

## 4. Architecture overview

```
        BUILD TIME (GitHub Action)                     RUNTIME (browser, static)
  ┌───────────────────────────────────┐         ┌──────────────────────────────────────┐
  content/*.md                                   User speaks ──► Web Speech API ──► text
     │  scripts/build.js (existing)                                     │
     ▼                                                                  ▼
  docs/data/questions/*.json                          keyword prefilter (filterQuestions)
     │  scripts/embed.js (NEW)                                          │  ∪
     ▼                                              transformers.js embeds query in browser
  docs/data/embeddings.bin + meta.json                                  │
  docs/data/catalog.txt (NEW, for fallback)              cosine sim vs docs/data/embeddings
     │                                                                  ▼
     └──────────────────────────────────────────────►      top-K candidate question IDs
                                                                        │  load full answerHtml
                                                                        ▼
                                                     LLM call (BYOK: Anthropic/OpenAI direct)
                                                       - Interviewee: synthesise answer from KB
                                                       - Interviewer: grade user answer vs reference
                                                                        │
                                                                        ▼
                                                        rendered answer / score + feedback
                                                        (optionally spoken via SpeechSynthesis)
```

No backend. API key lives only in the browser (memory or `localStorage`, user's choice).

---

## 5. Work breakdown

### Phase 0 — Precompute pipeline (build-time)

- [ ] Add dev dep: `@xenova/transformers` (or `@huggingface/transformers`).
- [ ] `scripts/embed.js`:
  - Load all `docs/data/questions/*.json` (answered only).
  - Build embedding input per question: `question` + first ~200 chars of de-tagged `answerHtml`
    + `topic` + `level` (so retrieval sees a bit of answer context, matching current haystack shape).
  - Run `Xenova/all-MiniLM-L6-v2`, mean-pool + L2-normalise → 384 floats.
  - Write:
    - `docs/data/embeddings.f32` — raw `Float32Array` of `N × 384`, or int8-quantised `.i8` + scale
      (target < 3 MB; 3,002 × 384 × 4 ≈ 4.6 MB raw, ~1.2 MB int8).
    - `docs/data/embeddings-meta.json` — `{ model, dim, count, ids: [...] }` (index order matches the blob).
  - Deterministic ordering: sort by `(topic, level, seq)`.
- [ ] `scripts/catalog.js` (fallback path): emit `docs/data/catalog.txt` — one line `` `<id>\t<question>` ``,
  sorted `(topic, level, seq)`, frozen format (byte-stable for prompt caching).
- [ ] Wire both into `scripts/build.js` `main()` (run after questions are written) **and** the CI workflow
  (they run as part of `node scripts/build.js`, so just call them from there).
- [ ] Sanity check: retrieval smoke test script — feed 20 hand-written paraphrased queries, assert the
  expected question is in top-5.

### Phase 1 — Shared client infrastructure

- [ ] `docs/assets/js/llm.js` — provider-agnostic chat wrapper:
  - `callLLM({ provider, apiKey, model, system, messages, stream, onToken })`.
  - Anthropic: `POST https://api.anthropic.com/v1/messages`, header
    `anthropic-dangerous-direct-browser-access: true`, `anthropic-version`, `x-api-key`.
  - OpenAI: `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`.
  - SSE streaming parse for both; normalise to `onToken(text)` + final text.
  - Surface structured errors (401 → bad key, 429 → rate limit, network/CORS).
- [ ] `docs/assets/js/keystore.js` — BYOK management:
  - Input UI: provider dropdown, key field (`type=password`), model field (sensible default per provider),
    "remember on this device" checkbox.
  - Persist to `localStorage` only if checked; otherwise keep in a module variable for the tab session.
  - "Clear key" button. Never `console.log` the key. Show a plain-language security note
    (key is stored in your browser; anyone with access to this device/page can read it).
  - Rough per-session cost estimate shown after each call (tokens in/out × published price table, static).
- [ ] `docs/assets/js/retrieve.js` — hybrid retrieval:
  - Lazy-load `transformers.js` + MiniLM (WebGPU if available, else WASM). Show a one-time
    "~25 MB model downloading" indicator; cache via the library's IndexedDB cache.
  - `keywordCandidates(query)` — reuse `filterQuestions` logic against `search-index.json`.
  - `embeddingCandidates(query, k)` — embed query, cosine vs `embeddings.f32`, top-k.
  - `hybrid(query, k)` — union, dedupe, keep keyword hits first, then embedding by score; return
    `[{ id, topic, score, source }]`.
  - Config flag `RETRIEVAL_FALLBACK = "none" | "titles-in-context"`; when embeddings confidence
    (top score) < threshold and a key is present, call `llm.js` with `catalog.txt` (cache_control on the
    catalog block for Anthropic) to get IDs.
- [ ] `docs/assets/js/kb.js` — load & cache `docs/data/questions/<topic>.json` on demand; `getById(id)`.

### Phase 2 — Mock Interviewee (`docs/interviewee.html` + `assets/js/interviewee.js`)

- [ ] Page: mic button + text box (reuse `.search-bar` + `setupVoiceSearch` pattern), answer panel,
  "sources" list linking `topic.html?t=<topic>&q=<id>`.
- [ ] Flow:
  1. Get transcript (voice or typed).
  2. `retrieve.hybrid(transcript, 8)`.
  3. Load full `answerHtml` (+ `followUps`) for candidates via `kb.js`.
  4. `llm.js` call — system prompt: *"You are the candidate in a mock interview. Answer the question
     using ONLY the reference material below. Merge relevant follow-ups. Speak naturally, ~45–90s of
     spoken length. If the material does not cover it, say so."* User content: transcript + numbered
     candidate Q&As.
  5. Stream answer into the panel; render "sources" from the candidates the model cites.
- [ ] Optional: read the answer aloud with `speechSynthesis`; toggle in UI.
- [ ] Graceful no-key mode: still show retrieved KB answers verbatim (no synthesis) as a fallback.

### Phase 3 — Mock Interviewer (`docs/interviewer.html` + `assets/js/interviewer.js`)

- [ ] Setup screen: pick topics (multi-select from `topics.json`), level mix
  (beginner→scenario sliders), question count, voice on/off.
- [ ] Question selection — **pure metadata, no LLM**: filter `search-index.json` by chosen
  topics/levels, shuffle, take N. Track an in-session "weak topics" set; bias later picks toward it.
- [ ] Per question:
  1. Show/speak the question.
  2. Capture spoken answer (Web Speech API; allow long dictation — set `continuous`, stop button).
  3. Load reference `answerHtml` + `followUps` for that exact `id`.
  4. `llm.js` grading call — system prompt returns strict JSON:
     `{ score_0_5, verdict, covered: [...], missed: [...], inaccuracies: [...], follow_up_question }`.
     Reference answer supplied as ground truth; instruct model to grade coverage & correctness, not style.
  5. Render score + feedback; if `score < 3`, add `topic` to weak set and optionally ask `follow_up_question`.
- [ ] Session summary: per-topic average, weakest 3 topics, list of missed points, "practice these"
  deep links. Persist last session to `localStorage` for a simple progress view.
- [ ] Abuse/robustness: cap questions per session, handle empty/garbled transcripts, retry a failed
  grading call once, degrade to "self-assess (show reference answer)" if no key.

### Phase 4 — Polish & commercialization hooks (later, optional)

- [ ] Nav entries + landing-page cards for the two modes; short "how it works / bring your key" explainer.
- [ ] Cost/usage meter surfaced in UI; link to provider pricing.
- [ ] Feature-flag a future **hosted managed-key tier** (would require: small backend proxy, auth,
    Stripe, per-plan quotas — out of scope for the static app, noted for roadmap).
- [ ] Optional edge-LLM path (`WebLLM`/`transformers.js` text model) behind a flag for offline/free tier;
    difficulty-tier routing (edge for beginner/intermediate + first-pass grading, cloud for
    advanced/scenario + final grading). Validate quality on the `advanced`+`scenario` sets before shipping.
- [ ] Optional local Whisper (`whisper.cpp`/WASM) as an alternative STT for accuracy on acronyms.

---

## 6. New / changed files

| File | Change |
|---|---|
| `package.json` | add `@xenova/transformers` (or HF equiv) to deps |
| `scripts/embed.js` | NEW — build-time embeddings |
| `scripts/catalog.js` | NEW — build-time `catalog.txt` for fallback retrieval |
| `scripts/build.js` | call embed + catalog after writing question JSON |
| `.github/workflows/build-deploy.yml` | no change if invoked from build.js; else add step |
| `docs/data/embeddings.f32` / `.i8` | NEW — generated artifact (committed or built in CI) |
| `docs/data/embeddings-meta.json` | NEW — generated |
| `docs/data/catalog.txt` | NEW — generated |
| `docs/assets/js/llm.js` | NEW — BYOK provider wrapper (Anthropic + OpenAI, streaming) |
| `docs/assets/js/keystore.js` | NEW — key input/storage/clear + cost estimate |
| `docs/assets/js/retrieve.js` | NEW — hybrid keyword + embedding retrieval, titles-in-context fallback |
| `docs/assets/js/kb.js` | NEW — lazy load full question JSON, getById |
| `docs/interviewee.html` + `docs/assets/js/interviewee.js` | NEW — Mock Interviewee mode |
| `docs/interviewer.html` + `docs/assets/js/interviewer.js` | NEW — Mock Interviewer mode |
| `docs/assets/css/style.css` | add styles for key UI, answer panel, score cards |
| `docs/index.html`, nav in other pages | add links to the two modes |
| `docs/search.html` | (done) voice search prototype — keep as-is |

---

## 7. Prompt sketches (to refine during execution)

**Interviewee synthesis (system):**
> You are the candidate in a mock technical interview for a .NET / backend architect role.
> Answer the interviewer's question using ONLY the reference Q&A material provided. Integrate
> relevant follow-ups. Be accurate and concise — about 45–90 seconds spoken. Use plain spoken
> phrasing, no markdown headings. If the reference material doesn't cover the question, say that
> briefly and answer only what it supports.

**Interviewer grading (system):**
> You grade a candidate's spoken answer against a reference answer for a .NET architect interview.
> The reference is ground truth. Judge factual coverage and correctness, not delivery or wording.
> Return ONLY JSON: {"score_0_5": int, "verdict": "...", "covered": [..], "missed": [..],
> "inaccuracies": [..], "follow_up_question": "..."}. `score_0_5`: 5 = all key points + accurate,
> 3 = partial, 0 = absent/wrong. `follow_up_question` probes the biggest gap.

**Titles-in-context retrieval fallback (system):**
> You are a retrieval engine for an interview question bank. Below is the full catalog, one line
> per question as `<id>\t<title>`. Given the user's transcribed spoken question (may contain
> speech-to-text errors), return the 1–5 catalog IDs whose questions best match the intent.
> Respond ONLY as JSON: {"matches":[{"id":"...","title_echo":"..."}]}. Echo each matched title
> verbatim. Return [] if nothing genuinely matches.
> (Catalog block gets `cache_control: {type: "ephemeral"}` for Anthropic; sort/format byte-stable.)

---

## 8. Risks & open questions

- **Context budget for fallback:** 171K-token catalog ≈ 85% of 200K. Little room for history; may need
  the 1M-context beta or to shard the catalog by topic group.
- **Model download UX:** ~25 MB MiniLM on first use of a mode. Need a clear progress state; consider
  smaller/quantised model or a "text-only, no semantic search" toggle for low-bandwidth users.
- **BYOK friction:** most non-developer users won't have a key → limits mainstream reach. Acceptable for
  a developer-facing v1; hosted tier is the answer later.
- **Key exposure:** `localStorage` key is readable by any script on the origin. Keep the app
  dependency-light; audit any third-party script before adding; default to session-only storage.
- **CORS:** Anthropic requires `anthropic-dangerous-direct-browser-access`. Verify current header/version
  requirements at implementation time. OpenAI browser calls are allowed but also expose the key.
- **ASR quality on acronyms** ("DDD", "gRPC", "IQueryable") — rely on fuzzy retrieval; consider a
  post-transcription normalisation map of common mis-hearings.
- **Grading calibration:** small/cheap models grade inconsistently. Recommend a mid/large model for
  grading; expose model choice so users can trade cost vs reliability.
- **Embedding staleness:** regenerate `embeddings.*` whenever `content/**` changes — must be part of the
  same build step, not a manual afterthought.
- **Commercial moat:** the curated 3,002-question KB + rubric-grading is the asset; the generic
  "AI interview coach" wrapper is not. Keep the niche (.NET/backend architect) sharp.

---

## 9. Suggested execution order

1. Phase 0 (embeddings + catalog build) — no UI risk, validates retrieval quality early.
2. Phase 1 (`llm.js`, `keystore.js`, `retrieve.js`, `kb.js`) — shared foundation.
3. Phase 2 (Mock Interviewee) — smaller surface, exercises retrieval + synthesis end to end.
4. Phase 3 (Mock Interviewer) — builds on the same pieces, adds grading + session state.
5. Phase 4 (polish, commercialization hooks, optional edge/Whisper) — only after 2 & 3 feel good.
