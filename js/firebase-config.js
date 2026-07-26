// firebase-config.js
// ─────────────────────────────────────────────────────────────
// ВСТАВЬТЕ СЮДА КОНФИГ ИЗ ВАШЕГО ПРОЕКТА FIREBASE.
//
// Firebase Console → Project settings → General → Your apps → SDK setup.
// Важно: включите Realtime Database (не Firestore) и задайте правила из README.
// databaseURL обязателен для Realtime Database.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCOyQoy-V7mvYIQQRfYLd3YOWqc0wEvBOM",
  authDomain: "uno-online-2c53e.firebaseapp.com",
  databaseURL: "https://uno-online-2c53e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "uno-online-2c53e",
  storageBucket: "uno-online-2c53e.firebasestorage.app",
  messagingSenderId: "848806710388",
  appId: "1:848806710388:web:e6f9e483e5d22895a7d521",
};

// Технический флаг: не трогайте. Помогает показать понятную ошибку, если конфиг не заполнен.
export const CONFIG_FILLED = !firebaseConfig.apiKey.startsWith("YOUR_");
