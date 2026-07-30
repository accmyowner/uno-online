// game.js — игровой экран и взаимодействие с партией.
import { state, serverNow } from "./state.js";
import { playCard, drawCard, passTurn, forceTimeout, newGame, backToLobby, leaveRoom, declareUnoNow, catchUnoNow, expireUno } from "./net.js";
import { canPlay, isWild } from "./deck.js";
import { UNO_WINDOW } from "./engine.js";
import { cardEl, miniStack, toast, modal, pickColor, pickPlayer, colorName } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { sfx } from "./sfx.js";

// ── Состояние экрана (между вызовами render) ──
let prevHandIds = new Set();
let prevVersion = -1;
let shownFinishVersion = -1;
let shownEventTs = -1;
let rafId = null;
let hostTimer = null;
let lastForcedVersion = -1;
let lastExpiredKey = -1;
let current = null; // { data, ctx }
let finishModal = null;
let resizeBound = false;

export function unmountGame() {
  if (rafId) cancelAnimationFrame(rafId);
  if (hostTimer) clearInterval(hostTimer);
  rafId = null; hostTimer = null;
  prevHandIds = new Set();
  prevVersion = -1; shownFinishVersion = -1; lastForcedVersion = -1;
  shownEventTs = -1; lastExpiredKey = -1;
  if (finishModal) { finishModal.close(); finishModal = null; }
  current = null;
}

function onResize() {
  const host = document.getElementById("hand");
  if (host) layoutHand(host);
}

function startLoops() {
  if (!rafId) rafId = requestAnimationFrame(tick);
  if (!hostTimer) hostTimer = setInterval(hostTimeoutCheck, 700);
  if (!resizeBound) { window.addEventListener("resize", onResize); resizeBound = true; }
}

// ── Адаптивная раскладка руки: ВСЕГДА помещается на экран, центрирована ──
function layoutHand(host) {
  const cards = host.children;
  const n = cards.length;
  host.style.removeProperty("--card-w");
  host.style.removeProperty("--card-h");
  host.style.setProperty("--fan", "1");
  if (n === 0) return;

  const first = getComputedStyle(cards[0]);
  let cardW = parseFloat(first.width) || 80;
  const cardH = parseFloat(first.height) || 116;
  const ratio = cardH / cardW;

  const hs = getComputedStyle(host);
  const padX = (parseFloat(hs.paddingLeft) || 0) + (parseFloat(hs.paddingRight) || 0);
  let availW = host.clientWidth - padX;
  if (availW <= 40) availW = window.innerWidth - 24; // запасной вариант, если ширина ещё не готова
  availW -= 4;

  const MAX_OVERLAP = 0.82; // максимально допустимое перекрытие
  const MIN_CARD = 30;      // минимальный размер карты
  const MAX_GAP = cardW * 0.24;

  let gap = 0;
  if (n > 1) {
    const full = n * cardW;
    if (full <= availW) {
      // всё помещается без перекрытия — раздвигаем (но не слишком)
      gap = Math.min((availW - full) / (n - 1), MAX_GAP);
    } else {
      // нужно перекрытие: шаг ровно по ширине экрана
      let step = (availW - cardW) / (n - 1);
      const minStep = cardW * (1 - MAX_OVERLAP);
      if (step < minStep) {
        // даже максимального перекрытия мало — уменьшаем карты
        cardW = Math.max(MIN_CARD, availW / (1 + (1 - MAX_OVERLAP) * (n - 1)));
        host.style.setProperty("--card-w", cardW + "px");
        host.style.setProperty("--card-h", (cardW * ratio) + "px");
        step = Math.max(0, (availW - cardW) / (n - 1)); // снова ровно по ширине
      }
      gap = step - cardW; // отрицательный отступ
    }
  }
  host.style.setProperty("--card-gap", gap + "px");

  // Чем больше карт — тем меньше «веер», чтобы края не выходили за поле
  const fan = n <= 6 ? 1 : Math.min(1, 12 / (n - 1));
  host.style.setProperty("--fan", String(Math.max(0.12, fan)));
}

