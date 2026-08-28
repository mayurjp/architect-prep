#!/usr/bin/env node
// Generates ONE multiple-choice question per answered question in content/*.md,
// using Claude, and caches the result in content/mcq/<topic>.json (committed to git).
//
// LOCAL + MANUAL ONLY — never run in CI. Needs ANTHROPIC_API_KEY in the environment.
// scripts/build.js reads the committed cache and needs no key.
//
//   node scripts/gen-mcq.js                              # every topic, incremental
//   MCQ_TOPICS=rest node scripts/gen-mcq.js              # one topic
//   MCQ_TOPICS=rest MCQ_LIMIT=5 node scripts/gen-mcq.js  # tiny sample to review first
//   MCQ_FORCE=1 node scripts/gen-mcq.js                  # ignore the cache, re-roll everything
//
// Env:
//   ANTHROPIC_API_KEY  required
//   MCQ_MODEL          default "claude-opus-5". For a cheap bulk run use "claude-haiku-4-5".
//   MCQ_EFFORT         low|medium|high|xhigh|max — omitted by default (model default).
//                      "low" markedly cuts cost/latency on the Opus/Sonnet 5 family.
//   MCQ_CONCURRENCY    parallel requests, default 4
//   MCQ_TOPICS         comma list of topic ids to restrict the run
//   MCQ_LIMIT          max questions to generate this run (across all topics)
//   MCQ_FORCE          "1" = regenerate even when the cache is fresh / previously failed
//
// A cache entry is regenerated only when the question text, answer text, MCQ_MODEL, or
// PROMPT_VERSION changed since it was written (tracked via sourceHash).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  parseContentFile,
  loadTopics,
  CONTENT_DIR,
  LEVEL_ORDER,
} = require("./build.js");

