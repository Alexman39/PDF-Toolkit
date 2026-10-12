import { createToolScreen } from '../components/toolScreen.js';

/**
 * A screen for a tool that isn't built yet, so its card still leads somewhere honest.
 * @param {{ title: string, description: string }} tool
 * @returns {import('../router.js').Mount}
 */
export function comingSoon(tool) {
  return (root) => {
    const { body } = createToolScreen(root, tool);
    const note = document.createElement('p');
    note.textContent = 'This tool is coming soon.';
    body.append(note);
    return () => {};
  };
}
