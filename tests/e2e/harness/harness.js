// A minimal merge flow wired from the shared components, so E2E tests can exercise them and
// the real worker before the tool screens exist (Phase 4).
import '../../../src/styles/main.css';
import '../../../src/styles/components.css';
import { downloadBytes } from '../../../src/lib/download.js';
import { userMessageFor } from '../../../src/lib/errorMessages.js';
import { runPdfJob } from '../../../src/lib/pdfWorkerClient.js';
import { createDropzone } from '../../../src/ui/components/dropzone.js';
import { createFileList } from '../../../src/ui/components/fileList.js';
import { createProgress } from '../../../src/ui/components/progress.js';
import { showToast } from '../../../src/ui/components/toast.js';

const mergeButton = document.createElement('button');
mergeButton.type = 'button';
mergeButton.className = 'button';
mergeButton.textContent = 'Merge';
mergeButton.disabled = true;

const fileList = createFileList({
  onChange: (files) => {
    mergeButton.disabled = files.length === 0;
  },
});

const dropzone = createDropzone({
  onFiles(accepted, rejected) {
    fileList.add(accepted);
    for (const { file, code } of rejected) {
      showToast(userMessageFor({ code }, file.name), { type: 'error' });
    }
  },
});

/** @type {AbortController | null} */
let controller = null;
const progress = createProgress({ onCancel: () => controller?.abort() });

mergeButton.addEventListener('click', async () => {
  const files = fileList.getFiles();
  controller = new AbortController();
  mergeButton.disabled = true;
  progress.start('Merging…');
  try {
    const inputs = await Promise.all(
      files.map(async (file) => ({ bytes: await file.arrayBuffer() })),
    );
    const { bytes } = await runPdfJob(
      'merge',
      { inputs },
      { signal: controller.signal, onProgress: progress.update },
    );
    downloadBytes(bytes, 'merged.pdf');
    showToast('Merged.', { type: 'success' });
  } catch (error) {
    const cancelled = error.name === 'AbortError';
    showToast(userMessageFor(error, files[error.fileIndex]?.name), {
      type: cancelled ? 'info' : 'error',
    });
  } finally {
    progress.hide();
    mergeButton.disabled = false;
  }
});

document
  .getElementById('app')
  .append(dropzone.element, fileList.element, mergeButton, progress.element);

// Longest gap between animation frames since the last reset: a frozen main thread shows up
// here as one huge gap.
let maxFrameGap = 0;
let lastFrame = performance.now();
function tick(now) {
  maxFrameGap = Math.max(maxFrameGap, now - lastFrame);
  lastFrame = now;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.harness = {
  resetFrameGap() {
    maxFrameGap = 0;
    lastFrame = performance.now();
  },
  maxFrameGap: () => maxFrameGap,
};
