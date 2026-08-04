/**
 * chat-ui.js
 * Простой чат: плавающая кнопка открытия, панель с сообщениями и полем ввода.
 */
import { el, clear } from '../utils/dom.js';
import { sounds } from '../audio/sound-manager.js';

export class ChatView {
  constructor(root, deps) {
    this.root = root;             // контейнер поверх игры
    this.deps = deps;             // { getMyId, onSend }
    this.names = new Map();       // senderId -> name
    this._open = false;
    this._lastCount = 0;
    this._primed = false;
    this._build();
  }

  /** Обновляем справочник имён из комнаты (для подписи сообщений). */
  setPlayers(players) {
    for (const p of players) this.names.set(p.id, p.name);
  }

  _build() {
    clear(this.root);

    this._toggle = el('button', {
      className: 'chat-toggle',
      title: 'Чат',
      html: '<span class="chat-toggle__icon">\u2709</span>',
      onClick: () => this.toggle(),
    });
    this._badge = el('span', { className: 'chat-toggle__badge', style: { display: 'none' } });
    this._toggle.append(this._badge);

    this._messages = el('div', { className: 'chat__messages' });

    this._input = el('input', {
      className: 'chat__input',
      type: 'text',
      maxlength: 300,
      placeholder: 'Написать сообщение...',
    });
    this._input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._send(); });

    const sendBtn = el('button', {
      className: 'chat__send',
      title: 'Отправить',
      html: '\u27A4',
      onClick: () => this._send(),
    });

    this._panel = el('div', { className: 'chat' }, [
      el('div', { className: 'chat__head' }, [
        el('span', { className: 'chat__title', text: 'Чат' }),
        el('button', { className: 'chat__close', html: '\u2715', onClick: () => this.close() }),
      ]),
      this._messages,
      el('div', { className: 'chat__bar' }, [this._input, sendBtn]),
    ]);

    this.root.append(this._toggle, this._panel);
  }

  toggle() { this._open ? this.close() : this.open(); }

  open() {
    this._open = true;
    this._panel.classList.add('is-open');
    this._badge.style.display = 'none';
    this._badge.textContent = '';
    this._input.focus();
    this._scrollToBottom();
  }

  close() {
    this._open = false;
    this._panel.classList.remove('is-open');
  }

  _send() {
    const text = this._input.value.trim();
    if (!text) return;
    this._input.value = '';
    sounds.button();
    this.deps.onSend(text);
  }

  /** Отрисовывает список сообщений. */
  render(messages) {
    clear(this._messages);
    const myId = this.deps.getMyId();
    for (const m of messages) {
      const mine = m.senderId === myId;
      const name = this.names.get(m.senderId) || 'Игрок';
      this._messages.append(el('div', {
        className: `chat-msg${mine ? ' is-mine' : ''}`,
      }, [
        mine ? null : el('span', { className: 'chat-msg__author', text: name }),
        el('span', { className: 'chat-msg__text', text: m.text }),
      ]));
    }

    // Первый рендер (первая подписка/переподключение) не считаем «новыми»
    // сообщениями — иначе история спамит бейджем и звуком.
    if (!this._primed) {
      this._primed = true;
      this._lastCount = messages.length;
      if (this._open) this._scrollToBottom();
      return;
    }

    // Звук и бейдж для новых чужих сообщений, когда чат закрыт.
    if (messages.length > this._lastCount) {
      const fresh = messages.slice(this._lastCount);
      const hasOthers = fresh.some((m) => m.senderId !== myId);
      if (hasOthers && !this._open) {
        sounds.chat();
        const n = Number(this._badge.textContent || '0') + fresh.filter((m) => m.senderId !== myId).length;
        this._badge.textContent = String(n);
        this._badge.style.display = '';
      }
    }
    this._lastCount = messages.length;
    if (this._open) this._scrollToBottom();
  }

  _scrollToBottom() {
    this._messages.scrollTop = this._messages.scrollHeight;
  }

  show() { this.root.style.display = ''; }
  hide() { this.root.style.display = 'none'; this.close(); }
}
