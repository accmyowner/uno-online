// lobby.js — экран лобби до начала игры.
import { state } from "./state.js";
import { setReady, updateSettings, startGame, leaveRoom } from "./net.js";
import { toast } from "./ui.js";
import { copyToClipboard, escapeHtml } from "./utils.js";

export function renderLobby(root, data, ctx) {
  const { code, go } = ctx;
  const meta = data.meta;
  const players = data.players || {};
  const isHost = meta.host === state.playerId;
  const ids = Object.entries(players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  const me = players[state.playerId];
  const count = ids.length;

  root.innerHTML = `
    <div class="lobby">
      <div class="lobby-head glass card-panel">
        <div class="code-block">
          <span class="code-label">Код комнаты</span>
          <div class="code-value" id="codeValue">${code}</div>
        </div>
        <button class="btn btn-ghost btn-copy" id="copyBtn">Копировать</button>
        <button class="btn btn-quiet btn-leave" id="leaveBtn">Выйти</button>
      </div>

      <div class="lobby-body">
        <div class="glass card-panel players-panel">
          <div class="panel-title">Игроки <span class="muted">${count}/${meta.settings.maxPlayers}</span></div>
          <ul class="player-list" id="playerList"></ul>
        </div>

        <div class="glass card-panel settings-panel">
          <div class="panel-title">Настройки комнаты</div>
          <div class="settings" id="settings"></div>

          <div class="panel-subtitle">Дополнительные правила</div>
          <div class="settings extra-rules" id="extraRules"></div>
          ${isHost ? "" : '<p class="muted small">Настройки меняет только хозяин комнаты.</p>'}
        </div>
      </div>

      <div class="lobby-footer glass card-panel">
        <button class="btn ${me?.ready ? "btn-ready-on" : "btn-primary"}" id="readyBtn">
          ${me?.ready ? "Готов ✓" : "Я готов"}
        </button>
        ${isHost
          ? `<button class="btn btn-start" id="startBtn" ${count < 2 ? "disabled" : ""}>
               Начать игру${count < 2 ? " (нужно 2+)" : ""}
             </button>`
          : '<span class="waiting-note">Ждём, пока хозяин начнёт игру…</span>'}
      </div>
    </div>
  `;

  // Список игроков
  const list = root.querySelector("#playerList");
  ids.forEach(([pid, p]) => {
    const li = document.createElement("li");
    li.className = "player-row" + (pid === state.playerId ? " is-me" : "");
    li.innerHTML = `
      <span class="p-avatar">${p.avatar || "🙂"}</span>
      <span class="p-name">${escapeHtml(p.name)}${pid === state.playerId ? " <span class='muted'>(вы)</span>" : ""}</span>
      ${pid === meta.host ? '<span class="crown" title="Хозяин комнаты">👑</span>' : ""}
      <span class="p-ready ${p.ready ? "on" : ""}">${p.ready ? "готов" : "не готов"}</span>
    `;
    list.appendChild(li);
  });

  // Настройки
  const settingsEl = root.querySelector("#settings");
  const s = meta.settings;
  const disabled = isHost ? "" : "disabled";
  settingsEl.innerHTML = `
    <label class="setting">
      <span>Максимум игроков</span>
      <select id="maxPlayers" class="input" ${disabled}>
        ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${n === s.maxPlayers ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </label>
    <label class="setting">
      <span>Время хода</span>
      <select id="turnTime" class="input" ${disabled}>
        ${[15, 20, 30, 45, 60].map((n) => `<option value="${n}" ${n === s.turnTime ? "selected" : ""}>${n} сек</option>`).join("")}
      </select>
    </label>
    <label class="setting setting-toggle">
      <span>Складывать +2 и +4 (stacking)</span>
      <input type="checkbox" id="stacking" ${s.stacking ? "checked" : ""} ${disabled}>
      <span class="switch"></span>
    </label>
    <label class="setting">
      <span>Вероятность спец-карт</span>
      <select id="specialRate" class="input" ${disabled}>
        ${[["low", "Маленькая"], ["mid", "Средняя"], ["classic", "Обычная"], ["high", "Большая"]]
          .map(([v, t]) => `<option value="${v}" ${(s.specialRate || "classic") === v ? "selected" : ""}>${t}</option>`).join("")}
      </select>
    </label>
  `;

  // Дополнительные правила (расширяемый блок)
  const extraEl = root.querySelector("#extraRules");
  extraEl.innerHTML = `
    <label class="setting setting-toggle rule-row">
      <span class="rule-label"><span class="rule-icon">🃏</span> Карта «Обмен руками»
        <span class="rule-hint">меняет руки с игроком (2 карты в колоде)</span></span>
      <input type="checkbox" id="handSwap" ${s.handSwap ? "checked" : ""} ${disabled}>
      <span class="switch"></span>
    </label>
    <div class="rule-row future muted small">
      <span class="rule-label"><span class="rule-icon">✨</span> Скоро: Jump-In, 7-0, накопление +2/+4…</span>
    </div>
  `;

  // ── Обработчики ──
  root.querySelector("#copyBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(code);
    toast(ok ? "Код скопирован" : "Скопируйте вручную: " + code, ok ? "success" : "warn");
  });

  root.querySelector("#leaveBtn").addEventListener("click", async () => {
    await leaveRoom();
    go("home");
  });

  root.querySelector("#readyBtn").addEventListener("click", () => {
    setReady(code, !me?.ready);
  });

  if (isHost) {
    const commit = () => {
      updateSettings(code, {
        maxPlayers: parseInt(root.querySelector("#maxPlayers").value, 10),
        turnTime: parseInt(root.querySelector("#turnTime").value, 10),
        stacking: root.querySelector("#stacking").checked,
        handSwap: root.querySelector("#handSwap").checked,
        specialRate: root.querySelector("#specialRate").value,
      });
    };
    root.querySelector("#maxPlayers").addEventListener("change", commit);
    root.querySelector("#turnTime").addEventListener("change", commit);
    root.querySelector("#stacking").addEventListener("change", commit);
    root.querySelector("#handSwap").addEventListener("change", commit);
    root.querySelector("#specialRate").addEventListener("change", commit);

    root.querySelector("#startBtn").addEventListener("click", async () => {
      const res = await startGame(code);
      if (!res.ok) toast(res.error, "error");
    });
  }
}