// ── Цикл обновления таймеров (без перерисовки DOM) ──
function tick() {
  rafId = requestAnimationFrame(tick);
  if (!current) return;
  const g = current.data.game;
  if (!g || g.status !== "playing") return;

  const now = serverNow();
  const total = g.settings.turnTime;
  const elapsed = (now - g.turnStartedAt) / 1000;
  const remaining = Math.max(0, total - elapsed);
  const p = Math.max(0, Math.min(1, remaining / total));
  const activePid = g.turnOrder[g.currentIndex];
  const low = remaining <= 5;

  document.querySelectorAll(".opp").forEach((el) => {
    const isActive = el.dataset.pid === activePid;
    el.style.setProperty("--p", isActive ? p : 0);
    el.classList.toggle("low", isActive && low);
    const secEl = el.querySelector(".opp-timer");
    if (secEl) secEl.textContent = isActive ? Math.ceil(remaining) : "";
  });

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

  // Таймер кнопки UNO (окно, пока можно поймать)
  const ring = document.getElementById("unoRing");
  if (ring && g.unoPending && g.unoPending.pid === state.playerId) {
    const rem = Math.max(0, (g.unoPending.deadline - now) / UNO_WINDOW);
    ring.style.background = `conic-gradient(#fff ${rem * 360}deg, rgba(255,255,255,.28) 0)`;
  }

  // Кнопка «Поймать!»: активна после форы и до конца окна
  const catchBtn = document.getElementById("catchBtn");
  if (catchBtn && g.unoPending) {
    const openable = now >= g.unoPending.openedAt + 1500;
    const alive = now <= g.unoPending.deadline + 300;
    catchBtn.disabled = !(openable && alive);
    const cs = document.getElementById("catchSec");
    if (cs) cs.textContent = alive ? Math.max(0, Math.ceil((g.unoPending.deadline - now) / 1000)) + "" : "";
  }
}

// ── Хост следит за тайм-аутами и истёкшим окном UNO ──
async function hostTimeoutCheck() {
  if (!current) return;
  const { data, ctx } = current;
  const g = data.game;
  if (!g || g.status !== "playing") return;
  if (data.meta.host !== state.playerId) return; // только хост

  const now = serverNow();

  // 1) Тайм-аут хода
  const elapsedMs = now - g.turnStartedAt;
  const limitMs = g.settings.turnTime * 1000 + 1800;
  if (elapsedMs >= limitMs && lastForcedVersion !== g.version) {
    lastForcedVersion = g.version;
    await forceTimeout(ctx.code, g.version);
    return;
  }

  // 2) Истёкшее «окно поимки UNO»
  if (g.unoPending && now > g.unoPending.deadline + 300 && lastExpiredKey !== g.unoPending.openedAt) {
    lastExpiredKey = g.unoPending.openedAt;
    await expireUno(ctx.code);
  }
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

  if (g.status === "playing" && finishModal) { finishModal.close(); finishModal = null; }

  const players = data.players || {};
  const myHand = (g.hands[state.playerId] || []).slice();
  const activePid = g.turnOrder[g.currentIndex];
  const isMyTurn = activePid === state.playerId && g.status === "playing";
  const versionChanged = g.version !== prevVersion;
  if (g.version < prevVersion) prevHandIds = new Set();

  root.innerHTML = `
    <div class="game" data-dir="${g.direction}">
      <div class="topbar">
        <button class="btn btn-quiet btn-sm" id="leaveGameBtn">Выйти</button>
        <div class="turn-banner" id="turnBanner"></div>
        <div class="topbar-right">
          <span class="game-mode">${g.settings.stacking ? "Складывание +2/+4" : "Классика"}${g.settings.handSwap ? " · 🃏" : ""}</span>
        </div>
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
  renderControls(root, g, myHand, isMyTurn, ctx, players);
  renderHand(root, g, myHand, isMyTurn, ctx);

  root.querySelector("#leaveGameBtn").addEventListener("click", async () => {
    await leaveRoom();
    ctx.go("home");
  });

  // ── Звуки и эффекты событий ──
  if (versionChanged) {
    const fx = true;
    const ev = g.lastEvent;
    if (ev && ev.ts && shownEventTs !== ev.ts) {
      shownEventTs = ev.ts;
      if (ev.type === "uno") {
        sfx.uno();
        if (fx) unoSplash(players[ev.by]?.name || "Игрок");
      } else if (ev.type === "caught") {
        sfx.catch();
        const tgt = players[ev.target]?.name || "Игрок";
        toast(`«${tgt}» забыл сказать UNO!  +2 карты`, "warn");
        if (fx) effectBurst("+2", "catch");
      } else if (ev.type === "swap") {
        sfx.swap();
        const a = players[ev.by]?.name || "Игрок";
        const b = players[ev.target]?.name || "Игрок";
        toast(`🃏 ${a} обменялся руками с ${b}!`, "info");
        if (fx) swapOverlay(a, b);
      }
    }
    const la = g.lastAction;
    if (la?.type === "play" && la?.card?.value !== "swap") {
      sfx.play();
      // Короткий эффект появления штрафных карт +2 / +4
      if (fx && la.card?.value === "draw2") effectBurst("+2", "draw");
      if (fx && la.card?.value === "wild4") effectBurst("+4", "draw");
    }
    if (la?.type === "timeout") sfx.timeout();
  }

  prevVersion = g.version;

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
  const order = g.turnOrder.filter((pid) => pid !== state.playerId);
  for (const pid of order) {
    const p = players[pid] || { name: "Вышел", avatar: "👻" };
    const count = (g.hands[pid] || []).length;
    const said = g.saidUno && g.saidUno[pid];
    const pending = g.unoPending && g.unoPending.pid === pid;
    const el = document.createElement("div");
    el.className = "opp" + (pid === activePid ? " active" : "") + (pending ? " uno-pending" : "");
    el.dataset.pid = pid;
    el.style.setProperty("--p", 0);
    el.innerHTML = `
      <div class="opp-ring">
        <div class="opp-avatar">${p.avatar || "🙂"}</div>
        <div class="opp-timer"></div>
      </div>
      <div class="opp-meta">
        <div class="opp-name">${escapeHtml(p.name)}${count === 1 ? ` <span class="uno-flag ${said ? "said" : ""}">UNO</span>` : ""}</div>
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

function renderControls(root, g, myHand, isMyTurn, ctx, players) {
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

  // Кнопка UNO! — только когда у меня ровно 1 карта и я ещё не сказал UNO
  const myCount = myHand.length;
  const said = g.saidUno && g.saidUno[state.playerId];
  if (myCount === 1 && !said) {
    const uno = document.createElement("button");
    uno.className = "btn btn-uno uno-appear";
    uno.id = "unoBtn";
    uno.innerHTML = `<span class="uno-ring" id="unoRing"></span><span class="uno-label">UNO!</span>`;
    uno.addEventListener("click", async () => {
      const r = await declareUnoNow(ctx.code);
      if (r.ok) { sfx.uno(); }
      else if (r.error) toast(r.error, "warn");
    });
    right.appendChild(uno);
  }

  // Кнопка «Поймать!» — если кто-то другой не сказал UNO
  if (g.unoPending && g.unoPending.pid !== state.playerId && !(g.saidUno && g.saidUno[g.unoPending.pid])) {
    const tgt = players[g.unoPending.pid]?.name || "игрока";
    const c = document.createElement("button");
    c.className = "btn btn-catch catch-appear";
    c.id = "catchBtn";
    c.disabled = true;
    c.innerHTML = `Поймать ${escapeHtml(tgt)}! <span id="catchSec"></span>`;
    c.addEventListener("click", async () => {
      const r = await catchUnoNow(ctx.code);
      if (r.ok) sfx.catch();
      else if (r.error) toast(r.error, "warn");
    });
    right.appendChild(c);
  }

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
    const playable = isMyTurn && canPlay(card, g) && !(card.value === "swap" && myHand.length < 2);
    const el = cardEl(card, { playable });
    el.style.setProperty("--i", i);
    el.style.setProperty("--n", myHand.length);
    if (!prevHandIds.has(card.id)) el.classList.add("card-enter");
    if (isMyTurn && !playable) el.classList.add("dimmed");
    el.addEventListener("click", () => onCardClick(card, g, isMyTurn, ctx, el));
    host.appendChild(el);
  });

  prevHandIds = ids;
  layoutHand(host);
}

