// Автотест новых механик: колода со swap, безопасность обмена рук, механика UNO.
import { createDeck, canPlay, isWild, isSwap } from "./js/deck.js";
import { startRound, play, draw, pass, declareUno, catchUno, timeout, clearExpiredUno, UNO_WINDOW } from "./js/engine.js";

function assert(cond, msg) { if (!cond) throw new Error("ОШИБКА: " + msg); }
const COLORS = ["red", "yellow", "green", "blue"];
const rnd = (n) => Math.floor(Math.random() * n);

// 1) Колода: числовые карты не меняются, спец-карты масштабируются настройкой
const numeric = (d) => d.filter(c => /^[0-9]$/.test(c.value)).length;
const special = (d) => d.filter(c => !/^[0-9]$/.test(c.value)).length;
assert(numeric(createDeck({specialRate:"low"})) === 76, "числовых карт всегда 76");
assert(numeric(createDeck({specialRate:"high"})) === 76, "числовых карт всегда 76 (high)");
assert(special(createDeck({specialRate:"high"})) > special(createDeck({specialRate:"classic"})), "Большая > Обычной по спец-картам");
assert(special(createDeck({specialRate:"classic"})) > special(createDeck({specialRate:"low"})), "Обычная > Маленькой по спец-картам");
assert(createDeck({handSwap:true}).filter(isSwap).length === 2, "classic + swap → 2 карты обмена");
assert(createDeck({handSwap:false}).filter(isSwap).length === 0, "без настройки swap нет в колоде");
assert(createDeck(true).filter(isSwap).length === 2, "обратная совместимость createDeck(true)");

function totalCards(g) {
  let t = g.deck.length + g.discardPile.length;
  for (const pid of g.turnOrder) t += g.hands[pid].length;
  return t;
}

// 2) Массовая симуляция со swap и механикой UNO
function totalOf(g){ let t=g.deck.length+g.discardPile.length; for(const pid of g.turnOrder) t+=g.hands[pid].length; return t; }
function simulate(nPlayers, stacking, handSwap, specialRate) {
  const order = Array.from({ length: nPlayers }, (_, i) => "P" + i);
  let now = 1000;
  let g = startRound(order, { turnTime: 30, stacking, handSwap, specialRate }, now);
  const expectTotal = totalOf(g);
  let moves = 0;

  while (g.status === "playing") {
    if (++moves > 4000) throw new Error("зависание партии");
    now += 200 + rnd(900);

    // Иногда сказать UNO, если у кого-то ровно 1 карта
    for (const pid of g.turnOrder) {
      if (g.hands[pid].length === 1 && !g.saidUno[pid] && Math.random() < 0.4) {
        const r = declareUno(g, pid, now);
        assert(r.ok, "declareUno должен проходить при 1 карте");
      }
    }
    // Иногда поймать забывшего сказать UNO
    if (g.unoPending && Math.random() < 0.35) {
      const target = g.unoPending.pid;
      const catcher = g.turnOrder.find((p) => p !== target);
      const before = g.hands[target].length;
      const t2 = g.unoPending.openedAt + 1600 + rnd(1000);
      const r = catchUno(g, catcher, t2);
      if (r.ok) assert(g.hands[target].length === before + 2, "пойманный берёт +2");
      now = Math.max(now, t2);
    }
    // Хост закрывает истёкшее окно
    if (g.unoPending && now > g.unoPending.deadline + 1000) {
      clearExpiredUno(g, now);
    }

    const pid = g.turnOrder[g.currentIndex];
    const hand = g.hands[pid];

    // Список играбельных карт (swap нельзя последней картой)
    let playable = hand.filter((c) => canPlay(c, g) && !(isSwap(c) && hand.length < 2));

    let res;
    if (playable.length && Math.random() < 0.85) {
      const card = playable[rnd(playable.length)];
      const color = isWild(card) ? COLORS[rnd(4)] : undefined;
      let target;
      if (isSwap(card)) {
        const others = g.turnOrder.filter((p) => p !== pid);
        target = others[rnd(others.length)];
      }
      const beforeLen = hand.length;
      res = play(g, pid, card.id, color, now, target);
      assert(res.ok, "легальный ход должен проходить: " + (res.error || ""));
      // swap не может привести к победе (нельзя выиграть обменом)
      if (isSwap(card)) assert(g.status === "playing" || g.winnerId !== pid || g.hands[pid].length === 0, "swap-победа некорректна");
    } else if (g.pendingDraw > 0) {
      res = draw(g, pid, now);
      assert(res.ok, "забрать штраф должно проходить");
    } else {
      res = draw(g, pid, now);
      assert(res.ok, "добор должен проходить");
      // после добора: сыграть взятую или спасовать
      const after = g.hands[pid].filter((c) => canPlay(c, g) && !(isSwap(c) && g.hands[pid].length < 2));
      if (after.length && Math.random() < 0.6) {
        const card = after[rnd(after.length)];
        const color = isWild(card) ? COLORS[rnd(4)] : undefined;
        let target;
        if (isSwap(card)) { const o = g.turnOrder.filter((p) => p !== pid); target = o[rnd(o.length)]; }
        const r2 = play(g, pid, card.id, color, now, target);
        assert(r2.ok, "ход взятой картой должен проходить");
      } else {
        const r3 = pass(g, pid, now);
        assert(r3.ok, "пас после добора должен проходить");
      }
    }

    // Иногда тайм-аут
    if (g.status === "playing" && Math.random() < 0.03) {
      now += g.settings.turnTime * 1000 + 100;
      const r = timeout(g, now);
      assert(r.ok, "тайм-аут должен проходить");
    }

    // Инварианты
    assert(totalCards(g) === expectTotal, `карт должно быть ${expectTotal}, а не ${totalCards(g)}`);
    if (g.unoPending) assert(g.hands[g.unoPending.pid].length === 1, "у ожидающего UNO ровно 1 карта");
  }

  assert(g.hands[g.winnerId].length === 0, "у победителя пустая рука");
  assert(totalCards(g) === expectTotal, "после финала карт столько же");
  return moves;
}

