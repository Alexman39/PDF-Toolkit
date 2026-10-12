import { PageRangeError } from '../../core/errors.js';
import { suffixedName, uniqueNames } from '../../core/fileNames.js';
import { parsePageRanges } from '../../core/pageRanges.js';
import { planSplit } from '../../core/splitPlan.js';
import { downloadBytes } from '../../lib/download.js';
import { formatBytes } from '../../lib/formatBytes.js';
import { runPdfJob } from '../../lib/pdfWorkerClient.js';
import { plural } from '../../lib/plural.js';
import { announce } from '../components/announce.js';
import { createButton } from '../components/buttons.js';
import { createThumbnailGrid } from '../components/thumbnailGrid.js';
import { createToolScreen } from '../components/toolScreen.js';
import { createDocumentTool } from './documentTool.js';

/** @typedef {import('./documentTool.js').OpenContext} OpenContext */
/** @typedef {import('../../core/splitPlan.js').SplitMode} SplitMode */
/** @typedef {import('../components/thumbnailGrid.js').ThumbnailGrid} ThumbnailGrid */

/** @typedef {'ranges' | 'everyN' | 'selected' | 'perPage'} ModeType */

/** @type {{ type: ModeType, label: string, help: string }[]} */
const MODES = [
  { type: 'ranges', label: 'Page ranges', help: 'Each range becomes its own file.' },
  { type: 'everyN', label: 'Every N pages', help: 'Cut the document into equal chunks.' },
  { type: 'selected', label: 'Pick pages', help: 'Choose pages from the previews.' },
  { type: 'perPage', label: 'One file per page', help: 'Every page becomes its own file.' },
];

// Listing every name for a 200-page split would push the Split button off the screen.
const NAMES_SHOWN = 3;

let nextId = 0;

/**
 * The Split screen: one PDF in, one or more PDFs out (several arrive as one zip).
 * @param {HTMLElement} root
 * @returns {import('../router.js').Unmount}
 */
