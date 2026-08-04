/**
 * game-engine.js
 * Чистая детерминированная стейт-машина UNO.
 *
 * Главный принцип: applyAction(state, action) -> { ok, state, error }.
 *  - Функция НЕ мутирует переданный state (работает с глубокой копией).
 *  - При невалидном действии возвращает { ok:false, error } и исходный state.
 *  - Вся валидация здесь: очередь хода, наличие карты, законность хода.
 *
 * Это единственное место, где меняется игровое состояние. И онлайн-слой,
 * и локальный режим применяют ходы только через applyAction — поэтому
 * состояние у всех игроков не может разойтись.
 */

import { CARD_TYPE, ROOM_STATUS, LIMITS } from './constants.js';
import { canPlay, isWildCard, nextIndex, drawAmount } from './rules.js';
import { buildDeck } from './deck.js';
import { createRng, shuffle } from './rng.js';

/** Глубокая копия состояния (только простые данные). */
function clone(state) {
  return structuredClone(state);
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

/** Верхняя карта сброса. */
export function topCard(state) {
  return state.discardPile[state.discardPile.length - 1];
}

/**
 * Создаёт начальное состояние партии.
 * @param {Array<{id,name}>} players  игроки в порядке рассадки
 * @param {object} settings           { seed, density, useSwapCard }
 */
export function createGame(players, settings) {
  const { seed, density = 'normal', useSwapCard = false } = settings;
  const rng = createRng(seed);

  const deck = shuffle(buildDeck({ density, useSwapCard }), rng);

  const hands = {};
  for (const p of players) hands[p.id] = [];

  // Раздаём стартовые руки.
  let cursor = 0;
  for (let round = 0; round < LIMITS.startingHand; round++) {
    for (const p of players) {
      hands[p.id].push(deck[cursor]);
      cursor += 1;
    }
  }

  const remaining = deck.slice(cursor);

  // Первой в сброс кладём первую попавшуюся цифровую карту,
  // чтобы избежать эффектов спец-карт на старте.
  const starterIdx = remaining.findIndex((c) => c.type === CARD_TYPE.NUMBER);
  const [starter] = remaining.splice(starterIdx, 1);

  return {
    seed,
    status: ROOM_STATUS.PLAYING,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    hands,
    drawPile: remaining,
    discardPile: [starter],
    activeColor: starter.color,
    currentIndex: 0,
    direction: 1,
    drawnThisTurn: false,
    unoState: null,        // { playerId, safe }
    winner: null,
    turnStartAt: Date.now(),
    turnTimer: settings.turnTimer ?? null,
    reshuffleCount: 0,
    version: 0,
    lastAction: null,
  };
}

/* ---------- Внутренние мутаторы (работают по ссылке на КЛОН) ---------- */

/** Пополняет колоду добора из сброса, если нужно. */
function refillIfNeeded(state) {
  if (state.drawPile.length > 0) return;
  if (state.discardPile.length <= 1) return; // нечем пополнять

  const top = state.discardPile.pop();
  const rng = createRng((state.seed + 1000 + state.reshuffleCount) >>> 0);
  state.drawPile = shuffle(state.discardPile, rng);
  state.discardPile = [top];
  state.reshuffleCount += 1;
}

/** Игрок берёт n карт. Возвращает массив взятых карт. */
function drawCards(state, playerId, n) {
  const taken = [];
  for (let i = 0; i < n; i++) {
    refillIfNeeded(state);
    if (state.drawPile.length === 0) break; // карты кончились совсем
    const card = state.drawPile.pop();
    state.hands[playerId].push(card);
    taken.push(card);
  }
  return taken;
}

/** Сдвигает очередь хода. Сбрасывает флаг добора и стартовое время хода. */
function advanceTurn(state, steps) {
  state.currentIndex = nextIndex(
    state.currentIndex,
    state.players.length,
    state.direction,
    steps
  );
  state.drawnThisTurn = false;
  state.turnStartAt = Date.now();
}

/** Индекс следующего игрока на 1 вперёд (для +2/+4/skip-целей). */
function neighbor(state) {
  return nextIndex(state.currentIndex, state.players.length, state.direction, 1);
}

/* ------------------------------- Действия ------------------------------- */

function actPlay(state, action) {
  const { playerId, cardId, chosenColor, swapTargetId } = action;
  const player = state.players[state.currentIndex];

  if (!player || player.id !== playerId) {
    return fail(state, 'Сейчас не ваш ход');
  }

  const hand = state.hands[playerId];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    return fail(state, 'Такой карты нет в руке');
  }

  const card = hand[cardIndex];
  if (!canPlay(card, topCard(state), state.activeColor)) {
    return fail(state, 'Эту карту нельзя сыграть сейчас');
  }

  // Для диких карт нужен выбранный цвет.
  if (isWildCard(card)) {
    if (!['red', 'yellow', 'green', 'blue'].includes(chosenColor)) {
      return fail(state, 'Не выбран цвет');
    }
  }

  // --- Применяем ход к клону ---
  const next = clone(state);
  const nHand = next.hands[playerId];
  const [played] = nHand.splice(cardIndex, 1);
  next.discardPile.push(played);
  next.drawnThisTurn = false;

  // Цвет после хода.
  next.activeColor = isWildCard(played) ? chosenColor : played.color;

  // Сброс/обновление UNO-состояния для сыгравшего.
  // Если у него станет != 1 карты — снимаем прежнее UNO-состояние на нём.
  if (next.unoState && next.unoState.playerId === playerId) {
    next.unoState = null;
  }

  // Победа: карта была последней.
  if (nHand.length === 0) {
    next.status = ROOM_STATUS.FINISHED;
    next.winner = playerId;
    next.unoState = null;
    next.lastAction = { type: 'PLAY', playerId, card: played, win: true, at: Date.now() };
    next.version += 1;
    return ok(next);
  }

  // Обмен руками (если после снятия карты рука не пуста).
  if (played.type === CARD_TYPE.SWAP_HANDS) {
    const targetExists = next.players.some((p) => p.id === swapTargetId);
    if (!targetExists || swapTargetId === playerId) {
      return fail(state, 'Не выбран игрок для обмена');
    }
    const tmp = next.hands[playerId];
    next.hands[playerId] = next.hands[swapTargetId];
    next.hands[swapTargetId] = tmp;
    // UNO-состояние могло относиться к участнику обмена — пересчитываем ниже.
    if (
      next.unoState &&
      (next.unoState.playerId === playerId || next.unoState.playerId === swapTargetId)
    ) {
      next.unoState = null;
    }
  }

  // Если у сыгравшего осталась ровно 1 карта — он под угрозой UNO.
  if (next.hands[playerId].length === 1) {
    next.unoState = { playerId, safe: false };
  }

  // Эффекты карт + сдвиг очереди.
  applyCardEffect(next, played);

  next.lastAction = {
    type: 'PLAY',
    playerId,
    card: played,
    chosenColor: next.activeColor,
    at: Date.now(),
  };
  next.version += 1;
  return ok(next);
}

