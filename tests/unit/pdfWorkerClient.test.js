import { describe, expect, it, vi } from 'vitest';
import { EncryptedPdfError } from '../../src/core/errors.js';
import { createPdfWorkerClient } from '../../src/lib/pdfWorkerClient.js';

/** A stand-in Worker that records what it was sent and lets the test reply. */
class FakeWorker {
  constructor() {
    this.posted = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
  }
  postMessage(message, transfer) {
    this.posted.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  /** @param {object} data */
  reply(data) {
    this.onmessage({ data });
  }
}

function setUp() {
  const workers = [];
  const client = createPdfWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

describe('createPdfWorkerClient', () => {
  it('does not start a worker until the first job', () => {
    const { workers } = setUp();
    expect(workers).toHaveLength(0);
  });

  it('sends {id, op, payload} and transfers the payload buffers', () => {
    const { client, workers } = setUp();
    const bytes = new ArrayBuffer(4);
    client.run('rotate', { bytes, deltas: { 0: 90 } });
    const [{ message, transfer }] = workers[0].posted;
    expect(message).toEqual({ id: 1, op: 'rotate', payload: { bytes, deltas: { 0: 90 } } });
    expect(transfer).toEqual([bytes]);
  });

  it('routes progress and results to the job with the matching id', async () => {
    const { client, workers } = setUp();
    const progressA = vi.fn();
    const a = client.run('merge', { inputs: [] }, { onProgress: progressA });
    const b = client.run('optimise', {});
    workers[0].reply({ id: 2, type: 'result', result: { bytes: 'B' } });
    workers[0].reply({ id: 1, type: 'progress', done: 1, total: 2 });
    workers[0].reply({ id: 1, type: 'result', result: { bytes: 'A' } });
    await expect(a).resolves.toEqual({ bytes: 'A' });
    await expect(b).resolves.toEqual({ bytes: 'B' });
    expect(progressA).toHaveBeenCalledWith(1, 2);
    expect(workers).toHaveLength(1);
  });

  it('rejects with the rebuilt typed error', async () => {
    const { client, workers } = setUp();
    const job = client.run('merge', { inputs: [] });
    workers[0].reply({
      id: 1,
      type: 'error',
      error: { name: 'EncryptedPdfError', code: 'ENCRYPTED', message: 'x', fileIndex: 3 },
    });
    await expect(job).rejects.toBeInstanceOf(EncryptedPdfError);
    await expect(job).rejects.toMatchObject({ fileIndex: 3 });
  });

  it('terminates the worker on abort and starts a fresh one for the next job', async () => {
    const { client, workers } = setUp();
    const controller = new AbortController();
    const job = client.run('optimise', {}, { signal: controller.signal });
    controller.abort();
    await expect(job).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminated).toBe(true);

    const next = client.run('optimise', {});
    expect(workers).toHaveLength(2);
    workers[1].reply({ id: 2, type: 'result', result: {} });
    await expect(next).resolves.toEqual({});
  });

  it('ignores messages for a job that was cancelled', async () => {
    const { client, workers } = setUp();
    const controller = new AbortController();
    const job = client.run('optimise', {}, { signal: controller.signal });
    const old = workers[0];
    controller.abort();
    await expect(job).rejects.toThrow();
    expect(() => old.reply({ id: 1, type: 'result', result: {} })).not.toThrow();
  });

  it('rejects at once for an already-aborted signal without starting a worker', async () => {
    const { client, workers } = setUp();
    await expect(client.run('optimise', {}, { signal: AbortSignal.abort() })).rejects.toMatchObject(
      { name: 'AbortError' },
    );
    expect(workers).toHaveLength(0);
  });

  it('stops listening to the signal once the job settles', async () => {
    const { client, workers } = setUp();
    const controller = new AbortController();
    const job = client.run('optimise', {}, { signal: controller.signal });
    workers[0].reply({ id: 1, type: 'result', result: {} });
    await job;
    controller.abort();
    expect(workers[0].terminated).toBe(false);
  });

  it('fails pending jobs when the worker crashes', async () => {
    const { client, workers } = setUp();
    const job = client.run('optimise', {});
    workers[0].onerror({ message: 'boom', preventDefault() {} });
    await expect(job).rejects.toThrow('PDF worker crashed: boom');
    expect(workers[0].terminated).toBe(true);
  });
});
