/**
 * Локальные тесты движка. Запуск: node test-engine.mjs
 * Не входит в поставку игры — используется только для проверки логики.
 */
import { createGame, applyAction, topCard } from './js/core/game-engine.js';
import { buildDeck } from './js/core/deck.js';
import { canPlay } from './js/core/rules.js';
import { CARD_TYPE, SPECIAL_DENSITY } from './js/core/constants.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}
function section(name) { console.log('\n=== ' + name + ' ==='); }

const P2 = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
const P4 = [
  { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
  { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
];

/* ---------- Колода ---------- */
section('Deck');
{
  const d = buildDeck({ density: 'normal', useSwapCard: false });
  // 4 цвета: (1 нуль + 18 единиц..девяток) = 19 цифр * 4 = 76
  const numbers = d.filter((c) => c.type === CARD_TYPE.NUMBER).length;
  assert(numbers === 76, `цифровых карт должно быть 76, а не ${numbers}`);
  const wild = d.filter((c) => c.type === CARD_TYPE.WILD).length;
  assert(wild === SPECIAL_DENSITY.normal.wild, 'кол-во wild по пресету');
  const swaps = d.filter((c) => c.type === CARD_TYPE.SWAP_HANDS).length;
  assert(swaps === 0, 'без useSwapCard карт обмена нет');

  const dSwap = buildDeck({ density: 'normal', useSwapCard: true });
  const swaps2 = dSwap.filter((c) => c.type === CARD_TYPE.SWAP_HANDS).length;
  assert(swaps2 === SPECIAL_DENSITY.normal.swap, 'карты обмена добавились');

  // Плотность не меняет обычные цифры.
  const dLarge = buildDeck({ density: 'large' });
  const numbersLarge = dLarge.filter((c) => c.type === CARD_TYPE.NUMBER).length;
  assert(numbersLarge === 76, 'цифры не зависят от плотности');
  const coloredNormal = buildDeck({ density: 'normal' }).filter(
    (c) => c.type === CARD_TYPE.SKIP
  ).length;
  const coloredLarge = dLarge.filter((c) => c.type === CARD_TYPE.SKIP).length;
  assert(coloredLarge > coloredNormal, 'спец-карт больше при large');
}

/* ---------- Старт партии ---------- */
section('createGame');
{
  const g = createGame(P4, { seed: 123, density: 'normal' });
  assert(g.players.length === 4, '4 игрока');
  for (const p of P4) assert(g.hands[p.id].length === 7, `${p.id} имеет 7 карт`);
  assert(topCard(g).type === CARD_TYPE.NUMBER, 'верхняя карта — цифра');
  assert(g.currentIndex === 0, 'ход у первого');
  assert(g.status === 'playing', 'статус playing');

  // Детерминизм: тот же seed -> те же руки.
  const g2 = createGame(P4, { seed: 123, density: 'normal' });
  assert(
    JSON.stringify(g.hands.a) === JSON.stringify(g2.hands.a),
    'один seed даёт одинаковую раздачу'
  );
  const g3 = createGame(P4, { seed: 999, density: 'normal' });
  assert(
    JSON.stringify(g.hands.a) !== JSON.stringify(g3.hands.a),
    'разный seed даёт разную раздачу'
  );
}

/* ---------- Валидация хода ---------- */
section('Validation');
{
  const g = createGame(P2, { seed: 5 });
  // Ходит 'a'. 'b' пытается ходить — отказ.
  const r1 = applyAction(g, { type: 'PLAY', playerId: 'b', cardId: g.hands.b[0].id });
  assert(!r1.ok, 'нельзя ходить не в свою очередь');

  // Игра несуществующей картой.
  const r2 = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'zzz' });
  assert(!r2.ok, 'нельзя сыграть несуществующую карту');

  // Нельзя пасовать без добора.
  const r3 = applyAction(g, { type: 'PASS', playerId: 'a' });
  assert(!r3.ok, 'нельзя пасовать не взяв карту');
}

