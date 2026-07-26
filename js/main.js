// main.js — запуск приложения и переключение экранов.
import { CONFIG_FILLED } from "./firebase.js";
import { state } from "./state.js";
import { watchServerOffset, subscribeRoom, leaveRoom } from "./net.js";
import { renderHome } from "./home.js";
import { renderLobby } from "./lobby.js";
import { renderGame, unmountGame } from "./game.js";
import { toast } from "./ui.js";

const root = document.getElementById("app");

let unsub = null;
let currentCode = null;

function go(target, code) {
  if (target === "home") {
    teardownRoom();
    renderHome(root, go);
    return;
  }
  // Вход в комнату (лобби/игра управляются статусом комнаты)
  enterRoom(code);
}

function teardownRoom() {
  if (unsub) { unsub(); unsub = null; }
  unmountGame();
  currentCode = null;
}

function enterRoom(code) {
  teardownRoom();
  currentCode = code;
  const ctx = { code, go };

  unsub = subscribeRoom(code, (data) => {
    if (!data) {
      // Комнату удалили или нас исключили
      toast("Комната закрыта", "warn");
      go("home");
      return;
    }
    if (!data.players || !data.players[state.playerId]) {
      // Нас больше нет в комнате
      toast("Вы покинули комнату", "warn");
      go("home");
      return;
    }
    const status = data.meta.status;
    if (status === "lobby") {
      unmountGame();
      renderLobby(root, data, ctx);
    } else {
      renderGame(root, data, ctx);
    }
  });
}

function boot() {
  if (!CONFIG_FILLED) {
    root.innerHTML = `
      <div class="config-warning glass card-panel">
        <h2>Нужно подключить Firebase</h2>
        <p>Откройте <code>js/firebase-config.js</code> и вставьте параметры своего проекта Firebase
        (Realtime Database). Подробная инструкция — в файле <code>README.md</code>.</p>
      </div>`;
    return;
  }
  watchServerOffset();
  renderHome(root, go);
}

// Мягкий выход при закрытии вкладки
window.addEventListener("beforeunload", () => {
  if (currentCode) { try { leaveRoom(); } catch (_) {} }
});

boot();
