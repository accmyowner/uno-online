// atmosphere.js — шестерёнка настроек, панель настроек и глобальная озвучка UI.
// Звуки навешиваются делегированием событий, без изменения логики экранов.
import { settings } from "./settings.js";
import { sfx } from "./sfx.js";
import { modal } from "./ui.js";

let inited = false;

export function initAtmosphere() {
  if (inited) return; inited = true;
  applyBodyClasses();
  settings.onChange((k) => { if (k === "animations") applyBodyClasses(); });
  mountGear();
  wireSounds();
  observeModals();
}

function applyBodyClasses() {
  document.body.classList.toggle("anim-off", !settings.animationsOn());
}

// ── Кнопка-шестерёнка ──
function mountGear() {
  const btn = document.createElement("button");
  btn.id = "settingsFab";
  btn.className = "settings-fab";
  btn.title = "Настройки";
  btn.setAttribute("aria-label", "Настройки");
  btn.textContent = "⚙";
  btn.addEventListener("click", () => { sfx.settingsOpen(); openSettings(); });
  document.body.appendChild(btn);
}

// ── Панель настроек ──
function openSettings() {
  const s = settings.get();
  const content = document.createElement("div");
  content.className = "settings-modal";
  content.innerHTML = `
    <h3>Настройки</h3>
    <div class="set-list">
      ${toggleRow("Анимации", "animations", s.animations)}
      ${toggleRow("Визуальные эффекты", "effects", s.effects)}
      ${toggleRow("Музыка", "music", s.music)}
      ${toggleRow("Звуки", "sounds", s.sounds)}
    </div>
    <div class="set-sliders">
      <label class="set-slider">
        <span>🎵 Громкость музыки</span>
        <input type="range" min="0" max="100" value="${Math.round(s.musicVol * 100)}" id="musicVol">
      </label>
      <label class="set-slider">
        <span>🔊 Громкость звуков</span>
        <input type="range" min="0" max="100" value="${Math.round(s.soundsVol * 100)}" id="soundsVol">
      </label>
    </div>
    <button class="btn btn-primary set-done" id="setDone">Готово</button>
  `;

  const m = modal(content, { closeable: true });

  content.querySelectorAll("input[data-key]").forEach((inp) => {
    inp.addEventListener("change", () => {
      settings.set(inp.dataset.key, inp.checked);
      sfx.click();
    });
  });
  const mv = content.querySelector("#musicVol");
  const sv = content.querySelector("#soundsVol");
  mv.addEventListener("input", () => settings.set("musicVol", mv.value / 100));
  sv.addEventListener("input", () => settings.set("soundsVol", sv.value / 100));
  sv.addEventListener("change", () => sfx.click());
  content.querySelector("#setDone").addEventListener("click", () => m.close());
}

function toggleRow(label, key, on) {
  return `
    <label class="setting setting-toggle set-row">
      <span>${label}</span>
      <input type="checkbox" data-key="${key}" ${on ? "checked" : ""}>
      <span class="switch"></span>
    </label>`;
}

// ── Глобальная озвучка интерфейса ──
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
    if (el.id === "chatSend") return; // звук отправки играет сам чат
    if (el.id === "settingsFab") return; // свой звук уже сыгран
    if (el.classList.contains("chat-close") || el.classList.contains("chat-fab")) return; // модалка/панель озвучены отдельно
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

// ── Открытие/закрытие модальных окон = мягкий звук меню ──
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
