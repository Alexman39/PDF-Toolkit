import { addRotation } from '../../core/rotation.js';
import { downloadBytes } from '../../lib/download.js';
import { userMessageFor } from '../../lib/errorMessages.js';
import { suffixedName } from '../../lib/fileNames.js';
import { formatBytes } from '../../lib/formatBytes.js';
import { largeInputWarning } from '../../lib/inputSize.js';
import { runPdfJob } from '../../lib/pdfWorkerClient.js';
import { announce } from '../components/announce.js';
import { createDropzone } from '../components/dropzone.js';
import { createProgress } from '../components/progress.js';
import { createStatusPanel } from '../components/statusPanel.js';
import { createThumbnailGrid } from '../components/thumbnailGrid.js';
import { showToast } from '../components/toast.js';
import { createToolScreen } from '../components/toolScreen.js';
import { icon } from '../components/icons.js';
import { openDocument } from './openDocument.js';

/** @typedef {import('./openDocument.js').OpenedDocument} OpenedDocument */
/** @typedef {import('../components/thumbnailGrid.js').ThumbnailGrid} ThumbnailGrid */

/** @type {Record<number, string>} */
const ANGLE_NAMES = { 90: '90° right', 180: '180°', 270: '90° left' };

/**
 * The Rotate screen: pick one PDF, turn pages in the preview grid, save a rotated copy.
 * @param {HTMLElement} root
 * @returns {import('../router.js').Unmount}
 */
