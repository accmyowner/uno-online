// ui.js — переиспользуемые элементы интерфейса.
import { cardLabel, isWild } from "./deck.js";

const COLOR_NAMES = { red: "Красный", blue: "Синий", green: "Зелёный", yellow: "Жёлтый" };
export function colorName(c) { return COLOR_NAMES[c] || "—"; }

// Крупный символ по центру карты
function bigSymbol(card) {
  switch (card.value) {
    case "skip": return "⊘";
    case "reverse": return "⇄";
    case "draw2": return "+2";
    case "wild": return "";       // рисуется цветной вертушкой через CSS
    case "wild4": return "+4";
    default: return card.value;
  }
}

// DOM-элемент карты
export function cardEl(card, opts = {}) {
  const { mini = false, playable = false, faceDown = false } = opts;
  const el = document.createElement("div");
  const colorClass = isWild(card) ? "color-wild" : `color-${card.color}`;
  el.className = `card ${colorClass}`;
  if (mini) el.classList.add("mini");
  if (playable) el.classList.add("playable");
  if (faceDown) el.classList.add("face-down");
  el.dataset.id = card.id;
  el.dataset.value = card.value;

  if (faceDown) {
    el.innerHTML = `<span class="card-back-logo">UNO</span>`;
    return el;
  }

  const corner = cardLabel(card);
  el.innerHTML = `
    <span class="oval"></span>
    ${card.value === "wild" || card.value === "wild4" ? '<span class="wild-wheel"></span>' : ""}
    <span class="corner tl">${corner}</span>
    <span class="pip">${bigSymbol(card)}</span>
    <span class="corner br">${corner}</span>
  `;
  return el;
}

// Мини-стопка карт соперника (несколько «рубашек» веером)
export function miniStack(count) {
  const wrap = document.createElement("div");
  wrap.className = "mini-stack";
  const shown = Math.min(count, 5);
  for (let i = 0; i < shown; i++) {
    const c = document.createElement("span");
    c.className = "mini-back";
    c.style.setProperty("--i", i);
    wrap.appendChild(c);
  }
  return wrap;
}

// ── Тосты ──
let toastHost = null;
export function toast(msg, type = "info") {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// ── Модальное окно ──
export function modal(contentEl, { closeable = true } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal glass";
  box.appendChild(contentEl);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 250);
  };
  if (closeable) {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }
  return { overlay, box, close };
}

// Выбор цвета для дикой карты. Возвращает Promise<color>.
export function pickColor() {
  return new Promise((resolve) => {
    const content = document.createElement("div");
    content.className = "color-picker";
    content.innerHTML = `<h3>Выберите цвет</h3><div class="color-grid"></div>`;
    const grid = content.querySelector(".color-grid");
    for (const c of ["red", "blue", "green", "yellow"]) {
      const b = document.createElement("button");
      b.className = `color-choice color-${c}`;
      b.setAttribute("aria-label", colorName(c));
      b.addEventListener("click", () => { m.close(); resolve(c); });
      grid.appendChild(b);
    }
    const m = modal(content, { closeable: false });
  });
}
