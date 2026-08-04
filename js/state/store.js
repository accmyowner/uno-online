/**
 * store.js
 * Небольшое локальное состояние приложения (вне игрового движка).
 * Хранит только клиентские данные: никнейм, uid, текущий код комнаты.
 * Игровое состояние живёт в Firestore и приходит подписками.
 */

const NICK_KEY = 'uno.nickname';

const state = {
  uid: null,
  nickname: localStorage.getItem(NICK_KEY) || '',
  code: null,
};

export const store = {
  get uid() { return state.uid; },
  set uid(v) { state.uid = v; },

  get nickname() { return state.nickname; },
  set nickname(v) {
    state.nickname = v;
    try { localStorage.setItem(NICK_KEY, v); } catch (_) { /* приватный режим */ }
  },

  get code() { return state.code; },
  set code(v) { state.code = v; },
};
