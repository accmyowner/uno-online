/**
 * game-ui.js
 * Рендер игрового экрана из состояния комнаты и обработка действий игрока.
 *
 * Всё, что меняет игру, отправляется через колбэк submit(action) — то есть
 * через транзакцию Firestore. UI лишь отображает актуальное состояние и
 * формирует корректные действия. Никакой игровой логики здесь нет.
 */
import { el, clear } from '../utils/dom.js';
import { HandRenderer } from './hand-renderer.js';
import { createCardFace, createCardBack } from './card.js';
import { canPlay, isWildCard } from '../core/rules.js';
import { topCard } from '../core/game-engine.js';
import { CARD_TYPE, COLORS } from '../core/constants.js';
import { sounds } from '../audio/sound-manager.js';
import { toast } from './toast.js';

const COLOR_LABELS = { red: 'Красный', yellow: 'Жёлтый', green: 'Зелёный', blue: 'Синий' };

export class GameView {
  constructor(root, deps) {
    this.root = root;
    this.getMyId = deps.getMyId;
    this.submit = deps.submit;         // (action) => Promise<{ok,error}>
    this.isOnline = deps.isOnline;     // (room, playerId) => bool

    this.elOpponents = el('div', { className: 'opponents', id: 'game-opponents' });
    this.elTable = el('div', { className: 'table', id: 'game-table' });
    this.elTimer = el('div', { className: 'turn-timer', id: 'turn-timer' }, [
      el('div', { className: 'turn-timer__bar' }),
    ]);
    this.elControls = el('div', { className: 'controls', id: 'game-controls' });
    this.elHand = el('div', { className: 'hand', id: 'game-hand' });

    clear(root);
    root.append(this.elTimer, this.elOpponents, this.elTable, this.elControls, this.elHand);

    this.hand = new HandRenderer(this.elHand, (cardId) => this._onCardSelect(cardId));

    this._lastVersion = -1;
    this._soundPrimed = false;   // первый снапшот не проигрывает звук (важно при реконнекте)
    this._pickerOpen = 0;        // сколько модальных оверлеев выбора открыто
    this._overlays = new Set();  // ссылки на оверлеи для очистки при destroy
    this._pendingTimeoutFor = null;
  }

  /** Обновление из снапшота комнаты. */
  update(room) {
    this.room = room;
    const game = room.game;
    if (!game) return;

    this._maybePlaySound(game);
    this._renderOpponents(room, game);
    this._renderTable(game);
    this._renderControls(room, game);
    this._renderHand(game);
  }

  get myId() { return this.getMyId(); }
  get isMyTurn() {
    const g = this.room?.game;
    return g && g.players[g.currentIndex]?.id === this.myId;
  }

  /* ------------------------- Звуки по событиям ------------------------- */
  _maybePlaySound(game) {
    // Первый снапшот (в т.ч. после переподключения) не озвучиваем —
    // иначе можно услышать звук уже случившегося действия.
    if (!this._soundPrimed) {
      this._soundPrimed = true;
      this._lastVersion = game.version;
      return;
    }
    const a = game.lastAction;
    if (!a || game.version === this._lastVersion) { this._lastVersion = game.version; return; }
    this._lastVersion = game.version;
    switch (a.type) {
      case 'PLAY':
        if (a.win) { a.playerId === this.myId ? sounds.win() : sounds.lose(); }
        else sounds.play();
        break;
      case 'DRAW':
      case 'TIMEOUT': sounds.draw(); break;
      case 'CALL_UNO': sounds.uno(); break;
      case 'CATCH_UNO':
        sounds.draw();
        if (a.targetId === this.myId) toast('Вас поймали на UNO: +2 карты', 'error');
        else if (a.playerId === this.myId) toast('Вы поймали UNO! Штраф сопернику', 'success');
        break;
      default: break;
    }
  }

  /* ------------------------- Оппоненты ------------------------- */
  _renderOpponents(room, game) {
    clear(this.elOpponents);
    const myIndex = game.players.findIndex((p) => p.id === this.myId);

    // Порядок: начиная со следующего за мной — по кругу.
    const order = [];
    for (let k = 1; k < game.players.length; k++) {
      order.push(game.players[(myIndex + k) % game.players.length]);
    }

    for (const p of order) {
      const idx = game.players.findIndex((x) => x.id === p.id);
      const count = game.hands[p.id].length;
      const isCurrent = game.currentIndex === idx;
      const online = this.isOnline(room, p.id);
      const uno = game.unoState;
      const catchable = uno && !uno.safe && uno.playerId === p.id && count === 1;

      const seat = el('div', {
        className: `seat${isCurrent ? ' is-current' : ''}${online ? '' : ' is-offline'}`,
      });

      seat.append(
        el('div', { className: 'seat__head' }, [
          el('span', { className: 'seat__name', text: p.name }),
          el('span', { className: 'seat__count', text: `${count}` }),
        ])
      );

      // Мини-веер рубашек (до 8 для аккуратности).
      const mini = el('div', { className: 'seat__cards' });
      const shown = Math.min(count, 8);
      for (let i = 0; i < shown; i++) {
        const back = createCardBack();
        back.classList.add('mini-card');
        back.style.left = `${i * 12}px`;
        mini.append(back);
      }
      mini.style.width = `${(shown - 1) * 12 + 34}px`;
      seat.append(mini);

      if (count === 1) {
        seat.append(el('span', {
          className: `seat__badge${uno && uno.safe && uno.playerId === p.id ? ' is-safe' : ' is-warn'}`,
          text: uno && uno.safe && uno.playerId === p.id ? 'UNO' : '1 карта',
        }));
      }

      if (catchable) {
        seat.append(el('button', {
          className: 'btn btn--catch',
          text: 'Поймать UNO',
          onClick: () => this._catchUno(p.id),
        }));
      }

      this.elOpponents.append(seat);
    }
  }

