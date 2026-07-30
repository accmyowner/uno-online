// sfx.js — мягкие звуки игровых действий и интерфейса (WebAudio, процедурно).
// Музыки нет. Настроек нет. Звуки всегда включены с фиксированной громкостью.
// На игровую логику не влияет.

let ctx = null;
let sfxGain = null;
let sfxLP = null;

const MASTER = 0.7; // общая громкость звуков

function ensure() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (_) { ctx = null; return null; }
  sfxGain = ctx.createGain();
  sfxGain.gain.value = MASTER;
  sfxLP = ctx.createBiquadFilter();
  sfxLP.type = "lowpass";
  sfxLP.frequency.value = 5200;
  sfxLP.connect(sfxGain).connect(ctx.destination);
  return ctx;
}

function resume() {
  const c = ensure();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}
["pointerdown", "keydown", "touchstart"].forEach((e) =>
  window.addEventListener(e, resume, { passive: true })
);

function blip(freq, dur, { type = "sine", gain = 0.5, when = 0, glideTo = null, attack = 0.012 } = {}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(sfxLP);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}
function seq(notes) {
  notes.forEach((n) => blip(n.f, n.d || 0.16, { type: n.type || "sine", gain: n.gain ?? 0.4, when: n.delay || 0, glideTo: n.glideTo || null }));
}

export const sfx = {
  // Интерфейс
  hover() { blip(1320, 0.04, { type: "sine", gain: 0.05 }); },
  click() { blip(523.25, 0.07, { type: "triangle", gain: 0.32 }); blip(784, 0.05, { type: "sine", gain: 0.14, delay: 0.02 }); },
  menuOpen() { seq([{ f: 523.25, gain: 0.3 }, { f: 784, gain: 0.28, delay: 0.06 }]); },
  menuClose() { seq([{ f: 659.25, gain: 0.26 }, { f: 440, gain: 0.24, delay: 0.06 }]); },
  createRoom() { seq([{ f: 523.25, gain: 0.34, type: "triangle" }, { f: 659.25, gain: 0.32, type: "triangle", delay: 0.08 }, { f: 784, gain: 0.32, type: "triangle", delay: 0.16 }]); },
  joinRoom() { seq([{ f: 587.33, gain: 0.32 }, { f: 880, gain: 0.3, delay: 0.09 }]); },
  selectRoom() { blip(659.25, 0.09, { type: "sine", gain: 0.26 }); },

  // Игра
  colorPick() { blip(698.46, 0.14, { type: "sine", gain: 0.3, glideTo: 932 }); },
  play() { blip(523.25, 0.07, { type: "triangle", gain: 0.22 }); },
  deal(n) { blip(392, 0.08, { type: "sine", gain: 0.24 }); blip(523.25, 0.08, { type: "sine", gain: 0.22, delay: 0.07 }); if (n >= 4) blip(659, 0.08, { type: "sine", gain: 0.2, delay: 0.14 }); },
  uno() { seq([{ f: 880, gain: 0.4, type: "triangle" }, { f: 1174.66, gain: 0.36, type: "triangle", delay: 0.09 }, { f: 1567.98, gain: 0.3, type: "triangle", delay: 0.18 }]); },
  catch() { blip(392, 0.26, { type: "sine", gain: 0.34, glideTo: 196 }); },
  swap() { blip(523.25, 0.16, { type: "sine", gain: 0.3, glideTo: 880 }); blip(880, 0.18, { type: "sine", gain: 0.26, glideTo: 523.25, delay: 0.14 }); },
  timeout() { blip(330, 0.18, { type: "sine", gain: 0.26, glideTo: 247 }); },

  // Чат
  chat() { blip(880, 0.07, { type: "sine", gain: 0.18 }); },
  send() { blip(659.25, 0.09, { type: "sine", gain: 0.2, glideTo: 880 }); },

  // Финал
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.2, { type: "triangle", gain: 0.34, when: i * 0.12 })); },
  lose() { [523.25, 440, 349.23].forEach((f, i) => blip(f, 0.26, { type: "sine", gain: 0.3, when: i * 0.14 })); },
};
