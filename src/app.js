/* VELVA — app entry: state, streaming, tools, events. */

(function () {
  "use strict";

  /* ---------- state ---------- */
  const state = {
    conversations: loadConversations(),
    activeId: null,
    prefs: Object.assign(
      {
        model: PRESET_MODEL,
        temp: 0.7,
        maxTokens: 4096,
        system: "",
        search: false,
        reasoning: true,
        markdown: true,
        stream: true,
        autoTitle: true,
        autoModel: true,
        theme: "auto",
        panelOpen: false,
        sidebarOpen: true,
      },
      loadPrefs()
    ),
    generating: false,
    abort: null,
    listening: false,
    recorder: null,
    mediaStream: null,
    current: null, // active session object
  };

  /* ---------- dom refs ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    sessionList: $("session-list"),
    messages: $("messages"),
    scroller: $("scroller"),
    textarea: $("textarea"),
    sendBtn: $("send-btn"),
    micBtn: $("mic-btn"),
    attachBtn: $("attach-btn"),
    drawBtn: $("draw-btn"),
    attachRow: $("attach-row"),
    chatTitle: $("chat-title"),
    modelBtn: $("model-btn"),
    modelBtnLabel: $("model-btn-label"),
    modelGroup: $("model-group"),
    modelSelect: $("model-select"),
    chModel: $("ch-model"),
    chTokens: $("ch-tokens"),
    temp: $("temp"),
    tempVal: $("temp-val"),
    maxtok: $("maxtok"),
    maxtokVal: $("maxtok-val"),
    system: $("system"),
    tSearch: $("t-search"),
    tReason: $("t-reason"),
    tMarkdown: $("t-markdown"),
    tStream: $("t-stream"),
    tTitle: $("t-title"),
    tAuto: $("t-auto"),
    usageList: $("usage-list"),
    chatSearch: $("chat-search"),
    sbStats: $("sb-stats"),
    scrollDown: $("scroll-down"),
    toasts: $("toasts"),
    panel: $("panel"),
    sidebar: $("sidebar"),
    modal: $("modal"),
  };

  const pendingAttachments = [];

  /* ---------- toast ---------- */
  window.toast = function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " toast-" + kind : "");
    t.textContent = msg;
    els.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 2800);
  };

  /* ---------- conversation helpers ---------- */
  function activeSession() {
    return state.conversations.find((c) => c.id === state.activeId) || null;
  }

  function newSession(model) {
    const c = {
      id: newId(),
      title: "New chat",
      model: model || state.prefs.model,
      created: Date.now(),
      updated: Date.now(),
      messages: [],
    };
    state.conversations.unshift(c);
    state.activeId = c.id;
    saveConversations(state.conversations);
    return c;
  }

  function ensureSession() {
    let c = activeSession();
    if (!c) c = newSession();
    return c;
  }

  function selectSession(id, silent) {
    state.activeId = id;
    state.current = activeSession();
    if (state.current) {
      state.current.model = state.current.model || state.prefs.model;
    }
    if (!silent) saveConversations(state.conversations);
    render();
  }

  function saveCurrent() {
    const c = activeSession();
    if (c) {
      c.updated = Date.now();
      saveConversations(state.conversations);
    }
  }

  function titleOf(c) {
    const first = (c.messages || []).find((m) => m.role === "user");
    const text = textOfContent(first ? first.content : "");
    if (!text) return c.title || "New chat";
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 42 ? clean.slice(0, 42) + "…" : clean;
  }

  function pickModel(text) {
    if (state.prefs.autoModel) return autoModelFor(text).id;
    return state.prefs.model;
  }

  /* ---------- rendering ---------- */
  function render() {
    renderSidebar();
    renderTopbar();
    renderMessages();
    renderModelControls();
    renderPrefs();
    renderUsage();
    renderTokens();
    renderComposerHint();
    savePrefs(state.prefs);
  }

  function renderSidebar() {
    const q = els.chatSearch.value.trim().toLowerCase();
    const list = state.conversations
      .filter((c) => !q || titleOf(c).toLowerCase().includes(q))
      .slice(0, 200);
    els.sessionList.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "sb-empty";
      empty.textContent = q ? "No matches." : "No conversations yet.";
      els.sessionList.appendChild(empty);
    }
    list.forEach((c) => {
      const item = document.createElement("button");
      item.className = "sb-item" + (c.id === state.activeId ? " active" : "");
      const dot = document.createElement("span");
      dot.className = "sb-item-dot";
      const m = getModelById(c.model || PRESET_MODEL);
      dot.style.background = modelColor(m);
      const label = document.createElement("span");
      label.className = "sb-item-title";
      label.textContent = titleOf(c);
      const meta = document.createElement("span");
      meta.className = "sb-item-meta";
      meta.textContent = fmtTime(c.updated);
      item.append(dot, label, meta);
      item.addEventListener("click", () => selectSession(c.id));
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openSessionMenu(c, item);
      });
      els.sessionList.appendChild(item);
    });
    const n = state.conversations.length;
    const chars = state.conversations.reduce(
      (s, c) => s + (c.messages || []).reduce((x, m) => x + (textOfContent(m.content).length || 0), 0),
      0
    );
    els.sbStats.textContent =
      n + " chat" + (n === 1 ? "" : "s") + " · " + (chars > 1000 ? (chars / 1000).toFixed(0) + "k chars" : chars + " chars");
  }

  function openSessionMenu(c, anchor) {
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    const btns = [
      ["Rename", () => renameSession(c)],
      ["Export", () => exportSession(c)],
      ["Duplicate", () => duplicateSession(c)],
      ["Delete", () => deleteSession(c)],
    ];
    btns.forEach(([label, fn]) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", () => {
        menu.remove();
        fn();
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.min(r.bottom, window.innerHeight - 160) + "px";
    menu.style.left = Math.min(r.right - 180, window.innerWidth - 190) + "px";
    setTimeout(() => {
      document.addEventListener("mousedown", function close(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("mousedown", close);
        }
      });
    }, 0);
  }

  function renameSession(c) {
    const name = prompt("Rename conversation", titleOf(c));
    if (name !== null && name.trim()) {
      c.title = name.trim().slice(0, 80);
      saveConversations(state.conversations);
      render();
    }
  }

  function duplicateSession(c) {
    const copy = JSON.parse(JSON.stringify(serializeConversation(c)));
    copy.id = newId();
    copy.title = titleOf(c) + " (copy)";
    copy.created = Date.now();
    copy.updated = Date.now();
    state.conversations.unshift(copy);
    state.activeId = copy.id;
    saveConversations(state.conversations);
    render();
  }

  function deleteSession(c) {
    state.conversations = state.conversations.filter((x) => x.id !== c.id);
    if (state.activeId === c.id) {
      state.activeId = state.conversations[0] ? state.conversations[0].id : null;
    }
    saveConversations(state.conversations);
    render();
  }

  function renderTopbar() {
    const c = activeSession();
    const m = getModelById(c ? c.model : state.prefs.model);
    els.chatTitle.textContent = c ? titleOf(c) : "New chat";
    els.modelBtnLabel.textContent = m ? m.name : "Select model";
    const dot = els.modelBtn.querySelector(".model-dot");
    dot.style.background = modelColor(m);
  }

  function modelColor(m) {
    if (!m) return "var(--accent)";
    if (m.tier === "flagship") return "var(--rose)";
    if (m.tier === "smart") return "var(--accent)";
    return "var(--teal)";
  }

  function renderMessages() {
    const c = activeSession();
    els.messages.innerHTML = "";
    if (!c || !c.messages.length) {
      renderEmpty();
      return;
    }
    c.messages.forEach((m) => els.messages.appendChild(messageEl(m)));
    scrollToBottom(true);
  }

  function renderEmpty() {
    els.messages.innerHTML = "";
    const hero = document.createElement("div");
    hero.className = "empty";
    const mark = document.createElement("div");
    mark.className = "empty-mark";
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 L20 6 L20 18 L12 22 L4 18 L4 6 Z" fill="currentColor"/><path d="M12 6 L16 8 L16 12 L12 14 L8 12 L8 8 Z" fill="rgba(0,0,0,0.35)"/></svg>';
    const h1 = document.createElement("h1");
    h1.textContent = "Good afternoon.";
    const p = document.createElement("p");
    p.className = "empty-sub";
    p.textContent = "16 Claude models. Streaming. Reasoning. Web search, vision, images, and voice.";
    const chips = document.createElement("div");
    chips.className = "chips";
    [
      "Summarize a long article",
      "Debug this code",
      "Design a landing page",
      "Plan a 3-week sprint",
      "Explain like I'm 12",
      "Rewrite in a punchy tone",
    ].forEach((t) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = t;
      b.addEventListener("click", () => {
        els.textarea.value = t;
        els.textarea.focus();
      });
      chips.appendChild(b);
    });
    hero.append(mark, h1, p, chips);
    els.messages.appendChild(hero);
  }

  function messageEl(m) {
    const wrap = document.createElement("div");
    wrap.className = "msg msg-" + m.role;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    if (m.role === "assistant") {
      const mm = getModelById(m.model || state.prefs.model);
      avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 L20 6 L20 18 L12 22 L4 18 L4 6 Z" fill="currentColor"/><path d="M12 6 L16 8 L16 12 L12 14 L8 12 L8 8 Z" fill="rgba(0,0,0,0.35)"/></svg>';
      avatar.style.color = modelColor(mm);
    } else {
      avatar.textContent = "You";
    }

    const body = document.createElement("div");
    body.className = "msg-body";

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const who = document.createElement("span");
    who.className = "msg-who";
    who.textContent = m.role === "assistant" ? (getModelById(m.model)?.name || "VELVA") : "You";
    const when = document.createElement("span");
    when.className = "msg-when";
    when.textContent = m.ts ? fmtClock(m.ts) : "";
    meta.append(who, when);

    const content = document.createElement("div");
    content.className = "msg-content";
    content.dataset.role = m.role;

    if (m.attachments && m.attachments.length) {
      const att = document.createElement("div");
      att.className = "att-grid";
      m.attachments.forEach((a) => {
        const tile = document.createElement("div");
        tile.className = "att-tile";
        if (a.kind === "image") {
          const img = document.createElement("img");
          img.src = a.url || "";
          img.alt = a.name || "attachment";
          tile.appendChild(img);
        } else {
          const ico = document.createElement("span");
          ico.className = "att-ico";
          ico.textContent = a.kind === "audio" ? "♪" : "📄";
          const nm = document.createElement("span");
          nm.className = "att-name";
          nm.textContent = a.name || "file";
          const sz = document.createElement("span");
          sz.className = "att-size";
          sz.textContent = fmtSize(a.size || 0);
          tile.append(ico, nm, sz);
        }
        tile.addEventListener("click", () => viewAttachment(a));
        att.appendChild(tile);
      });
      content.appendChild(att);
    }

    const text = document.createElement("div");
    text.className = "msg-text";
    if (m.role === "user") {
      text.textContent = textOfContent(m.content);
    } else if (m.role === "assistant") {
      if (state.prefs.markdown) {
        fillMarkdown(text, textOfContent(m.content));
      } else {
        text.textContent = textOfContent(m.content);
        text.style.whiteSpace = "pre-wrap";
      }
    }
    content.appendChild(text);

    if (m.reasoning) {
      const r = document.createElement("details");
      r.className = "reasoning";
      const rs = document.createElement("summary");
      rs.textContent = "Reasoning";
      const rb = document.createElement("div");
      rb.textContent = m.reasoning;
      r.append(rs, rb);
      content.appendChild(r);
    }

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    [
      ["Copy", () => copyText(textOfContent(m.content))],
      ["Read aloud", () => speak(textOfContent(m.content))],
      m.role === "assistant"
        ? ["Regenerate", () => regenerate(m)]
        : ["Edit", () => editMessage(m)],
    ].forEach(([label, fn]) => {
      const b = document.createElement("button");
      b.className = "ma-btn";
      b.textContent = label;
      b.addEventListener("click", fn);
      actions.appendChild(b);
    });
    body.append(meta, content, actions);
    wrap.append(avatar, body);
    return wrap;
  }

  function copyText(t) {
    navigator.clipboard.writeText(t).then(() => toast("Copied to clipboard.")).catch(() => {});
  }

  function speak(text) {
    const t = textOfContent(text).replace(/#{1,6}\s?/g, "").replace(/```[\s\S]*?```/g, " ").replace(/[`*_~\[\]()]/g, "").slice(0, 6000);
    if (!t.trim()) return;
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.rate = 1.02;
      speechSynthesis.speak(u);
    } else {
      toast("Speech synthesis is not available here.", "warn");
    }
  }

  function editMessage(m) {
    els.textarea.value = textOfContent(m.content);
    els.textarea.focus();
    toast("Pasted into the composer — resend to retry.");
  }

  function regenerate(m) {
    if (state.generating) return;
    const c = activeSession();
    const idx = c.messages.indexOf(m);
    if (idx <= 0) return;
    c.messages.splice(idx);
    saveConversations(state.conversations);
    state.generating = true;
    renderMessages();
    send({ regenerating: true });
  }

  function renderModelControls() {
    els.modelGroup.innerHTML = "";
    els.modelSelect.innerHTML = "";
    const c = activeSession();
    const current = (c && c.model) || state.prefs.model;
    const tiers = ["flagship", "smart", "fast"];
    tiers.forEach((tier) => {
      const models = CLAUDE_MODELS.filter((m) => m.tier === tier);
      const group = document.createElement("div");
      group.className = "mg-group";
      const label = document.createElement("div");
      label.className = "mg-label";
      label.textContent = formatModelTier(tier);
      group.appendChild(label);
      models.forEach((m) => {
        const b = document.createElement("button");
        b.className = "mg-item" + (m.id === current ? " active" : "");
        b.innerHTML =
          '<span class="mg-dot" style="background:' + modelColor(m) + '"></span>' +
          '<span class="mg-name"></span>' +
          (m.id === current ? '<span class="mg-check">✓</span>' : "");
        b.querySelector(".mg-name").textContent = m.name;
        b.addEventListener("click", () => {
          const c2 = activeSession();
          if (c2) c2.model = m.id;
          else state.prefs.model = m.id;
          state.prefs.model = m.id;
          saveConversations(state.conversations);
          render();
          toast("Using " + m.name);
        });
        group.appendChild(b);
      });
      els.modelGroup.appendChild(group);
    });
    CLAUDE_MODELS.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.name;
      els.modelSelect.appendChild(o);
    });
    els.modelSelect.value = current;
  }

  function renderPrefs() {
    const p = state.prefs;
    els.temp.value = p.temp;
    els.tempVal.textContent = p.temp;
    els.maxtok.value = p.maxTokens;
    els.maxtokVal.textContent = fmtTokens(p.maxTokens);
    els.system.value = p.system || "";
    els.tSearch.checked = !!p.search;
    els.tReason.checked = !!p.reasoning;
    els.tMarkdown.checked = !!p.markdown;
    els.tStream.checked = !!p.stream;
    els.tTitle.checked = !!p.autoTitle;
    els.tAuto.checked = !!p.autoModel;
    document.documentElement.classList.toggle("panel-open", p.panelOpen);
    document.documentElement.classList.toggle("sb-open", p.sidebarOpen);
  }

  function fmtTokens(n) {
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k";
    return String(n);
  }

  function renderUsage() {
    const buckets = {};
    state.conversations.forEach((c) => {
      (c.messages || []).forEach((m) => {
        if (m.role !== "assistant") return;
        const mm = getModelById(m.model) || { name: "Claude" };
        buckets[mm.name] = (buckets[mm.name] || 0) + 1;
      });
    });
    els.usageList.innerHTML = "";
    const rows = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      const e = document.createElement("div");
      e.className = "usage-empty";
      e.textContent = "No messages yet this session.";
      els.usageList.appendChild(e);
      return;
    }
    const max = rows[0][1];
    rows.forEach(([name, count]) => {
      const row = document.createElement("div");
      row.className = "usage-row";
      const head = document.createElement("div");
      head.className = "usage-head";
      head.innerHTML = "<span>" + name + "</span><span>" + count + "</span>";
      const bar = document.createElement("div");
      bar.className = "usage-bar";
      const fill = document.createElement("div");
      fill.className = "usage-fill";
      fill.style.width = Math.max(8, (count / max) * 100) + "%";
      bar.appendChild(fill);
      row.append(head, bar);
      els.usageList.appendChild(row);
    });
  }

  function renderTokens() {
    const c = activeSession();
    if (!c) {
      els.chTokens.textContent = "";
      return;
    }
    const chars = (c.messages || []).reduce((s, m) => s + (textOfContent(m.content).length || 0), 0);
    els.chTokens.textContent = "≈ " + Math.round(chars / 4) + " tokens";
  }

  function renderComposerHint() {
    const c = activeSession();
    const m = getModelById(c ? c.model : state.prefs.model);
    els.chModel.textContent = (m ? m.name : "Claude") + (state.prefs.search ? " · web search on" : "");
  }

  /* ---------- send / stream ---------- */
  function buildMessages(c, content) {
    const messages = [];
    if (state.prefs.system) messages.push({ role: "system", content: state.prefs.system });
    c.messages.forEach((m) => {
      if (m.role === "user") {
        let parts = [];
        if (textOfContent(m.content)) parts.push({ type: "text", text: textOfContent(m.content) });
        (m.attachments || []).forEach((a) => {
          if (a.kind === "image" && a.dataUrl) {
            parts.push({ type: "image_url", image_url: a.dataUrl });
          }
        });
        messages.push({ role: "user", content: parts });
      } else if (m.role === "assistant") {
        messages.push({ role: "assistant", content: textOfContent(m.content) });
      }
    });
    return messages;
  }

  async function send(opts) {
    opts = opts || {};
    if (state.generating) {
      stopStreaming();
      return;
    }
    const c = ensureSession();
    let text = opts.text != null ? opts.text : els.textarea.value.trim();
    if (!text && !pendingAttachments.length && !opts.regenerating) return;

    if (text && state.prefs.autoTitle && c.title === "New chat" && c.messages.length === 0) {
      c.title = text.replace(/\s+/g, " ").trim().slice(0, 42) + (text.length > 42 ? "…" : "");
    }
    if (!text && pendingAttachments.length) {
      text = pendingAttachments.length === 1
        ? "Describe this " + pendingAttachments[0].name
        : "Describe these attachments.";
    }

    const userMsg = { role: "user", content: text, attachments: pendingAttachments.slice(), ts: Date.now() };
    c.messages.push(userMsg);
    pendingAttachments.length = 0;
    renderAttachRow();

    const model = pickModel(text);
    const aiMsg = { role: "assistant", content: "", model, ts: Date.now(), reasoning: "" };
    c.messages.push(aiMsg);

    els.textarea.value = "";
    autosize();
    state.generating = true;
    saveConversations(state.conversations);
    renderMessages();

    const aiEl = els.messages.lastElementChild;
    const textEl = aiEl.querySelector(".msg-text");
    textEl.textContent = "";
    textEl.classList.add("typing");
    const typingDot = document.createElement("span");
    typingDot.className = "typing-dot";
    textEl.appendChild(typingDot);

    const ctrl = new AbortController();
    state.abort = ctrl;
    aiEl.classList.add("streaming");
    addStopUI(aiEl);

    const toolIds = [];
    if (state.prefs.search) toolIds.push("web_search");

    try {
      const messages = buildMessages(c, text);
      const response = await puter.ai.chat(messages, false, {
        model,
        temperature: Number(state.prefs.temp),
        max_tokens: Number(state.prefs.maxTokens),
        stream: state.prefs.stream,
        tools: toolIds.length ? toolIds.map((t) => ({ type: t })) : undefined,
        signal: ctrl.signal,
      });

      let full = "";
      let reasoning = "";
      let first = true;

      if (state.prefs.stream) {
        const parts = response;
        for await (const part of parts) {
          if (ctrl.signal.aborted) break;
          if (!part) continue;
          if (part.reasoning) {
            reasoning += part.reasoning;
            aiMsg.reasoning = reasoning;
            continue;
          }
          const piece = part.text != null ? part.text : typeof part === "string" ? part : "";
          if (!piece) continue;
          if (first) {
            typingDot.remove();
            textEl.classList.remove("typing");
            first = false;
          }
          full += piece;
          aiMsg.content = full;
          if (state.prefs.markdown) {
            fillMarkdown(textEl, full);
          } else {
            textEl.textContent = full;
          }
          scrollToBottom(false);
        }
      } else {
        const text0 =
          (response && (response.text != null ? response.text : response.content)) || "";
        full = text0;
        aiMsg.content = full;
      }

      typingDot.remove();
      textEl.classList.remove("typing");
      aiEl.classList.remove("streaming");

      if (state.prefs.markdown) {
        fillMarkdown(textEl, full || "_*No response.*_");
        highlightCodeBlocks(textEl);
      } else {
        textEl.textContent = full || "No response.";
      }

      if (!ctrl.signal.aborted && !full && !reasoning) {
        toast("The model returned an empty response. Try again.", "warn");
      }

      if (state.prefs.autoTitle && c.title === "New chat" && full && state.prefs.autoModel) {
        gentleTitle(c, text);
      }
    } catch (err) {
      typingDot.remove();
      textEl.classList.remove("typing");
      aiEl.classList.remove("streaming");
      if (ctrl.signal.aborted) {
        if (aiMsg.content === "" && !aiMsg.reasoning) {
          c.messages.pop();
        } else {
          aiMsg.content = aiMsg.content + "\n\n*(generation stopped)*";
        }
      } else {
        const msg = err && err.message ? err.message : "Something went wrong with this request.";
        if (aiMsg.content === "") {
          textEl.textContent = "";
          fillMarkdown(textEl, "**Error:** " + msg);
        }
        toast("Request failed: " + msg, "err");
      }
    } finally {
      state.generating = false;
      state.abort = null;
      saveConversations(state.conversations);
      renderMessages();
      renderTokens();
      renderUsage();
    }
  }

  function addStopUI(aiEl) {
    const stop = document.createElement("button");
    stop.className = "stop-btn";
    stop.textContent = "Stop generating";
    stop.addEventListener("click", stopStreaming);
    const content = aiEl.querySelector(".msg-content");
    content.appendChild(stop);
  }

  function stopStreaming() {
    if (state.abort) {
      state.abort.abort();
      speechSynthesis.cancel();
    }
  }

  function gentleTitle(c, text) {
    setTimeout(() => {
      if (c.title === "New chat") {
        const words = text.replace(/\s+/g, " ").trim();
        c.title = words.length > 40 ? words.slice(0, 40) + "…" : words;
        saveConversations(state.conversations);
        renderSidebar();
        renderTopbar();
      }
    }, 1200);
  }

  /* ---------- attachments ---------- */
  function renderAttachRow() {
    els.attachRow.innerHTML = "";
    if (!pendingAttachments.length) {
      els.attachRow.hidden = true;
      return;
    }
    els.attachRow.hidden = false;
    pendingAttachments.forEach((a, i) => {
      const chip = document.createElement("span");
      chip.className = "att-chip";
      if (a.kind === "image") {
        const img = document.createElement("img");
        img.src = a.dataUrl;
        img.alt = a.name;
        chip.appendChild(img);
      }
      const label = document.createElement("span");
      label.className = "att-chip-label";
      label.textContent = (a.name || "file").length > 24 ? (a.name || "file").slice(0, 24) + "…" : a.name || "file";
      const x = document.createElement("button");
      x.className = "att-chip-x";
      x.textContent = "×";
      x.addEventListener("click", () => {
        pendingAttachments.splice(i, 1);
        renderAttachRow();
      });
      chip.append(label, x);
      els.attachRow.appendChild(chip);
    });
  }

  function viewAttachment(a) {
    if (a.kind === "image") {
      showModal(
        a.name || "Image",
        '<img class="modal-img" src="' + (a.url || a.dataUrl) + '" alt=""/>'
      );
    } else {
      showModal(a.name || "File", '<pre class="modal-pre"></pre>', (body) => {
        const pre = body.querySelector(".modal-pre");
        pre.textContent = a.text || "(binary file — not shown)";
      });
    }
  }

  function addImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      pendingAttachments.push({
        kind: "image",
        name: file.name || "image.png",
        mime: file.type || "image/png",
        size: file.size,
        dataUrl,
        url: dataUrl,
        text: file.name || "",
      });
      renderAttachRow();
    };
    reader.readAsDataURL(file);
  }

  function addTextFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || "").slice(0, 20000);
      pendingAttachments.push({
        kind: "text",
        name: file.name || "file.txt",
        mime: file.type || "text/plain",
        size: file.size,
        text,
      });
      renderAttachRow();
    };
    reader.readAsText(file);
  }

  function addAudioFile(file) {
    const url = URL.createObjectURL(file);
    pendingAttachments.push({
      kind: "audio",
      name: file.name || "audio",
      mime: file.type || "audio/*",
      size: file.size,
      url,
      text: file.name || "",
    });
    renderAttachRow();
    showModal("Audio attachment", '<audio class="modal-audio" controls src="' + url + '"></audio>');
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    Array.from(files).forEach((f) => {
      if (!f) return;
      if (f.type.startsWith("image/")) addImageFile(f);
      else if (f.type.startsWith("text/") || f.type.includes("json") || f.type.includes("markdown")) addTextFile(f);
      else addAudioFile(f);
    });
  }

  /* ---------- image generation ---------- */
  async function generateImage() {
    const c = ensureSession();
    const prompt = (await askText("Generate an image", "Describe the image you want…")) || "";
    if (!prompt.trim()) return;
    const b = document.createElement("div");
    b.className = "msg msg-assistant";
    b.innerHTML =
      '<div class="msg-avatar">' +
      '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 L20 6 L20 18 L12 22 L4 18 L4 6 Z" fill="currentColor"/><path d="M12 6 L16 8 L16 12 L12 14 L8 12 L8 8 Z" fill="rgba(0,0,0,0.35)"/></svg>' +
      "</div>" +
      '<div class="msg-body"><div class="msg-meta"><span class="msg-who">VELVA · Image</span></div>' +
      '<div class="msg-content"><div class="msg-text"><div class="gen-box"><span class="gen-spin"></span><span class="gen-label">Rendering <em></em>…</span></div></div></div></div>';
    b.querySelector(".msg-avatar").style.color = "var(--rose)";
    b.querySelector(".gen-label em").textContent = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;
    els.messages.appendChild(b);
    scrollToBottom(true);

    const userMsg = { role: "user", content: "🎨 " + prompt, ts: Date.now() };
    c.messages.push(userMsg);

    try {
      const img = await puter.ai.txt2img(prompt, {
        model: "stabilityai/stable-diffusion-3-medium",
        width: 1024,
        height: 1024,
        steps: 25,
        seed: Math.floor(Math.random() * 1000000),
        negative_prompt: "blurry, low quality, distorted, watermark, text",
      });
      const gen = b.querySelector(".gen-box");
      gen.innerHTML = "";
      const imgEl = document.createElement("img");
      imgEl.src = img.src;
      imgEl.className = "gen-img";
      imgEl.alt = prompt;
      const actions = document.createElement("div");
      actions.className = "gen-actions";
      const save = document.createElement("button");
      save.className = "ma-btn";
      save.textContent = "Save image";
      save.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = img.src;
        a.download = "velva-" + Date.now() + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
      const regen = document.createElement("button");
      regen.className = "ma-btn";
      regen.textContent = "Regenerate";
      regen.addEventListener("click", () => {
        gen.innerHTML = "";
        const spin = document.createElement("span");
        spin.className = "gen-spin";
        const lbl = document.createElement("span");
        lbl.className = "gen-label";
        lbl.textContent = "Rendering again…";
        gen.append(spin, lbl);
        generateImage(prompt);
      });
      actions.append(save, regen);
      gen.append(imgEl, actions);
      const aiMsg = {
        role: "assistant",
        content: "🎨 Image generated: " + prompt,
        model: "stabilityai/stable-diffusion-3-medium",
        ts: Date.now(),
      };
      c.messages.push(aiMsg);
      scrollToBottom(true);
    } catch (err) {
      const gen = b.querySelector(".gen-box");
      gen.innerHTML = '<div class="gen-err">Image generation failed: ' + escapeHtml(err && err.message ? err.message : "unknown error") + "</div>";
    }
    saveConversations(state.conversations);
  }

  function drawImage() {
    generateImage();
  }

  /* ---------- voice ---------- */
  async function toggleMic() {
    if (state.listening) {
      stopListening();
      return;
    }
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast("Speech recognition is not available in this browser.", "warn");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    state.listening = true;
    els.micBtn.classList.add("on");
    toast("Listening… speak now.");
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) els.textarea.value += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      autosize();
    };
    rec.onerror = () => {
      stopListening();
      toast("Could not hear you.", "warn");
    };
    rec.onend = () => stopListening();
    rec.start();
  }

  function stopListening() {
    state.listening = false;
    els.micBtn.classList.remove("on");
  }

  /* ---------- modal ---------- */
  function showModal(title, html, afterOpen) {
    els.modal.querySelector("#modal-title").textContent = title;
    const body = els.modal.querySelector("#modal-body");
    body.innerHTML = html;
    els.modal.showModal();
    els.modal.querySelector("#modal-ok").hidden = true;
    els.modal.querySelector("#modal-cancel").textContent = "Close";
    if (afterOpen) afterOpen(body);
  }

  function askText(title, placeholder) {
    return new Promise((resolve) => {
      els.modal.querySelector("#modal-title").textContent = title;
      const body = els.modal.querySelector("#modal-body");
      body.innerHTML =
        '<textarea id="ask-input" class="pn-textarea" rows="3" placeholder="' +
        escapeHtml(placeholder || "") +
        '"></textarea>';
      const ok = els.modal.querySelector("#modal-ok");
      const cancel = els.modal.querySelector("#modal-cancel");
      ok.hidden = false;
      ok.textContent = "Generate";
      cancel.textContent = "Cancel";
      els.modal.showModal();
      const input = body.querySelector("#ask-input");
      input.focus();
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        els.modal.close();
        resolve(val);
      };
      ok.onclick = () => finish(input.value.trim());
      cancel.onclick = () => finish("");
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish(input.value.trim());
      });
      els.modal.addEventListener("close", () => finish(""), { once: true });
    });
  }

  function confirmText(title, html) {
    return new Promise((resolve) => {
      els.modal.querySelector("#modal-title").textContent = title;
      const body = els.modal.querySelector("#modal-body");
      body.innerHTML = html || "";
      const ok = els.modal.querySelector("#modal-ok");
      const cancel = els.modal.querySelector("#modal-cancel");
      ok.hidden = false;
      ok.textContent = "Confirm";
      cancel.textContent = "Cancel";
      els.modal.showModal();
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        els.modal.close();
        resolve(v);
      };
      ok.onclick = () => finish(true);
      cancel.onclick = () => finish(false);
      els.modal.addEventListener("close", () => finish(false), { once: true });
    });
  }

  /* ---------- export / import ---------- */
  function exportSession(c) {
    const data = {
      app: "VELVA",
      version: 1,
      exported: new Date().toISOString(),
      conversations: [serializeConversation(c)],
    };
    downloadJson(data, "velva-chat-" + Date.now() + ".json");
  }

  function exportAll() {
    const data = {
      app: "VELVA",
      version: 1,
      exported: new Date().toISOString(),
      conversations: state.conversations.map(serializeConversation),
    };
    downloadJson(data, "velva-all-" + Date.now() + ".json");
  }

  function importConversations() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        const data = await readJsonFile(f);
        const list = Array.isArray(data) ? data : data.conversations;
        if (!Array.isArray(list) || !list.length) throw new Error("No conversations in file");
        list.forEach((c) => {
          const messages = (c.messages || []).map((m) => ({
            role: m.role || "user",
            content: m.content || "",
            attachments: (m.attachments || []).map((a) => ({
              kind: a.kind || "text",
              name: a.name || "",
              mime: a.mime || "",
              size: a.size || 0,
              text: a.text || "",
            })),
            model: m.model || null,
            ts: m.ts || Date.now(),
          }));
          const merged = {
            id: newId(),
            title: c.title || "Imported",
            model: c.model || state.prefs.model,
            created: c.created || Date.now(),
            updated: c.updated || Date.now(),
            messages,
          };
          state.conversations.unshift(merged);
        });
        saveConversations(state.conversations);
        state.activeId = state.conversations[0].id;
        render();
        toast("Imported " + list.length + " conversation" + (list.length === 1 ? "" : "s") + ".");
      } catch (e) {
        toast("Import failed: " + e.message, "err");
      }
    });
    input.click();
  }

  function clearCurrent() {
    const c = activeSession();
    if (!c) return;
    confirmText("Clear this chat", "<p>This removes all messages from the current conversation. This cannot be undone.</p>").then((ok) => {
      if (!ok) return;
      c.messages = [];
      saveConversations(state.conversations);
      render();
    });
  }

  function deleteCurrent() {
    const c = activeSession();
    if (!c) return;
    confirmText("Delete this chat", "<p><strong>" + escapeHtml(titleOf(c)) + "</strong> will be deleted permanently.</p>").then((ok) => {
      if (!ok) return;
      deleteSession(c);
    });
  }

  function clearAll() {
    confirmText("Clear all conversations", "<p>This deletes every conversation on this device. Export first if you need a backup.</p>").then((ok) => {
      if (!ok) return;
      state.conversations = [];
      state.activeId = null;
      saveConversations(state.conversations);
      render();
    });
  }

  /* ---------- helpers ---------- */
  function fmtTime(ts) {
    const d = new Date(ts || Date.now());
    const now = new Date();
    const same = d.toDateString() === now.toDateString();
    if (same) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const yest = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    if (d.getFullYear() === now.getFullYear())
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function scrollToBottom(smooth) {
    requestAnimationFrame(() => {
      els.scroller.scrollTo({
        top: els.scroller.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  function autosize() {
    els.textarea.style.height = "auto";
    els.textarea.style.height = Math.min(els.textarea.scrollHeight, 220) + "px";
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = state.prefs.theme;
    const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }

  /* ---------- events ---------- */
  function bind() {
    els.sendBtn.addEventListener("click", () => send());
    els.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    els.textarea.addEventListener("input", autosize);
    els.attachBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/*,text/*,.json,.md,audio/*";
      input.addEventListener("change", () => handleFiles(input.files));
      input.click();
    });
    els.drawBtn.addEventListener("click", drawImage);
    els.micBtn.addEventListener("click", toggleMic);
    $("btn-draw").addEventListener("click", drawImage);
    $("btn-search").addEventListener("click", () => {
      state.prefs.search = !state.prefs.search;
      renderPrefs();
      renderComposerHint();
      toast(state.prefs.search ? "Web search enabled for the next message." : "Web search disabled.");
    });
    $("btn-new").addEventListener("click", () => {
      const c = newSession();
      render();
      els.textarea.focus();
    });
    $("btn-menu").addEventListener("click", () => {
      state.prefs.sidebarOpen = !state.prefs.sidebarOpen;
      renderPrefs();
    });
    $("btn-panel").addEventListener("click", togglePanel);
    $("btn-panel-close").addEventListener("click", togglePanel);
    function togglePanel() {
      state.prefs.panelOpen = !state.prefs.panelOpen;
      renderPrefs();
    }
    $("btn-settings").addEventListener("click", togglePanel);
    $("btn-export-chat").addEventListener("click", () => {
      const c = activeSession();
      if (c) exportSession(c);
      else toast("No chat to export.", "warn");
    });
    $("btn-export-all").addEventListener("click", exportAll);
    $("btn-export-all-2").addEventListener("click", exportAll);
    $("btn-import").addEventListener("click", importConversations);
    $("btn-import-2").addEventListener("click", importConversations);
    $("btn-clear").addEventListener("click", clearCurrent);
    $("btn-delete").addEventListener("click", deleteCurrent);
    $("btn-clear-all").addEventListener("click", clearAll);
    $("btn-theme").addEventListener("click", () => {
      const order = ["auto", "dark", "light"];
      state.prefs.theme = order[(order.indexOf(state.prefs.theme) + 1) % order.length];
      applyTheme();
      renderPrefs();
    });
    $("btn-search").title = "Toggle web search";

    els.chatTitle.addEventListener("click", () => {
      const c = activeSession();
      if (c) renameSession(c);
    });
    els.modelBtn.addEventListener("click", () => {
      state.prefs.panelOpen = true;
      renderPrefs();
    });
    els.modelSelect.addEventListener("change", () => {
      const c = activeSession();
      if (c) c.model = els.modelSelect.value;
      state.prefs.model = els.modelSelect.value;
      saveConversations(state.conversations);
      render();
    });

    els.temp.addEventListener("input", () => {
      state.prefs.temp = Number(els.temp.value);
      els.tempVal.textContent = state.prefs.temp;
      renderPrefs();
    });
    els.maxtok.addEventListener("input", () => {
      state.prefs.maxTokens = Number(els.maxtok.value);
      els.maxtokVal.textContent = fmtTokens(state.prefs.maxTokens);
      renderPrefs();
    });
    els.system.addEventListener("input", () => {
      state.prefs.system = els.system.value;
      savePrefs(state.prefs);
    });
    [
      [els.tSearch, "search"],
      [els.tReason, "reasoning"],
      [els.tMarkdown, "markdown"],
      [els.tStream, "stream"],
      [els.tTitle, "autoTitle"],
      [els.tAuto, "autoModel"],
    ].forEach(([el, key]) => {
      el.addEventListener("change", () => {
        state.prefs[key] = el.checked;
        savePrefs(state.prefs);
        renderComposerHint();
        if (key === "markdown") renderMessages();
      });
    });

    els.chatSearch.addEventListener("input", renderSidebar);
    els.scroller.addEventListener("scroll", () => {
      const near = els.scroller.scrollHeight - els.scroller.scrollTop - els.scroller.clientHeight < 120;
      els.scrollDown.hidden = near;
    });
    els.scrollDown.addEventListener("click", () => scrollToBottom(true));

    /* drag & drop attachments */
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    /* keyboard shortcuts */
    document.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearchOrPalette();
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        $("btn-new").click();
      } else if (mod && e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleMic();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        $("btn-theme").click();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        togglePanel();
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        state.prefs.sidebarOpen = !state.prefs.sidebarOpen;
        renderPrefs();
      }
    });

    els.sidebar.addEventListener("click", (e) => {
      if (e.target.closest("input")) return;
      if (window.innerWidth < 900) {
        state.prefs.sidebarOpen = false;
        renderPrefs();
      }
    });
  }

  /* Minimal command palette: quick actions via prompt-style modal. */
  function focusSearchOrPalette() {
    if (!document.activeElement || document.activeElement !== els.chatSearch) {
      els.chatSearch.focus();
    }
  }

  /* ---------- init ---------- */
  function init() {
    if (typeof puter === "undefined") {
      toast("Puter.js failed to load — AI features will not work.", "err");
    }
    applyTheme();
    if (!state.conversations.length) newSession();
    state.current = activeSession();
    bind();
    render();
    els.textarea.focus();
    autosize();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
