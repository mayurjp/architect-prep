# Canonical Content-Generation Prompt

Use this in any AI chat session to generate new `/content/<topic>.md` material. This is the workflow
referenced in `SPEC.md` §10 — it happens outside the site entirely; only the pasted-in markdown output
ever reaches the repo.

---

```
You are an expert technical interviewer and mentor preparing a candidate for a [ROLE] role.
Generate interview questions with model answers for the topic area: [TOPIC AREA].

Scope & coverage:
- Cover the topic exhaustively across four possible tiers: Beginner, Intermediate, Advanced, and
  (only if genuinely applicable) Scenario/Troubleshooting. Aim for the "whole universe" of commonly
  asked questions.
- Group questions by sub-topic, ordered foundational to advanced within each tier.

Format — follow this EXACTLY, it will be parsed by a script:

## {Level} — Question {N}

**Q{N}: {question text}**

{answer body in markdown — prose, ### sub-headings, tables, fenced code blocks with a language tag}

#### Follow-up: {follow-up question text}
{follow-up answer body}
(repeat #### Follow-up blocks as needed; each is optional)

---
(a horizontal rule after every question, including its follow-ups, before the next question starts)

Level values must be exactly one of: Beginner, Intermediate, Advanced, Scenario. Question numbering
restarts at 1 within each level. Use fenced code blocks with an explicit language (csharp, sql, yaml,
json, http, bash, dockerfile, etc.) — never an unlabeled fence.

Answer depth — for each answer, include as applicable:
1. Core concept / definition in plain language.
2. Underlying mechanism — how it works internally and why (runtime, compiler, network, execution model).
3. A short, focused code/config example demonstrating the concept, including an edge case where relevant.
4. Common pitfalls / gotchas that trip people up in real systems.
5. Likely follow-up questions, written as #### Follow-up: blocks per the format above.
6. Practical guidance — when to use it, when not to, and trade-offs.

Style:
- Precise and technically accurate; correct common oversimplifications and say why they're oversimplified.
- Concrete examples over abstract description.
- Expand each answer to roughly 200–400 words of substance (mechanism + example + pitfalls + follow-ups)
  — depth over brevity, but self-contained.

Process:
- Work in batches of 5 questions to keep responses reviewable. After each batch, pause and wait for me
  to say "continue" before the next batch.
- Start with tier [Beginner], sub-topic ordering your choice. Begin now with questions 1–5.
```

---

## Notes on reuse

- Swap `[ROLE]` and `[TOPIC AREA]` per file — e.g. `[TOPIC AREA]` = "Kubernetes" or "GCP (Google Cloud
  Platform) for .NET workloads" or "Design Patterns (Gang of Four, categorized Creational/Structural/
  Behavioral)".
- Only ask for a `Scenario` tier where it genuinely fits (troubleshooting-heavy topics: Kubernetes,
  microservices, message-driven systems). Skip it for topics like OOP or Design Patterns where it
  doesn't add value.
- If answers come back shallow, add: *"Expand each answer to 200–400 words with mechanism, example,
  gotchas, and follow-ups — depth over brevity."* (already folded into the template above, but worth
  repeating mid-session if quality drifts.)
- Paste the finished batches into the matching `/content/<slug>.md` file. Run `node scripts/build.js`
  to validate the formatting before committing.
