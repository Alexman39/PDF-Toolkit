# ROADMAP — PDF Toolkit

How to use this file:
- Work on **one phase per Claude Code session** and run `/clear` between phases.
- Paste the **Kickoff prompt**, let Claude Code plan, approve the plan, then build.
- A phase is done when every box is ticked and lint and tests pass. Tag it (`git tag phase-2`).

Estimated total: ~2–3 weeks part-time.

---

## Phase 0: Setup (½ day)
Kickoff prompt:
> Read CLAUDE.md. Phase 0: set up a Vite vanilla-JS project with the folder layout from §3, ESLint +
> Prettier, Vitest with one passing test, Playwright with one smoke test that opens the home page,
> and the npm scripts from §9. Add `pdf-lib`, `pdfjs-dist` and `fflate`. Add the CSP meta tag from §5.
> Configure Vite's `base` for GitHub Pages. Plan first.

- [x] `npm run dev`, `npm test`, `npm run test:e2e`, `npm run lint` all work
- [x] Home page shows 4 placeholder tool cards
- [x] Repo pushed to GitHub

---

## Phase 1: Test fixtures + core utilities (1 day)
Kickoff prompt:
> Phase 1. Create a script that generates small fixture PDFs with pdf-lib (3-page, 10-page, mixed
> page sizes, one page already rotated 90°). I'll add a scanned PDF, an encrypted PDF and a corrupt
> file manually. Then implement and fully test `core/pageRanges.js` (parse `"1-3, 5, 8-"`, validate
> against page count, clear errors for bad input) and `core/errors.js`, plus a `loadPdf(bytes)`
> helper that checks the `%PDF-` header and detects encryption. Tests first. Plan first.

- [ ] Range parser handles spaces, open ranges, duplicates, out-of-range values, garbage input
- [ ] Encrypted and corrupt fixtures produce the correct typed errors

---

## Phase 2: Core operations (2–3 days) ★ core
Kickoff prompt:
> Phase 2. Implement `core/merge.js`, `core/split.js` (all 4 modes from §4.2), `core/rotate.js`
> (additive, normalised rotation) and the **lossless** part of `core/compress.js` as pure functions:
> bytes in, bytes out. Unit-test each against the fixtures. Check page counts, page order and
> rotation values in the output. Explain how pdf-lib's `copyPages` works. Plan first.

- [ ] All operations tested, including edge cases (single page, all pages, already-rotated pages)
- [ ] No DOM usage anywhere in `src/core/`

---

## Phase 3: Worker + shared UI components (2 days)
Kickoff prompt:
> Phase 3. Create `workers/pdf.worker.js` exposing the core operations through a small message
> protocol (`{id, op, payload}` → progress / result / error), with transferable ArrayBuffers and
> cancel support. Build the shared components: dropzone (with PDF header validation), file list
> with drag-and-drop reorder plus keyboard buttons, progress bar, toast, and download helper with
> object-URL cleanup. Plan first.

- [ ] UI stays responsive while a 100+ page file is processed
- [ ] Cancelling works and frees memory
- [ ] Components are keyboard-accessible

---

## Phase 4: Merge, Rotate, Split screens (3 days)
Kickoff prompt:
> Phase 4. Build the Merge, Rotate and Split tool screens using the shared components and the
> worker. Add pdf.js thumbnails (`lib/thumbnails.js`) rendered lazily, only when visible. Split
> downloads multiple outputs as a zip via fflate. Every screen has empty/loading/success/error
> states. One screen at a time. Plan first.

- [ ] Full flow works in the browser for all three tools
- [ ] Thumbnails load lazily, so a 200-page PDF doesn't freeze the page
- [ ] Encrypted and corrupt files show friendly messages

---

## Phase 5: Compress (2 days)
Kickoff prompt:
> Phase 5. Finish `core/compress.js` with the **strong (lossy)** mode from §4.4: render pages
> with pdf.js (OffscreenCanvas in the worker where supported, main-thread fallback otherwise),
> encode them as JPEG with the chosen quality/DPI, and rebuild with pdf-lib. Build the Compress screen
> with the mode choice, the warning about losing selectable text, a before/after size display, and
> "keep original" when the result is larger. Plan first.

- [ ] Scanned fixture shrinks significantly; text-heavy fixture shows an honest result
- [ ] The warning is shown before the lossy mode runs

---

## Phase 6: Privacy, accessibility & polish (1–2 days)
Kickoff prompt:
> Phase 6. Add the Playwright test from §5 that fails on any network request while processing a
> file. Run an accessibility pass (keyboard-only walkthrough of every tool, ARIA labels, aria-live
> status, focus handling, contrast in both themes). Add the "files never leave your device" notice
> and a short FAQ. Review the code for innerHTML with file names. List issues before fixing them.

- [ ] Network test passes; app works offline after the first load
- [ ] Usable on a phone with touch only

---

## Phase 7: Ship (1 day)
Kickoff prompt:
> Phase 7. Set up a GitHub Actions workflow: lint + unit + e2e tests on every push, then deploy
> `dist/` to GitHub Pages on `main`. Write a README with a feature list, a privacy explanation
> (and how anyone can verify it in DevTools → Network), a Mermaid diagram of UI → worker → core,
> screenshots and setup steps.

- [ ] Live on GitHub Pages
- [ ] Green CI badge in README
- [ ] Added to portfolio site

---

## Later (out of scope)
- PWA / installable offline app (service worker)
- Reorder or delete pages inside a single PDF
- Images → PDF, PDF → images
- Add page numbers or a watermark

## Status
Current phase: **1**
