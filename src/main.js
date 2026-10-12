import './styles/main.css';
import './styles/components.css';
import { icon } from './ui/components/icons.js';
import { createStatusPanel } from './ui/components/statusPanel.js';
import { createToolScreen } from './ui/components/toolScreen.js';
import { hrefFor, startRouter } from './ui/router.js';

/** @typedef {import('./ui/router.js').Mount} Mount */

/**
 * @typedef {object} Tool
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {Parameters<typeof icon>[0]} icon
 * @property {() => Promise<Mount>} load
 *   A dynamic import, so each tool's code (and pdf.js, for the thumbnail tools) is only
 *   downloaded when its screen opens.
 */

/** @type {Tool[]} */
const TOOLS = [
  {
    id: 'merge',
    icon: 'merge',
    title: 'Merge',
    description: 'Combine several PDFs into one.',
    load: async () => (await import('./ui/tools/merge.js')).mountMerge,
  },
  {
    id: 'split',
    icon: 'split',
    title: 'Split',
    description: 'Extract pages or split into several files.',
    load: async () => (await import('./ui/tools/split.js')).mountSplit,
  },
  {
    id: 'rotate',
    icon: 'rotateRight',
    title: 'Rotate',
    description: 'Turn single pages or the whole document.',
    load: async () => (await import('./ui/tools/rotate.js')).mountRotate,
  },
  {
    id: 'compress',
    icon: 'compress',
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

  const body = document.createElement('span');
  body.className = 'tool-card__body';
  body.append(title, description);

  const arrow = icon('arrowRight');
  arrow.classList.add('tool-card__arrow');

  link.append(iconTile(tool.icon), body, arrow);
  item.append(link);
  return item;
}

/**
 * @param {Parameters<typeof icon>[0]} name
 * @returns {HTMLSpanElement}
 */
function iconTile(name) {
  const tile = document.createElement('span');
  tile.className = 'icon-tile';
  tile.append(icon(name));
  return tile;
}

/** @returns {HTMLElement} */
function createHero() {
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.setAttribute('aria-labelledby', 'hero-title');
  const title = document.createElement('h2');
  title.id = 'hero-title';
  title.className = 'hero__title';
  title.textContent = 'Edit PDFs privately, right in your browser.';
  const lead = document.createElement('p');
  lead.className = 'hero__lead';
  lead.textContent =
    'Merge, split, rotate and compress. Nothing is uploaded: the work happens on your device, even offline.';
  hero.append(title, lead);
  return hero;
}

/** The three reasons to trust the app, each one something a user can check. */
const PILLARS = [
  {
    icon: 'lock',
    title: 'Nothing is uploaded',
    text: 'There is no server. Your PDFs are read and written by your own browser.',
  },
  {
    icon: 'offline',
    title: 'Works offline',
    text: 'After your first visit the app runs without any connection.',
  },
  {
    icon: 'code',
    title: 'Open and verifiable',
    text: "The code is public, and your browser's developer tools show that no request is made.",
    link: {
      label: 'How to check it yourself',
      href: 'https://github.com/Alexman39/PDF-Toolkit#verify-it-in-your-browser',
    },
  },
];

/** @returns {HTMLElement} */
function createPillars() {
  const section = document.createElement('section');
  section.className = 'pillars';
  section.setAttribute('aria-labelledby', 'pillars-title');
  const heading = document.createElement('h2');
  heading.id = 'pillars-title';
  heading.className = 'section-title';
  heading.textContent = 'How your files stay private';
  const list = document.createElement('ul');
  list.className = 'pillars__list';
  for (const pillar of PILLARS) {
    const item = document.createElement('li');
    item.className = 'pillar';
    const title = document.createElement('h3');
    title.className = 'pillar__title';
    title.textContent = pillar.title;
    const text = document.createElement('p');
    text.className = 'pillar__text';
    text.textContent = pillar.text;
    item.append(iconTile(/** @type {Parameters<typeof icon>[0]} */ (pillar.icon)), title, text);
    if (pillar.link) {
      const link = document.createElement('a');
      link.href = pillar.link.href;
      link.textContent = pillar.link.label;
      item.append(link);
    }
    list.append(item);
  }
  section.append(heading, list);
  return section;
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
  root.replaceChildren(createHero(), list, createPillars(), createFaq());
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
  heading.className = 'section-title';
  heading.textContent = 'Questions';
  const list = document.createElement('div');
  list.className = 'faq__list';
  section.append(heading, list);
  for (const { question, answer } of FAQ) {
    const details = document.createElement('details');
    details.className = 'faq__item';
    const summary = document.createElement('summary');
    summary.textContent = question;
    const text = document.createElement('p');
    text.textContent = answer;
    details.append(summary, text);
    list.append(details);
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
