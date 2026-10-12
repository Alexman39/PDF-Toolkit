import './styles/main.css';
import './styles/components.css';

/** @typedef {{ id: string, title: string, description: string }} Tool */

/** @type {Tool[]} */
const TOOLS = [
  { id: 'merge', title: 'Merge', description: 'Combine several PDFs into one.' },
  { id: 'split', title: 'Split', description: 'Extract pages or split into several files.' },
  { id: 'rotate', title: 'Rotate', description: 'Turn single pages or the whole document.' },
  { id: 'compress', title: 'Compress', description: 'Make a PDF smaller.' },
];

/**
 * Builds a tool card with DOM APIs rather than innerHTML, so the same habit
 * carries over when we later render user-supplied file names.
 * @param {Tool} tool
 * @returns {HTMLLIElement}
 */
function createToolCard(tool) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool-card';
  button.dataset.tool = tool.id;

  const title = document.createElement('span');
  title.className = 'tool-card__title';
  title.textContent = tool.title;

  const description = document.createElement('span');
  description.className = 'tool-card__description';
  description.textContent = tool.description;

  button.append(title, description);
  item.append(button);
  return item;
}

/**
 * @param {HTMLElement} root
 */
function renderHome(root) {
  const list = document.createElement('ul');
  list.className = 'tool-grid';
  list.setAttribute('aria-label', 'Tools');
  list.append(...TOOLS.map(createToolCard));
  root.replaceChildren(list);
}

renderHome(/** @type {HTMLElement} */ (document.getElementById('app')));
