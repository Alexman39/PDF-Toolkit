import { suffixedName } from '../../core/fileNames.js';
import { compressStrong } from '../../lib/compressStrong.js';
import { downloadBytes } from '../../lib/download.js';
import { runPdfJob } from '../../lib/pdfWorkerClient.js';
import { plural } from '../../lib/plural.js';
import { describeSizeChange } from '../../lib/sizeChange.js';
import { createButton } from '../components/buttons.js';
import { createToolScreen } from '../components/toolScreen.js';
import { createDocumentTool } from './documentTool.js';

/** @typedef {import('./documentTool.js').OpenContext} OpenContext */

/** @typedef {'optimise' | 'strong'} ModeType */

/**
 * @typedef {object} Choice
 * @property {string} value
 * @property {string} label
 * @property {string} help
 * @property {boolean} [disabled]
 */

/** @type {{ type: ModeType, label: string, help: string }[]} */
const MODES = [
  {
    type: 'optimise',
    label: 'Optimise (lossless)',
    help: 'Text stays selectable. Usually a small saving.',
  },
  {
    type: 'strong',
    label: 'Strong (lossy)',
    help: 'Turns pages into images. Shrinks scans a lot, but text can no longer be selected.',
  },
];

const RESOLUTIONS = [
  { dpi: 72, label: '72 DPI', help: 'Smallest. Fine for reading on screen.' },
  { dpi: 110, label: '110 DPI', help: 'Balanced size and sharpness.' },
  { dpi: 150, label: '150 DPI', help: 'Sharper. Better for printing.' },
];

// 110 DPI keeps typical 200–300 DPI scans readable while cutting them well down; quality 60 is
// where JPEG artefacts start to be visible on text, so lower is the user's explicit choice.
const DEFAULT_DPI = 110;
const DEFAULT_QUALITY = 60;

/** @type {Record<string, string>} */
const IMAGE_FORMAT_NAMES = { JPXDecode: 'JPEG 2000', JBIG2Decode: 'JBIG2' };

let nextId = 0;

/**
 * The Compress screen: one PDF in, a smaller copy out, or the honest news that it isn't
 * smaller and the original is better.
 * @param {HTMLElement} root
 * @returns {import('../router.js').Unmount}
 */