/* ---------- Ход цифрой ---------- */
section('Play number card');
{
  // Собираем контролируемое состояние.
  let g = createGame(P2, { seed: 7 });
  const top = topCard(g);
  // Дать 'a' карту, которую точно можно сыграть (тот же цвет).
  const playable = { id: 'x1', color: top.color, type: CARD_TYPE.NUMBER, value: 5 };
  g.hands.a = [playable, { id: 'x2', color: 'red', type: CARD_TYPE.NUMBER, value: 1 }];
  const before = g.hands.a.length;
  const r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'x1' });
  assert(r.ok, 'валидный ход принят');
  assert(r.state.hands.a.length === before - 1, 'карта ушла из руки');
  assert(topCard(r.state).id === 'x1', 'карта легла в сброс');
  assert(r.state.currentIndex === 1, 'ход перешёл к сопернику');
  // Исходное состояние не мутировано.
  assert(g.hands.a.length === before, 'applyAction не мутирует вход');
}

/* ---------- Reverse при 2 игроках = Skip ---------- */
section('Reverse (2p) acts as Skip');
{
  let g = createGame(P2, { seed: 11 });
  const top = topCard(g);
  const rev = { id: 'rv', color: top.color, type: CARD_TYPE.REVERSE, value: null };
  g.hands.a = [rev, { id: 'k', color: 'blue', type: CARD_TYPE.NUMBER, value: 3 }];
  const r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'rv' });
  assert(r.ok, 'reverse сыгран');
  assert(r.state.currentIndex === 0, 'при 2 игроках reverse оставляет ход у себя');
}

/* ---------- Skip ---------- */
section('Skip (4p)');
{
  let g = createGame(P4, { seed: 21 });
  const top = topCard(g);
  const skip = { id: 'sk', color: top.color, type: CARD_TYPE.SKIP, value: null };
  g.hands.a = [skip, { id: 'z', color: 'red', type: CARD_TYPE.NUMBER, value: 2 }];
  const r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'sk' });
  assert(r.state.currentIndex === 2, 'skip пропускает игрока b, ход у c');
}

/* ---------- +2 ---------- */
section('Draw Two');
{
  let g = createGame(P4, { seed: 31 });
  const top = topCard(g);
  const d2 = { id: 'd2', color: top.color, type: CARD_TYPE.DRAW_TWO, value: null };
  g.hands.a = [d2, { id: 'z', color: 'green', type: CARD_TYPE.NUMBER, value: 2 }];
  const bBefore = g.hands.b.length;
  const r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'd2' });
  assert(r.state.hands.b.length === bBefore + 2, 'сосед взял 2 карты');
  assert(r.state.currentIndex === 2, '+2 пропускает соседа');
}

/* ---------- Wild + выбор цвета ---------- */
section('Wild');
{
  let g = createGame(P2, { seed: 41 });
  const wild = { id: 'w', color: 'wild', type: CARD_TYPE.WILD, value: null };
  g.hands.a = [wild, { id: 'z', color: 'red', type: CARD_TYPE.NUMBER, value: 2 }];
  const rNoColor = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'w' });
  assert(!rNoColor.ok, 'wild без цвета отклоняется');
  const r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'w', chosenColor: 'green' });
  assert(r.ok && r.state.activeColor === 'green', 'wild задаёт активный цвет');
}

/* ---------- Обмен руками ---------- */
section('Swap hands');
{
  let g = createGame(P2, { seed: 51, useSwapCard: true });
  const swap = { id: 'sw', color: 'wild', type: CARD_TYPE.SWAP_HANDS, value: null };
  g.hands.a = [swap, { id: 'a2', color: 'red', type: CARD_TYPE.NUMBER, value: 1 },
               { id: 'a3', color: 'red', type: CARD_TYPE.NUMBER, value: 2 }];
  g.hands.b = [{ id: 'b1', color: 'blue', type: CARD_TYPE.NUMBER, value: 9 }];
  const r = applyAction(g, {
    type: 'PLAY', playerId: 'a', cardId: 'sw', chosenColor: 'blue', swapTargetId: 'b',
  });
  assert(r.ok, 'обмен принят');
  // У 'a' было 2 карты после снятия swap, у 'b' — 1. После обмена меняются местами.
  assert(r.state.hands.a.length === 1, 'a получил руку b');
  assert(r.state.hands.b.length === 2, 'b получил руку a');
  assert(r.state.hands.a[0].id === 'b1', 'карты действительно обменялись');
}

