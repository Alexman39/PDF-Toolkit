import { icon } from './icons.js';

/** @typedef {Parameters<typeof icon>[0]} IconName */

/**
 * @typedef {object} ButtonOptions
 * @property {string} [text]       Visible label. Omit for an icon-only button.
 * @property {string} [ariaLabel]  Required for icon-only buttons, or when `text` is ambiguous
 *   out of context ("Left" → "Rotate all pages left").
 * @property {IconName} [icon]
 * @property {'primary' | 'secondary' | 'icon'} [variant='secondary']
 * @property {() => void} onClick
 */

/**
 * @param {ButtonOptions} options
 * @returns {HTMLButtonElement}
 */
export function createButton({ text, ariaLabel, icon: iconName, variant = 'secondary', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = {
    primary: 'button',
    secondary: 'button button--secondary',
    icon: 'icon-button',
  }[variant];
  if (iconName) button.append(icon(iconName));
  if (text) button.append(text);
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}
