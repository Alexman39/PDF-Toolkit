import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { packageSplitOutputs } from '../../src/core/zip.js';

const bytes = (...values) => new Uint8Array(values);

describe('packageSplitOutputs', () => {
  it('keeps a single output as a plain PDF', () => {
    const output = { label: 'p1-3', bytes: bytes(1, 2, 3) };
    expect(packageSplitOutputs([output], 'report.pdf')).toEqual({
      name: 'report_p1-3.pdf',
      bytes: output.bytes,
      type: 'application/pdf',
      names: ['report_p1-3.pdf'],
    });
  });

  it('zips several outputs, with unique names in order', () => {
    const packaged = packageSplitOutputs(
      [
        { label: 'p1-3', bytes: bytes(1) },
        { label: 'p5', bytes: bytes(2) },
        { label: 'p1-3', bytes: bytes(3) },
      ],
      'report.pdf',
    );
    expect(packaged.name).toBe('report_split.zip');
    expect(packaged.type).toBe('application/zip');
    expect(packaged.names).toEqual(['report_p1-3.pdf', 'report_p5.pdf', 'report_p1-3 (2).pdf']);

    const files = unzipSync(packaged.bytes);
    expect(Object.keys(files)).toEqual(packaged.names);
    expect(files['report_p1-3 (2).pdf']).toEqual(bytes(3));
  });
});
