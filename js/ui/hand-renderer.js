/**
 * hand-renderer.js
 * Отрисовывает руку игрока веером и вешает обработчик выбора карты.
 * Геометрию считает чистая функция layoutHand. Здесь — только DOM и события.
 *
 * Производительность: элементы карт переиспользуются между перерисовками
 * по data-card-id, меняются только их transform/размеры. Пересоздание
 * происходит лишь при изменении набора карт.
 */
import { layoutHand } from './hand-layout.js';
import { createCardFace } from './card.js';
import { clear } from '../utils/dom.js';

export class HandRenderer {
  /**
   * @param {HTMLElement} container  контейнер руки
   * @param {(cardId:string)=>void} onSelect  колбэк выбора карты
   */
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.nodes = new Map(); // cardId -> element
    this.lastKey = '';

    // Делегирование клика — один слушатель на всю руку.
    container.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.card');
      if (cardEl && this.container.contains(cardEl) && !cardEl.classList.contains('is-disabled')) {
        this.onSelect(cardEl.dataset.cardId);
      }
    });

    // Пересчёт раскладки при изменении размера контейнера.
    this._ro = new ResizeObserver(() => this.relayout());
    this._ro.observe(container);
  }

  /**
   * Отрисовывает набор карт.
   * @param {Array} cards
   * @param {(card)=>boolean} isPlayable  можно ли сыграть карту сейчас
   */
  render(cards, isPlayable) {
    this._cards = cards;
    this._isPlayable = isPlayable;

    const key = cards.map((c) => c.id).join(',');
    if (key !== this.lastKey) {
      // Набор карт изменился — синхронизируем DOM-узлы.
      const seen = new Set();
      for (const card of cards) {
        seen.add(card.id);
        if (!this.nodes.has(card.id)) {
          const node = createCardFace(card);
          node.classList.add('hand-card');
          this.nodes.set(card.id, node);
        }
      }
      // Удаляем узлы карт, которых больше нет.
      for (const [id, node] of this.nodes) {
        if (!seen.has(id)) { node.remove(); this.nodes.delete(id); }
      }
      // Перестраиваем порядок в DOM.
      clear(this.container);
      for (const card of cards) this.container.append(this.nodes.get(card.id));
      this.lastKey = key;
    }

    this.relayout();
  }

  /** Пересчёт позиций/размеров без пересоздания элементов. */
  relayout() {
    if (!this._cards) return;
    const width = this.container.clientWidth || 320;
    const { cardW, cardH, cards } = layoutHand(width, this._cards.length);

    this.container.style.setProperty('--card-w', `${cardW}px`);
    this.container.style.setProperty('--card-h', `${cardH}px`);
    this.container.style.height = `${cardH + 20}px`;

    for (let i = 0; i < this._cards.length; i++) {
      const card = this._cards[i];
      const node = this.nodes.get(card.id);
      const p = cards[i];
      node.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;
      node.style.zIndex = String(i);
      const playable = this._isPlayable ? this._isPlayable(card) : true;
      node.classList.toggle('is-disabled', !playable);
      node.classList.toggle('is-playable', playable);
    }
  }

  destroy() {
    this._ro.disconnect();
    clear(this.container);
    this.nodes.clear();
  }
}
