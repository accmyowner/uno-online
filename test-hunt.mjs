/**
 * test-hunt.mjs — охота за багами: инварианты + краевые случаи.
 * Запуск: node test-hunt.mjs
 */
import { createGame, applyAction, topCard } from './js/core/game-engine.js';
import { buildDeck } from './js/core/deck.js';
import { canPlay, isWildCard } from './js/core/rules.js';
import { CARD_TYPE, SPECIAL_DENSITY, COLORS } from './js/core/constants.js';

let passed = 0, failed = 0;
const fails = [];
function assert(cond, msg) { if (cond) passed++; else { failed++; fails.push(msg); console.error('  ✗', msg); } }
function section(n) { console.log('\n=== ' + n + ' ==='); }

/* ---------- Хелперы инвариантов ---------- */
function allCards(state) {
  const cards = [...state.drawPile, ...state.discardPile];
  for (const id in state.hands) cards.push(...state.hands[id]);
  return cards;
}
function checkInvariants(state, expectedTotal, label) {
  const cards = allCards(state);
  if (cards.length !== expectedTotal) {
    assert(false, `${label}: карт ${cards.length}, ожидалось ${expectedTotal}`);
    return false;
  }
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== cards.length) {
    assert(false, `${label}: дубликаты id (уникальных ${ids.size} из ${cards.length})`);
    return false;
  }
  if (state.discardPile.length < 1) { assert(false, `${label}: пустой сброс`); return false; }
  return true;
}
function deckSize(density, useSwap) {
  return buildDeck({ density, useSwapCard: useSwap }).length;
}

/* ---------- Политика бота для случайной игры ---------- */
function botAction(state) {
  const me = state.players[state.currentIndex].id;
  const hand = state.hands[me];
  const top = topCard(state);
  const playable = hand.filter((c) => canPlay(c, top, state.activeColor));
  if (playable.length && !state.drawnThisTurn) {
    // Иногда берём карту вместо игры — для разнообразия.
    if (Math.random() < 0.15) return { type: 'DRAW', playerId: me };
  }
  if (playable.length) {
    const card = playable[Math.floor(Math.random() * playable.length)];
    const action = { type: 'PLAY', playerId: me, cardId: card.id };
    if (isWildCard(card)) action.chosenColor = COLORS[Math.floor(Math.random() * 4)];
    if (card.type === CARD_TYPE.SWAP_HANDS) {
      const others = state.players.filter((p) => p.id !== me);
      action.swapTargetId = others[Math.floor(Math.random() * others.length)].id;
    }
    return action;
  }
  if (!state.drawnThisTurn) return { type: 'DRAW', playerId: me };
  return { type: 'PASS', playerId: me };
}

