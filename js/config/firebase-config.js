/**
 * firebase-config.js
 * ЕДИНСТВЕННЫЙ файл, который нужно отредактировать перед запуском.
 *
 * 1. Зайдите на https://console.firebase.google.com и создайте проект.
 * 2. Add app -> Web (</>) -> скопируйте объект firebaseConfig сюда.
 * 3. В разделе Authentication включите провайдер "Anonymous".
 * 4. В разделе Firestore Database создайте базу (production или test mode).
 *    Правила для быстрого старта (открытые — только для теста!) см. в README.
 *
 * Никаких секретов здесь нет: web-конфиг Firebase публичен по замыслу,
 * доступ ограничивается правилами Firestore.
 */
export const firebaseConfig = {
  apiKey: 'ВСТАВЬТЕ_СВОЙ_API_KEY',
  authDomain: 'ВСТАВЬТЕ.firebaseapp.com',
  projectId: 'ВСТАВЬТЕ_PROJECT_ID',
  storageBucket: 'ВСТАВЬТЕ.appspot.com',
  messagingSenderId: 'ВСТАВЬТЕ',
  appId: 'ВСТАВЬТЕ',
};

// Версия SDK Firebase, загружаемого с CDN (без сборки).
export const FIREBASE_SDK = '10.12.5';
