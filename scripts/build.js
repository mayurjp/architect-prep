#!/usr/bin/env node
// Parses /content/*.md (canonical format, see SPEC.md §3) into /docs/data/*.json.
// Plain Node + markdown-it, no framework. Run on every push via
// .github/workflows/build-deploy.yml — never at request time.

const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const DATA_DIR = path.join(ROOT, "docs", "data");
const MCQ_CACHE_DIR = path.join(CONTENT_DIR, "mcq");
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Scenario"];
const LEVEL_ORDER = ["beginner", "intermediate", "advanced", "scenario"];
const PLANNED_MARKER = "*(Planned — not yet answered.)*";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

class BuildError extends Error {
  constructor(message, file, line) {
    super(`${file}${line ? `:${line}` : ""} — ${message}`);
    this.file = file;
    this.line = line;
  }
}

function slugFromFilename(filename) {
  return filename.replace(/\.md$/, "");
}

// Splits a raw markdown file into question blocks on "## {Level} — Question {N}"
// headings, then extracts the bold question line, answer body, and any
// "#### Follow-up:" blocks within each question's span.
function parseContentFile(filePath, filename) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const topic = slugFromFilename(filename);

  const questionHeadingRe = /^##\s+(Beginner|Intermediate|Advanced|Scenario)\s+—\s+Question\s+(\d+)\s*$/;
  const followUpRe = /^####\s+Follow-up:\s*(.+)$/;
  const boldQuestionRe = /^\*\*Q(\d+):\s*(.+?)\*\*\s*$/;

  // Find start lines of each question heading.
  const headingIdx = [];
  lines.forEach((line, i) => {
    if (questionHeadingRe.test(line.trim())) headingIdx.push(i);
  });

  if (headingIdx.length === 0) {
    return { topic, questions: [] };
  }

  const questions = [];
  const seqByLevel = {};
  const codeFenceRe = /^```(\w+)?/;

  for (let h = 0; h < headingIdx.length; h++) {
    const start = headingIdx[h];
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1] : lines.length;
    const block = lines.slice(start, end);
    const lineNo = start + 1;

    const headingMatch = block[0].trim().match(questionHeadingRe);
    const level = headingMatch[1];
    const declaredSeq = parseInt(headingMatch[2], 10);

    if (!LEVELS.includes(level)) {
      throw new BuildError(`invalid level "${level}"`, filename, lineNo);
    }

    seqByLevel[level] = seqByLevel[level] || 0;
    seqByLevel[level] += 1;
    if (declaredSeq !== seqByLevel[level]) {
      throw new BuildError(
        `question numbering gap: expected Question ${seqByLevel[level]}, found Question ${declaredSeq}`,
        filename,
        lineNo
      );
    }
    const seq = declaredSeq;

    // Find the bold question line.
    let qLineIdx = -1;
    for (let i = 1; i < block.length; i++) {
      if (block[i].trim().match(boldQuestionRe)) {
        qLineIdx = i;
        break;
      }
      if (block[i].trim() !== "") break; // non-blank, non-question content before the bold line is a format error
    }
    if (qLineIdx === -1) {
      throw new BuildError(
        `missing bold "**Q${seq}: ...**" question line after heading`,
        filename,
        lineNo
      );
    }
    const qMatch = block[qLineIdx].trim().match(boldQuestionRe);
    const question = qMatch[2].trim();

    // Split the remainder into: main answer body, then any Follow-up sections.
    const rest = block.slice(qLineIdx + 1);
    const followUpStarts = [];
    rest.forEach((line, i) => {
      if (followUpRe.test(line.trim())) followUpStarts.push(i);
    });

    const mainEnd = followUpStarts.length > 0 ? followUpStarts[0] : rest.length;
    const mainBodyLines = stripTrailingRule(rest.slice(0, mainEnd));
    const status = mainBodyLines.join("\n").trim() === PLANNED_MARKER ? "planned" : "answered";

    validateCodeFences(mainBodyLines, filename, lineNo, codeFenceRe);

    const followUps = [];
    for (let f = 0; f < followUpStarts.length; f++) {
      const fStart = followUpStarts[f];
      const fEnd = f + 1 < followUpStarts.length ? followUpStarts[f + 1] : rest.length;
      const fBlock = rest.slice(fStart, fEnd);
      const fMatch = fBlock[0].trim().match(followUpRe);
      const fQuestion = fMatch[1].trim();
      const fBodyLines = stripTrailingRule(fBlock.slice(1));
      validateCodeFences(fBodyLines, filename, start + fStart + 1, codeFenceRe);
      followUps.push({
        question: fQuestion,
        answerHtml: md.render(fBodyLines.join("\n").trim()),
      });
    }

    questions.push({
      id: `${topic}__${level.toLowerCase()}__${seq}`,
      topic,
      level: level.toLowerCase(),
      seq,
      question,
      status,
      answerHtml: status === "planned" ? "" : md.render(mainBodyLines.join("\n").trim()),
      followUps,
    });
  }

  return { topic, questions };
}

function stripTrailingRule(bodyLines) {
  const out = [...bodyLines];
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  if (out.length && out[out.length - 1].trim() === "---") out.pop();
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out;
}

function validateCodeFences(bodyLines, filename, startLine, codeFenceRe) {
  let open = false;
  bodyLines.forEach((line, i) => {
    const m = line.match(/^```(\w*)\s*$/);
    if (!m) return;
    if (!open) {
      // Opening fence — must declare a language.
      if (m[1] === "") {
        throw new BuildError(
          `code fence missing a language tag`,
          filename,
          startLine + i
        );
      }
      open = true;
    } else {
      // Closing fence — bare ``` is correct here.
      open = false;
    }
  });
}

