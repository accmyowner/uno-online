// engine.js — чистая игровая логика UNO.
// Функции получают объект партии `game`, изменяют его и возвращают { ok, game, error }.
// Никаких обращений к Firebase здесь нет — движок легко тестируется и запускается внутри транзакций.

import { createDeck, isWild, canPlay, cardPoints, COLORS } from "./deck.js";
import { shuffle } from "./utils.js";

const ACTION_VALUES = ["skip", "reverse", "draw2"];

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
}

// Начать новый раунд. scores/wins переносятся из предыдущей партии, если переданы.
export function startRound(turnOrder, settings, now, prevScores = {}, prevWins = {}) {
  const deck = createDeck();
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
    settings: {
      turnTime: settings.turnTime,
      stacking: !!settings.stacking,
    },
    turnStartedAt: now,
    lastAction: { type: "deal", by: null, ts: now },
    version: 0,
  };
  for (const pid of turnOrder) {
    if (game.scores[pid] == null) game.scores[pid] = 0;
    if (game.wins[pid] == null) game.wins[pid] = 0;
  }
  return game;
}

// Сыграть карту
export function play(game, playerId, cardId, chosenColor, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  if (currentPid(game) !== playerId) return fail(game, "Сейчас не ваш ход");

  const hand = game.hands[playerId] || [];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return fail(game, "Такой карты нет в руке");

  const card = hand[cardIndex];
  if (!canPlay(card, game)) return fail(game, "Недопустимый ход");
  if (isWild(card) && !COLORS.includes(chosenColor)) return fail(game, "Не выбран цвет");

  // Убираем карту из руки в сброс
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
  return done(game);
}

// Взять карту (или забрать накопленный штраф)
export function draw(game, playerId, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  if (currentPid(game) !== playerId) return fail(game, "Сейчас не ваш ход");

  if (game.pendingDraw > 0) {
    const amount = game.pendingDraw;
    drawN(game, playerId, amount);
    game.pendingDraw = 0;
    game.pendingType = null;
    game.lastAction = { type: "draw", by: playerId, count: amount, ts: now };
    advance(game, 1);
    beginTurn(game, now);
    return done(game);
  }

  if (game.drawnThisTurn) return fail(game, "В этот ход карта уже взята");

  drawN(game, playerId, 1);
  game.drawnThisTurn = true;
  game.lastAction = { type: "draw", by: playerId, count: 1, ts: now };
  // Ход остаётся у игрока: он может сыграть взятую карту или спасовать
  return done(game);
}

// Спасовать (доступно только после добора)
export function pass(game, playerId, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  if (currentPid(game) !== playerId) return fail(game, "Сейчас не ваш ход");
  if (game.pendingDraw > 0) return fail(game, "Сначала заберите карты");
  if (!game.drawnThisTurn) return fail(game, "Сначала возьмите карту");

  game.lastAction = { type: "pass", by: playerId, ts: now };
  advance(game, 1);
  beginTurn(game, now);
  return done(game);
}

// Принудительное завершение хода по тайм-ауту (вызывает хост).
// Всегда продвигает игру дальше — зависание невозможно.
export function timeout(game, now) {
  if (!game || game.status !== "playing") return fail(game, "Партия не идёт");
  const pid = currentPid(game);

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
  return done(game);
}
