(function () {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `<span>Author: Mayur Patel</span><span id="last-updated"></span>`;
  document.body.appendChild(footer);

  fetch("data/build-info.json")
    .then((r) => r.json())
    .then((info) => {
      const el = document.getElementById("last-updated");
      if (!el || !info.publishedAt) return;
      const date = new Date(info.publishedAt);
      el.textContent = `Last updated ${date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`;
    })
    .catch(() => {});
})();
