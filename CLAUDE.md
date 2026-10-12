# CLAUDE.md — PDF Toolkit

> Master prompt for Claude Code. Claude reads this file at the start of every session.
> When a decision changes, update this file first.

## 1. What we are building

A small **browser-based PDF toolkit** that can **merge, split, rotate and compress** PDFs.
It runs **fully client-side**, so files never leave the user's device.

The product's main promise is privacy. Every technical decision must protect it:
- **No uploads, no backend, no analytics, no third-party requests at runtime.** All libraries are bundled, never loaded from a CDN.
- The app must keep working with the network turned off after the first load.
- The UI says this plainly ("Your files never leave this device"), and the code must make that true.

**Prototype goal:** a fast, polished single-page tool that works on desktop and mobile and is deployed to GitHub Pages. No accounts, no editing of page content, no OCR, no e-signatures.

## 2. Tech stack (do not change without asking me)

| Layer | Choice |
|---|---|
| Language | Modern JavaScript (ES modules), **no TypeScript**; use JSDoc types on public functions |
| Build/dev | Vite (vanilla template, no framework) |
| PDF writing | `pdf-lib` (merge, split, rotate, lossless optimise) |
| PDF rendering | `pdfjs-dist` (page thumbnails + rasterising for strong compression) |
| Zip | `fflate` (download several split files as one .zip) |
| Styling | Plain CSS with custom properties (light/dark), no CSS framework |
| Heavy work | Web Workers, so the UI never freezes |
| Tests | Vitest (logic), Playwright (end-to-end in a real browser) |
| Lint/format | ESLint + Prettier |
| Hosting | GitHub Pages (static build) |

Why two PDF libraries: `pdf-lib` can create and modify PDFs but **cannot render pages or re-encode images**. `pdfjs-dist` can render pages but cannot write PDFs. Thumbnails and real compression need rendering.

## 3. Repository layout

```
/
├── CLAUDE.md
├── ROADMAP.md
├── index.html
├── public/                  ← icons, manifest, sample PDFs for manual testing
├── src/
│   ├── main.js              ← app bootstrap + router between tools
│   ├── core/                ← PURE PDF operations (no DOM)
│   │   ├── merge.js
│   │   ├── split.js
│   │   ├── rotate.js
│   │   ├── compress.js
│   │   ├── pageRanges.js    ← parse "1-3, 5, 8-" → page indexes
│   │   └── errors.js        ← typed errors (Encrypted, Corrupt, TooLarge…)
│   ├── workers/
│   │   └── pdf.worker.js    ← runs core/* off the main thread
│   ├── ui/
│   │   ├── components/      ← dropzone, file list, thumbnail grid, progress, toast
│   │   └── tools/           ← one screen per tool: merge, split, rotate, compress
│   ├── lib/
│   │   ├── download.js      ← Blob → file download, object-URL cleanup
│   │   └── thumbnails.js    ← pdfjs rendering helpers
│   └── styles/
└── tests/
    ├── unit/                ← Vitest, uses fixtures
    ├── e2e/                 ← Playwright
    └── fixtures/            ← small sample PDFs (normal, scanned, encrypted, corrupt, 100+ pages)
```

**Rule:** `src/core/` takes `Uint8Array`/`ArrayBuffer` in and returns `Uint8Array` out. It never touches the DOM, so the same code runs in a worker and in tests.

## 4. Feature specification

### 4.1 Merge
- Add several PDFs (drag-and-drop or file picker) and reorder them by dragging. Keyboard alternative: up/down buttons.
- Optional: choose a page range per file.
- Output: one PDF, named `merged.pdf`. Implemented with `PDFDocument.create()` + `copyPages`.

### 4.2 Split
- Modes: **custom ranges** (`1-3, 5, 8-`), **every N pages**, **extract selected pages** (click thumbnails), **one file per page**.
- One output → PDF download. Several outputs → a single `.zip` (fflate).
- Output names: `<original>_p1-3.pdf`, and so on.

### 4.3 Rotate
- Thumbnail grid. Rotate single pages or all pages by ±90°/180°.
- Uses `page.setRotation(degrees(...))` and **adds** to the page's existing rotation (normalise to 0/90/180/270).
- Lossless: content is not re-encoded.

### 4.4 Compress (be honest with the user)
Two clearly labelled modes:
1. **Optimise (lossless):** re-save with `pdf-lib` using object streams, strip metadata on request, drop unused objects. Usually a small gain. Text stays selectable.
2. **Strong (lossy):** render each page with pdf.js to a canvas, encode it as JPEG (quality slider plus DPI choice: 72/110/150), and rebuild the PDF from the images with pdf-lib. Big gains on scanned PDFs, but **text is no longer selectable or searchable**. The UI must warn about this before running.
- Always show the before/after size. If the result is larger than the original, say so and offer the original back.