/** Применяет эффект сыгранной карты и двигает очередь. */
function applyCardEffect(state, card) {
  switch (card.type) {
    case CARD_TYPE.SKIP:
      advanceTurn(state, 2);
      break;

    case CARD_TYPE.REVERSE:
      state.direction *= -1;
      // При двух игроках Reverse работает как Skip.
      advanceTurn(state, state.players.length === 2 ? 2 : 1);
      break;

    case CARD_TYPE.DRAW_TWO: {
      const victim = state.players[neighbor(state)];
      drawCards(state, victim.id, 2);
      clearUnoIfChanged(state, victim.id);
      advanceTurn(state, 2);
      break;
    }

    case CARD_TYPE.WILD_DRAW_FOUR: {
      const victim = state.players[neighbor(state)];
      drawCards(state, victim.id, 4);
      clearUnoIfChanged(state, victim.id);
      advanceTurn(state, 2);
      break;
    }

    case CARD_TYPE.WILD:
    case CARD_TYPE.SWAP_HANDS:
    case CARD_TYPE.NUMBER:
    default:
      advanceTurn(state, 1);
      break;
  }
}

/** Если у игрока стало не 1 карты — снять UNO-состояние на нём. */
function clearUnoIfChanged(state, playerId) {
  if (
    state.unoState &&
    state.unoState.playerId === playerId &&
    state.hands[playerId].length !== 1
  ) {
    state.unoState = null;
  }
}