const PROMPT_VERSION = 1;
const MODEL = process.env.MCQ_MODEL || "claude-opus-5";
const EFFORT = process.env.MCQ_EFFORT || "";
const CONCURRENCY = Math.max(1, parseInt(process.env.MCQ_CONCURRENCY || "4", 10));
const LIMIT = process.env.MCQ_LIMIT ? parseInt(process.env.MCQ_LIMIT, 10) : Infinity;
const FORCE = process.env.MCQ_FORCE === "1";
const ONLY_TOPICS = process.env.MCQ_TOPICS
  ? new Set(process.env.MCQ_TOPICS.split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const MCQ_CACHE_DIR = path.join(CONTENT_DIR, "mcq");

let Anthropic;
try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (e) {
  console.error('Missing dependency "@anthropic-ai/sdk". Run: npm install');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. This script calls the Claude API.");
  process.exit(1);
}
const client = new Anthropic({ maxRetries: 5 });

/* ---------- text helpers ---------- */

function htmlToText(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();
}

function cap(s, n) {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

function normOption(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

function stripFence(text) {
  const m = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (m ? m[1] : text).trim();
}

/* ---------- hashing ---------- */

function sourceHash(q) {
  // Model-independent on purpose: the hash tracks whether the *source* question/answer
  // (or the prompt version) changed, not which model produced the MCQ. Switching MCQ_MODEL
  // does not force a costly full regeneration; use MCQ_FORCE for that.
  const payload = JSON.stringify({
    q: q.question,
    a: htmlToText(q.answerHtml),
    f: (q.followUps || []).map((f) => ({ q: f.question, a: htmlToText(f.answerHtml) })),
    pv: PROMPT_VERSION,
  });
  return "sha256:" + crypto.createHash("sha256").update(payload).digest("hex");
}

/* ---------- prompt ---------- */

const SYSTEM = `You write single-best-answer multiple-choice questions that test conceptual understanding for a .NET / backend architect interview. You are given one reference question and its authoritative answer. Produce ONE MCQ that checks whether the candidate understands the key idea in the answer — not wording recall or trivia.

Rules:
- Exactly 4 options. Exactly one is unambiguously correct given the reference answer. The other 3 are plausible but wrong (common misconceptions, or related-but-incorrect), similar in length and register to the correct option.
- No "all of the above" / "none of the above".
- No option may reference "the text", "the passage", "the reference", or "the answer above".
- The stem is self-contained and answerable without seeing the reference answer. Stem at most 300 characters. Each option at most 160 characters.
- "explanation": 2-4 sentences saying why the correct option is right and briefly why the distractors are wrong. Plain text, no markdown.
- "conceptTag": a short kebab-case tag for the concept being tested.

Output ONLY a JSON object, no prose and no code fence:
{"stem": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "...", "conceptTag": "..."}`;

function userPrompt(q, topicTitle) {
  const followUps = (q.followUps || [])
    .map((f) => `\n\nFollow-up: ${f.question}\n${cap(htmlToText(f.answerHtml), 800)}`)
    .join("");
  return `Topic: ${topicTitle}
Level: ${q.level}

Question: ${q.question}

Reference answer:
${cap(htmlToText(q.answerHtml), 6000)}${followUps}`;
}

/* ---------- validation ---------- */

function validateMcq(m) {
  if (!m || typeof m !== "object") return "response is not a JSON object";
  if (typeof m.stem !== "string" || m.stem.trim().length < 8 || m.stem.trim().length > 400)
    return "stem missing or outside 8-400 chars";
  if (!Array.isArray(m.options) || m.options.length !== 4) return "need exactly 4 options";
  if (!m.options.every((o) => typeof o === "string" && o.trim().length > 0)) return "an option is empty";
  if (new Set(m.options.map(normOption)).size !== 4) return "the 4 options are not distinct";
  if (!Number.isInteger(m.correctIndex) || m.correctIndex < 0 || m.correctIndex > 3)
    return "correctIndex must be an integer 0-3";
  if (typeof m.explanation !== "string" || m.explanation.trim().length < 20)
    return "explanation missing or too short";
  if (m.options.some((o) => /^(all|none)\s+of\s+the\s+above/i.test(o.trim())))
    return 'no "all/none of the above" options';
  if (m.options.map(normOption).includes(normOption(m.stem))) return "an option duplicates the stem";
  return null;
}

function normalizeMcq(m) {
  return {
    stem: m.stem.trim(),
    options: m.options.map((o) => o.trim()),
    correctIndex: m.correctIndex,
    explanation: m.explanation.trim(),
    conceptTag: typeof m.conceptTag === "string" ? m.conceptTag.trim() : "",
  };
}

/* ---------- one generation (with a single corrective retry) ---------- */

async function generateOne(q, topicTitle) {
  const messages = [{ role: "user", content: userPrompt(q, topicTitle) }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const req = {
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages,
    };
    if (EFFORT) req.output_config = { effort: EFFORT };

    const resp = await client.messages.create(req);
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed = null;
    let err = null;
    try {
      parsed = JSON.parse(stripFence(text));
    } catch (e) {
      err = "response was not valid JSON";
    }
    if (parsed) err = validateMcq(parsed);

    if (!err) return { ok: true, mcq: normalizeMcq(parsed) };

    if (attempt === 0) {
      messages.push({ role: "assistant", content: text || "(empty)" });
      messages.push({
        role: "user",
        content: `Your previous response failed validation: ${err}. Reply with ONLY the JSON object matching the schema.`,
      });
    } else {
      return { ok: false, error: `validation failed after retry: ${err}` };
    }
  }
  return { ok: false, error: "validation failed after retry" };
}

/* ---------- cache io ---------- */

function readCache(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  try {
    const arr = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(arr)) for (const e of arr) if (e && e.sourceId) map.set(e.sourceId, e);
  } catch (e) {
    console.warn(`  ! could not parse ${path.basename(file)} — treating as empty (${e.message})`);
  }
  return map;
}

function writeCache(file, map, answered) {
  const rank = {};
  LEVEL_ORDER.forEach((lv, i) => (rank[lv] = i));
  const q = new Map(answered.map((x) => [x.id, x]));
  const entries = [...map.values()].sort((a, b) => {
    const qa = q.get(a.sourceId);
    const qb = q.get(b.sourceId);
    if (!qa || !qb) return a.sourceId < b.sourceId ? -1 : 1;
    return (rank[qa.level] - rank[qb.level]) || qa.seq - qb.seq;
  });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2) + "\n");
}

