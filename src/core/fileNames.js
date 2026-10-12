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

/**
 * Makes names unique for a zip by numbering repeats: `a.pdf, a.pdf` → `a.pdf, a (2).pdf`.
 * Ranges like `1-3, 1-3` are allowed (one file per range), and a zip with two entries of the
 * same name extracts as one file silently overwriting the other.
 * @param {readonly string[]} names
 * @returns {string[]}
 */
export function uniqueNames(names) {
  // Case-insensitive, because Windows and macOS file systems are.
  const taken = new Set();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let candidate = name;
    for (let copy = 2; taken.has(candidate.toLowerCase()); copy++) {
      candidate = `${stem} (${copy})${extension}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
