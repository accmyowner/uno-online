/**
 * card.js
 * Построение DOM-элемента карты. Внешний вид задаётся в css/cards.css.
 */
import { el } from '../utils/dom.js';
import { CARD_TYPE } from '../core/constants.js';

/** Текстовый глиф центра карты по её типу. */
export function cardGlyph(card) {
  switch (card.type) {
    case CARD_TYPE.NUMBER: return String(card.value);
    case CARD_TYPE.SKIP: return '\u2298';        // ⊘
    case CARD_TYPE.REVERSE: return '\u21C4';     // ⇄
    case CARD_TYPE.DRAW_TWO: return '+2';
    case CARD_TYPE.WILD: return '\u2726';        // ✦
    case CARD_TYPE.WILD_DRAW_FOUR: return '+4';
    case CARD_TYPE.SWAP_HANDS: return '\u21C6';  // ⇆
    default: return '?';
  }
}

/** Мелкий глиф в углах карты. */
function cornerGlyph(card) {
  if (card.type === CARD_TYPE.NUMBER) return String(card.value);
  if (card.type === CARD_TYPE.DRAW_TWO) return '+2';
  if (card.type === CARD_TYPE.WILD_DRAW_FOUR) return '+4';
  return cardGlyph(card);
}

/**
 * Создаёт элемент лицевой стороны карты.
 * @param {object} card
 * @param {object} [opts] { small:boolean } — упрощённая версия для оппонентов
 */
export function createCardFace(card, opts = {}) {
  const isWild = card.color === 'wild';
  const node = el('div', {
    className: `card card--${card.color} card--${card.type}${isWild ? ' card--wild' : ''}`,
    dataset: { cardId: card.id },
  });

  node.append(
    el('span', { className: 'card__corner card__corner--tl', text: cornerGlyph(card) }),
    el('div', { className: 'card__oval' }, [
      el('span', { className: 'card__glyph', text: cardGlyph(card) }),
    ]),
    el('span', { className: 'card__corner card__corner--br', text: cornerGlyph(card) })
  );
  return node;
}

/** Создаёт элемент рубашки карты (для чужих рук и колоды добора). */
export function createCardBack() {
  return el('div', { className: 'card card--back' }, [
    el('div', { className: 'card__oval card__oval--back' }, [
      el('span', { className: 'card__logo', text: 'UNO' }),
    ]),
  ]);
}