function actDraw(state, action) {
  const { playerId } = action;
  const player = state.players[state.currentIndex];
  if (!player || player.id !== playerId) return fail(state, 'Сейчас не ваш ход');
  if (state.drawnThisTurn) return fail(state, 'Вы уже взяли карту в этот ход');

  const next = clone(state);
  const [drawn] = drawCards(next, playerId, 1);
  next.drawnThisTurn = true;
  clearUnoIfChanged(next, playerId);

  next.lastAction = { type: 'DRAW', playerId, at: Date.now() };

  // Если взятую карту нельзя сыграть — ход автоматически переходит дальше.
  if (!drawn || !canPlay(drawn, topCard(next), next.activeColor)) {
    advanceTurn(next, 1);
  }

  next.version += 1;
  return ok(next);
}

function actPass(state, action) {
  const { playerId } = action;
  const player = state.players[state.currentIndex];
  if (!player || player.id !== playerId) return fail(state, 'Сейчас не ваш ход');
  if (!state.drawnThisTurn) return fail(state, 'Сначала возьмите карту');

  const next = clone(state);
  advanceTurn(next, 1);
  next.lastAction = { type: 'PASS', playerId, at: Date.now() };
  next.version += 1;
  return ok(next);
}

function actCallUno(state, action) {
  const { playerId } = action;
  if (!state.unoState || state.unoState.playerId !== playerId) {
    return fail(state, 'Сейчас нельзя объявить UNO');
  }
  if (state.unoState.safe) return fail(state, 'UNO уже объявлено');

  const next = clone(state);
  next.unoState = { playerId, safe: true };
  next.lastAction = { type: 'CALL_UNO', playerId, at: Date.now() };
  next.version += 1;
  return ok(next);
}

function actCatchUno(state, action) {
  const { playerId, targetId } = action;
  if (!state.unoState || state.unoState.safe) {
    return fail(state, 'Ловить некого');
  }
  if (state.unoState.playerId !== targetId) {
    return fail(state, 'Этот игрок не под угрозой');
  }
  if (playerId === targetId) return fail(state, 'Нельзя поймать самого себя');
  if (state.hands[targetId].length !== 1) {
    return fail(state, 'Ловить уже поздно');
  }

  const next = clone(state);
  drawCards(next, targetId, LIMITS.unoPenalty);
  next.unoState = null; // окно закрывается — двойных штрафов не будет
  next.lastAction = {
    type: 'CATCH_UNO',
    playerId,
    targetId,
    penalty: LIMITS.unoPenalty,
    at: Date.now(),
  };
  next.version += 1;
  return ok(next);
}

/** Тайм-аут хода: игрок берёт карту и ход переходит дальше. */
function actTimeout(state, action) {
  const { playerId } = action;
  const player = state.players[state.currentIndex];
  if (!player || player.id !== playerId) return fail(state, 'Не ваш ход');

  const next = clone(state);
  if (!next.drawnThisTurn) {
    drawCards(next, playerId, 1);
    clearUnoIfChanged(next, playerId);
  }
  advanceTurn(next, 1);
  next.lastAction = { type: 'TIMEOUT', playerId, at: Date.now() };
  next.version += 1;
  return ok(next);
}

/* ------------------------------ Диспетчер ------------------------------ */

const HANDLERS = {
  PLAY: actPlay,
  DRAW: actDraw,
  PASS: actPass,
  CALL_UNO: actCallUno,
  CATCH_UNO: actCatchUno,
  TIMEOUT: actTimeout,
};

/**
 * Применяет действие к состоянию.
 * @returns {{ ok:boolean, state:object, error:(string|null) }}
 */
export function applyAction(state, action) {
  if (state.status === ROOM_STATUS.FINISHED) {
    return fail(state, 'Партия уже завершена');
  }
  const handler = HANDLERS[action.type];
  if (!handler) return fail(state, `Неизвестное действие: ${action.type}`);
  return handler(state, action);
}
