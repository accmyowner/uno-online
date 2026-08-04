/**
 * rules.js
 * Чистые правила UNO. Никакого состояния, никаких сайд-эффектов.
 * Все функции получают данные и возвращают результат.
 */

import { CARD_TYPE, WILD_COLOR } from './constants.js';

/** Карта является дикой (цвет выбирает игрок)? */
export function isWildCard(card) {
  return (
    card.type === CARD_TYPE.WILD ||
    card.type === CARD_TYPE.WILD_DRAW_FOUR ||
    card.type === CARD_TYPE.SWAP_HANDS
  );
}

/**
 * Можно ли положить `card` на верхнюю карту сброса.
 * @param {object} card       карта из руки
 * @param {object} topCard    верхняя карта сброса
 * @param {string} activeColor текущий активный цвет (для wild после выбора)
 */
export function canPlay(card, topCard, activeColor) {
  // Дикие карты можно класть всегда.
  if (isWildCard(card)) return true;

  // Совпадение по цвету.
  if (card.color === activeColor) return true;

  // Совпадение по значению (только цифры одинакового номинала).
  if (
    card.type === CARD_TYPE.NUMBER &&
    topCard.type === CARD_TYPE.NUMBER &&
    card.value === topCard.value
  ) {
    return true;
  }

  // Совпадение по типу спец-карты (skip на skip, reverse на reverse, +2 на +2).
  if (
    card.type === topCard.type &&
    card.type !== CARD_TYPE.NUMBER
  ) {
    return true;
  }

  return false;
}

/** Есть ли в руке хотя бы одна карта, которую можно сыграть. */
export function hasPlayableCard(hand, topCard, activeColor) {
  return hand.some((c) => canPlay(c, topCard, activeColor));
}

/**
 * Индекс следующего игрока.
 * @param {number} current   текущий индекс
 * @param {number} count     число игроков
 * @param {number} direction 1 или -1
 * @param {number} step      на сколько мест сдвинуться (1 обычно, 2 для skip)
 */
export function nextIndex(current, count, direction, step = 1) {
  // Приводим к диапазону [0, count) даже при отрицательных значениях.
  return ((current + direction * step) % count + count) % count;
}

/** Сколько карт заставляет взять данная карта (для +2 / +4), иначе 0. */
export function drawAmount(card) {
  if (card.type === CARD_TYPE.DRAW_TWO) return 2;
  if (card.type === CARD_TYPE.WILD_DRAW_FOUR) return 4;
  return 0;
}