/* ---------- run ---------- */

async function run() {
  fs.mkdirSync(MCQ_CACHE_DIR, { recursive: true });
  const topics = loadTopics();
  const topicById = Object.fromEntries(topics.map((t) => [t.id, t]));
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md")).sort();

  let calls = 0;
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  let pruned = 0;
  const failedIds = [];
  let budget = LIMIT;

  console.log(`model=${MODEL}${EFFORT ? ` effort=${EFFORT}` : ""} concurrency=${CONCURRENCY}` +
    `${LIMIT !== Infinity ? ` limit=${LIMIT}` : ""}${FORCE ? " force" : ""}`);

  for (const filename of files) {
    if (budget <= 0) break;
    const topicId = filename.replace(/\.md$/, "");
    if (ONLY_TOPICS && !ONLY_TOPICS.has(topicId)) continue;
    const topic = topicById[topicId];
    if (!topic) continue;

    const { questions } = parseContentFile(path.join(CONTENT_DIR, filename), filename);
    const answered = questions.filter((q) => q.status === "answered");
    if (answered.length === 0) continue;

    const cacheFile = path.join(MCQ_CACHE_DIR, `${topicId}.json`);
    const cache = readCache(cacheFile);

    const liveIds = new Set(answered.map((q) => q.id));
    for (const id of [...cache.keys()]) {
      if (!liveIds.has(id)) {
        cache.delete(id);
        pruned += 1;
      }
    }

    const todo = [];
    for (const q of answered) {
      const hash = sourceHash(q);
      const prev = cache.get(q.id);
      // Never touch hand-authored ("curated") entries, or fresh generated/failed ones,
      // unless MCQ_FORCE is set.
      const curated = prev && prev.curated === true && prev.status === "ok";
      const fresh = prev && prev.sourceHash === hash && (prev.status === "ok" || prev.status === "failed");
      if (!FORCE && (curated || fresh)) {
        skipped += 1;
      } else {
        todo.push({ q, hash });
      }
    }

    if (todo.length === 0) {
      writeCache(cacheFile, cache, answered);
      continue;
    }

    console.log(`\n${topicId}: ${todo.length} to generate (${answered.length - todo.length} cached)`);

    let next = 0;
    async function worker() {
      while (true) {
        if (budget <= 0) return;
        const idx = next++;
        if (idx >= todo.length) return;
        budget -= 1;
        const { q, hash } = todo[idx];
        calls += 1;
        let res;
        try {
          res = await generateOne(q, topic.title);
        } catch (e) {
          res = { ok: false, error: `api error: ${e.status || ""} ${e.message}`.trim() };
        }
        cache.set(q.id, {
          sourceId: q.id,
          sourceHash: hash,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
          generatedAt: new Date().toISOString(),
          status: res.ok ? "ok" : "failed",
          mcq: res.ok ? res.mcq : null,
          error: res.ok ? null : res.error,
        });
        if (res.ok) {
          ok += 1;
          process.stdout.write(".");
        } else {
          failed += 1;
          failedIds.push(q.id);
          process.stdout.write("x");
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    process.stdout.write("\n");
    writeCache(cacheFile, cache, answered);
  }

  console.log(
    `\nDone. calls=${calls} ok=${ok} failed=${failed} skipped=${skipped} pruned=${pruned}`
  );
  if (failedIds.length) console.log(`Failed ids: ${failedIds.join(", ")}`);
  if (budget <= 0 && LIMIT !== Infinity) console.log(`Stopped at MCQ_LIMIT=${LIMIT}.`);
  console.log(`Next: review content/mcq/<topic>.json, then run "npm run build".`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
