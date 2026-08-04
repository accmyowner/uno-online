/**
 * rng.js
 * Детерминированный генератор псевдослучайных чисел (mulberry32)
 * и связанные с ним чистые функции (перемешивание, id).
 *
 * Почему детерминированный: колода тасуется по seed, который хранится
 * в состоянии игры. Любой клиент, применяя одну и ту же последовательность
 * ходов к одному и тому же seed, получит идентичную колоду. Это исключает
 * расхождение состояний между игроками.
 */

/** Создаёт функцию-генератор из числового seed. Возвращает числа [0,1). */
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемешивание Фишера–Йетса. Не мутирует вход, возвращает новый массив. */
export function shuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Короткий случайный seed на основе времени и Math.random (для старта партии). */
export function makeSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
