/* VELVA — markdown rendering + code copy. Streaming-safe. */

function renderMarkdown(text) {
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    return escapeHtml(text);
  }
  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: (code, lang) => {
      if (typeof hljs !== "undefined") {
        try {
          return hljs.highlight(code, { language: lang || "plaintext" }).value;
        } catch (_) {
          try {
            return hljs.highlightAuto(code).value;
          } catch (__) {
            return escapeHtml(code);
          }
        }
      }
      return escapeHtml(code);
    },
  });
  const raw = marked.parse(text || "");
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target"],
    ADD_TAGS: ["input"],
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* Render markdown into a container (used per assistant message element). */
function fillMarkdown(el, text) {
  const html = renderMarkdown(text || "");
  el.innerHTML = html;
  el.querySelectorAll("pre code").forEach((block) => {
    const lang = (block.className.match(/language-(\S+)/) || [])[1] || "code";
    const row = document.createElement("div");
    row.className = "code-head";
    row.innerHTML =
      '<span class="code-lang"></span><button class="code-copy" title="Copy code">Copy</button>';
    row.querySelector(".code-lang").textContent = lang;
    row.querySelector(".code-copy").addEventListener("click", () => {
      const code = block.innerText;
      navigator.clipboard
        .writeText(code)
        .then(() => {
          row.querySelector(".code-copy").textContent = "Copied";
          setTimeout(() => (row.querySelector(".code-copy").textContent = "Copy"), 1200);
        })
        .catch(() => {});
    });
    const wrapper = block.parentNode;
    wrapper.parentNode.insertBefore(row, wrapper);
  });
  el.querySelectorAll("a").forEach((a) => (a.target = "_blank"));
}

/* Re-run highlighting on code blocks already in the DOM (after streaming). */
function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;
  container.querySelectorAll("pre code").forEach((block) => {
    const lang = (block.className.match(/language-(\S+)/) || [])[1];
    try {
      if (lang) {
        block.innerHTML = hljs.highlight(block.textContent, { language: lang }).value;
      } else {
        block.innerHTML = hljs.highlightAuto(block.textContent).value;
      }
    } catch (_) { /* keep as-is */ }
  });
}
