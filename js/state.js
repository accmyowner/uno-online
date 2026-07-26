// state.js — локальное состояние текущего клиента (не синхронизируется).
import { uid } from "./utils.js";

const STORE_KEY = "uno_identity_v1";

function loadIdentity() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveIdentity(identity) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(identity)); } catch (_) {}
}

const stored = loadIdentity();

export const state = {
  // Постоянный идентификатор игрока (переживает перезагрузку)
  playerId: stored?.playerId || uid("pl"),
  name: stored?.name || "",
  avatar: stored?.avatar || "🐼",

  // Текущая комната
  roomCode: null,
  isHost: false,

  // Смещение между часами клиента и сервера (мс). Заполняется из .info/serverTimeOffset.
  serverOffset: 0,

  // Последние полученные снимки данных
  room: null, // { meta, players, game }
};

export function setIdentity(name, avatar) {
  state.name = name;
  state.avatar = avatar;
  saveIdentity({ playerId: state.playerId, name, avatar });
}

// Приблизительное серверное время (для таймеров хода)
export function serverNow() {
  return Date.now() + state.serverOffset;
}
