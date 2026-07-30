// atmosphere.js — глобальная озвучка интерфейса (без окна настроек).
// Звуки навешиваются делегированием событий, без изменения логики экранов.
import { sfx } from "./sfx.js";

let inited = false;

export function initAtmosphere() {
  if (inited) return; inited = true;
  wireSounds();
  observeModals();
}

function wireSounds() {
  const hoverCapable = window.matchMedia && window.matchMedia("(hover: hover)").matches;

  document.addEventListener("click", (e) => {
    const el = e.target.closest(
      "button, .avatar-choice, .color-choice, .pp-choice, select, [role='button']"
    );
    if (!el) return;
    if (el.classList.contains("color-choice")) return sfx.colorPick();
    if (el.classList.contains("avatar-choice")) return sfx.selectRoom();
    if (el.id === "createBtn") return sfx.createRoom();
    if (el.id === "joinBtn") return sfx.joinRoom();
    if (el.id === "chatSend") return;                 // звук отправки играет сам чат
    if (el.classList.contains("chat-close") || el.classList.contains("chat-fab")) return;
    sfx.click();
  }, false);

  if (hoverCapable) {
    let last = 0;
    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest("button, .avatar-choice, .color-choice, .pp-choice");
      if (!el || el.disabled) return;
      const now = performance.now();
      if (now - last < 40) return;
      last = now;
      sfx.hover();
    }, false);
  }
}

// Открытие/закрытие модальных окон = мягкий звук
function observeModals() {
  const obs = new MutationObserver((muts) => {
    for (const mu of muts) {
      for (const n of mu.addedNodes) {
        if (n.nodeType === 1 && n.classList && n.classList.contains("modal-overlay")) sfx.menuOpen();
      }
      for (const n of mu.removedNodes) {
        if (n.nodeType === 1 && n.classList && n.classList.contains("modal-overlay")) sfx.menuClose();
      }
    }
  });
  obs.observe(document.body, { childList: true });
}