/* ---------- Победа ---------- */
section('Win');
{
  let g = createGame(P2, { seed: 61 });
  const top = topCard(g);
  const last = { id: 'last', color: top.color, type: CARD_TYPE.NUMBER, value: 4 };
  g.hands.a = [last];
  const r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'last' });
  assert(r.state.status === 'finished', 'партия завершена');
  assert(r.state.winner === 'a', 'победитель определён');
  // После завершения действия не принимаются.
  const r2 = applyAction(r.state, { type: 'DRAW', playerId: 'b' });
  assert(!r2.ok, 'после победы ходы отклоняются');
}

/* ---------- UNO: объявление и поимка ---------- */
section('UNO call & catch');
{
  let g = createGame(P4, { seed: 71 });
  const top = topCard(g);
  // 'a' сыграет и останется с 1 картой.
  g.hands.a = [
    { id: 'p1', color: top.color, type: CARD_TYPE.NUMBER, value: 3 },
    { id: 'p2', color: 'red', type: CARD_TYPE.NUMBER, value: 8 },
  ];
  let r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'p1' });
  assert(r.state.hands.a.length === 1, 'у a осталась 1 карта');
  assert(r.state.unoState && r.state.unoState.playerId === 'a' && !r.state.unoState.safe,
    'a под угрозой UNO');

  // Поимка соседом.
  const aBefore = r.state.hands.a.length;
  const caught = applyAction(r.state, { type: 'CATCH_UNO', playerId: 'b', targetId: 'a' });
  assert(caught.ok, 'поимка сработала');
  assert(caught.state.hands.a.length === aBefore + 2, 'штраф +2 применён');
  assert(caught.state.unoState === null, 'окно UNO закрылось');

  // Повторная поимка не даёт двойного штрафа.
  const doubleCatch = applyAction(caught.state, { type: 'CATCH_UNO', playerId: 'c', targetId: 'a' });
  assert(!doubleCatch.ok, 'второй раз поймать нельзя (нет двойного штрафа)');
}

section('UNO safe call prevents catch');
{
  let g = createGame(P4, { seed: 72 });
  const top = topCard(g);
  g.hands.a = [
    { id: 'p1', color: top.color, type: CARD_TYPE.NUMBER, value: 3 },
    { id: 'p2', color: 'red', type: CARD_TYPE.NUMBER, value: 8 },
  ];
  let r = applyAction(g, { type: 'PLAY', playerId: 'a', cardId: 'p1' });
  // 'a' успел объявить UNO.
  const called = applyAction(r.state, { type: 'CALL_UNO', playerId: 'a' });
  assert(called.ok && called.state.unoState.safe, 'a в безопасности');
  const tryCatch = applyAction(called.state, { type: 'CATCH_UNO', playerId: 'b', targetId: 'a' });
  assert(!tryCatch.ok, 'безопасного игрока поймать нельзя');
}

/* ---------- Добор и пас ---------- */
section('Draw & Pass');
{
  let g = createGame(P2, { seed: 81 });
  // Гарантируем, что у 'a' нет ходов: делаем сброс синим 7, а руку — красными фигурами
  g.discardPile = [{ id: 'top', color: 'blue', type: CARD_TYPE.NUMBER, value: 7 }];
  g.activeColor = 'blue';
  g.hands.a = [
    { id: 'r1', color: 'red', type: CARD_TYPE.NUMBER, value: 1 },
    { id: 'r2', color: 'green', type: CARD_TYPE.NUMBER, value: 2 },
  ];
  // Кладём наверх колоды заведомо неиграбельную карту.
  g.drawPile.push({ id: 'dr', color: 'yellow', type: CARD_TYPE.NUMBER, value: 0 });
  const r = applyAction(g, { type: 'DRAW', playerId: 'a' });
  assert(r.ok, 'добор выполнен');
  assert(r.state.hands.a.length === 3, 'в руке стало на 1 больше');
  // Взятая карта неиграбельна -> ход автоматически перешёл.
  assert(r.state.currentIndex === 1, 'после неиграбельного добора ход перешёл');
}

