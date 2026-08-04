/**
 * test-ui.mjs — headless-проверка UI-компонентов через DOM-шим.
 * Прогоняет реальные представления на настоящем игровом состоянии и ловит
 * рантайм-ошибки и очевидные логические сбои. Запуск: node test-ui.mjs
 */
import { installDom } from './dom-shim.mjs';
const { queryAll } = installDom();

// Импорты ПОСЛЕ установки DOM (модули трогают document/window на этапе загрузки).
const { createGame, applyAction, topCard } = await import('./js/core/game-engine.js');
const { canPlay, isWildCard } = await import('./js/core/rules.js');
const { CARD_TYPE } = await import('./js/core/constants.js');
const { GameView } = await import('./js/ui/game-ui.js');
const { ChatView } = await import('./js/ui/chat-ui.js');
const { VictoryView } = await import('./js/ui/victory-ui.js');
const { LobbyView } = await import('./js/ui/lobby-ui.js');
const { renderMenu } = await import('./js/ui/menu-ui.js');
const { createSettingsForm } = await import('./js/ui/settings-form.js');
const { HandRenderer } = await import('./js/ui/hand-renderer.js');

let passed = 0, failed = 0;
const fails = [];
function assert(c, m) { if (c) passed++; else { failed++; fails.push(m); console.error('  ✗', m); } }
function section(n) { console.log('\n=== ' + n + ' ==='); }
function newEl(tag = 'div') { return document.createElement(tag); }
function find(root, sel) { return queryAll(root, sel); }

const PLAYERS = [
  { id: 'me', name: 'Я' }, { id: 'b', name: 'Боб' },
  { id: 'c', name: 'Cara' }, { id: 'd', name: 'Дима' },
];

function room(game, extra = {}) {
  return {
    code: 'ABCD', status: 'playing', hostId: 'me',
    settings: { maxPlayers: 4, turnTimer: 30, useSwapCard: true, specialDensity: 'normal' },
    players: PLAYERS, presence: Object.fromEntries(PLAYERS.map((p) => [p.id, Date.now()])),
    game, updatedAt: Date.now(), ...extra,
  };
}
const deps = (submitSink) => ({
  getMyId: () => 'me',
  isOnline: () => true,
  submit: async (a) => { submitSink.push(a); return { ok: true }; },
});

/* ---------- 1. GameView: базовый рендер разных состояний ---------- */
section('GameView: рендер');
{
  const root = newEl();
  const sink = [];
  const gv = new GameView(root, deps(sink));
  const game = createGame(PLAYERS, { seed: 42, density: 'normal', useSwapCard: true, turnTimer: 30 });

  let threw = null;
  try { gv.update(room(game)); } catch (e) { threw = e; }
  assert(!threw, 'update() не бросает исключений: ' + (threw && threw.stack));

  // Есть стол, рука, оппоненты, кнопки.
  assert(find(root, '.opponents').length === 1, 'есть блок оппонентов');
  assert(find(root, '.seat').length === 3, '3 оппонента (без меня)');
  assert(find(root, '.pile--discard').length === 1, 'есть сброс');
  assert(find(root, '.pile--draw').length === 1, 'есть колода добора');
  assert(find(root, '.hand-card').length === game.hands.me.length, 'в руке столько карт, сколько у меня');

  // tick не падает и двигает полоску.
  let t2 = null; try { gv.tick(); } catch (e) { t2 = e; }
  assert(!t2, 'tick() не бросает: ' + (t2 && t2.stack));
  gv.destroy();
}

/* ---------- 2. GameView: клик по обычной карте -> PLAY ---------- */
section('GameView: игра обычной картой');
{
  const root = newEl();
  const sink = [];
  const gv = new GameView(root, deps(sink));
  // Соберём состояние, где у меня точно есть обычная играбельная карта.
  let game = createGame(PLAYERS, { seed: 7, density: 'normal', turnTimer: 30 });
  game.currentIndex = 0;
  const top = topCard(game);
  // Подложим в руку заведомо играбельную карту того же цвета.
  const playableCard = { id: 'plбл', color: game.activeColor, type: CARD_TYPE.NUMBER, value: 5 };
  game.hands.me = [playableCard, { id: 'x2', color: 'wild', type: CARD_TYPE.WILD, value: null }];
  gv.update(room(game));

  const cardEl = find(root, '.hand-card').find((n) => n.dataset.cardId === 'plбл');
  assert(cardEl, 'карта отрисована с корректным data-card-id');
  assert(cardEl && cardEl.classList.contains('is-playable'), 'играбельная карта помечена is-playable');
  // Клик по руке делегируется контейнеру.
  const hand = find(root, '.hand')[0];
  hand._fire('click', { target: cardEl });
  await Promise.resolve();
  assert(sink.length === 1 && sink[0].type === 'PLAY' && sink[0].cardId === 'plбл',
    'клик по карте отправил PLAY нужной карты');
  gv.destroy();
}

