/**
 * toast.js
 * Ненавязчивые всплывающие сообщения (ошибки хода, события).
 */
import { el } from '../utils/dom.js';

let container = null;

function ensureContainer() {
  if (!container) {
    container = el('div', { className: 'toast-container', id: 'toast-container' });
    document.body.append(container);
  }
  return container;
}

/** Показывает тост. type: 'info' | 'error' | 'success'. */
export function toast(message, type = 'info', ms = 2600) {
  const node = el('div', { className: `toast toast--${type}`, text: message });
  ensureContainer().append(node);
  // reflow -> плавное появление
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 250);
  }, ms);
}
