// pdf.js, configured once for every place that renders pages: thumbnails and strong
// compression, on the main thread or inside pdf.worker.js (where pdf.js starts its own worker
// as a nested worker).
//
// The legacy build polyfills the very new APIs the modern build relies on
// (e.g. Map.prototype.getOrInsertComputed), which many phones don't have yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// `?url` makes Vite copy the worker into dist/ and hand us its URL: pdf.js loads it from our own
// origin, never from a CDN.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
