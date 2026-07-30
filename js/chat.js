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

  makeFabDraggable(fab);
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

// ── Перетаскиваемая кнопка чата (тап = открыть, перетаскивание = переместить) ──
const FAB_KEY = "uno_chatfab_pos_v1";
const FAB_MARGIN = 8;

function clampFab(fab, x, y) {
  const w = fab.offsetWidth || 56, h = fab.offsetHeight || 56;
  const maxX = window.innerWidth - w - FAB_MARGIN;
  const maxY = window.innerHeight - h - FAB_MARGIN;
  return {
    x: Math.max(FAB_MARGIN, Math.min(x, maxX)),
    y: Math.max(FAB_MARGIN, Math.min(y, maxY)),
  };
}
function placeFab(fab, x, y) {
  const p = clampFab(fab, x, y);
  fab.style.left = p.x + "px";
  fab.style.top = p.y + "px";
  fab.style.right = "auto";
  fab.style.bottom = "auto";
}
function restoreFabPos(fab) {
  try {
    const raw = localStorage.getItem(FAB_KEY);
    if (!raw) return;
    const { x, y } = JSON.parse(raw);
    if (typeof x === "number" && typeof y === "number") {
      // применяем после того, как размеры кнопки известны
      requestAnimationFrame(() => placeFab(fab, x, y));
    }
  } catch (_) {}
}
function makeFabDraggable(fab) {
  restoreFabPos(fab);
  let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;

  fab.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false;
    const r = fab.getBoundingClientRect();
    ox = r.left; oy = r.top;
    sx = e.clientX; sy = e.clientY;
    try { fab.setPointerCapture(e.pointerId); } catch (_) {}
  });
  fab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 6) moved = true;
    if (moved) { e.preventDefault(); placeFab(fab, ox + dx, oy + dy); }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      const r = fab.getBoundingClientRect();
      try { localStorage.setItem(FAB_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (_) {}
    } else {
      setOpen(!open); // это был тап — открыть/закрыть чат
    }
  };
  fab.addEventListener("pointerup", end);
  fab.addEventListener("pointercancel", end);

  // При изменении размера экрана не даём кнопке уйти за границы
  window.addEventListener("resize", () => {
    if (fab.style.left) {
      const r = fab.getBoundingClientRect();
      placeFab(fab, r.left, r.top);
    }
  });
}

export function unmountChat() {
  if (unsub) { try { unsub(); } catch (_) {} unsub = null; }
  if (rootEl) { rootEl.remove(); rootEl = null; }
  document.body.classList.remove("chat-open");
  messages = []; open = false; unread = 0; seenCount = 0; initialized = false; curCode = null;
}
