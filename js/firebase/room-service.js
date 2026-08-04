/**
 * room-service.js
 * Весь онлайн-слой: комнаты, синхронизация, ходы, чат — поверх Firestore.
 *
 * Модель данных (документ rooms/{CODE}):
 *   { code, status, hostId, settings, players[], presence{}, game, updatedAt }
 * Чат: подколлекция rooms/{CODE}/messages.
 *
 * Ключевой принцип целостности: любое изменение игрового состояния проходит
 * через runTransaction + applyAction. Транзакция читает актуальный game,
 * применяет ход и пишет результат атомарно. Поэтому два игрока не могут
 * сходить одновременно, сыграть несуществующую карту или разойтись в стейте.
 */
import {
  db, ensureAuth,
  doc, getDoc, setDoc, onSnapshot, updateDoc, runTransaction,
  collection, addDoc, query, orderBy, limitToLast, deleteField,
} from './firebase.js';
import { createGame, applyAction } from '../core/game-engine.js';
import { ROOM_STATUS, LIMITS } from '../core/constants.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих 0/O, 1/I
const OFFLINE_MS = 12000; // игрок считается офлайн, если не «пинговал» дольше

function makeCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function roomRef(code) {
  return doc(db, 'rooms', code);
}

function cleanName(name) {
  return (name || '').trim().slice(0, 16) || 'Игрок';
}

/** Создаёт комнату, возвращает её код. Текущий игрок становится хостом. */
export async function createRoom(nickname, settings) {
  const uid = await ensureAuth();
  const name = cleanName(nickname);

  // Подбираем свободный код.
  let code;
  for (let attempt = 0; attempt < 6; attempt++) {
    code = makeCode();
    const snap = await getDoc(roomRef(code));
    if (!snap.exists()) break;
    code = null;
  }
  if (!code) throw new Error('Не удалось создать комнату, попробуйте снова');

  await setDoc(roomRef(code), {
    code,
    status: ROOM_STATUS.LOBBY,
    hostId: uid,
    settings,
    players: [{ id: uid, name }],
    presence: { [uid]: Date.now() },
    game: null,
    updatedAt: Date.now(),
  });
  return code;
}

/** Вход в комнату по коду. Поддерживает переподключение тем же uid. */
export async function joinRoom(code, nickname) {
  const uid = await ensureAuth();
  const name = cleanName(nickname);
  const ref = roomRef(code.toUpperCase());

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Комната не найдена');
    const room = snap.data();

    const already = room.players.find((p) => p.id === uid);
    if (already) {
      // Переподключение: обновляем имя и присутствие.
      const players = room.players.map((p) => (p.id === uid ? { ...p, name } : p));
      tx.update(ref, { players, [`presence.${uid}`]: Date.now(), updatedAt: Date.now() });
      return;
    }

    if (room.status !== ROOM_STATUS.LOBBY) {
      throw new Error('Игра уже началась');
    }
    if (room.players.length >= room.settings.maxPlayers) {
      throw new Error('Комната заполнена');
    }
    tx.update(ref, {
      players: [...room.players, { id: uid, name }],
      [`presence.${uid}`]: Date.now(),
      updatedAt: Date.now(),
    });
  });

  return code.toUpperCase();
}

/** Выход из комнаты. В лобби удаляет из списка, при необходимости передаёт хост. */
export async function leaveRoom(code) {
  const uid = await ensureAuth();
  const ref = roomRef(code);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const room = snap.data();

      if (room.status === ROOM_STATUS.LOBBY) {
        const players = room.players.filter((p) => p.id !== uid);
        if (players.length === 0) {
          tx.delete(ref);
          return;
        }
        const patch = {
          players,
          [`presence.${uid}`]: deleteField(),
          updatedAt: Date.now(),
        };
        if (room.hostId === uid) patch.hostId = players[0].id; // передаём хост
        tx.update(ref, patch);
      } else {
        // В процессе игры место сохраняем (для корректной очереди),
        // но убираем присутствие — ход такого игрока будет авто-пропущен.
        tx.update(ref, { [`presence.${uid}`]: deleteField(), updatedAt: Date.now() });
      }
    });
  } catch (_) {
    /* тихо игнорируем — выход не должен падать */
  }
}

