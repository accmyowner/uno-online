// utils.js — небольшие помощники без побочных эффектов

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)

// Код комнаты из 5 символов
export function makeRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// Уникальный идентификатор (для игроков и карт)
export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Детерминированное тасование Фишера–Йейтса на копии массива
export function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ограничение частоты вызова (для таймеров/ресайза)
export function throttle(fn, ms) {
  let last = 0;
  let scheduled = null;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      clearTimeout(scheduled);
      scheduled = null;
      last = now;
      fn(...args);
    } else if (!scheduled) {
      scheduled = setTimeout(() => {
        last = Date.now();
        scheduled = null;
        fn(...args);
      }, remaining);
    }
  };
}

// Экранирование текста игрока перед вставкой в DOM
export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Обрезка имени
export function cleanName(name) {
  return escapeHtml(String(name || "").trim()).slice(0, 16) || "Игрок";
}

// Копирование в буфер обмена с запасным вариантом
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* переходим к запасному способу */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}