  /* ------------------------- Стол ------------------------- */
  _renderTable(game) {
    clear(this.elTable);
    const top = topCard(game);

    const drawPile = el('div', {
      className: `pile pile--draw${this.isMyTurn && !game.drawnThisTurn ? ' is-active' : ''}`,
      onClick: () => this._draw(),
    }, [createCardBack(), el('span', { className: 'pile__label', text: 'Взять' })]);

    const discard = el('div', { className: 'pile pile--discard' });
    const topFace = createCardFace(top);
    discard.append(topFace);

    // Индикатор активного цвета (для wild).
    const colorDot = el('div', {
      className: `color-indicator color-indicator--${game.activeColor}`,
      title: COLOR_LABELS[game.activeColor] || '',
    });

    const dir = el('div', {
      className: 'direction',
      text: game.direction === 1 ? '\u21BB' : '\u21BA', // ↻ / ↺
    });

    this.elTable.append(drawPile, discard, colorDot, dir);
  }

  /* ------------------------- Кнопки управления ------------------------- */
  _renderControls(room, game) {
    clear(this.elControls);
    const g = game;
    const uno = g.unoState;

    // Большая кнопка UNO, когда я под угрозой и ещё не объявил.
    if (uno && !uno.safe && uno.playerId === this.myId) {
      this.elControls.append(el('button', {
        className: 'btn btn--uno pulse',
        text: 'UNO!',
        onClick: () => this._callUno(),
      }));
    }

    if (this.isMyTurn) {
      if (!g.drawnThisTurn) {
        this.elControls.append(el('button', {
          className: 'btn btn--draw',
          text: 'Взять карту',
          onClick: () => this._draw(),
        }));
      } else {
        this.elControls.append(el('button', {
          className: 'btn btn--pass',
          text: 'Пропустить ход',
          onClick: () => this._pass(),
        }));
      }
      this.elControls.append(el('span', { className: 'controls__turn', text: 'Ваш ход' }));
    } else {
      const cur = g.players[g.currentIndex];
      this.elControls.append(el('span', {
        className: 'controls__turn is-waiting',
        text: `Ходит: ${cur ? cur.name : '...'}`,
      }));
    }
  }

  /* ------------------------- Рука ------------------------- */
  _renderHand(game) {
    const myHand = game.hands[this.myId] || [];
    const top = topCard(game);
    const playable = (card) =>
      this.isMyTurn && canPlay(card, top, game.activeColor);
    this.hand.render(myHand, playable);
  }

  /* ------------------------- Действия ------------------------- */
  async _onCardSelect(cardId) {
    const game = this.room?.game;
    if (!game || !this.isMyTurn) return;
    const card = (game.hands[this.myId] || []).find((c) => c.id === cardId);
    if (!card) return;
    if (!canPlay(card, topCard(game), game.activeColor)) return;

    sounds.button();

    if (isWildCard(card)) {
      const color = await this._pickColor();
      if (!color) return;
      let swapTargetId;
      if (card.type === CARD_TYPE.SWAP_HANDS) {
        swapTargetId = await this._pickSwapTarget();
        if (!swapTargetId) return;
      }
      this._send({ type: 'PLAY', playerId: this.myId, cardId, chosenColor: color, swapTargetId });
    } else {
      this._send({ type: 'PLAY', playerId: this.myId, cardId });
    }
  }

  _draw() {
    if (!this.isMyTurn || this.room.game.drawnThisTurn) return;
    sounds.button();
    this._send({ type: 'DRAW', playerId: this.myId });
  }

  _pass() {
    sounds.button();
    this._send({ type: 'PASS', playerId: this.myId });
  }

  _callUno() {
    sounds.uno();
    this._send({ type: 'CALL_UNO', playerId: this.myId });
  }

  _catchUno(targetId) {
    sounds.button();
    this._send({ type: 'CATCH_UNO', playerId: this.myId, targetId });
  }

