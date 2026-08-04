/**
 * victory-ui.js
 * Экран завершения партии: победитель, таблица игроков, «Играть снова».
 */
import { el, clear } from '../utils/dom.js';
import { sounds } from '../audio/sound-manager.js';

export class VictoryView {
  constructor(root, deps) {
    this.root = root; // оверлей-контейнер
    this.deps = deps; // { getMyId, onPlayAgain, onLeave }
    this._shownVersion = null;
  }

  update(room) {
    const game = room.game;
    if (!game || game.status !== 'finished') { this.hide(); return; }
    // Рендерим один раз на завершённую партию.
    if (this._shownVersion === game.version) return;
    this._shownVersion = game.version;
    this._render(room, game);
    this.show();
  }

  _render(room, game) {
    clear(this.root);
    const myId = this.deps.getMyId();
    const isHost = room.hostId === myId;
    const winner = game.players.find((p) => p.id === game.winner);
    const iWon = game.winner === myId;

    // Ранжирование: победитель (0 карт) сверху, дальше по возрастанию карт.
    const ranking = [...game.players]
      .map((p) => ({ ...p, cards: game.hands[p.id].length }))
      .sort((a, b) => a.cards - b.cards);

    const table = el('div', { className: 'result-table' });
    ranking.forEach((p, i) => {
      table.append(el('div', {
        className: `result-row${p.id === game.winner ? ' is-winner' : ''}${p.id === myId ? ' is-me' : ''}`,
      }, [
        el('span', { className: 'result-row__place', text: `${i + 1}` }),
        el('span', { className: 'result-row__name', text: p.name }),
        el('span', { className: 'result-row__cards', text: p.cards === 0 ? '\u2605' : `${p.cards}` }),
      ]));
    });

    const actions = el('div', { className: 'result-actions' });
    if (isHost) {
      actions.append(el('button', {
        className: 'btn btn--primary btn--block',
        text: 'Играть снова',
        onClick: () => { sounds.button(); this.deps.onPlayAgain(); },
      }));
    } else {
      actions.append(el('div', { className: 'lobby-wait', text: 'Ожидание хоста…' }));
    }
    actions.append(el('button', {
      className: 'btn btn--ghost btn--block',
      text: 'Выйти в меню',
      onClick: () => { sounds.button(); this.deps.onLeave(); },
    }));

    this.root.append(el('div', { className: 'result-card' }, [
      el('div', { className: `result-hero ${iWon ? 'is-win' : 'is-lose'}` }, [
        el('span', { className: 'result-hero__label', text: iWon ? 'Победа' : 'Партия окончена' }),
        el('span', { className: 'result-hero__winner', text: winner ? winner.name : '' }),
      ]),
      table,
      actions,
    ]));
  }

  show() {
    this.root.classList.add('is-visible');
  }
  hide() {
    this.root.classList.remove('is-visible');
    this._shownVersion = null;
  }
}
