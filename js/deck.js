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

// Создание стандартной колоды из 108 карт
export function createDeck() {
  const deck = [];
  let n = 0;
  const add = (color, value) => deck.push({ id: `c${n++}`, color, value });

  for (const color of COLORS) {
    add(color, "0"); // по одному нулю
    for (let v = 1; v <= 9; v++) { add(color, String(v)); add(color, String(v)); }
    for (const special of ["skip", "reverse", "draw2"]) { add(color, special); add(color, special); }
  }
  for (let i = 0; i < 4; i++) { add("wild", "wild"); add("wild", "wild4"); }

  return shuffle(deck);
}

export function isWild(card) {
  return card.value === "wild" || card.value === "wild4";
}

export function isDrawCard(card) {
  return card.value === "draw2" || card.value === "wild4";
}

// Стоимость карты в очках (классический подсчёт UNO)
export function cardPoints(card) {
  if (card.value === "wild" || card.value === "wild4") return 50;
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
  // Дикие карты можно класть всегда
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
