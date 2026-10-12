import { defineConfig } from 'vite';

/**
 * Production CSP. Injected only at build time because the dev server needs a
 * WebSocket for hot reload, which `connect-src 'none'` would block (CLAUDE.md §5).
 */
const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** @returns {import('vite').Plugin} */
function cspMetaTag() {
  return {
    name: 'csp-meta-tag',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/.
  base: '/PDF-Toolkit/',
  plugins: [cspMetaTag()],
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
