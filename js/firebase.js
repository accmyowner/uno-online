// firebase.js — инициализация Firebase и удобные реэкспорты Realtime Database.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, onValue, get, set, update, remove,
  runTransaction, onDisconnect, serverTimestamp, off,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { firebaseConfig, CONFIG_FILLED } from "./firebase-config.js";

let db = null;

if (CONFIG_FILLED) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}

export {
  db, CONFIG_FILLED,
  ref, onValue, get, set, update, remove,
  runTransaction, onDisconnect, serverTimestamp, off,
};
