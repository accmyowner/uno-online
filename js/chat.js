// chat.js — игровой чат комнаты (ПК + мобильные). Живёт в <body>, независимо
// от перерисовок игрового поля. Использует уже существующую синхронизацию Firebase
// (net.subscribeChat / net.sendChat) — архитектура, сеть и логика чата не меняются.
import { state } from "./state.js";
import { subscribeChat, sendChat } from "./net.js";
import { escapeHtml } from "./utils.js";
import { sfx } from "./sfx.js";

let rootEl = null;
let unsub = null;
let messages = [];
let open = false;
let unread = 0;
let seenCount = 0;
let initialized = false;
let curCode = null;

function fmtTime(at) {
  try {
    const d = new Date(at);
    return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
  } catch (_) { return ""; }
}

export function mountChat(code) {
  if (rootEl && curCode === code) return;
  unmountChat();
  curCode = code;
  messages = []; open = false; unread = 0; seenCount = 0; initialized = false;

  rootEl = document.createElement("div");
  rootEl.className = "chat-root";
  rootEl.dataset.open = "false";
  rootEl.innerHTML = `
    <button class="chat-fab" id="chatFab" title="Чат" aria-label="Чат">
      <span class="chat-fab-icon">💬</span>
      <span class="chat-badge" id="chatBadge" hidden>0</span>
    </button>
    <div class="chat-panel glass" role="dialog" aria-label="Чат комнаты">
      <div class="chat-head">
        <span class="chat-title">💬 Чат</span>
        <button class="chat-close" id="chatClose" aria-label="Свернуть">✕</button>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input-row">
        <input type="text" class="chat-input" id="chatInput" maxlength="200"
          placeholder="Написать сообщение..." autocomplete="off" enterkeyhint="send">
        <button class="chat-send" id="chatSend" aria-label="Отправить">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(rootEl);

  const fab = rootEl.querySelector("#chatFab");
  const closeBtn = rootEl.querySelector("#chatClose");
  const input = rootEl.querySelector("#chatInput");
  const sendBtn = rootEl.querySelector("#chatSend");

  fab.addEventListener("click", () => setOpen(!open));
  closeBtn.addEventListener("click", () => setOpen(false));
  sendBtn.addEventListener("click", () => doSend(input.value));

  // ПК: Enter отправляет. Телефон (сенсорный ввод): отправка только кнопкой.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (!touch) { e.preventDefault(); doSend(input.value); }
    }
  });

  async function doSend(text) {
    text = String(text || "").trim();
    if (!text) return;
    const r = await sendChat(curCode, text);
    if (r.ok) { sfx.send(); input.value = ""; input.focus(); }
  }

  unsub = subscribeChat(code, (list) => {
    const prevCount = messages.length;
    messages = list;
    if (initialized && list.length > prevCount) {
      const fresh = list.slice(prevCount);
      const fromOthers = fresh.some((m) => m.by !== state.playerId);
      if (!open) {
        unread += fresh.length;
        updateBadge();
        if (fromOthers) sfx.chat();
      } else {
        seenCount = list.length;
        if (fromOthers) sfx.chat();
      }
    }
    initialized = true;
    if (open) seenCount = list.length;
    renderMessages();
  });
}

function setOpen(v) {
  if (!rootEl) return;
  open = v;
  rootEl.dataset.open = v ? "true" : "false";
  document.body.classList.toggle("chat-open", v);
  // Поле игры сдвигается на десктопе — просим пересчитать раскладку руки
  window.dispatchEvent(new Event("resize"));
  if (v) {
    unread = 0;
    seenCount = messages.length;
    updateBadge();
    renderMessages();
    const input = rootEl.querySelector("#chatInput");
    setTimeout(() => { if (input) input.focus(); scrollBottom(true); }, 60);
  }
}

function updateBadge() {
  const badge = rootEl && rootEl.querySelector("#chatBadge");
  if (!badge) return;
  if (unread > 0) { badge.hidden = false; badge.textContent = unread > 99 ? "99+" : String(unread); }
  else { badge.hidden = true; }
}

function scrollBottom(force) {
  const box = rootEl && rootEl.querySelector("#chatMessages");
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

function renderMessages() {
  const box = rootEl && rootEl.querySelector("#chatMessages");
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  if (!messages.length) {
    box.innerHTML = `<div class="chat-empty muted">Пока нет сообщений</div>`;
    return;
  }
  box.innerHTML = messages.map((m) => {
    const mine = m.by === state.playerId;
    return `
      <div class="chat-msg ${mine ? "mine" : ""}">
        <div class="chat-msg-head">
          <span class="chat-name">${escapeHtml(m.name || "Игрок")}</span>
          <span class="chat-time">${fmtTime(m.at)}</span>
        </div>
        <div class="chat-bubble">${escapeHtml(m.text || "")}</div>
      </div>`;
  }).join("");
  scrollBottom(nearBottom || true);
}

export function unmountChat() {
  if (unsub) { try { unsub(); } catch (_) {} unsub = null; }
  if (rootEl) { rootEl.remove(); rootEl = null; }
  document.body.classList.remove("chat-open");
  messages = []; open = false; unread = 0; seenCount = 0; initialized = false; curCode = null;
}
