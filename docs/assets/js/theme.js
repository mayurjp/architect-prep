// Light/dark theme toggle. Explicit user choice is persisted in localStorage
// and wins over the system preference; with no stored choice, style.css's
// prefers-color-scheme media query decides. Runs synchronously in <head> so
// the stored choice applies before first paint (no flash).
(function () {
  var stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
})();

function currentTheme() {
  var attr = document.documentElement.getAttribute("data-theme");
  if (attr) return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateToggleIcon() {
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  var theme = currentTheme();
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
  btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

function toggleTheme() {
  var next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateToggleIcon();
}

document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("theme-toggle");
  if (btn) btn.addEventListener("click", toggleTheme);
  updateToggleIcon();
});
