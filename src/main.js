import './styles/main.css';
import './styles/components.css';
import { hrefFor, startRouter } from './ui/router.js';

/** @typedef {import('./ui/router.js').Mount} Mount */

/**
 * @typedef {object} Tool
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {() => Promise<Mount>} load
 *   A dynamic import, so each tool's code (and pdf.js, for the thumbnail tools) is only
 *   downloaded when its screen opens.
 */

/** @param {{ title: string, description: string }} tool */
const placeholder = async (tool) => (await import('./ui/tools/comingSoon.js')).comingSoon(tool);

/** @type {Tool[]} */
const TOOLS = [
  {
    id: 'merge',
    title: 'Merge',
    description: 'Combine several PDFs into one.',
    load: async () => (await import('./ui/tools/merge.js')).mountMerge,
  },
  {
    id: 'split',
    title: 'Split',
    description: 'Extract pages or split into several files.',
    load() {
      return placeholder(this);
    },
  },
  {
    id: 'rotate',
    title: 'Rotate',
    description: 'Turn single pages or the whole document.',
    load: async () => (await import('./ui/tools/rotate.js')).mountRotate,
  },
  {
    id: 'compress',
    title: 'Compress',
    description: 'Make a PDF smaller.',
    load() {
      return placeholder(this);
    },
  },
];

/**
 * Builds a tool card with DOM APIs rather than innerHTML, so the same habit
 * carries over when we later render user-supplied file names.
 * A link rather than a button, because it navigates: users can open it in a new tab.
 * @param {Tool} tool
 * @returns {HTMLLIElement}
 */
function createToolCard(tool) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'tool-card';
  link.href = hrefFor(tool.id);
  link.dataset.tool = tool.id;

  const title = document.createElement('span');
  title.className = 'tool-card__title';
  title.textContent = tool.title;

  const description = document.createElement('span');
  description.className = 'tool-card__description';
  description.textContent = tool.description;

  link.append(title, description);
  item.append(link);
  return item;
}

/**
 * @param {HTMLElement} root
 * @param {string | null} from  The tool just left; its card gets focus so keyboard users
 *   continue where they were instead of at the top of the page.
 */
function renderHome(root, from) {
  const list = document.createElement('ul');
  list.className = 'tool-grid';
  list.setAttribute('aria-label', 'Tools');
  list.append(...TOOLS.map(createToolCard));
  root.replaceChildren(list);
  document.title = 'PDF Toolkit';
  if (from) list.querySelector(`[data-tool="${from}"]`)?.focus();
}

startRouter({
  root: /** @type {HTMLElement} */ (document.getElementById('app')),
  routes: TOOLS.map((tool) => tool.id),
  loadScreen: (id) => TOOLS.find((tool) => tool.id === id).load(),
  renderHome,
});
