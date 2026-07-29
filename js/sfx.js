// sfx.js — мягкие UI-звуки (WebAudio) + фоновая музыка из настоящего аудио-файла.
// UI-звуки генерируются процедурно; МУЗЫКА — это реальный трек (assets/music/menu-loop.*),
// проигрываемый с бесшовным лупом и плавным fade in/out. На игровую логику не влияет.
import { settings } from "./settings.js";

let ctx = null;
let sfxGain = null;   // общая громкость звуков
let sfxLP = null;     // мягкий low-pass
let musicGain = null; // громкость музыки (из настроек)
let started = false;

function ensure() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (_) { ctx = null; return null; }

  sfxGain = ctx.createGain();
  sfxGain.gain.value = settings.value("sounds") ? settings.value("soundsVol") : 0;
  sfxLP = ctx.createBiquadFilter();
  sfxLP.type = "lowpass";
  sfxLP.frequency.value = 5200;
  sfxLP.connect(sfxGain).connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = settings.value("music") ? settings.value("musicVol") : 0;
  musicGain.connect(ctx.destination);

  return ctx;
}

function resume() {
  const c = ensure();
  if (c && c.state === "suspended") c.resume().catch(() => {});
  if (!started) { started = true; if (settings.value("music")) startMusic(); }
}
["pointerdown", "keydown", "touchstart"].forEach((e) =>
  window.addEventListener(e, resume, { passive: true })
);

// ── Мягкий тон с плавной огибающей (для UI-звуков) ──
function blip(freq, dur, { type = "sine", gain = 0.5, when = 0, glideTo = null, attack = 0.012 } = {}) {
  const c = ensure();
  if (!c || !settings.value("sounds")) return;
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
  isMuted() { return !settings.value("sounds"); },
  toggleMute() {
    const on = !settings.value("sounds");
    settings.set("sounds", on);
    if (on) { resume(); this.click(); }
    return !on;
  },
  hover() { blip(1320, 0.04, { type: "sine", gain: 0.05 }); },
  click() { blip(523.25, 0.07, { type: "triangle", gain: 0.32 }); blip(784, 0.05, { type: "sine", gain: 0.14, delay: 0.02 }); },
  menuOpen() { seq([{ f: 523.25, gain: 0.3 }, { f: 784, gain: 0.28, delay: 0.06 }]); },
  menuClose() { seq([{ f: 659.25, gain: 0.26 }, { f: 440, gain: 0.24, delay: 0.06 }]); },
  settingsOpen() { seq([{ f: 494, gain: 0.26 }, { f: 740, gain: 0.24, delay: 0.05 }]); },
  createRoom() { seq([{ f: 523.25, gain: 0.34, type: "triangle" }, { f: 659.25, gain: 0.32, type: "triangle", delay: 0.08 }, { f: 784, gain: 0.32, type: "triangle", delay: 0.16 }]); },
  joinRoom() { seq([{ f: 587.33, gain: 0.32 }, { f: 880, gain: 0.3, delay: 0.09 }]); },
  selectRoom() { blip(659.25, 0.09, { type: "sine", gain: 0.26 }); },
  colorPick() { blip(698.46, 0.14, { type: "sine", gain: 0.3, glideTo: 932 }); },
  play() { blip(523.25, 0.07, { type: "triangle", gain: 0.22 }); },
  deal(n) { blip(392, 0.08, { type: "sine", gain: 0.24 }); blip(523.25, 0.08, { type: "sine", gain: 0.22, delay: 0.07 }); if (n >= 4) blip(659, 0.08, { type: "sine", gain: 0.2, delay: 0.14 }); },
  uno() { seq([{ f: 880, gain: 0.4, type: "triangle" }, { f: 1174.66, gain: 0.36, type: "triangle", delay: 0.09 }, { f: 1567.98, gain: 0.3, type: "triangle", delay: 0.18 }]); },
  catch() { blip(392, 0.26, { type: "sine", gain: 0.34, glideTo: 196 }); },
  swap() { blip(523.25, 0.16, { type: "sine", gain: 0.3, glideTo: 880 }); blip(880, 0.18, { type: "sine", gain: 0.26, glideTo: 523.25, delay: 0.14 }); },
  timeout() { blip(330, 0.18, { type: "sine", gain: 0.26, glideTo: 247 }); },
  chat() { blip(880, 0.07, { type: "sine", gain: 0.18 }); },
  send() { blip(659.25, 0.09, { type: "sine", gain: 0.2, glideTo: 880 }); },
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.2, { type: "triangle", gain: 0.34, when: i * 0.12 })); },
  lose() { [523.25, 440, 349.23].forEach((f, i) => blip(f, 0.26, { type: "sine", gain: 0.3, when: i * 0.14 })); },

  applyVolumes() {
    if (!ctx) return;
    if (sfxGain) sfxGain.gain.setTargetAtTime(settings.value("sounds") ? settings.value("soundsVol") : 0, ctx.currentTime, 0.05);
    if (musicGain) musicGain.gain.setTargetAtTime(settings.value("music") ? settings.value("musicVol") : 0, ctx.currentTime, 0.1);
  },
  startMusic, stopMusic,
};

