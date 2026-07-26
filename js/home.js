// home.js — стартовый экран.
import { state, setIdentity } from "./state.js";
import { createRoom, joinRoom, cleanupStaleRooms } from "./net.js";
import { toast } from "./ui.js";
import { cleanName } from "./utils.js";

const AVATARS = ["🐼", "🦊", "🐸", "🐙", "🦁", "🐵", "🐧", "🦄", "🐨", "🐯", "🐢", "🦉"];

export function renderHome(root, go) {
  cleanupStaleRooms();

  root.innerHTML = `
    <div class="home">
      <div class="home-hero">
        <div class="logo-cards" aria-hidden="true">
          <span class="logo-card lc-red">U</span>
          <span class="logo-card lc-blue">N</span>
          <span class="logo-card lc-green">O</span>
        </div>
        <p class="tagline">Онлайн-партии по коду комнаты. Играй с друзьями с любого устройства.</p>
      </div>

      <div class="glass card-panel home-panel">
        <label class="field">
          <span class="field-label">Ваше имя</span>
          <input id="nameInput" class="input" maxlength="16" placeholder="Например, Алекс" value="${state.name}">
        </label>

        <div class="field">
          <span class="field-label">Аватар</span>
          <div class="avatar-grid" id="avatarGrid"></div>
        </div>

        <div class="home-actions">
          <button id="createBtn" class="btn btn-primary btn-lg">Создать комнату</button>
          <div class="join-row">
            <input id="codeInput" class="input code-input" maxlength="5" placeholder="КОД" autocomplete="off">
            <button id="joinBtn" class="btn btn-ghost">Войти</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Аватары
  const grid = root.querySelector("#avatarGrid");
  AVATARS.forEach((a) => {
    const b = document.createElement("button");
    b.className = "avatar-choice" + (a === state.avatar ? " selected" : "");
    b.textContent = a;
    b.type = "button";
    b.addEventListener("click", () => {
      state.avatar = a;
      grid.querySelectorAll(".avatar-choice").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    });
    grid.appendChild(b);
  });

  const nameInput = root.querySelector("#nameInput");
  const codeInput = root.querySelector("#codeInput");
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  function ensureName() {
    const name = cleanName(nameInput.value);
    if (!nameInput.value.trim()) { toast("Введите имя", "warn"); nameInput.focus(); return null; }
    setIdentity(name, state.avatar);
    return name;
  }

  const createBtn = root.querySelector("#createBtn");
  createBtn.addEventListener("click", async () => {
    if (!ensureName()) return;
    createBtn.disabled = true;
    createBtn.textContent = "Создаём…";
    try {
      const code = await createRoom(state.room?.meta?.settings || {
        maxPlayers: 4, turnTime: 30, stacking: true,
      });
      go("lobby", code);
    } catch (e) {
      console.error(e);
      toast("Не удалось создать комнату", "error");
      createBtn.disabled = false;
      createBtn.textContent = "Создать комнату";
    }
  });

  const joinBtn = root.querySelector("#joinBtn");
  const doJoin = async () => {
    if (!ensureName()) return;
    const code = codeInput.value.trim();
    if (code.length < 4) { toast("Введите код комнаты", "warn"); codeInput.focus(); return; }
    joinBtn.disabled = true;
    const res = await joinRoom(code);
    joinBtn.disabled = false;
    if (!res.ok) { toast(res.error, "error"); return; }
    go("lobby", res.code);
  };
  joinBtn.addEventListener("click", doJoin);
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doJoin(); });
}
