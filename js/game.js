// game.js — игровой экран и взаимодействие с партией.
import { state, serverNow } from "./state.js";
import { playCard, drawCard, passTurn, forceTimeout, newGame, backToLobby, leaveRoom } from "./net.js";
import { canPlay, isWild } from "./deck.js";
import { cardEl, miniStack, toast, modal, pickColor, colorName } from "./ui.js";
import { escapeHtml } from "./utils.js";

// ── Состояние экрана (между вызовами render) ──
let prevHandIds = new Set();
let prevVersion = -1;
let shownFinishVersion = -1;
let unoSplashVersion = -1;
let rafId = null;
let hostTimer = null;
let lastForcedVersion = -1;
let current = null; // { data, ctx }
let finishModal = null; // ссылка на окно победителя, чтобы закрыть его при новой партии

export function unmountGame() {
  if (rafId) cancelAnimationFrame(rafId);
  if (hostTimer) clearInterval(hostTimer);
  rafId = null; hostTimer = null;
  prevHandIds = new Set();
  prevVersion = -1; shownFinishVersion = -1; lastForcedVersion = -1;
  if (finishModal) { finishModal.close(); finishModal = null; }
  current = null;
}

function startLoops() {
  if (!rafId) rafId = requestAnimationFrame(tick);
  if (!hostTimer) hostTimer = setInterval(hostTimeoutCheck, 700);
}

// ── Цикл обновления таймеров (без перерисовки DOM) ──
function tick() {
  rafId = requestAnimationFrame(tick);
  if (!current) return;
  const g = current.data.game;
  if (!g || g.status !== "playing") return;

  const total = g.settings.turnTime;
  const elapsed = (serverNow() - g.turnStartedAt) / 1000;
  const remaining = Math.max(0, total - elapsed);
  const p = Math.max(0, Math.min(1, remaining / total));
  const activePid = g.turnOrder[g.currentIndex];
  const low = remaining <= 5;

  // Кольцо активного соперника
  document.querySelectorAll(".opp").forEach((el) => {
    const isActive = el.dataset.pid === activePid;
    el.style.setProperty("--p", isActive ? p : 0);
    el.classList.toggle("low", isActive && low);
    const secEl = el.querySelector(".opp-timer");
    if (secEl) secEl.textContent = isActive ? Math.ceil(remaining) : "";
  });

  // Таймер игрока
  const bar = document.getElementById("myTimerBar");
  const sec = document.getElementById("myTimerSec");
  if (bar) {
    if (activePid === state.playerId) {
      bar.style.width = (p * 100) + "%";
      bar.classList.toggle("low", low);
      if (sec) sec.textContent = Math.ceil(remaining) + " сек";
    } else {
      bar.style.width = "0%";
      if (sec) sec.textContent = "";
    }
  }
}

// ── Хост следит за тайм-аутами ──
async function hostTimeoutCheck() {
  if (!current) return;
  const { data, ctx } = current;
  const g = data.game;
  if (!g || g.status !== "playing") return;
  if (data.meta.host !== state.playerId) return; // только хост

  const elapsedMs = serverNow() - g.turnStartedAt;
  const limitMs = g.settings.turnTime * 1000 + 1800; // небольшой запас
  if (elapsedMs < limitMs) return;
  if (lastForcedVersion === g.version) return; // уже пытались для этой версии
  lastForcedVersion = g.version;
  await forceTimeout(ctx.code, g.version);
}

