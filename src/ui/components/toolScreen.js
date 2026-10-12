/**
 * @typedef {object} ToolScreen
 * @property {HTMLElement} element
 * @property {HTMLElement} body  Where the tool puts its own controls.
 */

/**
 * The frame every tool shares: a Back link, a heading and a short description. Focus moves to
 * the heading so screen readers announce the new screen, as they would after a page load.
 * @param {HTMLElement} root
 * @param {{ title: string, description: string }} options
 * @returns {ToolScreen}
 */
export function createToolScreen(root, { title, description }) {
  const element = document.createElement('section');
  element.className = 'tool-screen';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/';
  back.textContent = '← All tools';

  const heading = document.createElement('h2');
  heading.className = 'tool-screen__title';
  heading.textContent = title;
  // Focusable from script only, so it isn't an extra Tab stop.
  heading.tabIndex = -1;

  const intro = document.createElement('p');
  intro.className = 'tool-screen__description';
  intro.textContent = description;

  const body = document.createElement('div');
  body.className = 'tool-screen__body';

  element.append(back, heading, intro, body);
  root.replaceChildren(element);
  document.title = `${title} · PDF Toolkit`;
  heading.focus();
  return { element, body };
}
