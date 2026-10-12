import { suffixedName } from '../../core/fileNames.js';
import { addRotation } from '../../core/rotation.js';
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
   * @returns {() => void}  Stops the grid's rendering.
   */
  function buildWorkspace({ file, doc, content }) {
    /** @type {Record<number, number>} Page index → pending degrees; empty means no changes. */
    let deltas = {};

    const allPages = document.createElement('div');
    allPages.className = 'toolbar';
    allPages.setAttribute('role', 'group');
    allPages.setAttribute('aria-label', 'All pages');
    const allLabel = document.createElement('span');
    allLabel.className = 'toolbar__label';
    allLabel.textContent = 'All pages:';
    allPages.append(
      allLabel,
      createButton({
        text: 'Left',
        icon: 'rotateLeft',
        ariaLabel: 'Rotate all pages left',
        onClick: () => rotateAll(-90),
      }),
      createButton({
        text: 'Right',
        icon: 'rotateRight',
        ariaLabel: 'Rotate all pages right',
        onClick: () => rotateAll(90),
      }),
      createButton({
        text: '180°',
        ariaLabel: 'Rotate all pages 180 degrees',
        onClick: () => rotateAll(180),
      }),
      createButton({ text: 'Reset', ariaLabel: 'Undo all rotations', onClick: resetRotations }),
    );

    const grid = createThumbnailGrid({
      pageCount: doc.pageCount,
      source: doc.thumbnails,
      label: 'Pages',
      decorate(tile, pageIndex) {
        const badge = document.createElement('span');
        badge.className = 'thumbnail__badge';
        tile.caption.append(badge);
        tile.controls.append(
          createButton({
            variant: 'icon',
            icon: 'rotateLeft',
            ariaLabel: `Rotate page ${pageIndex + 1} left`,
            onClick: () => rotatePage(pageIndex, -90),
          }),
          createButton({
            variant: 'icon',
            icon: 'rotateRight',
            ariaLabel: `Rotate page ${pageIndex + 1} right`,
            onClick: () => rotatePage(pageIndex, 90),
          }),
        );
      },
    });

    const hint = document.createElement('p');
    hint.id = 'rotate-hint';
    hint.className = 'tool-actions__hint';
    const saveButton = createButton({
      text: 'Save rotated PDF',
      variant: 'primary',
      onClick: save,
    });
    saveButton.setAttribute('aria-describedby', hint.id);
    const actions = document.createElement('div');
    actions.className = 'tool-actions';
    actions.append(saveButton, hint);

    content.append(allPages, grid.element, actions);
    applyRotation({});

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
      // An earlier "Saved…" no longer describes what's on screen.
      tool.status.clear();
      for (const [pageIndex, tile] of grid.tiles.entries()) {
        const angle = deltas[pageIndex] ?? 0;
        // CSS turns the preview; pdf.js already drew the page at its existing /Rotate, so only
        // the pending change is shown here.
        tile.frame.dataset.rotation = String(angle);
        tile.caption.querySelector('.thumbnail__badge').textContent = angle
          ? ` · ${ANGLE_NAMES[angle]}`
          : '';
      }
      const count = Object.keys(deltas).length;
      saveButton.disabled = count === 0;
      hint.textContent =
        count === 0
          ? 'Rotate at least one page to save.'
          : `${plural(count, 'page')} will be rotated.`;
    }

    function save() {
      const outputName = suffixedName(file.name, 'rotated');
      tool.run(
        'Rotating…',
        async (signal) => {
          const { bytes } = await runPdfJob(
            'rotate',
            { bytes: await file.arrayBuffer(), deltas },
            { signal },
          );
          downloadBytes(bytes, outputName);
          tool.status.showSuccess(`Saved ${outputName} (${formatBytes(bytes.byteLength)}).`, [
            {
              label: 'Download again',
              primary: true,
              onClick: () => downloadBytes(bytes, outputName),
            },
            { label: 'Rotate another file', onClick: tool.reset },
          ]);
        },
        saveButton,
      );
    }

    return () => grid.destroy();
  }

  return () => tool.destroy();
}
