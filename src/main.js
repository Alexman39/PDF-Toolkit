import './styles/main.css';
import './styles/components.css';
import { createStatusPanel } from './ui/components/statusPanel.js';
import { createToolScreen } from './ui/components/toolScreen.js';
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
    load: async () => (await import('./ui/tools/split.js')).mountSplit,
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
    load: async () => (await import('./ui/tools/compress.js')).mountCompress,
  },
];

/** Answers the questions a privacy-minded user asks before trusting a PDF tool with a file. */
const FAQ = [
  {
    question: 'Are my files uploaded anywhere?',
    answer:
      'No. Every tool runs inside your browser, on your device. There is no server to send files to, and the page tells the browser to block any connection it tries to make.',
  },
  {
    question: 'How can I check that?',
    answer:
      "Open your browser's developer tools (F12 or right-click → Inspect), choose the Network tab, then use any tool. Your file never appears in a request. You can also switch off your internet connection: everything keeps working.",
  },
  {
    question: 'Does it work offline?',
    answer:
      'Yes, after your first visit. Your browser keeps a copy of this app, so you can open it and use every tool without a connection.',
  },
  {
    question: 'Why does strong compression make text unselectable?',
    answer:
      'It redraws each page as a picture, which is what makes scans much smaller. A picture of text cannot be selected, searched or copied. Optimise keeps the text as it is, but usually saves less.',
  },
  {
    question: "Why won't my PDF open?",
    answer:
      'Password-protected PDFs need to be unlocked first, in the app that created them. Damaged files cannot be read. Very large files (over about 200 MB in total) may need more memory than the browser allows.',
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
  root.replaceChildren(list, createFaq());
  document.title = 'PDF Toolkit';
  if (from) list.querySelector(`[data-tool="${from}"]`)?.focus();
}

/**
 * Native <details>, so the questions open with the keyboard and announce their state without
 * any script.
 * @returns {HTMLElement}
 */
function createFaq() {
  const section = document.createElement('section');
  section.className = 'faq';
  section.setAttribute('aria-labelledby', 'faq-title');
  const heading = document.createElement('h2');
  heading.id = 'faq-title';
  heading.className = 'faq__title';
  heading.textContent = 'Questions';
  section.append(heading);
  for (const { question, answer } of FAQ) {
    const details = document.createElement('details');
    details.className = 'faq__item';
    const summary = document.createElement('summary');
    summary.textContent = question;
    const text = document.createElement('p');
    text.textContent = answer;
    details.append(summary, text);
    section.append(details);
  }
  return section;
}

/**
 * The screen for a tool whose code couldn't be downloaded. Reloading rather than importing
 * again, because browsers may remember a failed import() and fail it again without trying.
 * @param {HTMLElement} root
 * @param {string} id
 */
function renderLoadError(root, id) {
  const tool = TOOLS.find((candidate) => candidate.id === id);
  const { body } = createToolScreen(root, { title: tool.title, description: tool.description });
  const status = createStatusPanel();
  body.append(status.element);
  status.showError(
    `The ${tool.title} tool couldn't be loaded. Check your internet connection and try again.`,
    [{ label: 'Try again', primary: true, onClick: () => location.reload() }],
  );
}

// Production only: in dev a cached copy would hide every edit. Registering after `load` keeps
// the service worker's own downloads from competing with the first render.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    } catch (error) {
      // The app still works online; it just won't work offline.
      console.warn('Offline support unavailable', error);
    }
  });
}

startRouter({
  root: /** @type {HTMLElement} */ (document.getElementById('app')),
  routes: TOOLS.map((tool) => tool.id),
  loadScreen: (id) => TOOLS.find((tool) => tool.id === id).load(),
  renderHome,
  renderLoadError,
});
