# Test fixtures

## Generated (`npm run fixtures`)

Created by `scripts/generate-fixtures.js`. Output is deterministic; regenerate after editing the script.
Every page shows "Page N" so tests can verify page order.

| File              | Pages | Notes                                       |
| ----------------- | ----- | ------------------------------------------- |
| `three-pages.pdf` | 3     | A4                                          |
| `ten-pages.pdf`   | 10    | A4                                          |
| `mixed-sizes.pdf` | 3     | A4 portrait, US Letter, A5 landscape        |
| `rotated.pdf`     | 3     | A4; page 2 already has `/Rotate 90`         |
| `jpeg2000-image.pdf` | 1 | A4; has a placeholder JPEG 2000 image (never drawn) |
| `hundred-fifty-pages.pdf` | 150 | A4; for progress, cancel and UI-freeze tests |

## Added manually

Tests that use these are skipped until the file exists.

| File            | What it should be                                                  |
| --------------- | ------------------------------------------------------------------ |
| `scanned.pdf`   | Image-only pages (a real scan), a few pages, ideally < 2 MB         |
| `encrypted.pdf` | Password-protected (needs a password to open)                      |
| `corrupt.pdf`   | Starts with `%PDF-` but is damaged (e.g. a real PDF truncated)     |