/** Старт партии. Разрешён только хосту и при 2+ игроках. */
export async function startGame(code) {
  const uid = await ensureAuth();
  const ref = roomRef(code);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Комната не найдена');
    const room = snap.data();
    if (room.hostId !== uid) throw new Error('Только хост может начать игру');
    if (room.status !== ROOM_STATUS.LOBBY) throw new Error('Игра уже идёт');
    if (room.players.length < LIMITS.minPlayers) {
      throw new Error('Нужно минимум 2 игрока');
    }

    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const game = createGame(room.players, {
      seed,
      density: room.settings.specialDensity,
      useSwapCard: room.settings.useSwapCard,
      turnTimer: room.settings.turnTimer,
    });

    tx.update(ref, { status: ROOM_STATUS.PLAYING, game, updatedAt: Date.now() });
  });
}

/**
 * Применяет игровое действие через транзакцию.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function submitAction(code, action) {
  const ref = roomRef(code);
  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { ok: false, error: 'Комната не найдена' };
      const room = snap.data();
      if (!room.game) return { ok: false, error: 'Игра не запущена' };

      const res = applyAction(room.game, action);
      if (!res.ok) return { ok: false, error: res.error };

      const patch = { game: res.state, updatedAt: Date.now() };
      if (res.state.status === ROOM_STATUS.FINISHED) patch.status = ROOM_STATUS.FINISHED;
      tx.update(ref, patch);
      return { ok: true };
    });
    return result;
  } catch (e) {
    return { ok: false, error: e.message || 'Ошибка сети' };
  }
}

/** Новая партия теми же игроками (после победы). Только хост. */
export async function playAgain(code) {
  const uid = await ensureAuth();
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Комната не найдена');
    const room = snap.data();
    if (room.hostId !== uid) throw new Error('Только хост может начать заново');

    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const game = createGame(room.players, {
      seed,
      density: room.settings.specialDensity,
      useSwapCard: room.settings.useSwapCard,
      turnTimer: room.settings.turnTimer,
    });
    tx.update(ref, { status: ROOM_STATUS.PLAYING, game, updatedAt: Date.now() });
  });
}

/** Меняет настройки комнаты (только хост, только в лобби). */
export async function updateSettings(code, settings) {
  const uid = await ensureAuth();
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data();
    if (room.hostId !== uid || room.status !== ROOM_STATUS.LOBBY) return;
    tx.update(ref, { settings, updatedAt: Date.now() });
  });
}

/** Подписка на документ комнаты. Возвращает функцию отписки. */
export function subscribeRoom(code, onData, onError) {
  return onSnapshot(
    roomRef(code),
    (snap) => onData(snap.exists() ? snap.data() : null),
    (err) => onError && onError(err)
  );
}

/** Периодический «пинг» присутствия. Возвращает функцию остановки. */
export function startHeartbeat(code) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const uid = await ensureAuth();
      await updateDoc(roomRef(code), { [`presence.${uid}`]: Date.now() });
    } catch (_) { /* игнорируем сетевые сбои пинга */ }
  };
  tick();
  const id = setInterval(tick, 5000);
  return () => { stopped = true; clearInterval(id); };
}

/** Онлайн ли игрок по данным presence. */
export function isOnline(room, playerId, now = Date.now()) {
  const last = room.presence?.[playerId];
  return typeof last === 'number' && now - last < OFFLINE_MS;
}

/* ------------------------------- Чат ------------------------------- */

export async function sendMessage(code, text) {
  const uid = await ensureAuth();
  const clean = (text || '').trim().slice(0, 300);
  if (!clean) return;
  await addDoc(collection(db, 'rooms', code, 'messages'), {
    senderId: uid,
    text: clean,
    at: Date.now(),
  });
}

/** Подписка на последние сообщения чата. */
export function subscribeMessages(code, onData, onError) {
  const q = query(
    collection(db, 'rooms', code, 'messages'),
    orderBy('at'),
    limitToLast(50)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError && onError(err)
  );
}
