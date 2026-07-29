// background.js — живой атмосферный фон в стиле UNO (canvas).
// Только визуал: дрейфующие световые пятна, частицы и плавающие карты.
// Не связан с игрой/сетью/Firebase. Учитывает настройки и слабые устройства.
import { settings } from "./settings.js";

const UNO = ["#ff3b5c", "#2b7fff", "#2fd35a", "#ffce1f"];
const ACCENT = "#a855f7";
const LABELS = ["UNO", "+2", "+4", "↔", "0", "6", "9", "7", "3", "★"];

let canvas, ctx, W = 0, H = 0, DPR = 1;
let blobs = [], parts = [], cards = [];
let raf = null, running = true, t = 0, mounted = false;

function counts() {
  const p = settings.perf; // "min" | "low" | "high"
  if (p === "high") return { blobs: 5, parts: 30, cards: 12 };
  if (p === "low") return { blobs: 4, parts: 16, cards: 8 };
  return { blobs: 3, parts: 0, cards: 6 };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, settings.perf === "high" ? 2 : 1.4);
  W = canvas.width = Math.floor(window.innerWidth * DPR);
  H = canvas.height = Math.floor(window.innerHeight * DPR);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}

function build() {
  const c = counts();
  blobs = Array.from({ length: c.blobs }, () => ({
    x: rnd(0, W), y: rnd(0, H), r: rnd(0.28, 0.5) * Math.min(W, H),
    col: pick([...UNO, ACCENT]),
    vx: rnd(-0.06, 0.06) * DPR, vy: rnd(-0.06, 0.06) * DPR,
    a: rnd(0.1, 0.2), ph: rnd(0, 6.28), sp: rnd(0.3, 0.6),
  }));
  parts = Array.from({ length: c.parts }, () => ({
    x: rnd(0, W), y: rnd(0, H), r: rnd(1, 2.6) * DPR, col: pick(UNO),
    vx: rnd(-0.15, 0.15) * DPR, vy: rnd(-0.2, -0.05) * DPR, a: rnd(0.2, 0.6),
  }));
  cards = Array.from({ length: c.cards }, () => ({
    x: rnd(0, W), y: rnd(0, H), w: rnd(46, 80) * DPR,
    col: pick(UNO), label: pick(LABELS),
    rot: rnd(0, 6.28), vr: rnd(-0.0016, 0.0016),
    vx: rnd(-0.12, 0.12) * DPR, vy: rnd(-0.12, 0.12) * DPR,
    a: rnd(0.05, 0.12), ph: rnd(0, 6.28), sp: rnd(0.2, 0.5),
  }));
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(cd, motion) {
  const alpha = motion ? cd.a * (0.6 + 0.4 * Math.sin(t * cd.sp + cd.ph)) : cd.a;
  const w = cd.w, h = w * 1.45;
  ctx.save();
  ctx.translate(cd.x, cd.y);
  ctx.rotate(cd.rot);
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, cd.col);
  g.addColorStop(1, hexA(cd.col, 0.55));
  ctx.fillStyle = g;
  roundRect(-w / 2, -h / 2, w, h, w * 0.16);
  ctx.fill();
  // белый овал + подпись
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.save();
  ctx.rotate(-0.38);
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.34, h * 0.44, 0, 0, 6.2832);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = cd.col;
  ctx.font = `700 ${w * 0.42}px Fredoka, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cd.label, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function step(cd, motion) {
  if (!motion) return;
  cd.x += cd.vx; cd.y += cd.vy;
  const m = (cd.w || cd.r || 40) + 40;
  if (cd.x < -m) cd.x = W + m; else if (cd.x > W + m) cd.x = -m;
  if (cd.y < -m) cd.y = H + m; else if (cd.y > H + m) cd.y = -m;
  if (cd.rot != null) cd.rot += cd.vr;
}

function paint(motion) {
  ctx.clearRect(0, 0, W, H);

  // Световые пятна
  ctx.globalCompositeOperation = "lighter";
  for (const b of blobs) {
    step(b, motion);
    const pulse = motion ? 0.75 + 0.25 * Math.sin(t * b.sp + b.ph) : 1;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, hexA(b.col, b.a * pulse));
    g.addColorStop(1, hexA(b.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // Плавающие карты (далеко позади)
  for (const cd of cards) { step(cd, motion); drawCard(cd, motion); }

  // Частицы
  ctx.globalCompositeOperation = "lighter";
  for (const p of parts) {
    step(p, motion);
    ctx.fillStyle = hexA(p.col, p.a);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function frame() {
  if (!running) return;
  t += 0.006;
  paint(true);
  raf = requestAnimationFrame(frame);
}

function stopRAF() { if (raf) cancelAnimationFrame(raf); raf = null; }

function apply() {
  // Перестраиваем в соответствии с настройкой анимаций
  if (settings.animationsOn()) {
    running = true;
    if (!raf) frame();
  } else {
    stopRAF();
    paint(false); // один статичный красивый кадр
  }
}

function init() {
  if (mounted) return; mounted = true;
  canvas = document.createElement("canvas");
  canvas.id = "bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;display:block;";
  document.body.insertBefore(canvas, document.body.firstChild);
  ctx = canvas.getContext("2d");

  resize(); build(); apply();

  window.addEventListener("resize", () => { resize(); build(); if (!settings.animationsOn()) paint(false); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { running = false; stopRAF(); }
    else if (settings.animationsOn()) { running = true; frame(); }
  });
  settings.onChange((k) => { if (k === "animations") apply(); });
}

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
