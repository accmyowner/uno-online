/**
 * hand-layout.js
 * Чистая геометрия раскладки карт в руке. Никакого DOM.
 *
 * Задача: разместить N карт в контейнере шириной W так, чтобы:
 *  - ничего не выходило за пределы контейнера;
 *  - карты равномерно накладывались (веер), уменьшая шаг при росте N;
 *  - при крайней тесноте уменьшался и размер карты;
 *  - раскладка выглядела аккуратно при 1, 10, 20, 30, 40+ картах.
 *
 * Возвращает размеры карты и массив трансформаций для каждой карты.
 */

const RATIO = 1.5; // высота/ширина карты

/**
 * @param {number} width      доступная ширина контейнера, px
 * @param {number} count      число карт
 * @param {object} [opts]
 * @param {number} opts.maxCardW  максимальная ширина карты, px
 * @param {number} opts.minCardW  минимальная ширина карты, px
 * @returns {{ cardW:number, cardH:number, cards:Array<{x:number,y:number,rot:number}> }}
 */
export function layoutHand(width, count, opts = {}) {
  const maxCardW = opts.maxCardW ?? 96;
  const minCardW = opts.minCardW ?? 40;
  // Резерв по краям, чтобы наклон крайних карт не вылезал за контейнер.
  const pad = 8;
  const W = Math.max(0, width - pad * 2);

  if (count <= 0) return { cardW: maxCardW, cardH: maxCardW * RATIO, cards: [] };

  const COMFORT_OVERLAP = 0.55; // видимая доля каждой карты при просторе
  const MIN_OVERLAP = 0.16;     // минимальная видимая «полоска» карты

  if (count === 1) {
    const cardW = maxCardW;
    return {
      cardW,
      cardH: cardW * RATIO,
      cards: [{ x: (width - cardW) / 2, y: 0, rot: 0 }],
    };
  }

  // 1) Пытаемся показать карты максимального размера.
  let cardW = maxCardW;
  let step = cardW * COMFORT_OVERLAP;

  // Если при комфортном шаге всё влезает — отлично.
  if (cardW + step * (count - 1) > W) {
    // 2) Сжимаем шаг при том же размере карты.
    step = (W - cardW) / (count - 1);
    const minStep = cardW * MIN_OVERLAP;
    if (step < minStep) {
      // 3) Даже минимальный шаг не помещается — уменьшаем карту.
      //    Нужно: cardW + cardW*MIN_OVERLAP*(count-1) <= W
      cardW = W / (1 + MIN_OVERLAP * (count - 1));
      cardW = Math.max(minCardW, Math.min(maxCardW, cardW));
      step = cardW * MIN_OVERLAP;
    }
  }

  // Финальная гарантия: раскладка обязана поместиться при любом N.
  // Если из-за минимального размера карты шаг всё же переполняет —
  // подгоняем шаг точно под ширину (карта останется читаемой полоской).
  if (cardW + step * (count - 1) > W) {
    if (cardW > W) cardW = W;
    step = (W - cardW) / (count - 1);
    if (step < 0) step = 0;
  }

  const cardH = cardW * RATIO;

  // Итоговая ширина раскладки и центрирование.
  const totalW = cardW + step * (count - 1);
  const startX = pad + Math.max(0, (W - totalW) / 2);

  // Лёгкий веер: угол уменьшается с ростом числа карт, чтобы не вылезать.
  const maxFan = 10;                     // максимальный угол крайней карты, °
  const fan = Math.max(0, maxFan - count * 0.35);
  const mid = (count - 1) / 2;
  const arcLift = Math.min(18, cardH * 0.14); // подъём центра дуги

  const cards = [];
  for (let i = 0; i < count; i++) {
    const t = mid === 0 ? 0 : (i - mid) / mid; // -1..1
    const rot = t * fan;
    const y = Math.abs(t) * arcLift; // края чуть ниже, центр выше
    cards.push({ x: startX + step * i, y, rot });
  }

  return { cardW, cardH, cards };
}
