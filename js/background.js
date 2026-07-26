/* background.js — ДЕКОРАТИВНЫЙ анимированный фон в стиле UNO.
   Только визуал: мягкие светящиеся частицы фирменных цветов, плавно
   дрейфующие по экрану. Не связан с игровой логикой, сетью и Firebase —
   ничего из состояния игры не читает и не меняет. Автономный IIFE.
   Бережёт ресурсы: ограниченное число частиц, пауза на скрытой вкладке,
   статичный кадр при prefers-reduced-motion. */
(function () {
  "use strict";

  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COLORS = ["#ff3b5c", "#2b7fff", "#2fd35a", "#ffce1f", "#a855f7"];

  let started = false;
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (started) return;
    started = true;

    const canvas = document.createElement("canvas");
    canvas.id = "bg-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:fixed;inset:0;z-index:0;pointer-events:none;display:block;";
    // За #app (z-index:1), первым узлом body
    document.body.insertBefore(canvas, document.body.firstChild);

    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, DPR = 1, parts = [], t = 0, raf = null, running = true;

    function hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.floor(window.innerWidth * DPR);
      H = canvas.height = Math.floor(window.innerHeight * DPR);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    }

    function build() {
      // Плотность частиц зависит от площади экрана, но ограничена сверху.
      const n = Math.max(12, Math.min(30,
        Math.round((window.innerWidth * window.innerHeight) / 52000)));
      parts = [];
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: (46 + Math.random() * 96) * DPR,
          c: COLORS[(Math.random() * COLORS.length) | 0],
          vx: (Math.random() - 0.5) * 0.14 * DPR,
          vy: (Math.random() - 0.5) * 0.14 * DPR,
          a: 0.05 + Math.random() * 0.09,
          ph: Math.random() * Math.PI * 2,
          sp: 0.4 + Math.random() * 0.7,
        });
      }
    }

    function paint(motion) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        if (motion) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < -p.r) p.x = W + p.r; else if (p.x > W + p.r) p.x = -p.r;
          if (p.y < -p.r) p.y = H + p.r; else if (p.y > H + p.r) p.y = -p.r;
        }
        const pulse = motion ? (0.75 + 0.25 * Math.sin(t * p.sp + p.ph)) : 1;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, hexA(p.c, p.a * pulse));
        g.addColorStop(1, hexA(p.c, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function frame() {
      if (!running) return;
      t += 0.005;
      paint(true);
      raf = requestAnimationFrame(frame);
    }

    resize();
    build();
    window.addEventListener("resize", () => { resize(); build(); if (reduce) paint(false); });

    if (reduce) { paint(false); return; }

    frame();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        frame();
      }
    });
  }
})();