/* ---------- Тайм-аут ---------- */
section('Timeout');
{
  let g = createGame(P2, { seed: 91 });
  const aBefore = g.hands.a.length;
  const r = applyAction(g, { type: 'TIMEOUT', playerId: 'a' });
  assert(r.ok, 'тайм-аут обработан');
  assert(r.state.hands.a.length === aBefore + 1, 'по тайм-ауту взята 1 карта');
  assert(r.state.currentIndex === 1, 'ход перешёл дальше');
}

/* ---------- Стресс: длинная случайная партия без сбоев ---------- */
section('Stress: full random game');
{
  function randomGame(seed) {
    let g = createGame(P4, { seed, density: 'large', useSwapCard: true, turnTimer: 30 });
    const rnd = (() => { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    let guard = 0;
    while (g.status === 'playing' && guard < 5000) {
      guard++;
      const cur = g.players[g.currentIndex].id;
      const hand = g.hands[cur];
      const top = topCard(g);
      // Ищем играбельную карту.
      const idx = hand.findIndex((c) => canPlay(c, top, g.activeColor));
      let action;
      if (idx !== -1) {
        const c = hand[idx];
        action = { type: 'PLAY', playerId: cur, cardId: c.id };
        if (c.color === 'wild') action.chosenColor = ['red', 'green', 'blue', 'yellow'][Math.floor(rnd() * 4)];
        if (c.type === CARD_TYPE.SWAP_HANDS) {
          const others = g.players.filter((p) => p.id !== cur);
          action.swapTargetId = others[Math.floor(rnd() * others.length)].id;
        }
      } else if (!g.drawnThisTurn) {
        action = { type: 'DRAW', playerId: cur };
      } else {
        action = { type: 'PASS', playerId: cur };
      }
      const r = applyAction(g, action);
      if (!r.ok) {
        // Если ход отклонён (например, после добора появилась играбельная и надо PLAY), пробуем пас/добор.
        if (!g.drawnThisTurn) {
          const rd = applyAction(g, { type: 'DRAW', playerId: cur });
          if (rd.ok) { g = rd.state; continue; }
        }
        const rp = applyAction(g, { type: 'PASS', playerId: cur });
        if (rp.ok) { g = rp.state; continue; }
        console.error('  застряли:', r.error);
        break;
      }
      g = r.state;
      // Инвариант: суммарное число карт постоянно и неотрицательно.
      const total = Object.values(g.hands).reduce((s, h) => s + h.length, 0)
        + g.drawPile.length + g.discardPile.length;
      if (total !== g._deckSize) {
        if (g._deckSize === undefined) g._deckSize = total;
        else assert(false, `нарушен баланс карт: ${total} != ${g._deckSize}`);
      }
    }
    return { g, guard };
  }

  let finishedCount = 0;
  for (let s = 1; s <= 40; s++) {
    const { g, guard } = randomGame(s * 17 + 3);
    assert(guard < 5000, `партия seed=${s} не зациклилась`);
    if (g.status === 'finished') {
      finishedCount++;
      assert(g.hands[g.winner].length === 0, 'у победителя 0 карт');
    }
  }
  assert(finishedCount >= 30, `большинство партий завершились победой (${finishedCount}/40)`);
  console.log(`  завершились победой: ${finishedCount}/40`);
}

/* ---------- Итог ---------- */
console.log('\n----------------------------------------');
console.log(`Пройдено: ${passed}, Провалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
