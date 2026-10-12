/**
 * Builds an output name from the user's file name: `report.pdf` + `rotated` → `report_rotated.pdf`.
 * @param {string} originalName
 * @param {string} suffix
 * @param {string} [extension]  Without the dot.
 * @returns {string}
 */
export function suffixedName(originalName, suffix, extension = 'pdf') {
  const base = originalName.replace(/\.pdf$/i, '') || 'document';
  return `${base}_${suffix}.${extension}`;
}
