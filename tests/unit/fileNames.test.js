import { describe, expect, it } from 'vitest';
import { suffixedName } from '../../src/lib/fileNames.js';

describe('suffixedName', () => {
  it.each([
    ['report.pdf', 'rotated', 'pdf', 'report_rotated.pdf'],
    ['Report.PDF', 'rotated', 'pdf', 'Report_rotated.pdf'],
    ['scan', 'split', 'zip', 'scan_split.zip'],
    ['my.notes.pdf', 'rotated', 'pdf', 'my.notes_rotated.pdf'],
    ['.pdf', 'rotated', 'pdf', 'document_rotated.pdf'],
  ])('%s + %s → %s', (name, suffix, extension, expected) => {
    expect(suffixedName(name, suffix, extension)).toBe(expected);
  });
});
