/* VELVA — localStorage persistence, export/import. */

const STORE_KEY = "velva.conversations.v1";
const PREFS_KEY = "velva.prefs.v1";

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function saveConversations(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch (e) {
    toast("Storage is full — export your conversations to free space.", "warn");
  }
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (_) { /* ignore */ }
}

function newId() {
  return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Serialize a conversation for export (drops image blobs, keeps text + refs). */
function serializeConversation(c) {
  return {
    id: c.id,
    title: c.title,
    model: c.model,
    created: c.created,
    updated: c.updated,
    messages: c.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : textOfContent(m.content),
      attachments: (m.attachments || []).map((a) => ({
        kind: a.kind,
        name: a.name,
        mime: a.mime,
        size: a.size,
        text: a.text || "",
      })),
      model: m.model || null,
      reasoning: m.reasoning || null,
      ts: m.ts || null,
    })),
  };
}

function textOfContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p.text === "string") return p.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content || "");
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
