/**
 * main.js
 * Точка входа. Связывает экраны, подписки Firestore и UI-компоненты.
 * Здесь нет игровой логики — только оркестрация.
 */
import { ensureAuth } from './firebase/firebase.js';
import * as rooms from './firebase/room-service.js';
import { store } from './state/store.js';
import { showScreen } from './ui/screens.js';
import { renderMenu } from './ui/menu-ui.js';
import { LobbyView } from './ui/lobby-ui.js';
import { GameView } from './ui/game-ui.js';
import { VictoryView } from './ui/victory-ui.js';
import { ChatView } from './ui/chat-ui.js';
import { toast } from './ui/toast.js';
import { primeAudio } from './audio/sound-manager.js';
import { ROOM_STATUS } from './core/constants.js';
import { $ } from './utils/dom.js';

const els = {
  menu: $('#screen-menu'),
  lobby: $('#screen-lobby'),
  game: $('#screen-game'),
  gameRoot: $('#game-root'),
  chatRoot: $('#chat-root'),
  victory: $('#victory-overlay'),
};

// Текущая «сессия» комнаты: подписки, интервалы, представления.
let session = null;

const getMyId = () => store.uid;

/* ------------------------- Инициализация ------------------------- */
async function boot() {
  // Первый жест пользователя разблокирует аудио.
  window.addEventListener('pointerdown', primeAudio, { once: true });

  try {
    store.uid = await ensureAuth();
  } catch (e) {
    toast('Не удалось подключиться к Firebase. Проверьте firebase-config.js', 'error', 6000);
    return;
  }
  goToMenu();
}

/* ------------------------- Меню ------------------------- */
function goToMenu() {
  leaveSession();
  showScreen('screen-menu');
  renderMenu(els.menu, {
    onCreate: async (settings) => {
      try {
        const code = await rooms.createRoom(store.nickname, settings);
        enterRoom(code);
      } catch (e) { toast(e.message || 'Ошибка создания комнаты', 'error'); }
    },
    onJoin: async (code) => {
      try {
        const joined = await rooms.joinRoom(code, store.nickname);
        enterRoom(joined);
      } catch (e) { toast(e.message || 'Не удалось войти', 'error'); }
    },
  });
}

/* ------------------------- Вход в комнату ------------------------- */
function enterRoom(code) {
  leaveSession();
  store.code = code;

  const lobby = new LobbyView(els.lobby, {
    getMyId,
    isOnline: rooms.isOnline,
    onStart: async () => {
      const r = await safe(() => rooms.startGame(code));
      if (r && r.error) toast(r.error, 'error');
    },
    onLeave: () => goToMenu(),
    onSettingsChange: (vals) => rooms.updateSettings(code, vals),
  });

  const game = new GameView(els.gameRoot, {
    getMyId,
    isOnline: rooms.isOnline,
    submit: (action) => rooms.submitAction(code, action),
  });

  const victory = new VictoryView(els.victory, {
    getMyId,
    onPlayAgain: () => safe(() => rooms.playAgain(code)),
    onLeave: () => goToMenu(),
  });

  const chat = new ChatView(els.chatRoot, {
    getMyId,
    onSend: (text) => rooms.sendMessage(code, text),
  });

  const stopHeartbeat = rooms.startHeartbeat(code);

  const unsubRoom = rooms.subscribeRoom(code, onRoomUpdate, (err) => {
    toast('Потеряно соединение с комнатой', 'error');
  });

  const unsubChat = rooms.subscribeMessages(code, (msgs) => chat.render(msgs));

  const tickId = setInterval(() => {
    if (session && session.room && session.room.status === ROOM_STATUS.PLAYING) {
      session.game.tick();
    }
  }, 500);

  session = { code, lobby, game, victory, chat, stopHeartbeat, unsubRoom, unsubChat, tickId, room: null };
}

/* ------------------------- Реакция на состояние комнаты ------------------------- */
function onRoomUpdate(room) {
  if (!session) return;
  if (!room) {
    toast('Комната закрыта', 'info');
    goToMenu();
    return;
  }
  session.room = room;
  session.chat.setPlayers(room.players);

  if (room.status === ROOM_STATUS.LOBBY) {
    showScreen('screen-lobby');
    session.chat.hide();
    session.victory.hide();
    session.lobby.update(room);
    return;
  }

  // playing или finished — показываем игровой экран.
  showScreen('screen-game');
  session.chat.show();
  session.game.update(room);

  if (room.status === ROOM_STATUS.FINISHED) {
    session.victory.update(room);
  } else {
    session.victory.hide();
  }
}

/* ------------------------- Очистка сессии ------------------------- */
function leaveSession() {
  if (!session) return;
  const s = session;
  session = null;
  try { s.unsubRoom && s.unsubRoom(); } catch (_) {}
  try { s.unsubChat && s.unsubChat(); } catch (_) {}
  try { s.stopHeartbeat && s.stopHeartbeat(); } catch (_) {}
  clearInterval(s.tickId);
  // Сообщаем серверу о выходе (best-effort).
  if (s.code) rooms.leaveRoom(s.code);
  s.game && s.game.destroy();
  s.lobby && s.lobby.destroy();
  s.chat && s.chat.hide();
  s.victory && s.victory.hide();
}

async function safe(fn) {
  try { await fn(); return null; }
  catch (e) { return { error: e.message || 'Ошибка' }; }
}

// Best-effort уведомление о выходе при закрытии вкладки.
window.addEventListener('pagehide', () => {
  if (session && session.code) rooms.leaveRoom(session.code);
});

boot();