/* ---------- 1. Инварианты на множестве случайных партий ---------- */
section('Инварианты: случайные партии во всех конфигурациях');
{
  let games = 0, wins = 0, invariantOk = true, versionOk = true, maxTurns = 0;
  const configs = [];
  for (const n of [2, 3, 4, 6, 10]) {
    for (const density of Object.keys(SPECIAL_DENSITY)) {
      for (const useSwap of [false, true]) configs.push({ n, density, useSwap });
    }
  }
  for (const cfg of configs) {
    for (let rep = 0; rep < 4; rep++) {
      const players = Array.from({ length: cfg.n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
      const total = deckSize(cfg.density, cfg.useSwap);
      let state = createGame(players, {
        seed: (games * 7919 + rep * 104729) >>> 0,
        density: cfg.density,
        useSwapCard: cfg.useSwap,
      });
      games++;
      if (!checkInvariants(state, total, 'start')) { invariantOk = false; }
      let prevVersion = state.version;
      let turns = 0;
      const cap = 4000;
      while (state.status === 'playing' && turns < cap) {
        turns++;
        // Иногда пытаемся объявить/поймать UNO, чтобы задеть эти ветки.
        if (state.unoState && !state.unoState.safe) {
          if (Math.random() < 0.5) {
            const r = applyAction(state, { type: 'CALL_UNO', playerId: state.unoState.playerId });
            if (r.ok) state = r.state;
          } else {
            const catcher = state.players.find((p) => p.id !== state.unoState.playerId);
            const r = applyAction(state, { type: 'CATCH_UNO', playerId: catcher.id, targetId: state.unoState.playerId });
            if (r.ok) state = r.state;
          }
          if (!checkInvariants(state, total, 'uno-branch')) invariantOk = false;
        }
        const action = botAction(state);
        const res = applyAction(state, action);
        if (!res.ok) {
          // Бот сформировал только валидные действия — провал означает баг.
          assert(false, `валидное действие отклонено: ${JSON.stringify(action)} -> ${res.error}`);
          break;
        }
        state = res.state;
        if (state.version <= prevVersion) versionOk = false;
        prevVersion = state.version;
        if (!checkInvariants(state, total, `turn ${turns} (${cfg.n}p ${cfg.density})`)) {
          invariantOk = false; break;
        }
      }
      maxTurns = Math.max(maxTurns, turns);
      if (state.status === 'finished') {
        wins++;
        assert(state.winner != null, 'у завершённой партии есть победитель');
        assert(state.hands[state.winner].length === 0, 'у победителя 0 карт');
      } else {
        assert(turns < cap, `партия не завершилась за ${cap} ходов (возможно зацикливание): ${JSON.stringify(cfg)}`);
      }
    }
  }
  console.log(`  партий: ${games}, завершено победой: ${wins}, макс. ходов: ${maxTurns}`);
  assert(invariantOk, 'инварианты (кол-во карт, уникальность id) сохраняются всегда');
  assert(versionOk, 'version строго возрастает при каждом успешном действии');
  assert(wins === games, `все партии должны завершаться (${wins}/${games})`);
}

/* ---------- 2. Помощник: собрать состояние вручную ---------- */
function makeState(overrides) {
  const players = overrides.players || [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const base = createGame(players, { seed: 1, density: 'normal' });
  return Object.assign(base, overrides);
}
function C(id, color, type, value = null) { return { id, color, type, value }; }

/* ---------- 3. Reshuffle сброса ---------- */
section('Reshuffle: пустая колода добора пополняется из сброса');
{
  const state = makeState({
    hands: { a: [C('x', 'red', CARD_TYPE.NUMBER, 5)], b: [C('y', 'blue', CARD_TYPE.NUMBER, 9)] },
    drawPile: [],
    discardPile: [
      C('d1', 'green', CARD_TYPE.NUMBER, 1),
      C('d2', 'yellow', CARD_TYPE.NUMBER, 2),
      C('d3', 'red', CARD_TYPE.NUMBER, 3), // top
    ],
    activeColor: 'red',
    currentIndex: 0,
    drawnThisTurn: false,
  });
  const total = allCards(state).length;
  // Игрок a не может сыграть 5 (top красная 3, активный красный -> 5 красная играбельна!) 
  // Возьмём вместо этого DRAW, чтобы форсировать reshuffle.
  const res = applyAction(state, { type: 'DRAW', playerId: 'a' });
  assert(res.ok, 'DRAW при пустой колоде проходит: ' + res.error);
  assert(checkInvariants(res.state, total, 'после reshuffle'), 'карты сохранены при reshuffle');
  assert(res.state.reshuffleCount === 1, 'счётчик перетасовок увеличился');
  assert(res.state.discardPile.length === 1, 'после reshuffle в сбросе только верхняя карта');
  assert(res.state.hands.a.length === 2, 'игрок получил взятую карту');
  assert(res.state.drawPile.length === total - 4, 'остаток колоды = всего минус руки(3) минус сброс(1)');
}

/* ---------- 4. +2 / +4 как последняя карта = победа, жертва не берёт ---------- */
section('Спец-карта последней картой -> победа без эффекта');
{
  for (const t of [CARD_TYPE.DRAW_TWO, CARD_TYPE.WILD_DRAW_FOUR]) {
    const isWild = t === CARD_TYPE.WILD_DRAW_FOUR;
    const state = makeState({
      hands: {
        a: [C('win', isWild ? 'wild' : 'red', t)],
        b: [C('b1', 'blue', CARD_TYPE.NUMBER, 1), C('b2', 'green', CARD_TYPE.NUMBER, 2)],
      },
      drawPile: [C('dp1', 'red', CARD_TYPE.NUMBER, 7), C('dp2', 'red', CARD_TYPE.NUMBER, 8)],
      discardPile: [C('top', 'red', CARD_TYPE.NUMBER, 3)],
      activeColor: 'red',
      currentIndex: 0,
    });
    const total = allCards(state).length;
    const action = { type: 'PLAY', playerId: 'a', cardId: 'win' };
    if (isWild) action.chosenColor = 'red';
    const res = applyAction(state, action);
    assert(res.ok, `${t}: ход прошёл`);
    assert(res.state.status === 'finished' && res.state.winner === 'a', `${t}: победа игрока a`);
    assert(res.state.hands.b.length === 2, `${t}: жертва НЕ берёт карты при победе соперника`);
    assert(checkInvariants(res.state, total, `${t} win`), `${t}: карты сохранены`);
  }
}

/* ---------- 5. SWAP последней картой = обычная победа без обмена ---------- */
section('SWAP последней картой -> победа, обмен не выполняется');
{
  const state = makeState({
    hands: {
      a: [C('sw', 'wild', CARD_TYPE.SWAP_HANDS)],
      b: [C('b1', 'blue', CARD_TYPE.NUMBER, 1), C('b2', 'green', CARD_TYPE.NUMBER, 2)],
    },
    drawPile: [C('dp1', 'red', CARD_TYPE.NUMBER, 7)],
    discardPile: [C('top', 'red', CARD_TYPE.NUMBER, 3)],
    activeColor: 'red',
    currentIndex: 0,
  });
  const res = applyAction(state, { type: 'PLAY', playerId: 'a', cardId: 'sw', chosenColor: 'blue', swapTargetId: 'b' });
  assert(res.ok, 'SWAP-победа прошла');
  assert(res.state.status === 'finished' && res.state.winner === 'a', 'победа a');
  assert(res.state.hands.b.length === 2, 'обмен НЕ произошёл (у b по-прежнему 2)');
  assert(res.state.hands.a.length === 0, 'у a 0 карт');
}

/* ---------- 6. UNO: call / catch / двойной штраф / self / поздно ---------- */
section('UNO механика');
{
  // Подготовим: a только что сыграл 2-ю с конца карту -> 1 карта, unoState unsafe.
  function threatState() {
    return makeState({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      hands: { a: [C('a1', 'red', CARD_TYPE.NUMBER, 5)], b: [C('b1', 'blue', CARD_TYPE.NUMBER, 1), C('b2', 'blue', CARD_TYPE.NUMBER, 2)], c: [C('c1', 'green', CARD_TYPE.NUMBER, 3), C('c2', 'green', CARD_TYPE.NUMBER, 4)] },
      drawPile: [C('dp1', 'red', CARD_TYPE.NUMBER, 7), C('dp2', 'red', CARD_TYPE.NUMBER, 8), C('dp3', 'red', CARD_TYPE.NUMBER, 9)],
      discardPile: [C('top', 'red', CARD_TYPE.NUMBER, 6)],
      activeColor: 'red',
      currentIndex: 1, // ход b (не важно для call/catch)
      unoState: { playerId: 'a', safe: false },
    });
  }
  // Catch до call: a получает +2.
  {
    const s = threatState(); const total = allCards(s).length;
    const r = applyAction(s, { type: 'CATCH_UNO', playerId: 'b', targetId: 'a' });
    assert(r.ok, 'catch проходит');
    assert(r.state.hands.a.length === 3, 'пойманный берёт +2 (стало 3)');
    assert(r.state.unoState === null, 'окно UNO закрыто');
    assert(checkInvariants(r.state, total, 'после catch'), 'карты сохранены при catch');
    // Второй catch отклоняется (нет двойного штрафа).
    const r2 = applyAction(r.state, { type: 'CATCH_UNO', playerId: 'c', targetId: 'a' });
    assert(!r2.ok, 'повторный catch отклонён (нет двойного штрафа)');
  }
  // Call делает safe, после чего catch невозможен.
  {
    const s = threatState();
    const r = applyAction(s, { type: 'CALL_UNO', playerId: 'a' });
    assert(r.ok && r.state.unoState.safe === true, 'call делает safe');
    const r2 = applyAction(r.state, { type: 'CATCH_UNO', playerId: 'b', targetId: 'a' });
    assert(!r2.ok, 'catch после call отклонён');
    // Повторный call тоже отклонён.
    const r3 = applyAction(r.state, { type: 'CALL_UNO', playerId: 'a' });
    assert(!r3.ok, 'повторный call отклонён');
  }
  // Нельзя поймать самого себя, нельзя ловить не того.
  {
    const s = threatState();
    assert(!applyAction(s, { type: 'CATCH_UNO', playerId: 'a', targetId: 'a' }).ok, 'самоловля запрещена');
    assert(!applyAction(s, { type: 'CATCH_UNO', playerId: 'b', targetId: 'c' }).ok, 'ловить не-угрозу нельзя');
  }
  // Не под угрозой (нет unoState) — call/catch невозможны.
  {
    const s = makeState({ unoState: null });
    assert(!applyAction(s, { type: 'CALL_UNO', playerId: 'a' }).ok, 'call без угрозы нельзя');
    assert(!applyAction(s, { type: 'CATCH_UNO', playerId: 'b', targetId: 'a' }).ok, 'catch без угрозы нельзя');
  }
}

/* ---------- 7. TIMEOUT: уже брал карту -> без повторного добора ---------- */
section('TIMEOUT');
{
  const s = makeState({
    hands: { a: [C('a1', 'red', CARD_TYPE.NUMBER, 5), C('a2', 'blue', CARD_TYPE.NUMBER, 1)], b: [C('b1', 'green', CARD_TYPE.NUMBER, 2)] },
    drawPile: [C('dp1', 'red', CARD_TYPE.NUMBER, 7), C('dp2', 'red', CARD_TYPE.NUMBER, 8)],
    discardPile: [C('top', 'red', CARD_TYPE.NUMBER, 3)],
    activeColor: 'red', currentIndex: 0, drawnThisTurn: true,
  });
  const total = allCards(s).length;
  const r = applyAction(s, { type: 'TIMEOUT', playerId: 'a' });
  assert(r.ok, 'timeout прошёл');
  assert(r.state.hands.a.length === 2, 'при drawnThisTurn=true повторно НЕ берёт');
  assert(r.state.currentIndex === 1, 'ход перешёл');
  assert(checkInvariants(r.state, total, 'timeout'), 'карты сохранены');

  // TIMEOUT без предварительного добора -> берёт 1.
  const s2 = makeState({
    hands: { a: [C('a1', 'red', CARD_TYPE.NUMBER, 5)], b: [C('b1', 'green', CARD_TYPE.NUMBER, 2)] },
    drawPile: [C('dp1', 'red', CARD_TYPE.NUMBER, 7)],
    discardPile: [C('top', 'blue', CARD_TYPE.NUMBER, 3)],
    activeColor: 'blue', currentIndex: 0, drawnThisTurn: false,
  });
  const r2 = applyAction(s2, { type: 'TIMEOUT', playerId: 'a' });
  assert(r2.ok && r2.state.hands.a.length === 2, 'timeout без добора берёт 1 карту');
  assert(r2.state.currentIndex === 1, 'ход перешёл после timeout');
}

/* ---------- 8. DRAW при полностью пустых стопках -> ход переходит, без краша ---------- */
section('Пустые стопки');
{
  const s = makeState({
    hands: { a: [C('a1', 'red', CARD_TYPE.SKIP)], b: [C('b1', 'blue', CARD_TYPE.NUMBER, 2)] },
    drawPile: [],
    discardPile: [C('top', 'green', CARD_TYPE.NUMBER, 3)], // только 1 карта -> нечем пополнять
    activeColor: 'green', currentIndex: 0, drawnThisTurn: false,
  });
  const total = allCards(s).length;
  const r = applyAction(s, { type: 'DRAW', playerId: 'a' });
  assert(r.ok, 'DRAW при пустых стопках не падает');
  assert(r.state.hands.a.length === 1, 'карта не появилась из ниоткуда');
  assert(r.state.currentIndex === 1, 'ход перешёл');
  assert(checkInvariants(r.state, total, 'empty draw'), 'карты сохранены');
}

/* ---------- 9. Валидация: не свой ход / нет карты / wild без цвета ---------- */
section('Валидация ходов');
{
  const s = makeState({
    hands: { a: [C('a1', 'red', CARD_TYPE.NUMBER, 5), C('wild', 'wild', CARD_TYPE.WILD)], b: [C('b1', 'blue', CARD_TYPE.NUMBER, 2)] },
    drawPile: [C('dp', 'red', CARD_TYPE.NUMBER, 1)],
    discardPile: [C('top', 'red', CARD_TYPE.NUMBER, 3)],
    activeColor: 'red', currentIndex: 0,
  });
  const before = JSON.stringify(s);
  assert(!applyAction(s, { type: 'PLAY', playerId: 'b', cardId: 'b1' }).ok, 'нельзя ходить не в свою очередь');
  assert(!applyAction(s, { type: 'PLAY', playerId: 'a', cardId: 'no-such' }).ok, 'нельзя сыграть несуществующую карту');
  assert(!applyAction(s, { type: 'PLAY', playerId: 'a', cardId: 'wild' }).ok, 'wild без цвета отклонён');
  assert(JSON.stringify(s) === before, 'состояние не мутировано при отклонённых ходах');
  // Правильный wild с цветом проходит.
  const rok = applyAction(s, { type: 'PLAY', playerId: 'a', cardId: 'wild', chosenColor: 'green' });
  assert(rok.ok && rok.state.activeColor === 'green', 'wild с цветом задаёт активный цвет');
}

/* ---------- 10. Детерминизм: seed + действия -> идентичный результат ---------- */
section('Детерминизм применения');
{
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  function playScript(seed) {
    let s = createGame(players, { seed, density: 'large', useSwapCard: true });
    const actions = [];
    let guard = 0;
    while (s.status === 'playing' && guard++ < 2000) {
      const a = botActionDet(s);
      actions.push(a);
      s = applyAction(s, a).state;
    }
    // Обнуляем таймстемпы для сравнения.
    return stripTime(s);
  }
  // Детерминированный бот (без Math.random): всегда первая играбельная.
  function botActionDet(state) {
    const me = state.players[state.currentIndex].id;
    const hand = state.hands[me];
    const top = topCard(state);
    const card = hand.find((c) => canPlay(c, top, state.activeColor));
    if (card && !state.drawnThisTurn) {
      const action = { type: 'PLAY', playerId: me, cardId: card.id };
      if (isWildCard(card)) action.chosenColor = 'red';
      if (card.type === CARD_TYPE.SWAP_HANDS) {
        action.swapTargetId = state.players.find((p) => p.id !== me).id;
      }
      return action;
    }
    if (!state.drawnThisTurn) return { type: 'DRAW', playerId: me };
    return { type: 'PASS', playerId: me };
  }
  function stripTime(s) {
    const c = structuredClone(s);
    c.turnStartAt = 0;
    if (c.lastAction) c.lastAction.at = 0;
    return c;
  }
  const r1 = playScript(555);
  const r2 = playScript(555);
  assert(JSON.stringify(r1) === JSON.stringify(r2), 'одинаковый seed+скрипт -> идентичное финальное состояние');
}

/* ---------- 11. canPlay матрица ---------- */
section('canPlay');
{
  const red3 = C('t', 'red', CARD_TYPE.NUMBER, 3);
  assert(canPlay(C('x', 'red', CARD_TYPE.NUMBER, 8), red3, 'red'), 'цвет совпал');
  assert(canPlay(C('x', 'blue', CARD_TYPE.NUMBER, 3), red3, 'red'), 'значение совпало');
  assert(!canPlay(C('x', 'blue', CARD_TYPE.NUMBER, 8), red3, 'red'), 'ни цвет, ни значение — нельзя');
  assert(canPlay(C('x', 'wild', CARD_TYPE.WILD), red3, 'red'), 'wild всегда можно');
  const blueSkip = C('t', 'blue', CARD_TYPE.SKIP);
  assert(canPlay(C('x', 'red', CARD_TYPE.SKIP), blueSkip, 'blue'), 'skip на skip (по типу)');
  assert(!canPlay(C('x', 'red', CARD_TYPE.REVERSE), blueSkip, 'blue'), 'reverse на skip разного цвета — нельзя');
  // После wild активный цвет учитывается.
  const wildTop = C('t', 'wild', CARD_TYPE.WILD);
  assert(canPlay(C('x', 'green', CARD_TYPE.NUMBER, 1), wildTop, 'green'), 'на wild кладём по активному цвету');
  assert(!canPlay(C('x', 'red', CARD_TYPE.NUMBER, 1), wildTop, 'green'), 'неподходящий цвет на wild нельзя');
}

/* ---------- Итог ---------- */
console.log('\n' + '-'.repeat(44));
console.log(`Пройдено: ${passed}, Провалено: ${failed}`);
if (failed) { console.log('\nСписок провалов:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