export function mountSplit(root) {
  const { body } = createToolScreen(root, {
    title: 'Split',
    description: 'Extract pages or split a PDF into several files.',
  });

  /** @type {(() => void) | null} */
  let closeWorkspace = null;

  const tool = createDocumentTool(body, {
    onOpen: (context) => {
      closeWorkspace = buildWorkspace(context);
    },
    onClose: () => {
      closeWorkspace?.();
      closeWorkspace = null;
    },
  });

  /**
   * @param {OpenContext} context
   * @returns {() => void}  Stops the page grid, if one was made.
   */
  function buildWorkspace({ file, doc, content }) {
    const id = `split-${nextId++}`;
    const { pageCount } = doc;
    /** @type {ModeType} */
    let modeType = 'ranges';
    /** @type {Set<number>} */
    const selected = new Set();
    /** @type {ThumbnailGrid | null} Built the first time "Pick pages" is chosen. */
    let grid = null;

    // Mode choice
    const modes = document.createElement('fieldset');
    modes.className = 'mode-picker';
    const legend = document.createElement('legend');
    legend.textContent = 'How to split';
    modes.append(legend);
    for (const { type, label, help } of MODES) {
      const option = document.createElement('label');
      option.className = 'mode-picker__option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `${id}-mode`;
      radio.value = type;
      radio.checked = type === modeType;
      radio.addEventListener('change', () => setMode(type));
      const title = document.createElement('span');
      title.className = 'mode-picker__label';
      title.textContent = label;
      const description = document.createElement('span');
      description.className = 'mode-picker__help';
      description.textContent = help;
      option.append(radio, title, description);
      modes.append(option);
    }

    // Ranges
    const rangesPanel = panel();
    const rangesInput = textField(rangesPanel, {
      id: `${id}-ranges`,
      label: 'Pages',
      placeholder: 'e.g. 1-3, 5, 8-',
      help: 'Separate ranges with commas. "8-" means page 8 to the end.',
    });
    rangesInput.input.addEventListener('input', update);

    // Every N
    const everyNPanel = panel();
    const everyNInput = textField(everyNPanel, {
      id: `${id}-every-n`,
      label: 'Pages per file',
      type: 'number',
      value: String(Math.min(2, pageCount)),
    });
    Object.assign(everyNInput.input, { min: '1', max: String(pageCount), step: '1' });
    everyNInput.input.addEventListener('input', update);

    // Pick pages
    const selectedPanel = panel();
    const selectionBar = document.createElement('div');
    selectionBar.className = 'toolbar';
    selectionBar.append(
      createButton({ text: 'Select all', onClick: () => setSelection(range(pageCount)) }),
      createButton({ text: 'Clear selection', onClick: () => setSelection([]) }),
    );
    const separate = document.createElement('label');
    separate.className = 'checkbox';
    const separateInput = document.createElement('input');
    separateInput.type = 'checkbox';
    separateInput.addEventListener('change', update);
    separate.append(separateInput, 'Save each selected page as its own file');
    const gridSlot = document.createElement('div');
    selectedPanel.append(selectionBar, separate, gridSlot);

    // One per page
    const perPagePanel = panel();

    /** @type {Record<ModeType, HTMLElement>} */
    const panels = {
      ranges: rangesPanel,
      everyN: everyNPanel,
      selected: selectedPanel,
      perPage: perPagePanel,
    };

    // Summary and action
    const summary = document.createElement('p');
    summary.id = `${id}-summary`;
    summary.className = 'tool-actions__hint';
    const splitButton = createButton({ text: 'Split PDF', variant: 'primary', onClick: split });
    splitButton.setAttribute('aria-describedby', summary.id);
    const actions = document.createElement('div');
    actions.className = 'tool-actions tool-actions--stacked';
    actions.append(splitButton, summary);

    content.append(modes, ...Object.values(panels), actions);
    setMode(modeType);

    /** @param {ModeType} type */
    function setMode(type) {
      modeType = type;
      for (const [panelType, element] of Object.entries(panels)) {
        element.hidden = panelType !== type;
      }
      if (type === 'selected' && !grid) buildGrid();
      update();
    }

    function buildGrid() {
      grid = createThumbnailGrid({
        pageCount,
        source: doc.thumbnails,
        label: 'Pages to extract',
        decorate(tile, pageIndex) {
          const label = document.createElement('label');
          label.className = 'checkbox';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('aria-label', `Select page ${pageIndex + 1}`);
          checkbox.addEventListener('change', () => toggle(pageIndex, checkbox.checked));
          label.append(checkbox, 'Select');
          tile.controls.append(label);
          // Clicking the preview is the natural mouse/touch target; keyboard users have the
          // checkbox, so the frame itself doesn't need to be focusable.
          tile.frame.addEventListener('click', () => toggle(pageIndex, !selected.has(pageIndex)));
        },
      });
      gridSlot.append(grid.element);
    }

    /**
     * @param {number} pageIndex
     * @param {boolean} on
     */
    function toggle(pageIndex, on) {
      if (on) selected.add(pageIndex);
      else selected.delete(pageIndex);
      renderSelection();
      update();
    }

    /** @param {number[]} pageIndexes */
    function setSelection(pageIndexes) {
      selected.clear();
      for (const index of pageIndexes) selected.add(index);
      renderSelection();
      update();
      announce(`${plural(selected.size, 'page')} selected.`);
    }

    function renderSelection() {
      for (const [pageIndex, tile] of grid?.tiles.entries() ?? []) {
        const on = selected.has(pageIndex);
        tile.element.classList.toggle('is-selected', on);
        tile.controls.querySelector('input').checked = on;
      }
    }

    /**
     * Reads the controls into a split mode, or a message saying what's missing. `invalid`
     * means the user typed something wrong, as opposed to not having filled it in yet.
     * @returns {{ mode: SplitMode } | { problem: string, invalid?: boolean }}
     */
    function readMode() {
      switch (modeType) {
        case 'ranges': {
          const text = rangesInput.input.value;
          if (!text.trim()) return { problem: 'Enter the pages to extract.' };
          try {
            return { mode: { type: 'ranges', ranges: parsePageRanges(text, pageCount) } };
          } catch (error) {
            if (error instanceof PageRangeError) return { problem: error.message, invalid: true };
            throw error;
          }
        }
        case 'everyN': {
          const n = Number(everyNInput.input.value);
          if (!Number.isInteger(n) || n < 1 || n > pageCount) {
            return { problem: `Enter a whole number from 1 to ${pageCount}.`, invalid: true };
          }
          return { mode: { type: 'everyN', n } };
        }
        case 'selected':
          if (selected.size === 0) return { problem: 'Select at least one page.' };
          return {
            mode: { type: 'selected', pageIndexes: [...selected], separate: separateInput.checked },
          };
        default:
          return { mode: { type: 'perPage' } };
      }
    }

    function update() {
      // Any change makes an earlier result stale.
      tool.status.clear();
      const result = readMode();
      setInvalid(rangesInput, modeType === 'ranges' && result.invalid ? result.problem : null);
      setInvalid(everyNInput, modeType === 'everyN' && result.invalid ? result.problem : null);

      if (!('mode' in result)) {
        splitButton.disabled = true;
        summary.textContent = result.invalid
          ? 'Fix the highlighted field to continue.'
          : result.problem;
        return;
      }
      const names = uniqueNames(
        planSplit(pageCount, result.mode).map(({ label }) => suffixedName(file.name, label)),
      );
      splitButton.disabled = false;
      summary.textContent = describeOutput(names, suffixedName(file.name, 'split', 'zip'));
    }

    function split() {
      const result = readMode();
      if (!('mode' in result)) return;
      tool.run(
        'Splitting…',
        async (signal, onProgress) => {
          const output = await runPdfJob(
            'split',
            { bytes: await file.arrayBuffer(), mode: result.mode, fileName: file.name },
            { signal, onProgress },
          );
          const { name, bytes, type, names } = output;
          downloadBytes(bytes, name, type);
          const size = formatBytes(bytes.byteLength);
          tool.status.showSuccess(
            names.length > 1
              ? `Created ${plural(names.length, 'file')} in ${name} (${size}).`
              : `Saved ${name} (${size}).`,
            [
              {
                label: 'Download again',
                primary: true,
                onClick: () => downloadBytes(bytes, name, type),
              },
              { label: 'Split another file', onClick: tool.reset },
            ],
          );
        },
        splitButton,
      );
    }

    return () => grid?.destroy();
  }

  return () => tool.destroy();
}

