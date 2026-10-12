import { describe, expect, it, vi } from 'vitest';
import { createRenderQueue } from '../../src/lib/renderQueue.js';

/**
 * A render job the test finishes by hand, recording what happened to it.
 * @param {string[]} log
 * @param {number} key
 */
function controllableJob(log, key) {
  const job = { finish: () => {}, fail: () => {}, signal: /** @type {AbortSignal} */ (null) };
  job.run = (signal) => {
    log.push(`start ${key}`);
    job.signal = signal;
    signal.addEventListener('abort', () => log.push(`abort ${key}`));
    return new Promise((resolve, reject) => {
      job.finish = resolve;
      job.fail = reject;
    });
  };
  return job;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createRenderQueue', () => {
  it('runs at most `concurrency` jobs, newest request first', async () => {
    const log = [];
    const queue = createRenderQueue({ concurrency: 2 });
    const jobs = [0, 1, 2, 3].map((key) => controllableJob(log, key));
    jobs.forEach((job, key) => queue.want(key, job.run));
    expect(log).toEqual(['start 0', 'start 1']);

    jobs[0].finish();
    await tick();
    // 3 was requested after 2, so it's the page the user reached most recently.
    expect(log).toEqual(['start 0', 'start 1', 'start 3']);
  });

  it('drops a waiting job that is no longer wanted', async () => {
    const log = [];
    const queue = createRenderQueue({ concurrency: 1 });
    const jobs = [0, 1, 2].map((key) => controllableJob(log, key));
    jobs.forEach((job, key) => queue.want(key, job.run));
    queue.unwant(2);
    jobs[0].finish();
    await tick();
    expect(log).toEqual(['start 0', 'start 1']);
  });

  it('aborts a running job that is no longer wanted and starts the next one', () => {
    const log = [];
    const queue = createRenderQueue({ concurrency: 1 });
    const jobs = [0, 1].map((key) => controllableJob(log, key));
    jobs.forEach((job, key) => queue.want(key, job.run));
    queue.unwant(0);
    expect(log).toEqual(['start 0', 'abort 0', 'start 1']);
  });

  it('renders a key only once, and again after an aborted attempt', async () => {
    const log = [];
    const queue = createRenderQueue();
    const first = controllableJob(log, 0);
    queue.want(0, first.run);
    queue.want(0, first.run);
    queue.unwant(0);
    const second = controllableJob(log, 0);
    queue.want(0, second.run);
    second.finish();
    await tick();
    queue.want(0, controllableJob(log, 0).run);
    expect(log).toEqual(['start 0', 'abort 0', 'start 0']);
  });

  it('reports real failures once, but stays quiet about aborted jobs', async () => {
    const onError = vi.fn();
    const log = [];
    const queue = createRenderQueue({ onError });
    const broken = controllableJob(log, 0);
    queue.want(0, broken.run);
    broken.fail(new Error('bad page'));
    await tick();
    queue.want(0, controllableJob(log, 0).run);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(0, new Error('bad page'));

    const cancelled = controllableJob(log, 1);
    queue.want(1, cancelled.run);
    queue.unwant(1);
    cancelled.fail(new Error('RenderingCancelledException'));
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('clear aborts everything and accepts no more work', () => {
    const log = [];
    const queue = createRenderQueue({ concurrency: 1 });
    [0, 1].forEach((key) => queue.want(key, controllableJob(log, key).run));
    queue.clear();
    queue.want(2, controllableJob(log, 2).run);
    expect(log).toEqual(['start 0', 'abort 0']);
  });
});
