import { describe, expect, it } from 'vitest';
import { runJob } from '../../src/workers/runJob.js';
import { fixture, labels, pageTexts, readPages } from './helpers/pdf.js';

/**
 * Runs a job and records everything it posts, the way the worker would send it.
 * @param {string} op
 * @param {object} payload
 */
async function run(op, payload) {
  const posted = [];
  await runJob({ id: 7, op, payload }, (message, transfer = []) =>
    posted.push({ message, transfer }),
  );
  return posted;
}

describe('runJob', () => {
  it('inspects a file and reports its page count', async () => {
    const posted = await run('inspect', { bytes: fixture('ten-pages.pdf') });
    expect(posted).toEqual([
      { message: { id: 7, type: 'result', result: { pageCount: 10 } }, transfer: [] },
    ]);
  });

  it('reports an encrypted file from inspect as a typed error', async () => {
    const posted = await run('inspect', { bytes: fixture('encrypted.pdf') });
    expect(posted.at(-1).message.error.code).toBe('ENCRYPTED');
  });

  it('merges and reports progress once per file', async () => {
    const posted = await run('merge', {
      inputs: [{ bytes: fixture('three-pages.pdf') }, { bytes: fixture('ten-pages.pdf') }],
    });
    const messages = posted.map((p) => p.message);
    expect(messages.slice(0, 2)).toEqual([
      { id: 7, type: 'progress', done: 1, total: 2 },
      { id: 7, type: 'progress', done: 2, total: 2 },
    ]);
    const { message, transfer } = posted.at(-1);
    expect(message.type).toBe('result');
    expect(await pageTexts(message.result.bytes)).toEqual([...labels(1, 3), ...labels(1, 10)]);
    expect(transfer).toEqual([message.result.bytes.buffer]);
  });

  it('splits and transfers every output buffer', async () => {
    const posted = await run('split', {
      bytes: fixture('ten-pages.pdf'),
      mode: { type: 'everyN', n: 4 },
    });
    const progress = posted.filter((p) => p.message.type === 'progress');
    expect(progress.map((p) => p.message.done)).toEqual([1, 2, 3]);
    const { message, transfer } = posted.at(-1);
    expect(message.result.outputs.map((o) => o.label)).toEqual(['p1-4', 'p5-8', 'p9-10']);
    expect(transfer).toHaveLength(3);
  });

  it('rotates', async () => {
    const posted = await run('rotate', { bytes: fixture('three-pages.pdf'), deltas: { 0: 90 } });
    const pages = await readPages(posted.at(-1).message.result.bytes);
    expect(pages.map((p) => p.rotation)).toEqual([90, 0, 0]);
  });

  it('optimises', async () => {
    const posted = await run('optimise', { bytes: fixture('three-pages.pdf'), options: {} });
    expect(await pageTexts(posted.at(-1).message.result.bytes)).toEqual(labels(1, 3));
  });

  it('accepts ArrayBuffers, as transferred from the main thread', async () => {
    const posted = await run('rotate', {
      bytes: fixture('three-pages.pdf').buffer,
      deltas: { 1: 180 },
    });
    expect(posted.at(-1).message.type).toBe('result');
  });

  it('posts a typed error with the failing file index', async () => {
    const posted = await run('merge', {
      inputs: [{ bytes: fixture('three-pages.pdf') }, { bytes: fixture('encrypted.pdf') }],
    });
    expect(posted).toHaveLength(1);
    expect(posted[0].message).toMatchObject({
      id: 7,
      type: 'error',
      error: { code: 'ENCRYPTED', name: 'EncryptedPdfError', fileIndex: 1 },
    });
  });

  it('posts an error for corrupt input', async () => {
    const [{ message }] = await run('optimise', { bytes: fixture('corrupt.pdf') });
    expect(message.error.code).toBe('CORRUPT');
  });

  it('posts an error for an unknown operation instead of throwing', async () => {
    const [{ message }] = await run('explode', {});
    expect(message.error).toMatchObject({ name: 'TypeError', code: 'UNKNOWN' });
  });

  it('does not treat inherited properties as operations', async () => {
    const [{ message }] = await run('toString', {});
    expect(message.type).toBe('error');
  });
});
