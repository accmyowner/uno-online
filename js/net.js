// net.js — весь обмен с Firebase Realtime Database.
import {
  db, ref, onValue, get, set, update, remove,
  runTransaction, onDisconnect,
} from "./firebase.js";
import { state, serverNow } from "./state.js";
import { makeRoomCode, cleanName } from "./utils.js";
import {
  startRound, play, draw, pass, timeout,
  declareUno, catchUno, clearExpiredUno,
} from "./engine.js";

const roomPath = (code) => `rooms/${code}`;

// ── Подписка на смещение серверного времени (для точных таймеров) ──
export function watchServerOffset() {
  onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
    state.serverOffset = snap.val() || 0;
  });
}

// ── Нормализация партии после чтения (RTDB не хранит пустые массивы) ──
export function normalizeGame(raw) {
  if (!raw) return null;
  const g = { ...raw };
  g.deck = g.deck || [];
  g.discardPile = g.discardPile || [];
  g.turnOrder = g.turnOrder || [];
  g.hands = g.hands || {};
  for (const pid of g.turnOrder) g.hands[pid] = g.hands[pid] || [];
  g.pendingDraw = g.pendingDraw || 0;
  g.pendingType = g.pendingType || null;
  g.scores = g.scores || {};
  g.wins = g.wins || {};
  g.saidUno = g.saidUno || {};
  g.unoPending = g.unoPending || null;
  return g;
}

// ── Создание комнаты ──
export async function createRoom(settings) {
  let code = makeRoomCode();
  // На всякий случай убедимся, что код свободен
  for (let attempts = 0; attempts < 5; attempts++) {
    const snap = await get(ref(db, roomPath(code)));
    if (!snap.exists()) break;
    code = makeRoomCode();
  }

  const meta = {
    host: state.playerId,
    status: "lobby",
    createdAt: serverNow(),
    settings: {
      maxPlayers: settings.maxPlayers,
      turnTime: settings.turnTime,
      stacking: !!settings.stacking,
      handSwap: !!settings.handSwap,
    },
  };

  await set(ref(db, roomPath(code)), {
    meta,
    players: {
      [state.playerId]: player(true),
    },
  });

  state.roomCode = code;
  state.isHost = true;
  await attachPresence(code);
  return code;
}

function player(ready = false) {
  return {
    name: cleanName(state.name),
    avatar: state.avatar,
    ready,
    joinedAt: serverNow(),
  };
}

// ── Вход по коду ──
export async function joinRoom(code) {
  code = String(code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Введите код комнаты" };

  const snap = await get(ref(db, roomPath(code)));
  if (!snap.exists()) return { ok: false, error: "Комната не найдена" };

  const data = snap.val();
  const players = data.players || {};
  const alreadyIn = !!players[state.playerId];

  if (!alreadyIn) {
    if (data.meta.status !== "lobby") return { ok: false, error: "Игра уже началась" };
    const count = Object.keys(players).length;
    if (count >= data.meta.settings.maxPlayers) return { ok: false, error: "Комната заполнена" };
    await set(ref(db, `${roomPath(code)}/players/${state.playerId}`), player(false));
  }

  state.roomCode = code;
  state.isHost = data.meta.host === state.playerId;
  await attachPresence(code);
  return { ok: true, code };
}

// ── Присутствие: при отключении убираем игрока из комнаты ──
async function attachPresence(code) {
  const pRef = ref(db, `${roomPath(code)}/players/${state.playerId}`);
  try { await onDisconnect(pRef).remove(); } catch (_) {}
}

// ── Выход из комнаты ──
export async function leaveRoom() {
  const code = state.roomCode;
  if (!code) return;
  try {
    await onDisconnect(ref(db, `${roomPath(code)}/players/${state.playerId}`)).cancel();
  } catch (_) {}
  await remove(ref(db, `${roomPath(code)}/players/${state.playerId}`));

  // Если комната опустела — удаляем её целиком (вместе с чатом)
  const snap = await get(ref(db, `${roomPath(code)}/players`));
  if (!snap.exists()) {
    await remove(ref(db, roomPath(code)));
  } else if (state.isHost) {
    // Передаём хоста самому раннему игроку
    await reassignHost(code);
  }
  state.roomCode = null;
  state.isHost = false;
}

async function reassignHost(code) {
  const snap = await get(ref(db, `${roomPath(code)}/players`));
  if (!snap.exists()) return;
  const players = snap.val();
  const earliest = Object.entries(players)
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))[0];
  if (earliest) await update(ref(db, `${roomPath(code)}/meta`), { host: earliest[0] });
}

// ── Подписка на всю комнату ──
export function subscribeRoom(code, onUpdate) {
  const r = ref(db, roomPath(code));
  const unsub = onValue(r, (snap) => {
    const data = snap.val();
    if (!data) { onUpdate(null); return; }
    if (data.game) data.game = normalizeGame(data.game);
    state.room = data;
    // Восстановление хоста, если текущий покинул комнату
    const players = data.players || {};
    if (data.meta && !players[data.meta.host]) {
      reassignHost(code);
    }
    state.isHost = data.meta && data.meta.host === state.playerId;
    onUpdate(data);
  });
  return () => unsub();
}

// ── Лобби: готовность и настройки ──
export function setReady(code, ready) {
  return set(ref(db, `${roomPath(code)}/players/${state.playerId}/ready`), !!ready);
}