  async _send(action) {
    const res = await this.submit(action);
    if (res && !res.ok) toast(res.error || 'Действие отклонено', 'error');
  }

  /* ------------------------- Выбор цвета ------------------------- */
  _pickColor() {
    return new Promise((resolve) => {
      const overlay = el('div', { className: 'overlay' });
      const box = el('div', { className: 'picker' }, [
        el('h3', { className: 'picker__title', text: 'Выберите цвет' }),
      ]);
      const grid = el('div', { className: 'picker__colors' });
      for (const c of COLORS) {
        grid.append(el('button', {
          className: `color-btn color-btn--${c}`,
          title: COLOR_LABELS[c],
          onClick: () => { cleanup(); resolve(c); },
        }));
      }
      box.append(grid);
      overlay.append(box);
      const onEsc = (e) => { if (e.key === 'Escape') { cleanup(); resolve(null); } };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
      document.addEventListener('keydown', onEsc);
      document.body.append(overlay);
      this._pickerOpen++;
      this._overlays.add(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-visible'));
      const self = this;
      function cleanup() {
        document.removeEventListener('keydown', onEsc);
        overlay.remove();
        self._overlays.delete(overlay);
        self._pickerOpen = Math.max(0, self._pickerOpen - 1);
      }
    });
  }

  /* ------------------------- Выбор игрока для обмена ------------------------- */
  _pickSwapTarget() {
    const game = this.room.game;
    const others = game.players.filter((p) => p.id !== this.myId);
    return new Promise((resolve) => {
      const overlay = el('div', { className: 'overlay' });
      const box = el('div', { className: 'picker' }, [
        el('h3', { className: 'picker__title', text: 'С кем поменяться руками?' }),
      ]);
      const list = el('div', { className: 'picker__list' });
      for (const p of others) {
        list.append(el('button', {
          className: 'btn btn--ghost',
          text: `${p.name} (${game.hands[p.id].length})`,
          onClick: () => { cleanup(); resolve(p.id); },
        }));
      }
      box.append(list);
      overlay.append(box);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
      document.body.append(overlay);
      this._pickerOpen++;
      this._overlays.add(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-visible'));
      const self = this;
      function cleanup() {
        overlay.remove();
        self._overlays.delete(overlay);
        self._pickerOpen = Math.max(0, self._pickerOpen - 1);
      }
    });
  }

  /* ------------------------- Таймер и авто-пропуск ------------------------- */
  /**
   * Вызывается контроллером ~2 раза в секунду.
   * - Обновляет полоску таймера.
   * - По истечении времени: свой ход -> сам берёт карту (TIMEOUT).
   * - Если текущий игрок офлайн -> любой онлайн-игрок инициирует TIMEOUT.
   */
  tick() {
    const g = this.room?.game;
    if (!g || g.status !== 'playing') return;
    const timer = g.turnTimer;
    if (!timer) { this._setTimerBar(1); return; }

    const elapsed = (Date.now() - g.turnStartAt) / 1000;
    const ratio = Math.max(0, 1 - elapsed / timer);
    this._setTimerBar(ratio);

    const cur = g.players[g.currentIndex];
    if (!cur) return;
    const grace = 3;

    if (cur.id === this.myId) {
      // Не прерываем игрока, пока открыт выбор цвета/игрока для обмена.
      if (elapsed > timer + grace && !this._pickerOpen) this._triggerTimeout(cur.id);
    } else if (!this.isOnline(this.room, cur.id)) {
      // Дедупликация: инициирует только «референт» — онлайн-игрок с мин. uid.
      if (elapsed > timer + grace + 2 && this._isReferee()) this._triggerTimeout(cur.id);
    }
  }

  _isReferee() {
    const room = this.room;
    const online = room.game.players
      .map((p) => p.id)
      .filter((id) => this.isOnline(room, id));
    if (online.length === 0) return false;
    online.sort();
    return online[0] === this.myId;
  }

  _triggerTimeout(playerId) {
    // Не спамим: один запрос на «поколение» хода.
    if (this._pendingTimeoutFor === this.room.game.version) return;
    this._pendingTimeoutFor = this.room.game.version;
    // Таймаут отправляем «тихо»: при гонке нескольких клиентов проигравший
    // получит отказ (ход уже перешёл) — это норма, тост показывать не нужно.
    this.submit({ type: 'TIMEOUT', playerId });
  }

  _setTimerBar(ratio) {
    const bar = this.elTimer.querySelector('.turn-timer__bar');
    if (bar) {
      bar.style.width = `${ratio * 100}%`;
      bar.classList.toggle('is-low', ratio < 0.25);
    }
  }

  destroy() {
    // Убираем возможные открытые оверлеи выбора, чтобы не залипали поверх меню.
    for (const o of this._overlays) o.remove();
    this._overlays.clear();
    this._pickerOpen = 0;
    this.hand.destroy();
    clear(this.root);
  }
}