// ============================================================
//  ФОНОВАЯ МУЗЫКА — настоящий аудио-трек, бесшовный луп + fade
// ============================================================
// Форматы по приоритету (ogg — точнее лупится; mp3 — совместимость с Safari)
const MUSIC_SOURCES = ["assets/music/menu-loop.ogg", "assets/music/menu-loop.mp3"];
const LOOP_SECONDS = 1008000 / 44100; // точная длина исходного лупа (22.857…с)
const FADE_IN = 2.5;
const FADE_OUT = 1.6;

let musicBuffer = null;
let musicLoading = null;
let musicSource = null;
let fadeGain = null;      // отдельный gain для fade in/out
let loopStart = 0, loopEnd = LOOP_SECONDS;

async function loadMusic() {
  if (musicBuffer) return musicBuffer;
  if (musicLoading) return musicLoading;
  const c = ensure();
  if (!c) return null;
  musicLoading = (async () => {
    for (const url of MUSIC_SOURCES) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const arr = await resp.arrayBuffer();
        const buf = await c.decodeAudioData(arr.slice(0));
        musicBuffer = buf;
        computeLoopPoints(buf);
        return buf;
      } catch (_) { /* пробуем следующий формат */ }
    }
    console.warn("[music] Трек не найден. Положите файл в assets/music/menu-loop.mp3 (см. assets/music/README.txt).");
    return null;
  })();
  return musicLoading;
}

// Обрезаем возможную служебную тишину кодека, чтобы луп был бесшовным
function computeLoopPoints(buf) {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const scanTo = Math.min(data.length, Math.floor(0.25 * sr));
  let first = 0;
  for (let i = 0; i < scanTo; i++) { if (Math.abs(data[i]) > 0.015) { first = i; break; } }
  loopStart = first / sr;
  loopEnd = Math.min(buf.duration, loopStart + LOOP_SECONDS);
}

async function startMusic() {
  const c = ensure();
  if (!c || musicSource) return;
  if (!settings.value("music")) return;
  const buf = await loadMusic();
  if (!buf || !settings.value("music")) return;
  if (musicSource) return; // защита от гонки

  fadeGain = c.createGain();
  fadeGain.gain.value = 0.0001;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = loopStart;
  src.loopEnd = loopEnd;
  src.connect(fadeGain).connect(musicGain);
  src.start(0, loopStart);
  musicSource = src;

  // Плавное появление
  const now = c.currentTime;
  fadeGain.gain.setValueAtTime(0.0001, now);
  fadeGain.gain.linearRampToValueAtTime(1, now + FADE_IN);
}

function stopMusic() {
  const c = ctx;
  const src = musicSource;
  const fg = fadeGain;
  musicSource = null; fadeGain = null;
  if (!c || !src) return;
  const now = c.currentTime;
  try {
    fg.gain.cancelScheduledValues(now);
    fg.gain.setValueAtTime(Math.max(0.0001, fg.gain.value), now);
    fg.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT); // плавное затухание
    setTimeout(() => { try { src.stop(); } catch (_) {} }, (FADE_OUT + 0.1) * 1000);
  } catch (_) { try { src.stop(); } catch (_) {} }
}

// Реакция на изменения настроек
settings.onChange((k) => {
  if (k === "sounds" || k === "soundsVol" || k === "music" || k === "musicVol") sfx.applyVolumes();
  if (k === "music") {
    if (settings.value("music")) { resume(); startMusic(); }
    else stopMusic();
  }
});
