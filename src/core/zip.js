import { zipSync } from 'fflate';
import { suffixedName, uniqueNames } from './fileNames.js';

/** @typedef {import('./split.js').SplitOutput} SplitOutput */

/**
 * @typedef {object} PackagedFile
 * @property {string} name   What the download is called.
 * @property {Uint8Array} bytes
 * @property {string} type   MIME type.
 * @property {string[]} names  The PDFs inside: one for a lone PDF, several for a zip.
 */

/**
 * Turns split outputs into one download: a lone PDF stays a PDF; several go into a zip, so the
 * browser doesn't ask to allow multiple downloads (or quietly block all but the first).
 * @param {SplitOutput[]} outputs
 * @param {string} originalName  The user's file name, e.g. `report.pdf`.
 * @returns {PackagedFile}
 */
export function packageSplitOutputs(outputs, originalName) {
  const names = uniqueNames(outputs.map(({ label }) => suffixedName(originalName, label)));
  if (outputs.length === 1) {
    return { name: names[0], bytes: outputs[0].bytes, type: 'application/pdf', names };
  }
  // level 0 stores without compressing: PDF streams are already compressed, so deflating them
  // again costs CPU time for a percent or two.
  const entries = Object.fromEntries(names.map((name, i) => [name, outputs[i].bytes]));
  return {
    name: suffixedName(originalName, 'split', 'zip'),
    bytes: zipSync(entries, { level: 0 }),
    type: 'application/zip',
    names,
  };
}