// ── Главный рендер ──
export function renderGame(root, data, ctx) {
  current = { data, ctx };
  startLoops();

  const g = data.game;
  if (!g) {
    root.innerHTML = `<div class="game-loading glass card-panel">Раздаём карты…</div>`;
    return;
  }

  // Новая партия началась — закрываем окно победителя, если оно ещё открыто
  if (g.status === "playing" && finishModal) { finishModal.close(); finishModal = null; }

  const players = data.players || {};
  const myHand = (g.hands[state.playerId] || []).slice();
  const activePid = g.turnOrder[g.currentIndex];
  const isMyTurn = activePid === state.playerId && g.status === "playing";
  const versionChanged = g.version !== prevVersion;
  // Новая партия той же комнатой: версия сброшена в 0 — обновляем кэш анимации раздачи
  if (g.version < prevVersion) prevHandIds = new Set();

  root.innerHTML = `
    <div class="game" data-dir="${g.direction}">
      <div class="topbar">
        <button class="btn btn-quiet btn-sm" id="leaveGameBtn">Выйти</button>
        <div class="turn-banner" id="turnBanner"></div>
        <div class="game-mode">${g.settings.stacking ? "Складывание +2/+4" : "Классика"}</div>
      </div>

      <div class="opponents" id="opponents"></div>

      <div class="table">
        <div class="center">
          <button class="pile draw-pile" id="drawPile" aria-label="Взять карту">
            <span class="pile-back">UNO</span>
            <span class="pile-count" id="deckCount">${g.deck.length}</span>
          </button>
          <div class="discard-slot" id="discard"></div>
          <div class="center-side">
            <div class="color-orb color-${g.currentColor}" id="colorOrb" title="${colorName(g.currentColor)}"></div>
            <div class="dir-indicator" title="Направление игры">
              <span class="dir-arrow">${g.direction === 1 ? "↻" : "↺"}</span>
            </div>
          </div>
          ${g.pendingDraw > 0 ? `<div class="pending-badge">Штраф +${g.pendingDraw}</div>` : ""}
        </div>
      </div>

      <div class="my-hand-area ${isMyTurn ? "my-turn" : ""}">
        <div class="my-timer"><div class="my-timer-bar" id="myTimerBar"></div></div>
        <div class="my-controls" id="myControls"></div>
        <div class="hand" id="hand"></div>
      </div>
    </div>
  `;

  renderOpponents(root, g, players, activePid);
  renderDiscard(root, g, versionChanged);
  renderTurnBanner(root, g, players, activePid, isMyTurn);
  renderControls(root, g, myHand, isMyTurn, ctx);
  renderHand(root, g, myHand, isMyTurn, ctx);

  // Кнопка выхода
  root.querySelector("#leaveGameBtn").addEventListener("click", async () => {
    await leaveRoom();
    ctx.go("home");
  });

  // УНО-вспышка, когда кто-то дошёл до одной карты
  if (versionChanged && unoSplashVersion !== g.version) {
    const lastPid = g.lastAction?.by;
    if (g.lastAction?.type === "play" && lastPid && (g.hands[lastPid]?.length === 1)) {
      unoSplashVersion = g.version;
      unoSplash(players[lastPid]?.name || "Игрок");
    }
  }

  prevVersion = g.version;

  // Окно окончания партии
  if (g.status === "finished" && shownFinishVersion !== g.version) {
    shownFinishVersion = g.version;
    showWinnerModal(g, players, ctx);
  }
}

function renderTurnBanner(root, g, players, activePid, isMyTurn) {
  const banner = root.querySelector("#turnBanner");
  const p = players[activePid];
  if (g.status !== "playing") { banner.innerHTML = "Партия завершена"; return; }
  banner.innerHTML = isMyTurn
    ? `<span class="pulse-dot"></span> Ваш ход`
    : `Ходит <span class="ta">${p?.avatar || "🙂"} ${escapeHtml(p?.name || "…")}</span>`;
}

function renderOpponents(root, g, players, activePid) {
  const host = root.querySelector("#opponents");
  host.innerHTML = "";
  // Показываем всех, кроме себя, в порядке хода
  const order = g.turnOrder.filter((pid) => pid !== state.playerId);
  for (const pid of order) {
    const p = players[pid] || { name: "Вышел", avatar: "👻" };
    const count = (g.hands[pid] || []).length;
    const el = document.createElement("div");
    el.className = "opp" + (pid === activePid ? " active" : "");
    el.dataset.pid = pid;
    el.style.setProperty("--p", 0);
    el.innerHTML = `
      <div class="opp-ring">
        <div class="opp-avatar">${p.avatar || "🙂"}</div>
        <div class="opp-timer"></div>
      </div>
      <div class="opp-meta">
        <div class="opp-name">${escapeHtml(p.name)}${count === 1 ? ' <span class="uno-flag">UNO</span>' : ""}</div>
        <div class="opp-count"><span class="cnt">${count}</span> карт</div>
      </div>
    `;
    el.querySelector(".opp-ring").prepend(miniStack(count));
    host.appendChild(el);
  }
}

function renderDiscard(root, g, versionChanged) {
  const slot = root.querySelector("#discard");
  slot.innerHTML = "";
  if (g.discardTop) {
    const el = cardEl(g.discardTop);
    el.classList.add("on-table");
    if (isWild(g.discardTop)) el.classList.add(`chosen-${g.currentColor}`);
    if (versionChanged && g.lastAction?.type === "play") el.classList.add("pop");
    slot.appendChild(el);
  }
  const deckCount = root.querySelector("#deckCount");
  if (deckCount) deckCount.textContent = g.deck.length;
}

function renderControls(root, g, myHand, isMyTurn, ctx) {
  const host = root.querySelector("#myControls");
  host.innerHTML = "";
  if (g.status !== "playing") return;

  const left = document.createElement("div");
  left.className = "control-group";

  if (isMyTurn) {
    if (g.pendingDraw > 0) {
      const b = button(`Взять +${g.pendingDraw}`, "btn-draw");
      b.addEventListener("click", () => doDraw(ctx.code));
      left.appendChild(b);
    } else {
      const drawBtn = button(g.drawnThisTurn ? "Карта взята" : "Взять карту", "btn-draw");
      drawBtn.disabled = g.drawnThisTurn;
      drawBtn.addEventListener("click", () => doDraw(ctx.code));
      left.appendChild(drawBtn);

      const passBtn = button("Пас", "btn-pass");
      passBtn.disabled = !g.drawnThisTurn;
      passBtn.addEventListener("click", () => doPass(ctx.code));
      left.appendChild(passBtn);
    }
  } else {
    const wait = document.createElement("span");
    wait.className = "muted";
    wait.textContent = "Ожидайте свой ход";
    left.appendChild(wait);
  }

  host.appendChild(left);

  const right = document.createElement("div");
  right.className = "control-group";
  const myCount = myHand.length;
  const uno = button("УНО!", "btn-uno");
  uno.disabled = myCount > 2;
  if (myCount === 2) uno.classList.add("ready");
  uno.addEventListener("click", () => unoSplash(state.name || "Вы"));
  right.appendChild(uno);
  const timer = document.createElement("span");
  timer.className = "my-timer-sec";
  timer.id = "myTimerSec";
  right.appendChild(timer);
  host.appendChild(right);
}

