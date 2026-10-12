import { describe, expect, it } from 'vitest';
import { suffixedName, uniqueNames } from '../../src/core/fileNames.js';

describe('suffixedName', () => {
  it.each([
    ['report.pdf', 'rotated', 'pdf', 'report_rotated.pdf'],
    ['Report.PDF', 'rotated', 'pdf', 'Report_rotated.pdf'],
    ['scan', 'split', 'zip', 'scan_split.zip'],
    ['my.notes.pdf', 'rotated', 'pdf', 'my.notes_rotated.pdf'],
    ['.pdf', 'rotated', 'pdf', 'document_rotated.pdf'],
    ['no-extension', 'p1-3', 'pdf', 'no-extension_p1-3.pdf'],
  ])('%s + %s → %s', (name, suffix, extension, expected) => {
    expect(suffixedName(name, suffix, extension)).toBe(expected);
  });
});

describe('uniqueNames', () => {
  it('numbers repeats and leaves unique names alone', () => {
    expect(uniqueNames(['a_p1-3.pdf', 'a_p4.pdf', 'a_p1-3.pdf', 'a_p1-3.pdf'])).toEqual([
      'a_p1-3.pdf',
      'a_p4.pdf',
      'a_p1-3 (2).pdf',
      'a_p1-3 (3).pdf',
    ]);
  });

  it('treats names differing only in case as the same file', () => {
    expect(uniqueNames(['A.pdf', 'a.pdf'])).toEqual(['A.pdf', 'a (2).pdf']);
  });

  it('never numbers into a name that is already taken', () => {
    expect(uniqueNames(['a (2).pdf', 'a.pdf', 'a.pdf'])).toEqual([
      'a (2).pdf',
      'a.pdf',
      'a (3).pdf',
    ]);
  });

  it('handles names without an extension', () => {
    expect(uniqueNames(['notes', 'notes'])).toEqual(['notes', 'notes (2)']);
  });
});
