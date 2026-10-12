import { hasPdfHeader } from '../../core/pdfHeader.js';
import { icon } from './icons.js';

/**
 * @typedef {object} RejectedFile
 * @property {File} file
 * @property {'NOT_PDF'} code  Matches core error codes so errorMessages.js can word it.
 */

/**
 * @typedef {object} DropzoneOptions
 * @property {(accepted: File[], rejected: RejectedFile[]) => void} onFiles
 * @property {boolean} [multiple=true]
 * @property {string} [label]
 */

// Same limit as hasPdfHeader's search, so we never read more of a file than it looks at.
const HEADER_BYTES = 1024;
let nextId = 0;
let windowDropBlocked = false;

/**
 * Splits files into PDFs and non-PDFs by their `%PDF-` header. Reads only the first 1 KB of
 * each, so checking a 500 MB file costs nothing. File extensions and MIME types are ignored
 * because both are just labels the user (or OS) chose.
 * @param {File[]} files
 * @returns {Promise<{ accepted: File[], rejected: RejectedFile[] }>}
 */
export async function partitionPdfs(files) {
  const accepted = [];
  const rejected = [];
  for (const file of files) {
    const head = await file.slice(0, HEADER_BYTES).arrayBuffer();
    if (hasPdfHeader(head)) accepted.push(file);
    else rejected.push({ file, code: 'NOT_PDF' });
  }
  return { accepted, rejected };
}

/**
 * A file picker that also accepts drag-and-drop. The real `<input type="file">` stays in the
 * page (visually hidden), so keyboard, screen-reader and mobile users get the native picker.
 * @param {DropzoneOptions} options
 * @returns {{ element: HTMLElement }}
 */
export function createDropzone({ onFiles, multiple = true, label }) {
  blockWindowDrop();
  const id = `dropzone-input-${nextId++}`;

  const element = document.createElement('div');
  element.className = 'dropzone';

  const input = document.createElement('input');
  input.type = 'file';
  input.id = id;
  input.className = 'visually-hidden';
  // Only a hint for the OS picker; partitionPdfs does the real check.
  input.accept = 'application/pdf,.pdf';
  input.multiple = multiple;

  const labelElement = document.createElement('label');
  labelElement.htmlFor = id;
  labelElement.className = 'dropzone__label';
  const title = document.createElement('span');
  title.className = 'dropzone__title';
  title.textContent = label ?? (multiple ? 'Drop PDFs here' : 'Drop a PDF here');
  const action = document.createElement('span');
  action.className = 'dropzone__action';
  action.textContent = multiple ? 'or choose files' : 'or choose a file';
  const tile = document.createElement('span');
  tile.className = 'icon-tile dropzone__icon';
  tile.append(icon('addFile'));
  labelElement.append(tile, title, action);
  element.append(input, labelElement);

  async function accept(fileList) {
    const files = [...fileList];
    if (files.length === 0) return;
    const { accepted, rejected } = await partitionPdfs(multiple ? files : files.slice(0, 1));
    onFiles(accepted, rejected);
  }

  input.addEventListener('change', async () => {
    await accept(input.files);
    // Reset so picking the same file again still fires `change`.
    input.value = '';
  });

  // dragenter/dragleave also fire when crossing child elements, so count them.
  let depth = 0;
  element.addEventListener('dragenter', (event) => {
    event.preventDefault();
    depth++;
    element.classList.add('is-active');
  });
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  element.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) element.classList.remove('is-active');
  });
  element.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    element.classList.remove('is-active');
    accept(event.dataTransfer.files);
  });

  return { element };
}

/**
 * A file dropped just outside the zone would otherwise replace the app with the browser's
 * PDF viewer and lose the user's work.
 */
function blockWindowDrop() {
  if (windowDropBlocked) return;
  windowDropBlocked = true;
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (event) => {
      if (!event.defaultPrevented) event.preventDefault();
    });
  }
}
