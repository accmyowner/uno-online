// firebase-config.js
// ─────────────────────────────────────────────────────────────
// ВСТАВЬТЕ СЮДА КОНФИГ ИЗ ВАШЕГО ПРОЕКТА FIREBASE.
//
// Firebase Console → Project settings → General → Your apps → SDK setup.
// Важно: включите Realtime Database (не Firestore) и задайте правила из README.
// databaseURL обязателен для Realtime Database.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Технический флаг: не трогайте. Помогает показать понятную ошибку, если конфиг не заполнен.
export const CONFIG_FILLED = !firebaseConfig.apiKey.startsWith("YOUR_");