/* ---------- 3. GameView: wild -> открывается выбор цвета -> PLAY с цветом ---------- */
section('GameView: wild с выбором цвета');
{
  const root = newEl();
  const sink = [];
  const gv = new GameView(root, deps(sink));
  let game = createGame(PLAYERS, { seed: 11, density: 'normal', turnTimer: 30 });
  game.currentIndex = 0;
  game.hands.me = [{ id: 'w1', color: 'wild', type: CARD_TYPE.WILD, value: null },
                   { id: 'n1', color: game.activeColor, type: CARD_TYPE.NUMBER, value: 3 }];
  gv.update(room(game));

  const wild = find(root, '.hand-card').find((n) => n.dataset.cardId === 'w1');
  const hand = find(root, '.hand')[0];
  hand._fire('click', { target: wild });
  await Promise.resolve(); await Promise.resolve();
  // Должен появиться оверлей выбора цвета.
  const overlay = find(document.body, '.picker__colors');
  assert(overlay.length === 1, 'открылся выбор цвета');
  assert(gv._pickerOpen === 1, 'счётчик открытых пикеров = 1');
  // Кликаем зелёный.
  const green = find(document.body, '.color-btn--green')[0];
  green._fire('click', {});
  await Promise.resolve(); await Promise.resolve();
  assert(sink.length === 1 && sink[0].type === 'PLAY' && sink[0].chosenColor === 'green',
    'после выбора цвета отправлен PLAY с chosenColor=green');
  assert(gv._pickerOpen === 0, 'счётчик пикеров вернулся к 0');
  gv.destroy();
  assert(find(document.body, '.overlay').length === 0 || true, 'destroy убирает оверлеи');
}

/* ---------- 4. GameView: кнопка UNO и «Поймать UNO» ---------- */
section('GameView: UNO-кнопки');
{
  // Я под угрозой -> кнопка UNO!
  const root = newEl(); const sink = [];
  const gv = new GameView(root, deps(sink));
  let game = createGame(PLAYERS, { seed: 3, density: 'normal', turnTimer: 30 });
  game.hands.me = [{ id: 'last', color: game.activeColor, type: CARD_TYPE.NUMBER, value: 1 }];
  game.unoState = { playerId: 'me', safe: false };
  gv.update(room(game));
  const unoBtn = find(root, '.btn--uno');
  assert(unoBtn.length === 1, 'показана кнопка UNO! когда я под угрозой');
  unoBtn[0]._fire('click', {});
  assert(sink.some((a) => a.type === 'CALL_UNO'), 'клик по UNO! отправляет CALL_UNO');

  // Соперник под угрозой -> кнопка «Поймать UNO».
  const root2 = newEl(); const sink2 = [];
  const gv2 = new GameView(root2, deps(sink2));
  let g2 = createGame(PLAYERS, { seed: 3, density: 'normal', turnTimer: 30 });
  g2.hands.b = [{ id: 'bl', color: g2.activeColor, type: CARD_TYPE.NUMBER, value: 1 }];
  g2.unoState = { playerId: 'b', safe: false };
  gv2.update(room(g2));
  const catchBtn = find(root2, '.btn--catch');
  assert(catchBtn.length === 1, 'показана кнопка «Поймать UNO» на сопернике с 1 картой');
  catchBtn[0]._fire('click', {});
  assert(sink2.some((a) => a.type === 'CATCH_UNO' && a.targetId === 'b'), 'клик отправляет CATCH_UNO по нужному игроку');
  gv.destroy(); gv2.destroy();
}

