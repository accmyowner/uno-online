/**
 * constants.js
 * Единый источник правды для всех неизменяемых значений игры.
 * Никакой логики — только данные. Импортируется всеми остальными модулями.
 */

// Цвета обычных карт.
export const COLORS = Object.freeze(['red', 'yellow', 'green', 'blue']);

// Служебный "цвет" для карт Wild / +4 до выбора цвета.
export const WILD_COLOR = 'wild';

// Типы карт.
export const CARD_TYPE = Object.freeze({
  NUMBER: 'number',   // value: 0..9
  SKIP: 'skip',
  REVERSE: 'reverse',
  DRAW_TWO: 'draw2',
  WILD: 'wild',
  WILD_DRAW_FOUR: 'wild4',
  SWAP_HANDS: 'swap',  // опциональная карта "Обмен руками"
});

// Множество цветных спец-карт (не Wild). Нужно для генерации колоды.
export const COLORED_ACTIONS = Object.freeze([
  CARD_TYPE.SKIP,
  CARD_TYPE.REVERSE,
  CARD_TYPE.DRAW_TWO,
]);

// Пресеты "вероятности спец-карт". Множитель на количество цветных
// спец-карт и wild-карт. Обычные цифровые карты НЕ меняются.
export const SPECIAL_DENSITY = Object.freeze({
  small:   { label: 'Маленькая', colored: 1, wild: 2, swap: 1 },
  medium:  { label: 'Средняя',   colored: 1, wild: 3, swap: 1 },
  normal:  { label: 'Обычная',   colored: 2, wild: 4, swap: 2 }, // = классическое UNO
  large:   { label: 'Большая',   colored: 4, wild: 8, swap: 4 },
});

// Значения по умолчанию для настроек комнаты.
export const ROOM_DEFAULTS = Object.freeze({
  maxPlayers: 4,
  turnTimer: 30,          // секунд на ход
  useSwapCard: false,
  specialDensity: 'normal',
});

// Границы настроек.
export const LIMITS = Object.freeze({
  minPlayers: 2,
  maxPlayers: 10,
  minTimer: 10,
  maxTimer: 120,
  startingHand: 7,
  unoPenalty: 2,          // штраф за незамеченное UNO
});

// Статусы комнаты.
export const ROOM_STATUS = Object.freeze({
  LOBBY: 'lobby',
  PLAYING: 'playing',
  FINISHED: 'finished',
});
