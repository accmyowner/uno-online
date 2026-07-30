// deck.js — модель карт и чистые правила UNO (без Firebase, легко тестируется)

import { shuffle } from "./utils.js";

export const COLORS = ["red", "yellow", "green", "blue"];

// Значения карт:
//  "0".."9" — числовые
//  "skip"   — пропуск хода
//  "reverse"— смена направления
//  "draw2"  — +2
//  "wild"   — выбор цвета
//  "wild4"  — +4 и выбор цвета
//  "swap"   — «Обмен руками»: чёрная карта, меняет руки с выбранным игроком + выбор цвета
//             (добавляется в колоду только если включена настройка комнаты)

// Множители количества СПЕЦИАЛЬНЫХ карт по настройке комнаты
// (числовые карты не меняются). classic = классическое UNO.
const SPECIAL_RATES = { low: 0.4, mid: 0.7, classic: 1.0, high: 1.8 };

// Создание колоды. opts = { handSwap, specialRate }.
// Для обратной совместимости допускается createDeck(true) === { handSwap:true }.
export function createDeck(opts = {}) {
  if (typeof opts === "boolean") opts = { handSwap: opts };
  const handSwap = !!opts.handSwap;
  const rate = SPECIAL_RATES[opts.specialRate] != null ? SPECIAL_RATES[opts.specialRate] : 1.0;
  const scaled = (base) => Math.max(0, Math.round(base * rate));

  const deck = [];
  let n = 0;
  const add = (color, value, times = 1) => { for (let i = 0; i < times; i++) deck.push({ id: `c${n++}`, color, value }); };

  for (const color of COLORS) {
    add(color, "0", 1);                                   // числовые карты не масштабируются
    for (let v = 1; v <= 9; v++) add(color, String(v), 2);
    for (const special of ["skip", "reverse", "draw2"]) add(color, special, scaled(2));
  }
  add("wild", "wild", scaled(4));
  add("wild", "wild4", scaled(4));

  // «Обмен руками» — только если включена настройка; количество тоже зависит от вероятности спец-карт
  if (handSwap) add("wild", "swap", Math.max(1, scaled(2)));

  return shuffle(deck);
}

export function isSwap(card) {
  return !!card && card.value === "swap";
}

// «Чёрные»/универсальные карты (требуют выбора цвета и играются на что угодно)
export function isWild(card) {
  return card.value === "wild" || card.value === "wild4" || card.value === "swap";
}

export function isDrawCard(card) {
  return card.value === "draw2" || card.value === "wild4";
}

// Стоимость карты в очках (классический подсчёт UNO)
export function cardPoints(card) {
  if (card.value === "wild" || card.value === "wild4") return 50;
  if (card.value === "swap") return 40;
  if (card.value === "skip" || card.value === "reverse" || card.value === "draw2") return 20;
  return parseInt(card.value, 10) || 0;
}

// Читаемая подпись для истории/иконок
export function cardLabel(card) {
  switch (card.value) {
    case "skip": return "⦸";
    case "reverse": return "⇄";
    case "draw2": return "+2";
    case "wild": return "★";
    case "wild4": return "+4";
    case "swap": return "↔";
    default: return card.value;
  }
}

// Можно ли сыграть карту в текущей ситуации.
// game: { currentColor, topValue, pendingDraw, pendingType }
export function canPlay(card, game) {
  // Есть накопленный штраф (+2/+4) — разрешено только «перебить» той же картой
  if (game.pendingDraw > 0) {
    if (game.pendingType === "draw2") return card.value === "draw2";
    if (game.pendingType === "wild4") return card.value === "wild4";
    return false;
  }
  // Дикие карты (в т.ч. «Обмен руками») можно класть всегда
  if (isWild(card)) return true;
  // Совпадение по цвету
  if (card.color === game.currentColor) return true;
  // Совпадение по значению/типу (например, skip на skip другого цвета)
  if (card.value === game.topValue) return true;
  return false;
}

// Есть ли у игрока хотя бы один допустимый ход
export function hasPlayableCard(hand, game) {
  return hand.some((card) => canPlay(card, game));
}
