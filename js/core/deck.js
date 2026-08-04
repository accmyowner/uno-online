/**
 * deck.js
 * Построение колоды и создание отдельных карт. Чистые функции.
 *
 * Формат карты: { id, color, type, value }
 *  - color: один из COLORS или WILD_COLOR
 *  - type:  один из CARD_TYPE
 *  - value: число 0..9 только для CARD_TYPE.NUMBER, иначе null
 *
 * id уникален в пределах колоды — по нему UI отслеживает конкретную карту.
 */

import {
  COLORS,
  WILD_COLOR,
  CARD_TYPE,
  COLORED_ACTIONS,
  SPECIAL_DENSITY,
} from './constants.js';

/**
 * id карты детерминирован: он равен порядковому номеру карты в колоде.
 * Благодаря этому две колоды, построенные с одинаковыми параметрами,
 * полностью идентичны (важно для воспроизводимости и тестов).
 */
function card(seq, color, type, value = null) {
  return { id: `c${seq}`, color, type, value };
}

/**
 * Строит полную колоду.
 * Обычные цифровые карты всегда классические:
 *   по одной "0" и по две "1..9" каждого цвета.
 * Количество спец-карт масштабируется пресетом плотности.
 *
 * @param {object} options
 * @param {string} options.density  ключ из SPECIAL_DENSITY
 * @param {boolean} options.useSwapCard  включать ли карты "Обмен руками"
 */
export function buildDeck({ density = 'normal', useSwapCard = false } = {}) {
  const preset = SPECIAL_DENSITY[density] || SPECIAL_DENSITY.normal;
  const deck = [];
  let seq = 0;
  const add = (color, type, value = null) => deck.push(card(seq++, color, type, value));

  for (const color of COLORS) {
    // Цифры: одна "0", по две "1".."9" — это неизменяемая классика.
    add(color, CARD_TYPE.NUMBER, 0);
    for (let n = 1; n <= 9; n++) {
      add(color, CARD_TYPE.NUMBER, n);
      add(color, CARD_TYPE.NUMBER, n);
    }
    // Цветные спец-карты: количество зависит от плотности.
    for (const type of COLORED_ACTIONS) {
      for (let i = 0; i < preset.colored; i++) add(color, type);
    }
  }

  // Wild и Wild+4.
  for (let i = 0; i < preset.wild; i++) {
    add(WILD_COLOR, CARD_TYPE.WILD);
    add(WILD_COLOR, CARD_TYPE.WILD_DRAW_FOUR);
  }

  // Опциональная карта "Обмен руками".
  if (useSwapCard) {
    for (let i = 0; i < preset.swap; i++) add(WILD_COLOR, CARD_TYPE.SWAP_HANDS);
  }

  return deck;
}
