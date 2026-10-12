import { downloadBytes } from '../../lib/download.js';
import { userMessageFor } from '../../lib/errorMessages.js';
import { formatBytes } from '../../lib/formatBytes.js';
import { largeInputWarning } from '../../lib/inputSize.js';
import { runPdfJob } from '../../lib/pdfWorkerClient.js';
import { createDropzone } from '../components/dropzone.js';
import { createFileList } from '../components/fileList.js';
import { createProgress } from '../components/progress.js';
import { createStatusPanel } from '../components/statusPanel.js';
import { showToast } from '../components/toast.js';
import { createToolScreen } from '../components/toolScreen.js';

const OUTPUT_NAME = 'merged.pdf';
const MIN_FILES = 2;

/**
 * The Merge screen: pick PDFs, put them in order, get one PDF back.
 * @param {HTMLElement} root
 * @returns {import('../router.js').Unmount}
 */
export function mountMerge(root) {
  const { body } = createToolScreen(root, {
    title: 'Merge',
    description:
      'Combine several PDFs into one. Drag the files, or use the arrows, to set the order.',
  });

  /** @type {AbortController | null} */
  let controller = null;
  /** @type {Uint8Array | null} Kept so "Download again" works without merging twice. */
  let result = null;

  const dropzone = createDropzone({
    onFiles(accepted, rejected) {
      fileList.add(accepted);
      for (const { file, code } of rejected) {
        showToast(userMessageFor({ code }, file.name), { type: 'error' });
      }
    },
  });

  const sizeWarning = document.createElement('p');
  sizeWarning.className = 'note note--warning';
  sizeWarning.hidden = true;

  const fileList = createFileList({ label: 'Files to merge', onChange: handleFilesChanged });

  const hint = document.createElement('p');
  hint.id = 'merge-hint';
  hint.className = 'tool-actions__hint';

  const mergeButton = document.createElement('button');
  mergeButton.type = 'button';
  mergeButton.className = 'button';
  mergeButton.textContent = 'Merge PDFs';
  mergeButton.setAttribute('aria-describedby', hint.id);
  mergeButton.addEventListener('click', merge);

  const actions = document.createElement('div');
  actions.className = 'tool-actions';
  actions.append(mergeButton, hint);

  const progress = createProgress({ onCancel: () => controller?.abort() });
  const status = createStatusPanel();

  body.append(
    dropzone.element,
    sizeWarning,
    fileList.element,
    actions,
    progress.element,
    status.element,
  );
  handleFilesChanged([]);

  /** @param {File[]} files */
  function handleFilesChanged(files) {
    // Any change makes an earlier result or error stale.
    result = null;
    status.clear();
    fileList.clearErrors();

    const missing = MIN_FILES - files.length;
    mergeButton.disabled = missing > 0;
    hint.textContent =
      missing > 0
        ? `Add ${missing === MIN_FILES ? 'at least two PDFs' : 'one more PDF'} to merge.`
        : `${files.length} files will be merged into ${OUTPUT_NAME}.`;

    const warning = largeInputWarning(files);
    sizeWarning.hidden = !warning;
    sizeWarning.textContent = warning ?? '';
  }

  /** @param {boolean} busy */
  function setBusy(busy) {
    // inert blocks clicks, focus and drops on everything but the progress bar, so the list
    // can't change under a running job.
    for (const element of [dropzone.element, fileList.element, actions]) element.inert = busy;
  }

  async function merge() {
    const files = fileList.getFiles();
    controller = new AbortController();
    status.clear();
    fileList.clearErrors();
    setBusy(true);
    progress.start(`Merging ${files.length} files…`);
    // The Merge button just became inert; give focus somewhere useful rather than <body>.
    progress.element.querySelector('button')?.focus();

    try {
      // File.arrayBuffer() each time: the worker takes ownership of the buffers we send.
      const inputs = await Promise.all(
        files.map(async (file) => ({ bytes: await file.arrayBuffer() })),
      );
      const { bytes } = await runPdfJob(
        'merge',
        { inputs },
        { signal: controller.signal, onProgress: progress.update },
      );
      result = bytes;
      downloadBytes(bytes, OUTPUT_NAME);
      status.showSuccess(
        `Merged ${files.length} files into ${OUTPUT_NAME} (${formatBytes(bytes.byteLength)}).`,
        [
          {
            label: 'Download again',
            primary: true,
            onClick: () => downloadBytes(result, OUTPUT_NAME),
          },
          { label: 'Start over', onClick: startOver },
        ],
      );
    } catch (error) {
      if (error?.name === 'AbortError') {
        status.showInfo('Merge cancelled. Your files are still here.');
      } else {
        const failed = files[error?.fileIndex];
        if (failed) fileList.setError(error.fileIndex, userMessageFor(error));
        status.showError(
          failed
            ? `${userMessageFor(error, failed.name)} Remove it and try again.`
            : userMessageFor(error),
        );
      }
    } finally {
      controller = null;
      progress.hide();
      setBusy(false);
      focusAfterJob();
    }
  }

  function focusAfterJob() {
    const next = status.element.querySelector('button') ?? mergeButton;
    if (next.disabled) dropzone.element.querySelector('input')?.focus();
    else next.focus();
  }

  function startOver() {
    fileList.clear();
    dropzone.element.querySelector('input')?.focus();
  }

  return () => {
    // Leaving mid-merge stops the job instead of downloading a file onto another screen.
    controller?.abort();
  };
}
