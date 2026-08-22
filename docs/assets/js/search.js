// Plain client-side substring/keyword filter over the lightweight search-index.json.
// No backend — the whole index ships as one static JSON file.

function filterQuestions(questions, queryRaw) {
  const query = (queryRaw || "").trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/);
  return questions.filter((q) => {
    const haystack = (
      q.question +
      " " +
      q.topic +
      " " +
      q.level +
      " " +
      (q.snippet || "")
    ).toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { filterQuestions };
}
