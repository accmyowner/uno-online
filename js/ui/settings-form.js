/**
 * settings-form.js
 * Форма настроек комнаты. Используется при создании и в лобби (для хоста).
 * Возвращает элемент и методы getValues/setValues/setDisabled.
 */
import { el } from '../utils/dom.js';
import { LIMITS, SPECIAL_DENSITY, ROOM_DEFAULTS } from '../core/constants.js';

export function createSettingsForm(initial = ROOM_DEFAULTS, onChange = () => {}) {
  const values = { ...ROOM_DEFAULTS, ...initial };

  const maxPlayers = el('select', { className: 'field__select' });
  for (let n = LIMITS.minPlayers; n <= LIMITS.maxPlayers; n++) {
    maxPlayers.append(el('option', { value: n, text: `${n}` }));
  }
  maxPlayers.value = values.maxPlayers;

  const timer = el('select', { className: 'field__select' });
  for (const t of [10, 15, 20, 30, 45, 60, 90, 120]) {
    timer.append(el('option', { value: t, text: `${t} сек` }));
  }
  timer.value = values.turnTimer;

  const density = el('select', { className: 'field__select' });
  for (const [key, cfg] of Object.entries(SPECIAL_DENSITY)) {
    density.append(el('option', { value: key, text: cfg.label }));
  }
  density.value = values.specialDensity;

  const swap = el('input', { type: 'checkbox', className: 'field__check' });
  swap.checked = !!values.useSwapCard;

  const read = () => ({
    maxPlayers: Number(maxPlayers.value),
    turnTimer: Number(timer.value),
    specialDensity: density.value,
    useSwapCard: swap.checked,
  });

  const notify = () => onChange(read());
  [maxPlayers, timer, density, swap].forEach((c) => c.addEventListener('change', notify));

  const field = (label, control) =>
    el('label', { className: 'field' }, [
      el('span', { className: 'field__label', text: label }),
      control,
    ]);

  const element = el('div', { className: 'settings' }, [
    field('Максимум игроков', maxPlayers),
    field('Таймер хода', timer),
    field('Спец-карты', density),
    el('label', { className: 'field field--row' }, [
      swap,
      el('span', { className: 'field__label', text: 'Карта «Обмен руками»' }),
    ]),
  ]);

  return {
    element,
    getValues: read,
    setValues(v) {
      maxPlayers.value = v.maxPlayers;
      timer.value = v.turnTimer;
      density.value = v.specialDensity;
      swap.checked = !!v.useSwapCard;
    },
    setDisabled(disabled) {
      [maxPlayers, timer, density, swap].forEach((c) => { c.disabled = disabled; });
      element.classList.toggle('is-readonly', disabled);
    },
  };
}