### 4.5 Shared behaviour
- Accept only PDFs. Check the `%PDF-` header, not just the file extension.
- **Encrypted PDFs:** detect them and show a clear message ("This PDF is password-protected; unlock it first"). Do not produce broken output.
- **Corrupt PDFs:** show a friendly error. One bad file must not break the others in a merge.
- Large files: show a progress bar, run the work in a worker, and allow cancelling. Warn above ~200 MB total, since browsers have memory limits.
- Revoke object URLs after download to free memory.

## 5. Privacy & security requirements
- A Content-Security-Policy meta tag with `default-src 'self'` and `connect-src 'none'` (adjust only if Vite dev needs it, and only in dev).
- No `fetch`/XHR anywhere in `src/` except loading the bundled pdf.js worker file.
- No `eval`, no innerHTML with file-derived strings. File names are user input: escape them.
- Add a Playwright test that fails if the page makes **any** network request after load while processing a file.
- Optional later: a service worker for offline use (PWA).

## 6. UX & accessibility
- Home screen: 4 big tool cards. Each tool is one focused screen with Back.
- Mobile-first. It must work with touch drag-and-drop or button alternatives.
- Every action is keyboard-accessible, controls have visible focus and ARIA labels, and status messages use `aria-live`.
- Every screen has empty, loading, success and error states.
- Light/dark theme follows the system setting.

## 7. Coding conventions
- Small modules, one responsibility each. Prefer pure functions; keep side effects at the edges (UI, download).
- `async`/`await`, no promise chains. Throw typed errors from `core/errors.js` and map them to user messages in the UI only.
- Use JSDoc `@param`/`@returns` on every exported function.
- Name things by meaning (`parsePageRanges`, not `parse2`).
- Comments explain *why*, not *what*.