export function mountCompress(root) {
  const { body } = createToolScreen(root, {
    title: 'Compress',
    description:
      'Make a PDF smaller. Optimise keeps everything as it is; Strong turns pages into images, which shrinks scans the most.',
  });

  const tool = createDocumentTool(body, {
    onOpen: buildWorkspace,
    // No thumbnails on this screen, so pdf.js isn't loaded just to open the file.
    open: { previews: false, forCompress: true },
  });

  /** @param {OpenContext} context */
  function buildWorkspace({ file, doc, content }) {
    const id = `compress-${nextId++}`;
    /** @type {ModeType} */
    let modeType = 'optimise';
    const unsupported = (doc.unsupportedImages ?? []).map((name) => IMAGE_FORMAT_NAMES[name]);

    const modes = radioGroup({
      legend: 'How to compress',
      name: `${id}-mode`,
      value: modeType,
      choices: MODES.map(({ type, label, help }) => {
        if (type !== 'strong' || unsupported.length === 0) return { value: type, label, help };
        return {
          value: type,
          label,
          help: `Not available for this file: it contains ${unsupported.join(' and ')} images, which this tool can't draw yet.`,
          disabled: true,
        };
      }),
      onChange(value) {
        modeType = /** @type {ModeType} */ (value);
        update();
      },
    });

    // Optimise
    const optimisePanel = panel();
    const stripMetadata = checkbox('Remove metadata (title, author, dates)');
    stripMetadata.input.addEventListener('change', update);
    optimisePanel.append(stripMetadata.element);

    // Strong
    const strongPanel = panel();
    const quality = rangeField({
      id: `${id}-quality`,
      label: 'Image quality',
      help: 'Lower means a smaller file and blurrier pages.',
      min: 30,
      max: 95,
      step: 5,
      value: DEFAULT_QUALITY,
    });
    quality.input.addEventListener('input', update);
    const resolution = radioGroup({
      legend: 'Resolution',
      name: `${id}-dpi`,
      value: String(DEFAULT_DPI),
      choices: RESOLUTIONS.map(({ dpi, label, help }) => ({ value: String(dpi), label, help })),
      onChange: update,
      className: 'mode-picker mode-picker--three',
    });

    // Shown whenever Strong is chosen, so it can't be missed, and confirmed with a checkbox
    // rather than a dialog: nothing pops up, and the reason the button is disabled sits right
    // above it.
    const warning = document.createElement('div');
    warning.className = 'note note--warning';
    const warningText = document.createElement('p');
    warningText.className = 'note__text';
    warningText.textContent =
      'Strong compression turns every page into a picture. Text can no longer be selected, searched or copied, and links, bookmarks and form fields are removed. Your original file is not changed.';
    const acknowledge = checkbox("I understand the compressed copy won't have selectable text");
    acknowledge.input.addEventListener('change', update);
    warning.append(warningText, acknowledge.element);
    strongPanel.append(quality.element, resolution.element, warning);

    // Action
    const hint = document.createElement('p');
    hint.id = `${id}-hint`;
    hint.className = 'tool-actions__hint';
    const compressButton = createButton({
      text: 'Compress PDF',
      variant: 'primary',
      onClick: compress,
    });
    compressButton.setAttribute('aria-describedby', hint.id);
    const actions = document.createElement('div');
    actions.className = 'tool-actions tool-actions--stacked';
    actions.append(compressButton, hint);

    content.append(modes.element, optimisePanel, strongPanel, actions);
    update();

    function update() {
      // Any change makes an earlier result stale.
      tool.status.clear();
      optimisePanel.hidden = modeType !== 'optimise';
      strongPanel.hidden = modeType !== 'strong';
      quality.output.textContent = `${quality.input.value}%`;
      // Otherwise screen readers say "60", which could be anything.
      quality.input.setAttribute('aria-valuetext', `${quality.input.value}%`);

      const blocked = modeType === 'strong' && !acknowledge.input.checked;
      compressButton.disabled = blocked;
      if (modeType === 'optimise') {
        hint.textContent = 'Saves a lossless copy.';
      } else if (blocked) {
        hint.textContent = 'Tick the box in the warning above to continue.';
      } else {
        hint.textContent = `Renders ${plural(doc.pageCount, 'page')} at ${resolution.value()} DPI.`;
      }
    }

    function compress() {
      const strong = modeType === 'strong';
      if (strong && !acknowledge.input.checked) return;
      const outputName = suffixedName(file.name, 'compressed');
      const settings = {
        dpi: Number(resolution.value()),
        quality: Number(quality.input.value) / 100,
        stripMetadata: stripMetadata.input.checked,
      };

      tool.run(
        strong ? 'Rendering pages…' : 'Optimising…',
        async (signal, onProgress) => {
          const bytes = strong
            ? await compressStrong(file, {
                dpi: settings.dpi,
                quality: settings.quality,
                canRenderInWorker: doc.canRenderInWorker ?? false,
                signal,
                onProgress,
              })
            : (
                await runPdfJob(
                  'optimise',
                  {
                    bytes: await file.arrayBuffer(),
                    options: { stripMetadata: settings.stripMetadata },
                  },
                  { signal },
                )
              ).bytes;
          showResult(bytes, outputName, strong);
        },
        compressButton,
      );
    }

    /**
     * @param {Uint8Array} bytes
     * @param {string} outputName
     * @param {boolean} strong
     */
    function showResult(bytes, outputName, strong) {
      const change = describeSizeChange(file.size, bytes.byteLength);
      if (change.smaller) {
        downloadBytes(bytes, outputName);
        tool.status.showSuccess(`Saved ${outputName}: ${change.text}.`, [
          {
            label: 'Download again',
            primary: true,
            onClick: () => downloadBytes(bytes, outputName),
          },
          { label: 'Compress another file', onClick: tool.reset },
        ]);
        return;
      }
      // Not downloaded automatically: a "compressed" file that is bigger is never what the
      // user wanted, and quietly handing it over would hide that.
      const tip = strong
        ? 'A lower resolution or quality may help; text-only PDFs are usually smallest as they are.'
        : 'Strong mode can shrink scanned documents.';
      tool.status.showInfo(
        `The result isn't smaller: ${change.text}. Your original is the better file to keep. ${tip}`,
        [
          {
            label: 'Keep original',
            primary: true,
            onClick: () => downloadBytes(file, file.name),
          },
          { label: 'Download anyway', onClick: () => downloadBytes(bytes, outputName) },
        ],
      );
    }
  }

  return () => tool.destroy();
}

