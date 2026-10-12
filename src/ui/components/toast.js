/** @typedef {'info' | 'success' | 'error'} ToastType */

const AUTO_DISMISS_MS = 6000;

/** @type {HTMLElement | null} */
let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toasts';
    // Present from page load (well, first toast) so screen readers are already watching it
    // when content arrives; regions created together with their text are often missed.
    container.setAttribute('aria-live', 'polite');
    document.body.append(container);
  }
  return container;
}

/**
 * Shows a short message in the corner. Errors use role="alert" so they interrupt the screen
 * reader, and they stay until dismissed: an error that vanishes while being read is lost.
 * @param {string} message
 * @param {{ type?: ToastType }} [options]
 * @returns {() => void}  Dismisses the toast early.
 */
export function showToast(message, { type = 'info' } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  if (type === 'error') toast.setAttribute('role', 'alert');

  const text = document.createElement('p');
  text.className = 'toast__message';
  text.textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss notification');

  toast.append(text, close);
  getContainer().append(toast);

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };
  close.addEventListener('click', dismiss);

  if (type !== 'error') {
    const scheduleDismiss = () => {
      timer = setTimeout(() => {
        // Don't pull the toast out from under someone who is reading or tabbing into it.
        if (toast.matches(':hover, :focus-within')) scheduleDismiss();
        else dismiss();
      }, AUTO_DISMISS_MS);
    };
    scheduleDismiss();
  }
  return dismiss;
}
