(function () {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `<span>Author: Mayur Patel</span><span id="question-count"></span><span id="last-updated"></span>`;
  document.body.appendChild(footer);

  fetch("data/build-info.json")
    .then((r) => r.json())
    .then((info) => {
      const countEl = document.getElementById("question-count");
      if (countEl && info.totalQuestions) {
        countEl.textContent = `${info.totalQuestions.toLocaleString()} questions across ${info.totalTopics} topics`;
      }
      const dateEl = document.getElementById("last-updated");
      if (!dateEl || !info.publishedAt) return;
      const date = new Date(info.publishedAt);
      dateEl.textContent = `Last updated ${date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`;
    })
    .catch(() => {});
})();
