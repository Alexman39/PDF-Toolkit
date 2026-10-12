import { describe, expect, it } from 'vitest';
import { partitionPdfs } from '../../src/ui/components/dropzone.js';
import { fixture } from './helpers/pdf.js';

describe('partitionPdfs', () => {
  it('sorts by the %PDF- header, ignoring names and MIME types', async () => {
    const real = new File([fixture('three-pages.pdf')], 'renamed.txt', { type: 'text/plain' });
    const fake = new File(['hello'], 'fake.pdf', { type: 'application/pdf' });
    const empty = new File([], 'empty.pdf');
    const { accepted, rejected } = await partitionPdfs([real, fake, empty]);
    expect(accepted).toEqual([real]);
    expect(rejected).toEqual([
      { file: fake, code: 'NOT_PDF' },
      { file: empty, code: 'NOT_PDF' },
    ]);
  });

  it('accepts the corrupt fixture, which fails later with a clearer error', async () => {
    const { accepted } = await partitionPdfs([new File([fixture('corrupt.pdf')], 'c.pdf')]);
    expect(accepted).toHaveLength(1);
  });
});
