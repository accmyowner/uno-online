/**
 * firebase.js
 * Единая точка инициализации Firebase: приложение, аутентификация, Firestore.
 * Модульный SDK грузится с CDN — сборка не требуется (подходит для GitHub Pages).
 *
 * Экспортирует уже готовые к использованию db, auth и промис ensureAuth(),
 * который резолвится анонимным uid (стабильным между перезагрузками —
 * это даёт «переподключение» из коробки).
 */
import { firebaseConfig, FIREBASE_SDK } from '../config/firebase-config.js';

const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;

const { initializeApp } = await import(`${base}/firebase-app.js`);
const authMod = await import(`${base}/firebase-auth.js`);
const fsMod = await import(`${base}/firebase-firestore.js`);

const app = initializeApp(firebaseConfig);

export const auth = authMod.getAuth(app);
// Локальная персистентность uid -> переподключение сохраняет игрока.
await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => {});

export const db = fsMod.getFirestore(app);

// Реэкспорт нужных функций Firestore, чтобы остальной код не тянул CDN напрямую.
export const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  collection, addDoc, query, orderBy, limitToLast,
  runTransaction, serverTimestamp, arrayUnion, arrayRemove, deleteField,
} = fsMod;

let _uidPromise = null;

/** Гарантирует анонимный вход и возвращает uid. Кешируется. */
export function ensureAuth() {
  if (_uidPromise) return _uidPromise;
  _uidPromise = new Promise((resolve, reject) => {
    authMod.onAuthStateChanged(auth, (user) => {
      if (user) resolve(user.uid);
    });
    authMod.signInAnonymously(auth).catch(reject);
  });
  return _uidPromise;
}
