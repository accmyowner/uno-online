// settings.js — пользовательские настройки атмосферы (визуал/звук/музыка).
// Только оформление; на игровую логику, сеть и Firebase не влияет.
const KEY = "uno_atmos_v1";

const DEFAULTS = {
  animations: true,
  effects: true,
  music: true,
  sounds: true,
  musicVol: 0.4,
  soundsVol: 0.7,
};

// Авто-определение «слабого» устройства для снижения нагрузки
function detectPerf() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return "min";
  if (mem <= 3 || cores <= 4 || mobile) return "low";
  return "high";
}

let data = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  data = { ...DEFAULTS, ...saved };
} catch (_) {}

const perf = detectPerf();
const listeners = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
}

export const settings = {
  perf,                       // "min" | "low" | "high"
  get() { return { ...data }; },
  value(k) { return data[k]; },
  set(k, v) {
    data[k] = v;
    persist();
    listeners.forEach((fn) => { try { fn(k, v, { ...data }); } catch (_) {} });
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Учитывать и настройку, и системное «уменьшить движение»
  animationsOn() { return data.animations && perf !== "min"; },
  effectsOn() { return data.effects; },
};
