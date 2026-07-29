// sfx.js — короткие звуковые эффекты через WebAudio (без внешних файлов).
// Только визуально-звуковая часть, на игровую логику не влияет.

let ctx = null;
let muted = false;
try { muted = localStorage.getItem("uno_muted_v1") === "1"; } catch (_) {}

function ac() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ctx = null; }
  return ctx;
}

// Разбудить аудио после первого действия пользователя (браузеры блокируют автозвук)
function resume() { const c = ac(); if (c && c.state === "suspended") c.resume().catch(() => {}); }
["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, resume, { once: false, passive: true }));

function tone(freq, dur, type = "sine", gain = 0.09, when = 0) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function slide(f1, f2, dur, type = "sine", gain = 0.09) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  isMuted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem("uno_muted_v1", muted ? "1" : "0"); } catch (_) {}
    if (!muted) { resume(); tone(660, 0.08, "triangle"); }
    return muted;
  },
  uno() { resume(); tone(880, 0.1, "triangle", 0.11); tone(1175, 0.14, "triangle", 0.1, 0.08); },
  catch() { resume(); slide(300, 90, 0.35, "sawtooth", 0.11); },
  timeout() { resume(); tone(280, 0.16, "sine", 0.09); tone(200, 0.2, "sine", 0.08, 0.1); },
  swap() { resume(); slide(500, 900, 0.16, "sine", 0.09); slide(900, 520, 0.16, "sine", 0.08); },
  chat() { resume(); tone(760, 0.07, "sine", 0.06); },
  play() { resume(); tone(520, 0.06, "triangle", 0.05); },
  win() { resume(); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, "triangle", 0.1, i * 0.11)); },
};
