/**
 * sound-manager.js
 * Короткие звуки синтезируются на лету через WebAudio API.
 * Плюсы: нет внешних файлов (проще хостинг на GitHub Pages),
 * мгновенная реакция, крошечный вес. Музыки нет — только эффекты.
 */

let ctx = null;
let enabled = true;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  // Автоплей-политика: контекст стартует после первого действия пользователя.
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Один тон с плавным затуханием. */
function tone(freq, { type = 'sine', dur = 0.12, gain = 0.15, delay = 0 } = {}) {
  const ac = context();
  if (!ac || !enabled) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Последовательность тонов (аккорд/арпеджио). */
function sequence(notes) {
  notes.forEach((n) => tone(n.freq, n));
}

export const sounds = {
  play() { tone(420, { type: 'triangle', dur: 0.1, gain: 0.14 }); },
  draw() { tone(240, { type: 'sine', dur: 0.09, gain: 0.12 }); },
  button() { tone(600, { type: 'square', dur: 0.045, gain: 0.05 }); },
  chat() { tone(760, { type: 'sine', dur: 0.08, gain: 0.08 }); },
  uno() {
    sequence([
      { freq: 660, type: 'triangle', dur: 0.12, gain: 0.18, delay: 0 },
      { freq: 880, type: 'triangle', dur: 0.18, gain: 0.18, delay: 0.1 },
    ]);
  },
  win() {
    sequence([
      { freq: 523, dur: 0.15, gain: 0.16, delay: 0, type: 'triangle' },
      { freq: 659, dur: 0.15, gain: 0.16, delay: 0.13, type: 'triangle' },
      { freq: 784, dur: 0.15, gain: 0.16, delay: 0.26, type: 'triangle' },
      { freq: 1046, dur: 0.3, gain: 0.18, delay: 0.39, type: 'triangle' },
    ]);
  },
  lose() {
    sequence([
      { freq: 392, dur: 0.2, gain: 0.14, delay: 0, type: 'sine' },
      { freq: 330, dur: 0.2, gain: 0.14, delay: 0.16, type: 'sine' },
      { freq: 262, dur: 0.35, gain: 0.14, delay: 0.32, type: 'sine' },
    ]);
  },
};

export function setSoundEnabled(v) { enabled = !!v; }
export function isSoundEnabled() { return enabled; }

/** Разблокировать аудио-контекст по первому жесту пользователя. */
export function primeAudio() { context(); }
