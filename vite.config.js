import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

/**
 * Emits src/sw.js as dist/sw.js with the list of every built file filled in, so the service
 * worker can cache the whole app on the first visit. It has to sit at the root of dist/, not
 * in assets/, because a service worker only controls pages at or below its own path.
 * @returns {import('vite').Plugin}
 */
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    // 'post' so index.html and the worker bundles are already in `bundle`.
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((fileName) => fileName !== 'index.html')
        .sort();
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      const source = (await readFile(new URL('src/sw.js', import.meta.url), 'utf8'))
        .replace('self.__PRECACHE_ASSETS__', JSON.stringify(assets))
        .replace('self.__PRECACHE_VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo-name>/.
  base: '/PDF-Toolkit/',
  plugins: [cspMetaTag(), serviceWorker()],
  // ES module workers can load code with dynamic import(), so pdf.js (~1 MB) is only fetched
  // when the worker first renders pages, not for every merge. The default ('iife') can't split.
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
