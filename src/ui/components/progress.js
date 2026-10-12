import { announce } from './announce.js';

/**
 * @typedef {object} Progress
 * @property {HTMLElement} element
 * @property {(label: string) => void} start  Shows the bar in its indeterminate state.
 * @property {(done: number, total: number) => void} update
 * @property {() => void} hide
 */

let nextId = 0;

/**
 * A progress bar with a Cancel button. It starts indeterminate, because rotate and optimise
 * are a single save() with no steps to count.
 * @param {{ onCancel?: () => void }} [options]  Without onCancel there is no Cancel button.
 * @returns {Progress}
 */
export function createProgress({ onCancel } = {}) {
  const id = `progress-label-${nextId++}`;
  const element = document.createElement('div');
  element.className = 'progress';
  element.hidden = true;

  const label = document.createElement('span');
  label.id = id;
  label.className = 'progress__label';

  const bar = document.createElement('progress');
  bar.className = 'progress__bar';
  bar.setAttribute('aria-labelledby', id);

  element.append(label, bar);

  if (onCancel) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button button--secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', onCancel);
    element.append(cancel);
  }

  return {
    element,
    start(text) {
      label.textContent = text;
      // Without a value attribute <progress> is indeterminate (the animated bar).
      bar.removeAttribute('value');
      bar.removeAttribute('max');
      element.hidden = false;
      // Announced once; announcing every tick would drown out everything else.
      announce(text);
    },
    update(done, total) {
      bar.max = total;
      bar.value = done;
    },
    hide() {
      element.hidden = true;
    },
  };
}
