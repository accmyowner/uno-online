// engine.js — чистая игровая логика UNO.
// Функции получают объект партии `game`, изменяют его и возвращают { ok, game, error }.
// Никаких обращений к Firebase здесь нет — движок легко тестируется и запускается внутри транзакций.

import { createDeck, isWild, isSwap, canPlay, cardPoints, COLORS } from "./deck.js";
import { shuffle } from "./utils.js";

const ACTION_VALUES = ["skip", "reverse", "draw2"];

// Окно механики UNO: сколько времени игрок может «поймать» забывшего сказать UNO.
export const UNO_WINDOW = 5000;   // мс — видимый таймер
const CATCH_GRACE = 1500;         // мс — фора, чтобы игрок успел сам нажать UNO

function fail(game, error) { return { ok: false, game, error }; }
function done(game) { game.version = (game.version || 0) + 1; return { ok: true, game, error: null }; }

function currentPid(game) { return game.turnOrder[game.currentIndex]; }

function reshuffleIfNeeded(game) {
  if (game.deck.length > 0) return;
  if (game.discardPile.length <= 1) return; // нечего перемешивать
  const top = game.discardPile[game.discardPile.length - 1];
  const rest = game.discardPile.slice(0, -1);
  game.deck = shuffle(rest);
  game.discardPile = [top];
}

function drawN(game, pid, count) {
  for (let i = 0; i < count; i++) {
    reshuffleIfNeeded(game);
    if (game.deck.length === 0) break; // предохранитель: карт больше нет нигде
    game.hands[pid].push(game.deck.pop());
  }
}

function advance(game, steps) {
  const n = game.turnOrder.length;
  game.currentIndex = ((game.currentIndex + game.direction * steps) % n + n) % n;
}

function beginTurn(game, now) {
  game.drawnThisTurn = false;
  game.turnStartedAt = now;
}

// ── Механика UNO ─────────────────────────────────────────────
// Открыть «окно поимки», если ходивший остался с одной картой и не сказал UNO.
function openUnoIfNeeded(game, actorPid, now) {
  game.saidUno = game.saidUno || {};
  const len = (game.hands[actorPid] || []).length;
  if (len === 1 && !game.saidUno[actorPid]) {
    game.unoPending = { pid: actorPid, openedAt: now, deadline: now + UNO_WINDOW };
  }
}
// Привести состояние UNO в согласованность с руками.
function refreshUno(game) {
  game.saidUno = game.saidUno || {};
  for (const pid of game.turnOrder) {
    const len = (game.hands[pid] || []).length;
    if (len !== 1 && game.saidUno[pid]) delete game.saidUno[pid];
  }
  if (game.unoPending) {
    const len = (game.hands[game.unoPending.pid] || []).length;
    if (len !== 1) game.unoPending = null;
  }
}

function finishRound(game, winnerId) {
  let roundPoints = 0;
  for (const pid of game.turnOrder) {
    if (pid === winnerId) continue;
    for (const card of game.hands[pid]) roundPoints += cardPoints(card);
  }
  game.status = "finished";
  game.winnerId = winnerId;
  game.roundPoints = roundPoints;
  game.scores = game.scores || {};
  game.scores[winnerId] = (game.scores[winnerId] || 0) + roundPoints;
  game.wins = game.wins || {};
  game.wins[winnerId] = (game.wins[winnerId] || 0) + 1;
  game.finishedAt = game.turnStartedAt;
  game.unoPending = null;
}