export function mountRotate(root) {
  const { body } = createToolScreen(root, {
    title: 'Rotate',
    description:
      'Turn single pages or the whole document. Only the page orientation changes, so quality stays the same.',
  });

  /** @type {AbortController | null} */
  let controller = null;
  /** @type {File | null} */
  let file = null;
  /** @type {OpenedDocument | null} */
  let doc = null;
  /** @type {ThumbnailGrid | null} */
  let grid = null;
  /** @type {Record<number, number>} Page index → pending degrees; empty means no changes. */
  let deltas = {};
  /** @type {Uint8Array | null} */
  let result = null;

  const dropzone = createDropzone({
    multiple: false,
    onFiles(accepted, rejected) {
      for (const { file: bad, code } of rejected) {
        showToast(userMessageFor({ code }, bad.name), { type: 'error' });
      }
      if (accepted[0]) open(accepted[0]);
    },
  });

  const progress = createProgress({ onCancel: () => controller?.abort() });
  const status = createStatusPanel();

  const workspace = document.createElement('div');
  workspace.className = 'workspace';
  workspace.hidden = true;

  const fileName = document.createElement('p');
  fileName.className = 'workspace__file';
  const changeFile = secondaryButton('Choose another file', reset);
  const fileBar = document.createElement('div');
  fileBar.className = 'workspace__bar';
  fileBar.append(fileName, changeFile);

  const sizeWarning = document.createElement('p');
  sizeWarning.className = 'note note--warning';
  sizeWarning.hidden = true;

  const allPages = document.createElement('div');
  allPages.className = 'toolbar';
  allPages.setAttribute('role', 'group');
  allPages.setAttribute('aria-label', 'All pages');
  const allLabel = document.createElement('span');
  allLabel.className = 'toolbar__label';
  allLabel.textContent = 'All pages:';
  allPages.append(
    allLabel,
    secondaryButton('Left', () => rotateAll(-90), 'Rotate all pages left', 'rotateLeft'),
    secondaryButton('Right', () => rotateAll(90), 'Rotate all pages right', 'rotateRight'),
    secondaryButton('180°', () => rotateAll(180), 'Rotate all pages 180 degrees'),
    secondaryButton('Reset', resetRotations, 'Undo all rotations'),
  );

  const gridSlot = document.createElement('div');

  const hint = document.createElement('p');
  hint.id = 'rotate-hint';
  hint.className = 'tool-actions__hint';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'button';
  saveButton.textContent = 'Save rotated PDF';
  saveButton.setAttribute('aria-describedby', hint.id);
  saveButton.addEventListener('click', save);
  const actions = document.createElement('div');
  actions.className = 'tool-actions';
  actions.append(saveButton, hint);

  workspace.append(fileBar, sizeWarning, allPages, gridSlot, actions);
  body.append(dropzone.element, workspace, progress.element, status.element);

  /** @param {File} picked */
  async function open(picked) {
    controller = new AbortController();
    const { signal } = controller;
    status.clear();
    dropzone.element.inert = true;
    progress.start(`Opening ${picked.name}…`);
    progress.element.querySelector('button')?.focus();
    try {
      const opened = await openDocument(picked, signal);
      file = picked;
      doc = opened;
      showWorkspace();
    } catch (error) {
      if (signal.aborted) status.showInfo('Cancelled.');
      else status.showError(userMessageFor(error, picked.name));
      dropzone.element.inert = false;
      dropzone.element.querySelector('input')?.focus();
    } finally {
      if (controller?.signal === signal) controller = null;
      progress.hide();
    }
  }

  function showWorkspace() {
    deltas = {};
    result = null;
    fileName.textContent = `${file.name} · ${pagesText(doc.pageCount)} · ${formatBytes(file.size)}`;
    const warning = largeInputWarning([file]);
    sizeWarning.hidden = !warning;
    sizeWarning.textContent = warning ?? '';

    grid = createThumbnailGrid({
      pageCount: doc.pageCount,
      source: doc.thumbnails,
      label: 'Pages',
      decorate(tile, pageIndex) {
        const angle = document.createElement('span');
        angle.className = 'thumbnail__badge';
        tile.caption.append(angle);
        tile.controls.append(
          iconButton('rotateLeft', `Rotate page ${pageIndex + 1} left`, () =>
            rotatePage(pageIndex, -90),
          ),
          iconButton('rotateRight', `Rotate page ${pageIndex + 1} right`, () =>
            rotatePage(pageIndex, 90),
          ),
        );
      },
    });
    gridSlot.replaceChildren(grid.element);
    dropzone.element.hidden = true;
    workspace.hidden = false;
    updateSaveState();
    fileName.tabIndex = -1;
    fileName.focus();
    announce(`${file.name} opened, ${pagesText(doc.pageCount)}.`);
  }

  /**
   * @param {number} pageIndex
   * @param {number} delta
   */
  function rotatePage(pageIndex, delta) {
    applyRotation(addRotation(deltas, [pageIndex], delta));
    const angle = deltas[pageIndex];
    announce(`Page ${pageIndex + 1}: ${angle ? `turned ${ANGLE_NAMES[angle]}` : 'upright'}.`);
  }

  /** @param {number} delta */
  function rotateAll(delta) {
    const all = Array.from({ length: doc.pageCount }, (_, index) => index);
    applyRotation(addRotation(deltas, all, delta));
    announce(`All pages turned ${delta === 180 ? '180°' : delta < 0 ? 'left' : 'right'}.`);
  }

  function resetRotations() {
    applyRotation({});
    announce('All rotations undone.');
  }

  /** @param {Record<number, number>} next */
  function applyRotation(next) {
    deltas = next;
    result = null;
    status.clear();
    for (const [pageIndex, tile] of grid.tiles.entries()) {
      const angle = deltas[pageIndex] ?? 0;
      // CSS turns the preview; pdf.js already drew the page at its existing /Rotate, so only
      // the pending change is shown here.
      tile.frame.dataset.rotation = String(angle);
      tile.caption.querySelector('.thumbnail__badge').textContent = angle
        ? ` · ${ANGLE_NAMES[angle]}`
        : '';
    }
    updateSaveState();
  }

  function updateSaveState() {
    const count = Object.keys(deltas).length;
    saveButton.disabled = count === 0;
    hint.textContent =
      count === 0 ? 'Rotate at least one page to save.' : `${pagesText(count)} will be rotated.`;
  }

  async function save() {
    controller = new AbortController();
    const { signal } = controller;
    const outputName = suffixedName(file.name, 'rotated');
    status.clear();
    workspace.inert = true;
    progress.start('Rotating…');
    progress.element.querySelector('button')?.focus();
    try {
      const { bytes } = await runPdfJob(
        'rotate',
        { bytes: await file.arrayBuffer(), deltas },
        { signal },
      );
      result = bytes;
      downloadBytes(bytes, outputName);
      status.showSuccess(`Saved ${outputName} (${formatBytes(bytes.byteLength)}).`, [
        {
          label: 'Download again',
          primary: true,
          onClick: () => downloadBytes(result, outputName),
        },
        { label: 'Rotate another file', onClick: reset },
      ]);
    } catch (error) {
      if (signal.aborted) status.showInfo('Cancelled. Your changes are still here.');
      else status.showError(userMessageFor(error, file.name));
    } finally {
      if (controller?.signal === signal) controller = null;
      progress.hide();
      workspace.inert = false;
      (status.element.querySelector('button') ?? saveButton).focus();
    }
  }

  /** Back to the empty state, freeing the previews. */
  function reset() {
    closeDocument();
    status.clear();
    workspace.hidden = true;
    dropzone.element.hidden = false;
    dropzone.element.inert = false;
    dropzone.element.querySelector('input')?.focus();
  }

  function closeDocument() {
    grid?.destroy();
    grid = null;
    gridSlot.replaceChildren();
    doc?.thumbnails?.destroy();
    doc = null;
    file = null;
    deltas = {};
    result = null;
  }

  return () => {
    controller?.abort();
    closeDocument();
  };
}

/**
 * @param {string} text
 * @param {() => void} onClick
 * @param {string} [ariaLabel]  When the visible text alone is ambiguous out of context.
 * @param {Parameters<typeof icon>[0]} [iconName]
 * @returns {HTMLButtonElement}
 */
function secondaryButton(text, onClick, ariaLabel, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--secondary';
  if (iconName) button.append(icon(iconName));
  button.append(text);
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * @param {Parameters<typeof icon>[0]} iconName
 * @param {string} ariaLabel
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
function iconButton(iconName, ariaLabel, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.append(icon(iconName));
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * @param {number} count
 * @returns {string}
 */
function pagesText(count) {
  return count === 1 ? '1 page' : `${count} pages`;
}
