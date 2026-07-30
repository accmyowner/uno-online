// background.js — живой атмосферный фон в стиле UNO (canvas).
// Только визуал. Не связан с игрой/сетью/Firebase.
// Холст растягивается на весь экран через inset:0 (CSS-масштаб),
// поэтому показ/скрытие адресной строки на телефоне не вызывает «прыжков».

const UNO = ["#ff3b5c", "#2b7fff", "#2fd35a", "#ffce1f"];
const ACCENT = "#a855f7";
const LABELS = ["UNO", "+2", "+4", "↔", "0", "6", "9", "7", "3", "★"];

const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function detectPerf() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
  if (reduceMotion) return "min";
  if (mem <= 3 || cores <= 4 || mobile) return "low";
  return "high";
}
const PERF = detectPerf();

let canvas, ctx, W = 0, H = 0, DPR = 1;
let blobs = [], parts = [], cards = [];
let raf = null, running = true, t = 0, mounted = false;
let resizeTO = null;

function counts() {
  if (PERF === "high") return { blobs: 5, parts: 28, cards: 12 };
  if (PERF === "low") return { blobs: 4, parts: 14, cards: 8 };
  return { blobs: 3, parts: 0, cards: 6 };
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function sizeBuffer() {
  DPR = Math.min(window.devicePixelRatio || 1, PERF === "high" ? 2 : 1.5);
  const w = Math.floor(window.innerWidth * DPR);
  const h = Math.floor(window.innerHeight * DPR);
  return { w, h };
}

function build() {
  const c = counts();
  blobs = Array.from({ length: c.blobs }, () => ({
    x: rnd(0, W), y: rnd(0, H), r: rnd(0.28, 0.5) * Math.min(W, H),
    col: pick([...UNO, ACCENT]),
    vx: rnd(-0.05, 0.05) * DPR, vy: rnd(-0.05, 0.05) * DPR,
    a: rnd(0.1, 0.2), ph: rnd(0, 6.28), sp: rnd(0.3, 0.6),
  }));
  parts = Array.from({ length: c.parts }, () => ({
    x: rnd(0, W), y: rnd(0, H), r: rnd(1, 2.6) * DPR, col: pick(UNO),
    vx: rnd(-0.14, 0.14) * DPR, vy: rnd(-0.2, -0.05) * DPR, a: rnd(0.2, 0.6),
  }));
  cards = Array.from({ length: c.cards }, () => ({
    x: rnd(0, W), y: rnd(0, H), w: rnd(46, 80) * DPR,
    col: pick(UNO), label: pick(LABELS),
    rot: rnd(0, 6.28), vr: rnd(-0.0016, 0.0016),
    vx: rnd(-0.11, 0.11) * DPR, vy: rnd(-0.11, 0.11) * DPR,
    a: rnd(0.05, 0.12), ph: rnd(0, 6.28), sp: rnd(0.2, 0.5),
  }));
}

// Масштабируем позиции при ресайзе (без пересоздания — чтобы не было «скачка»)
function rescale(oldW, oldH) {
  if (!oldW || !oldH) return;
  const sx = W / oldW, sy = H / oldH;
  for (const arr of [blobs, parts, cards]) for (const o of arr) { o.x *= sx; o.y *= sy; }
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
  g.addColorStop(0, cd.col); g.addColorStop(1, hexA(cd.col, 0.55));
  ctx.fillStyle = g;
  roundRect(-w / 2, -h / 2, w, h, w * 0.16); ctx.fill();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.save(); ctx.rotate(-0.38);
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, h * 0.44, 0, 0, 6.2832); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = cd.col;
  ctx.font = `700 ${w * 0.42}px Fredoka, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(cd.label, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}
function step(o, motion) {
  if (!motion) return;
  o.x += o.vx; o.y += o.vy;
  const m = (o.w || o.r || 40) + 40;
  if (o.x < -m) o.x = W + m; else if (o.x > W + m) o.x = -m;
  if (o.y < -m) o.y = H + m; else if (o.y > H + m) o.y = -m;
  if (o.rot != null) o.rot += o.vr;
}
function paint(motion) {
  ctx.clearRect(0, 0, W, H);
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
  for (const cd of cards) { step(cd, motion); drawCard(cd, motion); }
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

function onResize() {
  // Реагируем только на заметное изменение (игнорируем дрожание адресной строки)
  const { w, h } = sizeBuffer();
  const dw = Math.abs(w - W), dh = Math.abs(h - H);
  if (dw < 2 && dh < 40) return;          // мелкие вертикальные колебания игнорируем
  const oldW = W, oldH = H;
  W = canvas.width = w; H = canvas.height = h;
  rescale(oldW, oldH);
  if (reduceMotion) paint(false);
}

function init() {
  if (mounted) return; mounted = true;
  canvas = document.createElement("canvas");
  canvas.id = "bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  // ВАЖНО: без inline px-размеров — только растяжение через inset:0 (нет «прыжков»)
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;";
  document.body.insertBefore(canvas, document.body.firstChild);
  ctx = canvas.getContext("2d");

  const { w, h } = sizeBuffer();
  W = canvas.width = w; H = canvas.height = h;
  build();

  if (reduceMotion) paint(false);
  else frame();

  window.addEventListener("resize", () => {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(onResize, 150); // дебаунс
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { running = false; stopRAF(); }
    else if (!reduceMotion) { running = true; if (!raf) frame(); }
  });
}

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