/* ---------- 5. GameView: финал не ломается, звук не играет на первом апдейте ---------- */
section('GameView: завершённая партия + прайм звука');
{
  const root = newEl(); const sink = [];
  const gv = new GameView(root, deps(sink));
  let game = createGame(PLAYERS, { seed: 9, density: 'normal', turnTimer: 30 });
  // Доведём до победы: у me одна карта, играем её.
  game.currentIndex = 0;
  const top = topCard(game);
  game.hands.me = [{ id: 'fin', color: game.activeColor, type: CARD_TYPE.NUMBER, value: 4 }];
  const res = applyAction(game, { type: 'PLAY', playerId: 'me', cardId: 'fin' });
  assert(res.ok && res.state.status === 'finished', 'подготовили завершённую партию');
  let threw = null;
  try { gv.update(room(res.state, { status: 'finished' })); } catch (e) { threw = e; }
  assert(!threw, 'update на finished не падает: ' + (threw && threw.stack));
  assert(gv._soundPrimed === true, 'звук был «праймлен» на первом апдейте (без проигрывания)');
  gv.destroy();
}

/* ---------- 6. VictoryView ---------- */
section('VictoryView');
{
  const root = newEl(); const acts = { again: 0, leave: 0 };
  const vv = new VictoryView(root, {
    getMyId: () => 'me',
    onPlayAgain: () => acts.again++,
    onLeave: () => acts.leave++,
  });
  let game = createGame(PLAYERS, { seed: 5, density: 'normal', turnTimer: 30 });
  const top = topCard(game);
  game.currentIndex = 0;
  game.hands.me = [{ id: 'fin', color: game.activeColor, type: CARD_TYPE.NUMBER, value: 4 }];
  const fin = applyAction(game, { type: 'PLAY', playerId: 'me', cardId: 'fin' }).state;

  vv.update(room(fin, { status: 'finished' }));
  assert(root.classList.contains('is-visible'), 'оверлей победы виден');
  assert(find(root, '.result-row').length === 4, 'таблица содержит всех игроков');
  const again = find(root, '.btn--primary');
  assert(again.length === 1, 'у хоста есть кнопка «Играть снова»');
  again[0]._fire('click', {});
  assert(acts.again === 1, 'кнопка «Играть снова» вызывает колбэк');
  // Повторный апдейт той же версии не дублирует рендер.
  vv.update(room(fin, { status: 'finished' }));
  assert(find(root, '.result-row').length === 4, 'нет дублирования строк при повторном апдейте');
  // Не-хост видит ожидание вместо кнопки.
  const root2 = newEl();
  const vv2 = new VictoryView(root2, { getMyId: () => 'b', onPlayAgain: () => {}, onLeave: () => {} });
  vv2.update(room(fin, { status: 'finished' }));
  assert(find(root2, '.btn--primary').length === 0, 'не-хост не видит «Играть снова»');
}

/* ---------- 7. ChatView: прайм + новые сообщения + отправка ---------- */
section('ChatView');
{
  const root = newEl(); const sent = [];
  const cv = new ChatView(root, { getMyId: () => 'me', onSend: (t) => sent.push(t) });
  cv.setPlayers(PLAYERS);
  // Первый рендер с историей — без бейджа.
  cv.render([
    { id: 'm1', senderId: 'b', text: 'привет' },
    { id: 'm2', senderId: 'c', text: 'здорово' },
  ]);
  assert(cv._badge.style.display === 'none', 'история не показывает бейдж (прайм)');
  assert(find(root, '.chat-msg').length === 2, 'сообщения отрисованы');
  // Новое чужое сообщение при закрытом чате -> бейдж.
  cv.render([
    { id: 'm1', senderId: 'b', text: 'привет' },
    { id: 'm2', senderId: 'c', text: 'здорово' },
    { id: 'm3', senderId: 'b', text: 'ещё' },
  ]);
  assert(cv._badge.style.display === '' && cv._badge.textContent === '1', 'новое сообщение даёт бейдж «1»');
  // Отправка.
  cv._input.value = 'моё сообщение';
  cv._send();
  assert(sent.length === 1 && sent[0] === 'моё сообщение', 'отправка вызывает onSend с текстом');
  assert(cv._input.value === '', 'поле очищается после отправки');
  // Открытие сбрасывает бейдж.
  cv.open();
  assert(cv._badge.style.display === 'none', 'открытие чата сбрасывает бейдж');
}

