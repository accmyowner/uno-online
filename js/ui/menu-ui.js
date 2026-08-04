/**
 * menu-ui.js
 * Главное меню: никнейм, создание комнаты (с настройками) и вход по коду.
 */
import { el, clear } from '../utils/dom.js';
import { store } from '../state/store.js';
import { createSettingsForm } from './settings-form.js';
import { ROOM_DEFAULTS } from '../core/constants.js';
import { sounds } from '../audio/sound-manager.js';
import { toast } from './toast.js';

export function renderMenu(root, { onCreate, onJoin }) {
  clear(root);

  const nick = el('input', {
    className: 'field__input',
    type: 'text',
    maxlength: 16,
    placeholder: 'Ваш никнейм',
    value: store.nickname,
  });
  nick.addEventListener('input', () => { store.nickname = nick.value; });

  const requireNick = () => {
    if (!nick.value.trim()) { toast('Введите никнейм', 'error'); nick.focus(); return false; }
    return true;
  };

  // --- Создание комнаты ---
  const settings = createSettingsForm(ROOM_DEFAULTS);
  const createPanel = el('div', { className: 'panel panel--collapsed' }, [
    settings.element,
    el('button', {
      className: 'btn btn--primary btn--block',
      text: 'Создать',
      onClick: () => { if (requireNick()) { sounds.button(); onCreate(settings.getValues()); } },
    }),
  ]);

  const createToggle = el('button', {
    className: 'btn btn--primary btn--block',
    text: 'Создать комнату',
    onClick: () => {
      sounds.button();
      createPanel.classList.toggle('panel--collapsed');
      joinPanel.classList.add('panel--collapsed');
    },
  });

  // --- Вход по коду ---
  const code = el('input', {
    className: 'field__input field__input--code',
    type: 'text',
    maxlength: 4,
    placeholder: 'КОД',
    autocapitalize: 'characters',
  });
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  const joinPanel = el('div', { className: 'panel panel--collapsed' }, [
    code,
    el('button', {
      className: 'btn btn--block',
      text: 'Войти',
      onClick: () => {
        if (!requireNick()) return;
        if (code.value.length < 4) { toast('Введите код комнаты', 'error'); return; }
        sounds.button();
        onJoin(code.value);
      },
    }),
  ]);

  const joinToggle = el('button', {
    className: 'btn btn--block',
    text: 'Войти по коду',
    onClick: () => {
      sounds.button();
      joinPanel.classList.toggle('panel--collapsed');
      createPanel.classList.add('panel--collapsed');
    },
  });

  const card = el('div', { className: 'menu-card' }, [
    el('div', { className: 'brand' }, [
      el('span', { className: 'brand__mark', text: 'UNO' }),
      el('span', { className: 'brand__sub', text: 'ONLINE' }),
    ]),
    el('label', { className: 'field' }, [
      el('span', { className: 'field__label', text: 'Никнейм' }),
      nick,
    ]),
    createToggle,
    createPanel,
    joinToggle,
    joinPanel,
  ]);

  root.append(card);
}