/**
 * A fieldset of radio cards (the same look as Split's mode picker).
 * @param {{ legend: string, name: string, value: string, choices: Choice[], onChange: (value: string) => void, className?: string }} options
 * @returns {{ element: HTMLFieldSetElement, value: () => string }}
 */
function radioGroup({ legend, name, value, choices, onChange, className = 'mode-picker' }) {
  const element = document.createElement('fieldset');
  element.className = className;
  const legendElement = document.createElement('legend');
  legendElement.textContent = legend;
  element.append(legendElement);

  for (const choice of choices) {
    const option = document.createElement('label');
    option.className = 'mode-picker__option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.value = choice.value;
    radio.checked = choice.value === value;
    radio.disabled = choice.disabled ?? false;
    radio.addEventListener('change', () => onChange(choice.value));
    const label = document.createElement('span');
    label.className = 'mode-picker__label';
    label.textContent = choice.label;
    const help = document.createElement('span');
    help.className = 'mode-picker__help';
    help.textContent = choice.help;
    option.append(radio, label, help);
    element.append(option);
  }

  return {
    element,
    value: () => /** @type {HTMLInputElement} */ (element.querySelector('input:checked')).value,
  };
}

/**
 * A labelled slider whose current value is shown next to the label.
 * @param {{ id: string, label: string, help: string, min: number, max: number, step: number, value: number }} options
 * @returns {{ element: HTMLDivElement, input: HTMLInputElement, output: HTMLOutputElement }}
 */
function rangeField({ id, label, help, min, max, step, value }) {
  const labelElement = document.createElement('label');
  labelElement.className = 'field__label';
  labelElement.htmlFor = id;
  labelElement.textContent = label;

  const output = document.createElement('output');
  output.htmlFor.add(id);
  output.className = 'field__value';
  const row = document.createElement('div');
  row.className = 'field__row';
  row.append(labelElement, output);

  const input = document.createElement('input');
  input.id = id;
  input.type = 'range';
  input.className = 'field__range';
  Object.assign(input, { min: String(min), max: String(max), step: String(step) });
  input.value = String(value);

  const helpElement = document.createElement('p');
  helpElement.id = `${id}-help`;
  helpElement.className = 'field__help';
  helpElement.textContent = help;
  input.setAttribute('aria-describedby', helpElement.id);

  const element = document.createElement('div');
  element.className = 'field';
  element.append(row, input, helpElement);
  return { element, input, output };
}

/**
 * @param {string} text
 * @returns {{ element: HTMLLabelElement, input: HTMLInputElement }}
 */
function checkbox(text) {
  const element = document.createElement('label');
  element.className = 'checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  element.append(input, text);
  return { element, input };
}

/** @returns {HTMLDivElement} */
function panel() {
  const element = document.createElement('div');
  element.className = 'mode-panel';
  return element;
}