async function onCardClick(card, g, isMyTurn, ctx, el) {
  if (g.status !== "playing") return;
  if (!isMyTurn) { toast("Сейчас не ваш ход", "warn"); return; }
  if (!canPlay(card, g)) {
    el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
    return;
  }

  // Карта «Обмен руками»: выбрать игрока и цвет
  if (card.value === "swap") {
    const myLen = (g.hands[state.playerId] || []).length;
    if (myLen < 2) { toast("«Обмен руками» нельзя разыграть последней картой", "warn"); return; }
    const players = current?.data?.players || {};
    const entries = g.turnOrder
      .filter((pid) => pid !== state.playerId)
      .map((pid) => ({
        pid,
        name: players[pid]?.name || "Игрок",
        avatar: players[pid]?.avatar || "🙂",
        count: (g.hands[pid] || []).length,
      }));
    const target = await pickPlayer(entries);
    if (!target) return;
    const color = await pickColor();
    if (!color) return;
    const res = await playCard(ctx.code, card.id, color, target);
    if (!res.ok && res.error) toast(res.error, "error");
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
  const iWon = g.winnerId === state.playerId;
  if (iWon) sfx.win(); else sfx.lose();
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

// ── Эффект-вспышка (например «+2» при поимке) ──
function effectBurst(text, kind = "") {
  const el = document.createElement("div");
  el.className = `effect-burst ${kind}`;
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 1100);
}

// ── Анимация обмена руками ──
function swapOverlay(a, b) {
  const el = document.createElement("div");
  el.className = "swap-overlay";
  el.innerHTML = `
    <div class="swap-card left">🃏</div>
    <div class="swap-arrows">⇄</div>
    <div class="swap-card right">🃏</div>
    <div class="swap-names">${escapeHtml(a)} ⇄ ${escapeHtml(b)}</div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 1500);
}

// ── helpers ──
function button(label, cls = "") {
  const b = document.createElement("button");
  b.className = `btn ${cls}`;
  b.textContent = label;
  return b;
}