let games = 0, totalMoves = 0;
for (let i = 0; i < 300; i++) {
  const n = 2 + rnd(9);            // 2..10 игроков
  const stacking = Math.random() < 0.5;
  const handSwap = Math.random() < 0.7;
  const specialRate = ["low","mid","classic","high"][Math.floor(Math.random()*4)];
  totalMoves += simulate(n, stacking, handSwap, specialRate);
  games++;
}

// 3) Точечные проверки механики UNO
function craft() {
  return {
    turnOrder: ["A", "B", "C"], currentIndex: 0, direction: 1,
    deck: [{ id: "d1", color: "red", value: "5" }, { id: "d2", color: "blue", value: "3" }, { id: "d3", color: "green", value: "8" }],
    discardPile: [{ id: "x", color: "red", value: "7" }],
    discardTop: { id: "x", color: "red", value: "7" },
    hands: {
      A: [{ id: "a1", color: "red", value: "1" }],
      B: [{ id: "b1", color: "red", value: "2" }, { id: "b2", color: "blue", value: "9" }],
      C: [{ id: "c1", color: "green", value: "4" }, { id: "c2", color: "yellow", value: "6" }],
    },
    currentColor: "red", topValue: "7", pendingDraw: 0, pendingType: null,
    drawnThisTurn: false, status: "playing", winnerId: null,
    saidUno: {}, unoPending: null,
    settings: { turnTime: 30, stacking: false, handSwap: false }, version: 0, turnStartedAt: 0,
  };
}
// declareUno только при 1 карте
assert(declareUno(craft(), "A", 100).ok, "A с 1 картой может сказать UNO");
assert(!declareUno(craft(), "B", 100).ok, "B с 2 картами не может сказать UNO");
{ // повторное declareUno — запрет спама
  const g = craft(); assert(declareUno(g, "A", 100).ok, "первый UNO");
  assert(!declareUno(g, "A", 110).ok, "повторный UNO запрещён (антиспам)");
}
{ // catch: рано / вовремя / сам себя
  const g = craft(); g.unoPending = { pid: "A", openedAt: 0, deadline: UNO_WINDOW };
  assert(!catchUno(g, "B", 100).ok, "ловить до grace нельзя");
  assert(!catchUno(g, "A", 2000).ok, "нельзя ловить самого себя");
  const before = g.hands["A"].length;
  const r = catchUno(g, "B", 2000);
  assert(r.ok, "поимка после grace проходит");
  assert(g.hands["A"].length === before + 2, "пойманный A берёт +2");
  assert(g.unoPending === null, "после поимки окно закрыто");
}
{ // если сказал UNO — поймать нельзя
  const g = craft(); g.unoPending = { pid: "A", openedAt: 0, deadline: UNO_WINDOW }; g.saidUno = { A: true };
  assert(!catchUno(g, "B", 2000).ok, "сказавшего UNO поймать нельзя");
}
{ // swap: нельзя последней картой (у игрока с 1 картой)
  const g = craft();
  g.hands["A"] = [{ id: "s1", color: "wild", value: "swap" }]; // единственная карта — swap
  const r = play(g, "A", "s1", "blue", 100, "B");
  assert(!r.ok, "swap последней картой запрещён");
}
{ // swap: корректный обмен рук + смена цвета
  const g = craft();
  g.hands["A"] = [{ id: "s1", color: "wild", value: "swap" }, { id: "a2", color: "red", value: "5" }];
  g.hands["B"] = [{ id: "b1", color: "green", value: "2" }, { id: "b2", color: "yellow", value: "9" }, { id: "b3", color: "blue", value: "1" }];
  const r = play(g, "A", "s1", "blue", 100, "B");
  assert(r.ok, "swap проходит");
  assert(g.currentColor === "blue", "после swap выбран новый цвет");
  assert(g.hands["A"].length === 3, "A получил руку B (3 карты)");
  assert(g.hands["B"].length === 1, "B получил остаток руки A (1 карта)");
}

console.log(`✅ Новые механики: ${games} партий (2–10 игроков, swap и UNO), ходов ${totalMoves}. Точечные проверки UNO/swap пройдены.`);
