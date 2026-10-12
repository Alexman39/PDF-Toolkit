import { formatBytes } from '../../lib/formatBytes.js';
import { announce } from './announce.js';
import { icon } from './icons.js';
import { moveItem } from './reorder.js';

/**
 * @typedef {object} FileListOptions
 * @property {(files: File[]) => void} [onChange]  Called after every reorder or removal.
 * @property {string} [label]  Accessible name of the list.
 */

/**
 * @typedef {object} FileList
 * @property {HTMLOListElement} element
 * @property {(files: File[]) => void} add
 * @property {() => File[]} getFiles
 * @property {() => void} clear
 * @property {(index: number, message: string) => void} setError
 *   Flags one file, e.g. the encrypted one that stopped a merge. The flag follows the file when
 *   it is reordered and goes away when the file is removed or `clearErrors` is called.
 * @property {() => void} clearErrors
 */

/** @typedef {{ key: number, file: File, error?: string }} Entry */

/**
 * An ordered list of files. Reordering works three ways: drag the handle with a mouse or
 * finger (Pointer Events, because HTML5 drag-and-drop does not fire on touch screens), or the
 * up/down buttons for keyboard and screen-reader users.
 * @param {FileListOptions} [options]
 * @returns {FileList}
 */
export function createFileList({ onChange, label = 'Selected files' } = {}) {
  /** @type {Entry[]} */
  let entries = [];
  let nextKey = 0;

  const element = document.createElement('ol');
  element.className = 'file-list';
  element.setAttribute('aria-label', label);

  /**
   * @param {Entry[]} next
   * @param {{ key: number, action: string } | null} [focus]  Control to focus after re-render.
   */
  function update(next, focus = null) {
    entries = next;
    render(focus);
    onChange?.(entries.map((entry) => entry.file));
  }

  /** @param {{ key: number, action: string } | null} focus */
  function render(focus) {
    element.replaceChildren(...entries.map((entry, index) => renderItem(entry, index)));
    if (!focus) return;
    const item = element.querySelector(`[data-key="${focus.key}"]`);
    const target = item?.querySelector(`[data-action="${focus.action}"]:not(:disabled)`);
    // Moving to the top disables "up"; keep focus in the row on the button that still works.
    (target ?? item?.querySelector('button:not(:disabled)'))?.focus();
  }

  /**
   * @param {Entry} entry
   * @param {number} index
   * @returns {HTMLLIElement}
   */
  function renderItem(entry, index) {
    const { file, key, error } = entry;
    const item = document.createElement('li');
    item.className = error ? 'file-list__item has-error' : 'file-list__item';
    item.dataset.key = String(key);

    const handle = document.createElement('span');
    handle.className = 'file-list__handle';
    // Pointer-only affordance; keyboard users have the buttons, so hide it from the a11y tree.
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '⠿';
    handle.addEventListener('pointerdown', (event) => startDrag(event, item, key));

    const name = document.createElement('span');
    name.className = 'file-list__name';
    name.textContent = file.name; // textContent, never innerHTML: file names are user input
    name.title = file.name;

    const details = document.createElement('span');
    details.className = 'file-list__details';
    details.append(name);
    if (error) {
      const message = document.createElement('span');
      message.className = 'file-list__error';
      message.textContent = error;
      details.append(message);
    }

    const size = document.createElement('span');
    size.className = 'file-list__size';
    size.textContent = formatBytes(file.size);

    const actions = document.createElement('span');
    actions.className = 'file-list__actions';
    actions.append(
      button('up', 'arrowUp', `Move ${file.name} up`, index === 0, () => move(key, -1)),
      button('down', 'arrowDown', `Move ${file.name} down`, index === entries.length - 1, () =>
        move(key, 1),
      ),
      button('remove', 'close', `Remove ${file.name}`, false, () => remove(key)),
    );

    item.append(handle, details, size, actions);
    return item;
  }

  /**
   * @param {string} action
   * @param {Parameters<typeof icon>[0]} iconName
   * @param {string} ariaLabel
   * @param {boolean} disabled
   * @param {() => void} onClick
   */
  function button(action, iconName, ariaLabel, disabled, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'icon-button';
    element.dataset.action = action;
    element.append(icon(iconName));
    element.setAttribute('aria-label', ariaLabel);
    element.disabled = disabled;
    element.addEventListener('click', onClick);
    return element;
  }

  /**
   * @param {number} key
   * @param {number} step  -1 for up, +1 for down.
   */
  function move(key, step) {
    const from = entries.findIndex((entry) => entry.key === key);
    const to = from + step;
    if (to < 0 || to >= entries.length) return;
    update(moveItem(entries, from, to), { key, action: step < 0 ? 'up' : 'down' });
    announcePosition(key);
  }

  /** @param {number} key */
  function remove(key) {
    const index = entries.findIndex((entry) => entry.key === key);
    const [removed] = entries.slice(index, index + 1);
    const next = entries.filter((entry) => entry.key !== key);
    // Focus the row that took its place (or the new last row), so keyboard users aren't
    // dropped back to the top of the page when the focused button disappears.
    const neighbour = next[Math.min(index, next.length - 1)];
    update(next, neighbour ? { key: neighbour.key, action: 'remove' } : null);
    announce(`Removed ${removed.file.name}. ${countText(next.length)}.`);
  }

  /** @param {number} key */
  function announcePosition(key) {
    const index = entries.findIndex((entry) => entry.key === key);
    announce(`${entries[index].file.name}, position ${index + 1} of ${entries.length}`);
  }

  /**
   * Drags a row by its handle. The dragged row follows the pointer with a transform while its
   * neighbours are moved past it in the DOM. Moving the neighbours rather than the dragged row
   * matters: re-inserting the row that holds pointer capture would make the browser drop it.
   * @param {PointerEvent} event
   * @param {HTMLLIElement} item
   * @param {number} key
   */
  function startDrag(event, item, key) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = /** @type {HTMLElement} */ (event.currentTarget);
    handle.setPointerCapture(event.pointerId);
    const grabOffset = event.clientY - item.getBoundingClientRect().top;
    let offset = 0;
    item.classList.add('is-dragging');

    /** @param {PointerEvent} moveEvent */
    const onMove = (moveEvent) => {
      const previous = item.previousElementSibling;
      const next = item.nextElementSibling;
      if (next && moveEvent.clientY > midpoint(next)) element.insertBefore(next, item);
      else if (previous && moveEvent.clientY < midpoint(previous)) {
        element.insertBefore(previous, item.nextElementSibling);
      }
      const layoutTop = item.getBoundingClientRect().top - offset;
      offset = moveEvent.clientY - grabOffset - layoutTop;
      item.style.transform = `translateY(${offset}px)`;
    };

    /** @param {PointerEvent} endEvent */
    const onEnd = (endEvent) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      item.classList.remove('is-dragging');
      item.style.transform = '';
      const from = entries.findIndex((entry) => entry.key === key);
      const to = [...element.children].indexOf(item);
      // pointercancel (e.g. the OS took over the gesture) undoes the drag.
      if (endEvent.type === 'pointercancel' || from === to) {
        render(null);
        return;
      }
      update(moveItem(entries, from, to));
      announcePosition(key);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  return {
    element,
    add(files) {
      update([...entries, ...files.map((file) => ({ key: nextKey++, file }))]);
    },
    getFiles: () => entries.map((entry) => entry.file),
    clear() {
      update([]);
    },
    setError(index, message) {
      if (!entries[index]) return;
      // The file set didn't change, so re-render without calling onChange.
      entries = entries.with(index, { ...entries[index], error: message });
      render(null);
    },
    clearErrors() {
      if (!entries.some((entry) => entry.error)) return;
      entries = entries.map(({ key, file }) => ({ key, file }));
      render(null);
    },
  };
}

/**
 * @param {Element} element
 * @returns {number}
 */
function midpoint(element) {
  const { top, height } = element.getBoundingClientRect();
  return top + height / 2;
}

/**
 * @param {number} count
 * @returns {string}
 */
function countText(count) {
  return count === 1 ? '1 file' : `${count} files`;
}
