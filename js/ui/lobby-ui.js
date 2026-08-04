/**
 * lobby-ui.js
 * Лобби комнаты: код для друзей, список игроков, настройки (для хоста),
 * кнопки «Начать игру» и «Выйти».
 */
import { el, clear } from '../utils/dom.js';
import { createSettingsForm } from './settings-form.js';
import { LIMITS } from '../core/constants.js';
import { sounds } from '../audio/sound-manager.js';
import { toast } from './toast.js';

export class LobbyView {
  constructor(root, deps) {
    this.root = root;
    this.deps = deps; // { getMyId, onStart, onLeave, onSettingsChange, isOnline }
    this.form = null;
    this._built = false;
  }

  update(room) {
    const myId = this.deps.getMyId();
    const isHost = room.hostId === myId;

    if (!this._built) this._build(room, isHost);

    // Код.
    this._codeEl.textContent = room.code;

    // Настройки (форма строится один раз; для не-хоста — только чтение).
    if (this.form) {
      // Обновляем значения только если пользователь их не редактирует прямо сейчас.
      if (!isHost) this.form.setValues(room.settings);
      this.form.setDisabled(!isHost);
    }

    // Список игроков.
    clear(this._playersEl);
    for (const p of room.players) {
      const online = this.deps.isOnline(room, p.id);
      this._playersEl.append(el('div', {
        className: `lobby-player${online ? '' : ' is-offline'}`,
      }, [
        el('span', { className: 'lobby-player__dot' }),
        el('span', { className: 'lobby-player__name', text: p.name }),
        p.id === room.hostId ? el('span', { className: 'lobby-player__host', text: 'хост' }) : null,
        p.id === myId ? el('span', { className: 'lobby-player__you', text: 'вы' }) : null,
      ]));
    }
    this._countEl.textContent =
      `${room.players.length} / ${room.settings.maxPlayers}`;

    // Кнопка старта.
    if (isHost) {
      this._startBtn.style.display = '';
      this._waitEl.style.display = 'none';
      this._startBtn.disabled = room.players.length < LIMITS.minPlayers;
      this._startBtn.textContent = room.players.length < LIMITS.minPlayers
        ? 'Нужно минимум 2 игрока'
        : 'Начать игру';
    } else {
      this._startBtn.style.display = 'none';
      this._waitEl.style.display = '';
    }
  }

  _build(room, isHost) {
    clear(this.root);

    this._codeEl = el('span', { className: 'room-code__value', text: room.code });
    const copyBtn = el('button', {
      className: 'btn btn--ghost btn--sm',
      text: 'Копировать',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(room.code);
          toast('Код скопирован', 'success', 1400);
        } catch (_) { toast('Не удалось скопировать', 'error'); }
      },
    });

    this._playersEl = el('div', { className: 'lobby-players' });
    this._countEl = el('span', { className: 'lobby-count' });

    this.form = createSettingsForm(room.settings, (vals) => {
      if (this.deps.getMyId() === room.hostId) this.deps.onSettingsChange(vals);
    });

    this._startBtn = el('button', {
      className: 'btn btn--primary btn--block',
      text: 'Начать игру',
      onClick: () => { sounds.button(); this.deps.onStart(); },
    });
    this._waitEl = el('div', { className: 'lobby-wait', text: 'Ожидание хоста…' });

    const leaveBtn = el('button', {
      className: 'btn btn--ghost btn--block',
      text: 'Выйти',
      onClick: () => { sounds.button(); this.deps.onLeave(); },
    });

    this.root.append(el('div', { className: 'lobby-card' }, [
      el('div', { className: 'room-code' }, [
        el('span', { className: 'room-code__label', text: 'Код комнаты' }),
        this._codeEl,
        copyBtn,
      ]),
      el('div', { className: 'lobby-section' }, [
        el('div', { className: 'lobby-section__head' }, [
          el('span', { className: 'lobby-section__title', text: 'Игроки' }),
          this._countEl,
        ]),
        this._playersEl,
      ]),
      el('div', { className: 'lobby-section' }, [
        el('span', { className: 'lobby-section__title', text: 'Настройки' }),
        this.form.element,
      ]),
      this._startBtn,
      this._waitEl,
      leaveBtn,
    ]));

    this._built = true;
  }

  destroy() {
    this._built = false;
    clear(this.root);
  }
}