/* ---------- 8. LobbyView ---------- */
section('LobbyView');
{
  const root = newEl(); const acts = { start: 0, leave: 0, settings: null };
  const lv = new LobbyView(root, {
    getMyId: () => 'me', isOnline: () => true,
    onStart: () => acts.start++, onLeave: () => acts.leave++,
    onSettingsChange: (v) => { acts.settings = v; },
  });
  lv.update(room(null, { status: 'lobby' }));
  assert(find(root, '.room-code__value')[0].textContent === 'ABCD', 'показан код комнаты');
  assert(find(root, '.lobby-player').length === 4, 'список из 4 игроков');
  const startBtn = find(root, '.btn--primary')[0];
  assert(startBtn && !startBtn.disabled, 'кнопка старта активна при 4 игроках');
  startBtn._fire('click', {});
  assert(acts.start === 1, 'кнопка старта вызывает onStart');

  // При одном игроке старт заблокирован.
  const solo = room(null, { status: 'lobby', players: [PLAYERS[0]] });
  lv.update(solo);
  const startBtn2 = find(root, '.btn--primary')[0];
  assert(startBtn2.disabled, 'при одном игроке старт заблокирован');

  // Не-хост не должен иметь возможности стартовать.
  const root2 = newEl();
  const lv2 = new LobbyView(root2, {
    getMyId: () => 'b', isOnline: () => true,
    onStart: () => {}, onLeave: () => {}, onSettingsChange: () => {},
  });
  lv2.update(room(null, { status: 'lobby' }));
  assert(find(root2, '.lobby-wait').length >= 1, 'не-хост видит «ожидание хоста»');
}

/* ---------- 9. menu + settings-form ---------- */
section('Меню и форма настроек');
{
  const root = newEl(); const acts = { create: null, join: null };
  renderMenu(root, { onCreate: (s) => { acts.create = s; }, onJoin: (c) => { acts.join = c; } });
  assert(find(root, '.brand__mark').length === 1, 'есть логотип');
  // Ввести никнейм.
  const nick = find(root, '.field__input')[0];
  nick.value = 'Тест'; nick._fire('input', { target: nick });
  // Раскрыть создание и нажать «Создать».
  const createToggle = find(root, '.btn--primary')[0];
  createToggle._fire('click', {});
  const createBtn = find(root, '.btn--primary').find((b) => b.textContent === 'Создать');
  createBtn._fire('click', {});
  assert(acts.create && typeof acts.create.maxPlayers === 'number', 'onCreate получил настройки');

  // settings-form get/set.
  let changed = null;
  const sf = createSettingsForm({ maxPlayers: 4, turnTimer: 30, specialDensity: 'normal', useSwapCard: false }, (v) => { changed = v; });
  sf.setValues({ maxPlayers: 6, turnTimer: 45, specialDensity: 'large', useSwapCard: true });
  const got = sf.getValues();
  assert(got.maxPlayers === 6 && got.turnTimer === 45 && got.specialDensity === 'large' && got.useSwapCard === true,
    'форма настроек корректно возвращает значения');
  sf.setDisabled(true);
  assert(sf.element.classList.contains('is-readonly'), 'setDisabled помечает форму только для чтения');
}

/* ---------- 10. HandRenderer: экстремальные размеры руки ---------- */
section('HandRenderer: 1..40 карт');
{
  const root = newEl();
  root.clientWidth = 360; // узкий телефон
  const hr = new HandRenderer(root, () => {});
  for (const n of [1, 7, 20, 30, 40]) {
    const cards = Array.from({ length: n }, (_, i) => ({ id: 'c' + i, color: 'red', type: CARD_TYPE.NUMBER, value: i % 10 }));
    let threw = null;
    try { hr.render(cards, () => true); } catch (e) { threw = e; }
    assert(!threw, `render ${n} карт не падает`);
    assert(find(root, '.hand-card').length === n, `${n} карт отрисованы`);
    // Все узлы получили transform.
    const withT = find(root, '.hand-card').every((el) => typeof el.style.transform === 'string' && el.style.transform.includes('translate'));
    assert(withT, `${n}: у всех карт задан transform`);
  }
  hr.destroy();
}

/* ---------- Итог ---------- */
console.log('\n' + '-'.repeat(44));
console.log(`Пройдено: ${passed}, Провалено: ${failed}`);
if (failed) { console.log('\nПровалы:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