// Начать новый раунд. scores/wins переносятся из предыдущей партии, если переданы.
export function startRound(turnOrder, settings, now, prevScores = {}, prevWins = {}) {
  const deck = createDeck({ handSwap: !!settings.handSwap, specialRate: settings.specialRate });
  const hands = {};
  for (const pid of turnOrder) hands[pid] = [];
  for (let r = 0; r < 7; r++) {
    for (const pid of turnOrder) hands[pid].push(deck.pop());
  }
  // Первая карта сброса — обязательно числовая, чтобы избежать спорных ситуаций на старте
  let idx = deck.findIndex((c) => !isWild(c) && !ACTION_VALUES.includes(c.value));
  if (idx === -1) idx = 0;
  const first = deck.splice(idx, 1)[0];

  const game = {
    turnOrder: turnOrder.slice(),
    currentIndex: 0,
    direction: 1,
    deck,
    discardPile: [first],
    discardTop: first,
    hands,
    currentColor: first.color,
    topValue: first.value,
    pendingDraw: 0,
    pendingType: null,
    drawnThisTurn: false,
    status: "playing",
    winnerId: null,
    roundPoints: 0,
    scores: { ...prevScores },
    wins: { ...prevWins },
    saidUno: {},
    unoPending: null,
    settings: {
      turnTime: settings.turnTime,
      stacking: !!settings.stacking,
      handSwap: !!settings.handSwap,
      specialRate: settings.specialRate || "classic",
    },
    turnStartedAt: now,
    lastAction: { type: "deal", by: null, ts: now },
    lastEvent: null,
    version: 0,
  };
  for (const pid of turnOrder) {
    if (game.scores[pid] == null) game.scores[pid] = 0;
    if (game.wins[pid] == null) game.wins[pid] = 0;
  }
  return game;
}

// Сыграть карту. targetPid используется только картой «Обмен руками».
export function play(game, playerId, cardId, chosenColor, now, targetPid) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  if (currentPid(game) !== playerId) return fail(game, "Сейчас не ваш ход");

  const hand = game.hands[playerId] || [];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return fail(game, "Такой карты нет в руке");

  const card = hand[cardIndex];
  if (!canPlay(card, game)) return fail(game, "Недопустимый ход");
  if (isWild(card) && !COLORS.includes(chosenColor)) return fail(game, "Не выбран цвет");

  // Новое действие закрывает «окно поимки UNO» предыдущего игрока
  game.unoPending = null;

  // ── Особая карта «Обмен руками» ──
  if (isSwap(card)) {
    if (hand.length < 2) return fail(game, "«Обмен руками» нельзя разыграть последней картой");
    const targets = game.turnOrder.filter((pid) => pid !== playerId);
    if (!targetPid || !targets.includes(targetPid)) return fail(game, "Не выбран игрок для обмена");

    hand.splice(cardIndex, 1);
    game.discardPile.push(card);
    game.discardTop = card;
    game.topValue = card.value;
    game.currentColor = chosenColor;

    // Полный обмен рук между ходившим и выбранным игроком
    const mine = game.hands[playerId];
    game.hands[playerId] = game.hands[targetPid];
    game.hands[targetPid] = mine;

    game.lastAction = { type: "play", by: playerId, card, color: chosenColor, swapWith: targetPid, ts: now };
    game.lastEvent = { type: "swap", by: playerId, target: targetPid, ts: now };

    advance(game, 1);
    beginTurn(game, now);
    openUnoIfNeeded(game, playerId, now);
    refreshUno(game);
    return done(game);
  }

  // ── Обычные карты ──
  hand.splice(cardIndex, 1);
  game.discardPile.push(card);
  game.discardTop = card;
  game.topValue = card.value;
  game.currentColor = isWild(card) ? chosenColor : card.color;
  game.lastAction = { type: "play", by: playerId, card, color: game.currentColor, ts: now };

  // Победа: рука опустела
  if (hand.length === 0) {
    finishRound(game, playerId);
    return done(game);
  }

  const n = game.turnOrder.length;
  const stacking = !!game.settings.stacking;

  switch (card.value) {
    case "reverse":
      game.direction *= -1;
      advance(game, n === 2 ? 2 : 1); // при 2 игроках работает как пропуск
      break;
    case "skip":
      advance(game, 2);
      break;
    case "draw2":
      if (stacking) {
        game.pendingDraw += 2;
        game.pendingType = "draw2";
        advance(game, 1);
      } else {
        advance(game, 1);
        drawN(game, currentPid(game), 2);
        advance(game, 1); // пропускаем оштрафованного
      }
      break;
    case "wild4":
      if (stacking) {
        game.pendingDraw += 4;
        game.pendingType = "wild4";
        advance(game, 1);
      } else {
        advance(game, 1);
        drawN(game, currentPid(game), 4);
        advance(game, 1);
      }
      break;
    default:
      advance(game, 1);
  }

  beginTurn(game, now);
  openUnoIfNeeded(game, playerId, now);
  refreshUno(game);
  return done(game);
}