## 8. How to work with me (rules for Claude Code)
1. **One roadmap phase at a time.** Read `ROADMAP.md` and stay inside the current phase's scope.
2. **Plan first** for any task touching more than 2 files, and wait for my OK.
3. **I am learning.** After each step, give a 3–5 line explanation of what you did and *why*, plus one concept worth studying (e.g. ArrayBuffers, Web Workers, Blob URLs, PDF object structure).
4. **Verify:** run `npm run lint` and `npm test` before saying something is done. Report failures exactly.
5. **Small commits.** Suggest a Conventional Commit message (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`) after each working step. Don't commit unless I ask.
6. **No new dependencies** beyond §2 without asking and explaining why. **Never** load anything from a CDN at runtime.
7. Don't silently change this file. Propose changes instead.
8. When a phase is done, tick its checklist in `ROADMAP.md` and add decisions to §10.

## 9. Commands
```
npm install
npm run dev          # Vite dev server
npm run build        # production build to dist/
npm run preview      # serve the build locally
npm test             # Vitest unit tests
npm run test:e2e     # Playwright
npm run lint
```

## 10. Decisions log
- 2026-10-12: pdf-lib for writing, pdf.js for rendering. Compression offered as lossless vs lossy, with an explicit warning that the lossy mode removes selectable text.
- 2026-10-12: CSP meta tag is injected at build time only (Vite plugin), because dev hot reload needs a WebSocket. E2E tests run against `vite preview` of the production build. Prettier ignores `*.md` to protect CLAUDE.md and ROADMAP.md.
- 2026-10-12: Core ops take 0-based page indexes; text ranges are parsed in the UI via pageRanges.js. Merge fails on any bad input (error carries `fileIndex`) rather than silently skipping it. Split "selected" = one file in ascending page order; `separate: true` gives one file per page.
- 2026-10-12: Lossless compress removes unreachable objects by walking from the trailer instead of copying pages into a new doc, so outlines, forms and page labels survive.
- 2026-10-12: ESLint limits src/core to globals shared by Node and browsers, enforcing "no DOM in core".
- 2026-10-12: Cancel = `worker.terminate()` + respawn on next job, not a cancel message: pdf-lib can't be interrupted mid-save, and terminating frees the worker's memory at once. Aborting cancels every job in that worker.
- 2026-10-12: Worker protocol split into `workers/messages.js` (shared, imports only errors.js) and `workers/runJob.js` (op table). Importing core from the client put pdf-lib in the main bundle (424 KB → 3.8 KB after the split).
- 2026-10-12: Typed errors cross the worker boundary as `{ name, code, message, fileIndex… }` and are rebuilt by `code`, since structured clone drops custom fields. `mergePdfs`/`splitPdf` take an optional `onProgress` callback; rotate/optimise show indeterminate progress.
- 2026-10-12: Component E2E tests run on a harness page (`tests/e2e/harness/`) served by the Vite dev server, so it never ships in `dist/`. File-list drag uses Pointer Events (HTML5 DnD doesn't fire on touch).
- 2026-10-12: Hash routing (`#/merge`), since GitHub Pages can't serve deep paths. Each tool is a dynamic import exporting `mount(root) → unmount`; unmount aborts jobs and frees previews. Home bundle stays ~4.5 KB.
- 2026-10-12: pdf.js uses the **legacy** build (the modern one needs `Map.prototype.getOrInsertComputed`, missing on many phones). No font/CMap/wasm URLs are set, because pdf.js would fetch them and the CSP forbids it: thumbnails fall back to system fonts and JPEG 2000 images may not render (revisit for Phase 5's lossy compress).
- 2026-10-12: Thumbnails render to a throwaway canvas, then a JPEG blob URL (~15 KB/page instead of ~0.5 MB of canvas pixels). IntersectionObserver (rootMargin one screen) feeds a render queue: 2 at a time, newest request first, cancelled when scrolled away. Blob URLs are revoked on close.
- 2026-10-12: Rotate/Split run a worker `inspect` op (pdf-lib `loadPdf`) before opening pdf.js, because pdf.js opens owner-password PDFs that pdf-lib refuses. Previews are optional: if pdf.js fails, tiles show page numbers only.
- 2026-10-12: The worker's `split` op returns one packaged download `{ name, bytes, type, names }`: a lone output stays a PDF, several are zipped in the worker with fflate at level 0 (PDFs are already compressed). Repeated names get ` (2)`.
- 2026-10-12: pdf-lib-free core modules (`splitPlan.js`, `rotation.js`, `fileNames.js`) so screens can validate and preview output names on the main thread without bundling pdf-lib.
- 2026-10-12: Merge per-file page ranges deferred to "Later" to keep Phase 4 small.
- 2026-10-12: Strong compress = `lib/rasterise.js` (pdf.js → canvas → JPEG) + `core/compress.js` `buildImagePdf` (pdf-lib, embeds the JPEGs as-is, no metadata). Rendering runs in pdf.worker.js on OffscreenCanvas when `canRenderInWorker()` (OffscreenCanvas 2D + `convertToBlob`, `self.fonts`, nested `Worker`); pdf.js gets a custom `CanvasFactory` and `ownerDocument: { fonts: self.fonts }`, and runs its own worker nested (importing its worker code into ours would hijack our `onmessage`). Otherwise, or if worker rendering throws an untyped error, the main thread renders and the worker only assembles.
- 2026-10-12: Workers are built as ES modules (`worker.format: 'es'`) so `renderInWorker.js` (pdf.js) is a dynamic import; the PDF worker stays ~440 KB for other jobs.
- 2026-10-12: Strong mode is disabled for PDFs with JPEG 2000 / JBIG2 images (`inspect` with `forCompress`): pdf.js needs wasm decoders it would fetch, which the CSP forbids, so those pages would come out blank. Decoders deferred to "Later".
- 2026-10-12: Compress defaults 110 DPI / quality 60. A "compressed" result that isn't smaller is never downloaded automatically; the user picks Keep original (unchanged copy) or Download anyway. The lossy warning is inline with an "I understand" checkbox that enables the button, not a dialog.
- 2026-10-12: Offline = hand-written service worker (`src/sw.js`, no dependency). A Vite plugin emits it as `dist/sw.js` with every built file listed and a hash of the list as cache name; registered in production only. Assets cache-first with `ignoreVary` (servers send `Vary: Origin`, which made module scripts miss the cache); navigations network-first with the cached page as fallback and never refreshed from the network. No `skipWaiting()`, so an open tab keeps its version's chunks.
- 2026-10-12: The §5 network test (`privacy.spec.js`) allows only `blob:`/`data:` URLs and requests answered by the service worker's cache after load; anything else fails, as does any CSP violation. It also runs every tool offline, before and after a reload. Tests that rewrite responses with `page.route()` must `test.use({ serviceWorkers: 'block' })`.
- 2026-10-12: A screen whose code can't be downloaded shows an error with "Try again" (a full reload, since browsers may cache a failed `import()`). Touch is covered by a Playwright "touch" project (Pixel 7 emulation, finger drag via CDP touch events). Theme contrast is checked by a unit test that reads main.css; `--border-strong` (≥3:1) outlines text inputs.
- 2026-10-12: CI = one workflow (`.github/workflows/ci.yml`, Node 24): lint, unit and e2e on every push/PR; on `main` the `dist/` the e2e tests just built is uploaded and deployed by a separate job (`needs: test`, only that job gets `pages`/`id-token` write), so the live site is exactly the tested bytes. README screenshots come from `npm run screenshots` (a script, not a test, so CI never fails over pixels). MIT license.
