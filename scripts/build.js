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
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Scenario"];
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
  fs.writeFileSync(
    path.join(DATA_DIR, "questions.json"),
    JSON.stringify(allQuestions, null, 2)
  );

  const topicsWithCounts = topics.map((t) => ({
    ...t,
    counts: counts[t.id] || { total: 0, answered: 0, planned: 0, byLevel: {} },
  }));
  fs.writeFileSync(
    path.join(DATA_DIR, "topics.json"),
    JSON.stringify(topicsWithCounts, null, 2)
  );

  const totalAnswered = allQuestions.filter((q) => q.status === "answered").length;
  console.log(
    `Built ${allQuestions.length} questions (${totalAnswered} answered, ${
      allQuestions.length - totalAnswered
    } planned) across ${files.length} content files -> docs/data/`
  );
}

try {
  main();
} catch (err) {
  if (err instanceof BuildError) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