export function updateSettings(code, settings) {
  return update(ref(db, `${roomPath(code)}/meta/settings`), settings);
}

// ── Старт партии (только хост) ──
export async function startGame(code) {
  const snap = await get(ref(db, roomPath(code)));
  if (!snap.exists()) return { ok: false, error: "Комната не найдена" };
  const data = snap.val();
  const players = data.players || {};
  const ids = Object.entries(players)
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    .map(([pid]) => pid);

  if (ids.length < 2) return { ok: false, error: "Нужно минимум 2 игрока" };

  const game = startRound(ids, data.meta.settings, serverNow());
  await update(ref(db, roomPath(code)), {
    game,
    "meta/status": "playing",
  });
  return { ok: true };
}

// ── Новая партия той же комнатой (только хост), очки переносятся ──
export async function newGame(code) {
  const snap = await get(ref(db, roomPath(code)));
  if (!snap.exists()) return { ok: false, error: "Комната не найдена" };
  const data = snap.val();
  const players = data.players || {};
  const ids = Object.entries(players)
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    .map(([pid]) => pid);
  if (ids.length < 2) return { ok: false, error: "Нужно минимум 2 игрока" };

  const prev = normalizeGame(data.game) || {};
  const game = startRound(ids, data.meta.settings, serverNow(), prev.scores || {}, prev.wins || {});
  await update(ref(db, roomPath(code)), { game, "meta/status": "playing" });
  return { ok: true };
}

// ── Возврат в лобби после партии (хост) ──
export async function backToLobby(code) {
  await update(ref(db, roomPath(code)), { "meta/status": "lobby", game: null });
  const snap = await get(ref(db, `${roomPath(code)}/players`));
  if (snap.exists()) {
    const updates = {};
    for (const pid of Object.keys(snap.val())) updates[`${pid}/ready`] = false;
    await update(ref(db, `${roomPath(code)}/players`), updates);
  }
}

// ── Общий помощник: атомарное действие над партией через транзакцию ──
async function gameAction(code, actionFn) {
  let engineError = null;
  const gref = ref(db, `${roomPath(code)}/game`);
  const res = await runTransaction(gref, (current) => {
    if (!current) return; // нет данных — прерываем
    const norm = normalizeGame(current);
    const { ok, game, error } = actionFn(norm);
    if (!ok) { engineError = error; return; } // прерываем без коммита
    return game;
  });
  return { ok: res.committed, error: res.committed ? null : (engineError || "Действие отклонено") };
}

// ── Действия игрока ──
export function playCard(code, cardId, chosenColor, targetPid) {
  return gameAction(code, (g) => play(g, state.playerId, cardId, chosenColor, serverNow(), targetPid));
}
export function drawCard(code) {
  return gameAction(code, (g) => draw(g, state.playerId, serverNow()));
}
export function passTurn(code) {
  return gameAction(code, (g) => pass(g, state.playerId, serverNow()));
}

// ── Механика UNO ──
export function declareUnoNow(code) {
  return gameAction(code, (g) => declareUno(g, state.playerId, serverNow()));
}
export function catchUnoNow(code) {
  return gameAction(code, (g) => catchUno(g, state.playerId, serverNow()));
}
// Хост закрывает истёкшее «окно поимки»
export function expireUno(code) {
  return gameAction(code, (g) => clearExpiredUno(g, serverNow()));
}

// ── Тайм-аут хода (вызывает только хост) ──
export function forceTimeout(code, expectedVersion) {
  return gameAction(code, (g) => {
    if (g.version !== expectedVersion) return { ok: false, error: "stale" };
    const elapsed = serverNow() - g.turnStartedAt;
    if (elapsed < g.settings.turnTime * 1000) return { ok: false, error: "рано" };
    return timeout(g, serverNow());
  });
}

// ── Чат комнаты (использует ту же синхронизацию Firebase) ──
let lastChatAt = 0;
export async function sendChat(code, text) {
  text = String(text || "").replace(/\s+$/g, "").slice(0, 200);
  if (!text.trim()) return { ok: false, error: "Пустое сообщение" };
  const now = serverNow();
  if (now - lastChatAt < 900) return { ok: false, error: "Слишком часто" }; // антиспам ~1 сообщение/сек
  lastChatAt = now;
  const id = `${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const name = String(state.name || "Игрок").trim().slice(0, 16) || "Игрок";
  const msg = { by: state.playerId, name, avatar: state.avatar || "🙂", text, at: now };
  try {
    await set(ref(db, `${roomPath(code)}/chat/${id}`), msg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Не удалось отправить" };
  }
}

export function subscribeChat(code, cb) {
  const r = ref(db, `${roomPath(code)}/chat`);
  const unsub = onValue(r, (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    cb(list);
  });
  return () => unsub();
}

// ── Очистка «мёртвых» комнат при заходе на главный экран ──
export async function cleanupStaleRooms() {
  try {
    const snap = await get(ref(db, "rooms"));
    if (!snap.exists()) return;
    const rooms = snap.val();
    const now = serverNow();
    const DAY = 24 * 60 * 60 * 1000;
    for (const [code, data] of Object.entries(rooms)) {
      const noPlayers = !data.players || Object.keys(data.players).length === 0;
      const old = data.meta && (now - (data.meta.createdAt || now)) > DAY;
      if (noPlayers || old) {
        await remove(ref(db, roomPath(code))).catch(() => {});
      }
    }
  } catch (_) { /* очистка не критична */ }
}
