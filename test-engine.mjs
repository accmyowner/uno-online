// Симуляция случайных партий для проверки движка на зависания, нелегальные ходы и корректный финал.
import { startRound, play, draw, pass, timeout } from "./js/engine.js";
import { canPlay, isWild } from "./js/deck.js";

const COLORS = ["red", "yellow", "green", "blue"];
let clock = 1;
const now = () => clock++;

function totalCards(game) {
  let t = game.deck.length + game.discardPile.length;
  for (const pid of game.turnOrder) t += game.hands[pid].length;
  return t;
}

function randomBot(game, pid) {
  const hand = game.hands[pid];
  const playable = hand.filter((c) => canPlay(c, game));
  // 85% сыграть, если можно
  if (playable.length && Math.random() < 0.85) {
    const card = playable[Math.floor(Math.random() * playable.length)];
    const color = isWild(card) ? COLORS[Math.floor(Math.random() * 4)] : null;
    return play(game, pid, card.id, color, now());
  }
  const d = draw(game, pid, now());
  if (!d.ok) return d;
  // после добора попробуем сыграть взятую карту, иначе пас
  const stillMine = game.turnOrder[game.currentIndex] === pid;
  if (stillMine && game.status === "playing") {
    const p2 = game.hands[pid].filter((c) => canPlay(c, game));
    if (p2.length && Math.random() < 0.7) {
      const card = p2[Math.floor(Math.random() * p2.length)];
      const color = isWild(card) ? COLORS[Math.floor(Math.random() * 4)] : null;
      return play(game, pid, card.id, color, now());
    }
    return pass(game, pid, now());
  }
  return d;
}

function runGame(numPlayers, stacking) {
  const order = Array.from({ length: numPlayers }, (_, i) => `p${i}`);
  let game = startRound(order, { turnTime: 30, stacking }, now());

  const start = totalCards(game);
  if (start !== 108) throw new Error(`Старт: карт ${start}, ожидалось 108`);

  let steps = 0;
  while (game.status === "playing") {
    steps++;
    if (steps > 20000) throw new Error("ЗАВИСАНИЕ: превышен лимит ходов");

    const pid = game.turnOrder[game.currentIndex];

    // 8% ходов — эмуляция тайм-аута (действие хоста)
    if (Math.random() < 0.08) {
      const r = timeout(game, now());
      if (!r.ok) throw new Error("timeout вернул ошибку: " + r.error);
    } else {
      const r = randomBot(game, pid);
      if (!r.ok && r.error === "Недопустимый ход") throw new Error("НЕЛЕГАЛЬНЫЙ ХОД пропущен движком");
    }

    // Инвариант: общее число карт всегда 108
    const t = totalCards(game);
    if (t !== 108) throw new Error(`Потеря карт: ${t} на шаге ${steps}`);

    // Инвариант: индекс текущего игрока валиден
    if (game.currentIndex < 0 || game.currentIndex >= numPlayers) throw new Error("Некорректный currentIndex");
  }

  // Финал: у победителя 0 карт, ровно один победитель
  if (!game.winnerId) throw new Error("Партия завершилась без победителя");
  if (game.hands[game.winnerId].length !== 0) throw new Error("У победителя остались карты");
  return steps;
}

let ok = 0;
let totalSteps = 0;
const CONFIGS = [];
for (let n = 2; n <= 8; n++) { CONFIGS.push([n, true]); CONFIGS.push([n, false]); }

const RUNS = 400;
for (let i = 0; i < RUNS; i++) {
  const [n, stacking] = CONFIGS[i % CONFIGS.length];
  try {
    totalSteps += runGame(n, stacking);
    ok++;
  } catch (e) {
    console.error(`❌ Партия #${i} (игроков ${n}, stacking ${stacking}):`, e.message);
    process.exit(1);
  }
}

console.log(`✅ Успешно сыграно ${ok}/${RUNS} партий (2–8 игроков, со стеком и без).`);
console.log(`   Всего ходов: ${totalSteps}, в среднем ${(totalSteps / ok).toFixed(1)} на партию.`);
console.log("   Инварианты соблюдены: 108 карт всегда, нет нелегальных ходов, нет зависаний, всегда есть победитель.");