function loadTopics() {
  const topicsPath = path.join(CONTENT_DIR, "topics.json");
  return JSON.parse(fs.readFileSync(topicsPath, "utf8"));
}

function snippetFromHtml(html) {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 200).trim()}…` : text;
}

// Plain-text clip of rendered answer HTML, for use as an MCQ option string.
function mcqOptionText(html, max = 160) {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function normOption(s) {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

// Builds docs/data/mcq/<topic>.json + index.json from two sources, in priority order:
//   1. content/mcq/<topic>.json — LLM-pre-generated MCQs (status "ok"), committed to the repo.
//   2. a deterministic "match the answer" fallback synthesised here: the stem is the real
//      question, the correct option is this question's own answer snippet, and three
//      distractors are answer snippets from other questions (same topic+level first).
// Pure, synchronous, deterministic — no network, no randomness. CI runs this with no API key.
function buildMcqData(byTopic, topics) {
  const outDir = path.join(DATA_DIR, "mcq");
  fs.mkdirSync(outDir, { recursive: true });

  const index = {};
  let totGenerated = 0;
  let totFallback = 0;
  let totUnquizzable = 0;

  // Flat list of every answered question, for widening the distractor pool beyond one topic.
  const allAnswered = [];
  for (const qs of byTopic.values()) {
    for (const q of qs) if (q.status === "answered") allAnswered.push(q);
  }

  const orderedTopicIds = topics.map((t) => t.id);
  for (const topicId of orderedTopicIds) {
    const qs = (byTopic.get(topicId) || []).filter((q) => q.status === "answered");
    if (qs.length === 0) continue;

    const generatedById = loadGeneratedMcq(topicId);

    const sorted = qs.slice().sort((a, b) => {
      const lv = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
      return lv !== 0 ? lv : a.seq - b.seq;
    });

    const items = [];
    const byLevel = {};
    const genByLevel = {};
    const fbByLevel = {};
    let generated = 0;
    let fallback = 0;
    let unquizzable = 0;

    for (const q of sorted) {
      const gen = generatedById.get(q.id);
      let item = null;

      if (gen) {
        item = {
          id: q.id,
          topic: q.topic,
          level: q.level,
          seq: q.seq,
          sourceQuestion: q.question,
          stem: gen.stem,
          options: gen.options,
          correctIndex: gen.correctIndex,
          explanation: gen.explanation,
          origin: "generated",
        };
        generated += 1;
        genByLevel[q.level] = (genByLevel[q.level] || 0) + 1;
      } else {
        const fb = buildFallbackMcq(q, sorted, allAnswered);
        if (fb) {
          item = fb;
          fallback += 1;
          fbByLevel[q.level] = (fbByLevel[q.level] || 0) + 1;
        } else {
          unquizzable += 1;
        }
      }

      if (item) {
        items.push(item);
        byLevel[q.level] = (byLevel[q.level] || 0) + 1;
      }
    }

    fs.writeFileSync(
      path.join(outDir, `${topicId}.json`),
      JSON.stringify(items, null, 2)
    );

    index[topicId] = {
      total: items.length,
      byLevel,
      genByLevel,
      fbByLevel,
      generated,
      fallback,
      unquizzable,
    };
    totGenerated += generated;
    totFallback += fallback;
    totUnquizzable += unquizzable;
  }

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(index, null, 2)
  );

  const stats = {
    total: totGenerated + totFallback,
    generated: totGenerated,
    fallback: totFallback,
    unquizzable: totUnquizzable,
  };
  if (stats.total > 0 && stats.generated / stats.total < 0.9) {
    console.warn(
      `MCQ: only ${stats.generated}/${stats.total} items are LLM-generated ` +
        `(${stats.fallback} using the match-the-answer fallback). Run "npm run gen:mcq" to fill the gap.`
    );
  }
  return stats;
}

// Reads content/mcq/<topic>.json (committed cache). Returns Map<sourceId, mcq> of entries
// whose status is "ok" and whose payload passes a light structural check. Missing file -> empty.
function loadGeneratedMcq(topicId) {
  const out = new Map();
  const file = path.join(MCQ_CACHE_DIR, `${topicId}.json`);
  if (!fs.existsSync(file)) return out;

  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`MCQ: could not parse ${path.relative(ROOT, file)} — ignoring (${err.message})`);
    return out;
  }
  if (!Array.isArray(entries)) return out;

  for (const e of entries) {
    if (!e || e.status !== "ok" || !e.mcq || typeof e.sourceId !== "string") continue;
    const m = e.mcq;
    const ok =
      typeof m.stem === "string" &&
      m.stem.trim().length > 0 &&
      Array.isArray(m.options) &&
      m.options.length === 4 &&
      m.options.every((o) => typeof o === "string" && o.trim().length > 0) &&
      new Set(m.options.map(normOption)).size === 4 &&
      Number.isInteger(m.correctIndex) &&
      m.correctIndex >= 0 &&
      m.correctIndex <= 3 &&
      typeof m.explanation === "string" &&
      m.explanation.trim().length > 0;
    if (!ok) {
      console.warn(`MCQ: ${e.sourceId} in ${topicId}.json failed structural check — using fallback`);
      continue;
    }
    out.set(e.sourceId, {
      stem: m.stem.trim(),
      options: m.options.map((o) => o.trim()),
      correctIndex: m.correctIndex,
      explanation: m.explanation.trim(),
    });
  }
  return out;
}

// Deterministic "match the answer" MCQ: stem = the question, correct = its own answer snippet,
// distractors = answer snippets from three other questions. Returns null when three distinct
// distractors cannot be found (very small level pools).
function buildFallbackMcq(q, sameTopicSorted, allAnswered) {
  const correct = mcqOptionText(q.answerHtml);
  if (!correct) return null;
  const used = new Set([normOption(correct)]);

  // Candidate pools, widening: same topic+level -> same topic -> everything. Each sorted by
  // a stable key so the output only changes when content changes.
  const sameLevel = sameTopicSorted.filter((o) => o.id !== q.id && o.level === q.level);
  const sameTopic = sameTopicSorted.filter((o) => o.id !== q.id);
  const everything = allAnswered
    .filter((o) => o.id !== q.id)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const distractors = [];
  for (const pool of [sameLevel, sameTopic, everything]) {
    if (pool.length === 0) continue;
    // Fixed stride walk seeded from this question's seq, so picks are spread across the pool
    // rather than always the first few, but stay deterministic.
    const stride = Math.max(1, Math.floor(pool.length / 3));
    const start = q.seq % pool.length;
    for (let k = 0; k < pool.length && distractors.length < 3; k++) {
      const cand = pool[(start + k * stride) % pool.length];
      const text = mcqOptionText(cand.answerHtml);
      if (!text) continue;
      const key = normOption(text);
      if (used.has(key)) continue;
      used.add(key);
      distractors.push(text);
    }
    if (distractors.length >= 3) break;
  }

  if (distractors.length < 3) return null;

  const options = distractors.slice(0, 3);
  const correctIndex = q.seq % 4;
  options.splice(correctIndex, 0, correct);

  return {
    id: q.id,
    topic: q.topic,
    level: q.level,
    seq: q.seq,
    sourceQuestion: q.question,
    stem: q.question,
    options,
    correctIndex,
    explanation:
      "The correct choice is this question's own reference answer. Open the full question for the complete explanation.",
    origin: "fallback",
  };
}

function main() {
  const topics = loadTopics();
  const knownIds = new Set(topics.map((t) => t.id));

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  let allQuestions = [];
  const counts = {};

  for (const filename of files) {
    const filePath = path.join(CONTENT_DIR, filename);
    const { topic, questions } = parseContentFile(filePath, filename);

    if (!knownIds.has(topic)) {
      throw new BuildError(
        `content file has no matching entry in content/topics.json (expected topic id "${topic}")`,
        filename
      );
    }

    counts[topic] = questions.reduce(
      (acc, q) => {
        acc.total += 1;
        acc[q.status] = (acc[q.status] || 0) + 1;
        acc.byLevel[q.level] = (acc.byLevel[q.level] || 0) + 1;
        return acc;
      },
      { total: 0, answered: 0, planned: 0, byLevel: {} }
    );

    allQuestions = allQuestions.concat(questions);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const questionsDir = path.join(DATA_DIR, "questions");
  fs.mkdirSync(questionsDir, { recursive: true });
  const byTopic = new Map();
  for (const q of allQuestions) {
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q);
  }
  for (const [topicId, qs] of byTopic) {
    fs.writeFileSync(
      path.join(questionsDir, `${topicId}.json`),
      JSON.stringify(qs, null, 2)
    );
  }

  const searchIndex = allQuestions
    .filter((q) => q.status === "answered")
    .map((q) => ({
      id: q.id,
      topic: q.topic,
      level: q.level,
      question: q.question,
      snippet: snippetFromHtml(q.answerHtml),
    }));
  fs.writeFileSync(
    path.join(DATA_DIR, "search-index.json"),
    JSON.stringify(searchIndex, null, 2)
  );

  const questionIds = {};
  for (const [topicId, qs] of byTopic) {
    questionIds[topicId] = qs.map((q) => q.id);
  }
  fs.writeFileSync(
    path.join(DATA_DIR, "question-ids.json"),
    JSON.stringify(questionIds, null, 2)
  );

  const topicsWithCounts = topics.map((t) => ({
    ...t,
    counts: counts[t.id] || { total: 0, answered: 0, planned: 0, byLevel: {} },
  }));
  fs.writeFileSync(
    path.join(DATA_DIR, "topics.json"),
    JSON.stringify(topicsWithCounts, null, 2)
  );

  const mcqStats = buildMcqData(byTopic, topicsWithCounts);

  const totalAnswered = allQuestions.filter((q) => q.status === "answered").length;
  const publishedAt = new Date().toISOString();

  fs.writeFileSync(
    path.join(DATA_DIR, "build-info.json"),
    JSON.stringify(
      {
        publishedAt,
        totalQuestions: totalAnswered,
        totalTopics: files.length,
        mcqTotal: mcqStats.total,
        mcqGenerated: mcqStats.generated,
        mcqFallback: mcqStats.fallback,
        mcqUnquizzable: mcqStats.unquizzable,
      },
      null,
      2
    )
  );

  updateHomepageMeta(totalAnswered, files.length, publishedAt);

  console.log(
    `Built ${allQuestions.length} questions (${totalAnswered} answered, ${
      allQuestions.length - totalAnswered
    } planned) across ${files.length} content files -> docs/data/`
  );
  console.log(
    `MCQ: ${mcqStats.total} quizzable (${mcqStats.generated} generated, ` +
      `${mcqStats.fallback} fallback, ${mcqStats.unquizzable} unquizzable) -> docs/data/mcq/`
  );
}

// Keeps the homepage's <meta description>/OG/Twitter tags in sync with the current
// question/topic counts, so the numbers shown in link previews (LinkedIn, etc.) never
// go stale as content grows — docs/index.html is hand-authored, not generated, so this
// only rewrites the specific count phrase rather than the whole file.
function updateHomepageMeta(totalQuestions, totalTopics, publishedAt) {
  const indexPath = path.join(ROOT, "docs", "index.html");
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, "utf8");
  const formattedCount = totalQuestions.toLocaleString("en-US");
  let updated = html.replace(
    /[\d,]+\+ interview questions across \d+ topics/g,
    `${formattedCount}+ interview questions across ${totalTopics} topics`
  );
  updated = updated.replace(
    /(<meta property="article:modified_time" content=")[^"]*(" \/>)/,
    `$1${publishedAt}$2`
  );
  updated = updated.replace(
    /(<meta property="og:updated_time" content=")[^"]*(" \/>)/,
    `$1${publishedAt}$2`
  );
  if (updated !== html) {
    fs.writeFileSync(indexPath, updated);
  }
}

// Reusable pieces for scripts/gen-mcq.js (which parses content/*.md directly, since the
// docs/data/questions/*.json outputs are git-ignored / CI-only).
module.exports = {
  parseContentFile,
  loadTopics,
  snippetFromHtml,
  CONTENT_DIR,
  LEVEL_ORDER,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (err instanceof BuildError) {
      console.error(`Build failed: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
