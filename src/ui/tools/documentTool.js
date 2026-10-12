import { userMessageFor } from '../../lib/errorMessages.js';
import { formatBytes } from '../../lib/formatBytes.js';
import { largeInputWarning } from '../../lib/inputSize.js';
import { plural } from '../../lib/plural.js';
import { announce } from '../components/announce.js';
import { createButton } from '../components/buttons.js';
import { createDropzone } from '../components/dropzone.js';
import { createProgress } from '../components/progress.js';
import { createStatusPanel } from '../components/statusPanel.js';
import { showToast } from '../components/toast.js';
import { openDocument } from './openDocument.js';

/** @typedef {import('./openDocument.js').OpenedDocument} OpenedDocument */
/** @typedef {import('../components/statusPanel.js').StatusPanel} StatusPanel */

/**
 * @typedef {object} OpenContext
 * @property {File} file
 * @property {OpenedDocument} doc
 * @property {HTMLElement} content  Empty; the tool builds its controls here.
 */

/**
 * @callback Task
 * @param {AbortSignal} signal
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<void>}
 */

/**
 * @typedef {object} DocumentTool
 * @property {StatusPanel} status
 * @property {(label: string, task: Task, returnFocus: HTMLElement) => Promise<void>} run
 *   Runs a job with the progress bar and Cancel; failures become the error state. The task
 *   shows its own success state.
 * @property {() => void} reset  Back to the empty state.
 * @property {() => void} destroy  For the screen's unmount: stops jobs, frees previews.
 */

/**
 * The flow shared by tools that work on one PDF (Rotate, Split): empty (dropzone) → opening
 * (checked by pdf-lib in the worker) → workspace → running → success or error.
 * @param {HTMLElement} body
 * @param {{ onOpen: (context: OpenContext) => void, onClose?: () => void }} options
 *   `onClose` runs before the workspace is emptied, so the tool can stop observers etc.
 * @returns {DocumentTool}
 */
export function createDocumentTool(body, { onOpen, onClose }) {
  /** @type {AbortController | null} */
  let controller = null;
  /** @type {{ file: File, doc: OpenedDocument } | null} */
  let current = null;

  const dropzone = createDropzone({
    multiple: false,
    onFiles(accepted, rejected) {
      for (const { file, code } of rejected) {
        showToast(userMessageFor({ code }, file.name), { type: 'error' });
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
  // Focused when a file opens, so screen readers start from what was loaded.
  fileName.tabIndex = -1;
  const fileBar = document.createElement('div');
  fileBar.className = 'workspace__bar';
  fileBar.append(fileName, createButton({ text: 'Choose another file', onClick: reset }));

  const sizeWarning = document.createElement('p');
  sizeWarning.className = 'note note--warning';
  sizeWarning.hidden = true;

  const content = document.createElement('div');
  workspace.append(fileBar, sizeWarning, content);
  body.append(dropzone.element, workspace, progress.element, status.element);

  const fileInput = () => dropzone.element.querySelector('input');
  const focusCancel = () => progress.element.querySelector('button')?.focus();

  /** @param {File} file */
  async function open(file) {
    controller = new AbortController();
    const { signal } = controller;
    status.clear();
    dropzone.element.inert = true;
    progress.start(`Opening ${file.name}…`);
    focusCancel();
    try {
      const doc = await openDocument(file, signal);
      current = { file, doc };
      fileName.textContent = `${file.name} · ${plural(doc.pageCount, 'page')} · ${formatBytes(file.size)}`;
      const warning = largeInputWarning([file]);
      sizeWarning.hidden = !warning;
      sizeWarning.textContent = warning ?? '';
      onOpen({ file, doc, content });
      dropzone.element.hidden = true;
      workspace.hidden = false;
      fileName.focus();
      announce(`${file.name} opened, ${plural(doc.pageCount, 'page')}.`);
    } catch (error) {
      if (signal.aborted) status.showInfo('Cancelled.');
      else status.showError(userMessageFor(error, file.name));
      fileInput()?.focus();
    } finally {
      if (controller?.signal === signal) controller = null;
      dropzone.element.inert = false;
      progress.hide();
    }
  }

  /** @type {DocumentTool['run']} */
  async function run(label, task, returnFocus) {
    controller = new AbortController();
    const { signal } = controller;
    status.clear();
    // The workspace can't change under a running job; focus goes to Cancel, not <body>.
    workspace.inert = true;
    progress.start(label);
    focusCancel();
    try {
      await task(signal, progress.update);
    } catch (error) {
      if (signal.aborted) status.showInfo('Cancelled. Your settings are still here.');
      else status.showError(userMessageFor(error, current?.file.name));
    } finally {
      if (controller?.signal === signal) controller = null;
      progress.hide();
      workspace.inert = false;
      (status.element.querySelector('button') ?? returnFocus).focus();
    }
  }

  function close() {
    onClose?.();
    content.replaceChildren();
    current?.doc.thumbnails?.destroy();
    current = null;
  }

  function reset() {
    close();
    status.clear();
    workspace.hidden = true;
    dropzone.element.hidden = false;
    fileInput()?.focus();
  }

  return {
    status,
    run,
    reset,
    destroy() {
      controller?.abort();
      close();
    },
  };
}