function renderHand(root, g, myHand, isMyTurn, ctx) {
  const host = root.querySelector("#hand");
  host.innerHTML = "";
  const ids = new Set(myHand.map((c) => c.id));

  myHand.forEach((card, i) => {
    const playable = isMyTurn && canPlay(card, g);
    const el = cardEl(card, { playable });
    el.style.setProperty("--i", i);
    el.style.setProperty("--n", myHand.length);
    if (!prevHandIds.has(card.id)) el.classList.add("card-enter");
    if (isMyTurn && !playable) el.classList.add("dimmed");
    el.addEventListener("click", () => onCardClick(card, g, isMyTurn, ctx, el));
    host.appendChild(el);
  });

  prevHandIds = ids;
}

async function onCardClick(card, g, isMyTurn, ctx, el) {
  if (g.status !== "playing") return;
  if (!isMyTurn) { toast("Сейчас не ваш ход", "warn"); return; }
  if (!canPlay(card, g)) {
    el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
    return;
  }
  let color = null;
  if (isWild(card)) {
    color = await pickColor();
    if (!color) return;
  }
  const res = await playCard(ctx.code, card.id, color);
  if (!res.ok && res.error) toast(res.error, "error");
}

async function doDraw(code) {
  const res = await drawCard(code);
  if (!res.ok && res.error) toast(res.error, "warn");
}
async function doPass(code) {
  const res = await passTurn(code);
  if (!res.ok && res.error) toast(res.error, "warn");
}

// ── Победное окно ──
function showWinnerModal(g, players, ctx) {
  const isHost = current?.data?.meta?.host === state.playerId;
  const winner = players[g.winnerId] || { name: "Игрок", avatar: "🏆" };

  const rows = g.turnOrder
    .map((pid) => ({
      pid,
      name: players[pid]?.name || "Вышел",
      avatar: players[pid]?.avatar || "👻",
      score: g.scores?.[pid] || 0,
      wins: g.wins?.[pid] || 0,
    }))
    .sort((a, b) => b.score - a.score);

  const content = document.createElement("div");
  content.className = "winner-modal";
  content.innerHTML = `
    <div class="confetti" aria-hidden="true">${"<i></i>".repeat(24)}</div>
    <div class="winner-crown">🏆</div>
    <h2 class="winner-title">${escapeHtml(winner.name)} побеждает!</h2>
    <p class="winner-sub">+${g.roundPoints} очков за партию</p>
    <table class="score-table">
      <thead><tr><th>#</th><th>Игрок</th><th>Победы</th><th>Очки</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="${r.pid === g.winnerId ? "row-winner" : ""}">
            <td>${i + 1}</td>
            <td><span class="sc-avatar">${r.avatar}</span> ${escapeHtml(r.name)}</td>
            <td>${r.wins}</td>
            <td class="sc-score">${r.score}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <div class="winner-actions"></div>
  `;

  const actions = content.querySelector(".winner-actions");
  if (isHost) {
    const again = button("Новая игра", "btn-primary btn-lg");
    again.addEventListener("click", async () => { m.close(); const r = await newGame(ctx.code); if (!r.ok) toast(r.error, "error"); });
    const lobby = button("В лобби", "btn-ghost");
    lobby.addEventListener("click", async () => { m.close(); await backToLobby(ctx.code); });
    actions.append(again, lobby);
  } else {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "Ждём, пока хозяин начнёт новую партию…";
    actions.appendChild(note);
  }
  const leave = button("Выйти из комнаты", "btn-quiet");
  leave.addEventListener("click", async () => { m.close(); await leaveRoom(); ctx.go("home"); });
  actions.appendChild(leave);

  const m = modal(content, { closeable: false });
  finishModal = m;
}

// ── Вспышка «UNO!» ──
function unoSplash(name) {
  const el = document.createElement("div");
  el.className = "uno-splash";
  el.innerHTML = `<span class="uno-word">UNO!</span><span class="uno-by">${escapeHtml(name)}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 1200);
}

// ── helpers ──
function button(label, cls = "") {
  const b = document.createElement("button");
  b.className = `btn ${cls}`;
  b.textContent = label;
  return b;
}