/**
 * "Creates 3 files: a_p1.pdf, a_p2.pdf, a_p3.pdf. They download together as a_split.zip."
 * @param {string[]} names
 * @param {string} zipName
 * @returns {string}
 */
function describeOutput(names, zipName) {
  if (names.length === 1) return `Creates ${names[0]}.`;
  const shown = names.slice(0, NAMES_SHOWN).join(', ');
  const more = names.length > NAMES_SHOWN ? ` and ${names.length - NAMES_SHOWN} more` : '';
  return `Creates ${plural(names.length, 'file')}: ${shown}${more}. They download together as ${zipName}.`;
}

/** @returns {HTMLDivElement} */
function panel() {
  const element = document.createElement('div');
  element.className = 'mode-panel';
  return element;
}

/**
 * @typedef {object} TextField
 * @property {HTMLInputElement} input
 * @property {HTMLElement} help
 * @property {HTMLElement} error
 */

/**
 * A labelled input with help text and an error line, both linked via aria-describedby.
 * @param {HTMLElement} parent
 * @param {{ id: string, label: string, type?: string, value?: string, placeholder?: string, help?: string }} options
 * @returns {TextField}
 */
function textField(parent, { id, label, type = 'text', value = '', placeholder, help }) {
  const labelElement = document.createElement('label');
  labelElement.className = 'field__label';
  labelElement.htmlFor = id;
  labelElement.textContent = label;

  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.className = 'field__input';
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  // Page lists are not words; spellcheck and autocorrect only get in the way.
  input.spellcheck = false;
  input.autocomplete = 'off';
  if (type === 'number') input.inputMode = 'numeric';

  const helpElement = document.createElement('p');
  helpElement.id = `${id}-help`;
  helpElement.className = 'field__help';
  helpElement.textContent = help ?? '';
  helpElement.hidden = !help;

  const error = document.createElement('p');
  error.id = `${id}-error`;
  error.className = 'field__error';
  error.hidden = true;

  input.setAttribute('aria-describedby', `${error.id} ${helpElement.id}`);
  const field = document.createElement('div');
  field.className = 'field';
  field.append(labelElement, input, error, helpElement);
  parent.append(field);
  return { input, help: helpElement, error };
}

/**
 * @param {TextField} field
 * @param {string | null} message
 */
function setInvalid(field, message) {
  if (message) field.input.setAttribute('aria-invalid', 'true');
  else field.input.removeAttribute('aria-invalid');
  field.error.textContent = message ?? '';
  field.error.hidden = !message;
}

/**
 * @param {number} count
 * @returns {number[]}
 */
function range(count) {
  return Array.from({ length: count }, (_, index) => index);
}