// Взять карту (или забрать накопленный штраф)
export function draw(game, playerId, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  if (currentPid(game) !== playerId) return fail(game, "Сейчас не ваш ход");

  game.unoPending = null;

  if (game.pendingDraw > 0) {
    const amount = game.pendingDraw;
    drawN(game, playerId, amount);
    game.pendingDraw = 0;
    game.pendingType = null;
    game.lastAction = { type: "draw", by: playerId, count: amount, ts: now };
    advance(game, 1);
    beginTurn(game, now);
    refreshUno(game);
    return done(game);
  }

  if (game.drawnThisTurn) return fail(game, "В этот ход карта уже взята");

  drawN(game, playerId, 1);
  game.drawnThisTurn = true;
  game.lastAction = { type: "draw", by: playerId, count: 1, ts: now };
  refreshUno(game);
  // Ход остаётся у игрока: он может сыграть взятую карту или спасовать
  return done(game);
}

// Спасовать (доступно только после добора)
export function pass(game, playerId, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  if (currentPid(game) !== playerId) return fail(game, "Сейчас не ваш ход");
  if (game.pendingDraw > 0) return fail(game, "Сначала заберите карты");
  if (!game.drawnThisTurn) return fail(game, "Сначала возьмите карту");

  game.unoPending = null;
  game.lastAction = { type: "pass", by: playerId, ts: now };
  advance(game, 1);
  beginTurn(game, now);
  refreshUno(game);
  return done(game);
}

// Сказать «UNO» (доступно, когда в руке ровно одна карта)
export function declareUno(game, playerId, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  const len = (game.hands[playerId] || []).length;
  if (len !== 1) return fail(game, "Сказать «UNO» можно только с одной картой");
  game.saidUno = game.saidUno || {};
  if (game.saidUno[playerId]) return fail(game, "Вы уже сказали UNO");
  game.saidUno[playerId] = true;
  if (game.unoPending && game.unoPending.pid === playerId) game.unoPending = null;
  game.lastEvent = { type: "uno", by: playerId, ts: now };
  return done(game);
}

// Поймать игрока, забывшего сказать UNO (штраф +2)
export function catchUno(game, catcherId, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  const p = game.unoPending;
  if (!p) return fail(game, "Сейчас некого ловить");
  if (p.pid === catcherId) return fail(game, "Нельзя ловить самого себя");
  if (!game.turnOrder.includes(catcherId)) return fail(game, "Вы не в игре");
  game.saidUno = game.saidUno || {};
  if (game.saidUno[p.pid]) return fail(game, "Игрок уже сказал UNO");
  if (now < p.openedAt + CATCH_GRACE) return fail(game, "Ещё рано");
  if (now > p.deadline + 600) return fail(game, "Уже поздно");

  drawN(game, p.pid, 2);
  const target = p.pid;
  game.unoPending = null;
  game.lastEvent = { type: "caught", by: catcherId, target, ts: now };
  refreshUno(game);
  return done(game);
}

// Хост закрывает истёкшее «окно поимки» (когда никто не поймал за отведённое время)
export function clearExpiredUno(game, now) {
  if (!game || game.status !== "playing") return fail(game, "нет партии");
  const p = game.unoPending;
  if (!p) return fail(game, "нет ожидания");
  if (now <= p.deadline) return fail(game, "рано");
  game.unoPending = null;
  return done(game);
}

// Принудительное завершение хода по тайм-ауту (вызывает хост).
// Всегда продвигает игру дальше — зависание невозможно.
export function timeout(game, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  const pid = currentPid(game);

  game.unoPending = null;

  if (game.pendingDraw > 0) {
    const amount = game.pendingDraw;
    drawN(game, pid, amount);
    game.pendingDraw = 0;
    game.pendingType = null;
  } else if (!game.drawnThisTurn) {
    drawN(game, pid, 1);
  }
  game.lastAction = { type: "timeout", by: pid, ts: now };
  advance(game, 1);
  beginTurn(game, now);
  refreshUno(game);
  return done(game);
}
