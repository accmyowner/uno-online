/**
 * screens.js
 * Показ ровно одного экрана за раз. Экраны — элементы с классом .screen.
 */
import { $$ } from '../utils/dom.js';

export function showScreen(id) {
  for (const s of $$('.screen')) {
    s.classList.toggle('is-active', s.id === id);
  }
}
