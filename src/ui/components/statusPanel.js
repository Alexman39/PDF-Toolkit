import { announce } from './announce.js';

/**
 * @typedef {object} StatusAction
 * @property {string} label
 * @property {() => void} onClick
 * @property {boolean} [primary]
 */

/**
 * @typedef {object} StatusPanel
 * @property {HTMLElement} element
 * @property {(message: string, actions?: StatusAction[]) => void} showSuccess
 * @property {(message: string, actions?: StatusAction[]) => void} showError
 * @property {(message: string, actions?: StatusAction[]) => void} showInfo
 *   Neither success nor failure, e.g. "cancelled".
 * @property {() => void} clear
 */

/**
 * The outcome of a tool's job (success, error or info), shown next to the action that caused
 * it. The empty state is the dropzone and the loading state is the progress bar.
 * @returns {StatusPanel}
 */
export function createStatusPanel() {
  const element = document.createElement('div');
  element.className = 'status-panel';
  element.hidden = true;

  /**
   * @param {'success' | 'error' | 'info'} type
   * @param {string} message
   * @param {StatusAction[]} actions
   */
  function show(type, message, actions) {
    const box = document.createElement('div');
    box.className = `status-panel__box status-panel__box--${type}`;
    // A freshly inserted role="alert" is announced at once. Other messages go through the
    // polite #status region instead, so it doesn't cut off whatever the screen reader is saying.
    if (type === 'error') box.setAttribute('role', 'alert');

    const text = document.createElement('p');
    text.className = 'status-panel__message';
    text.textContent = message;
    box.append(text);

    if (actions.length > 0) {
      const row = document.createElement('div');
      row.className = 'status-panel__actions';
      for (const { label, onClick, primary } of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = primary ? 'button' : 'button button--secondary';
        button.textContent = label;
        button.addEventListener('click', onClick);
        row.append(button);
      }
      box.append(row);
    }

    element.replaceChildren(box);
    element.hidden = false;
    if (type !== 'error') announce(message);
  }

  return {
    element,
    showSuccess: (message, actions = []) => show('success', message, actions),
    showError: (message, actions = []) => show('error', message, actions),
    showInfo: (message, actions = []) => show('info', message, actions),
    clear() {
      element.replaceChildren();
      element.hidden = true;
    },
  };
}
