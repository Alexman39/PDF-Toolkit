/**
 * @callback RenderJob
 * @param {AbortSignal} signal  Aborted when the item leaves the queue before it finishes.
 * @returns {Promise<void>}
 */

/**
 * @typedef {object} RenderQueue
 * @property {(key: number, job: RenderJob) => void} want
 *   Asks for `key` to be rendered. Asking again for a key that is queued, running or done
 *   does nothing.
 * @property {(key: number) => void} unwant
 *   Takes `key` out of the queue, or aborts it if it's running. Done keys stay done.
 * @property {() => void} clear  Aborts everything; nothing runs after this.
 */

/**
 * Runs at most `concurrency` render jobs at a time, newest request first. Thumbnails ask when
 * they scroll into view and withdraw when they scroll out, so a fast fling through a 200-page
 * PDF only renders the pages the user stops on.
 *
 * Newest first because the most recent request is the page the user is looking at now; the
 * oldest ones have probably scrolled away already.
 * @param {{ concurrency?: number, onError?: (key: number, error: unknown) => void }} [options]
 * @returns {RenderQueue}
 */
export function createRenderQueue({ concurrency = 2, onError } = {}) {
  /** @type {Map<number, RenderJob>} Insertion order = request order. */
  const waiting = new Map();
  /** @type {Map<number, AbortController>} */
  const running = new Map();
  /** @type {Set<number>} */
  const done = new Set();
  let cleared = false;

  function pump() {
    while (!cleared && running.size < concurrency && waiting.size > 0) {
      const [key, job] = [...waiting].at(-1);
      waiting.delete(key);
      start(key, job);
    }
  }

  /**
   * @param {number} key
   * @param {RenderJob} job
   */
  async function start(key, job) {
    const controller = new AbortController();
    running.set(key, controller);
    try {
      await job(controller.signal);
      if (!controller.signal.aborted) done.add(key);
    } catch (error) {
      // An aborted job may reject (pdf.js throws RenderingCancelledException); that's expected.
      // A real failure counts as done, so scrolling back doesn't retry a broken page forever.
      if (!controller.signal.aborted) {
        done.add(key);
        onError?.(key, error);
      }
    } finally {
      // Only remove our own entry: an unwant + want while we were finishing starts a new one.
      if (running.get(key) === controller) running.delete(key);
      pump();
    }
  }

  return {
    want(key, job) {
      if (cleared || done.has(key) || running.has(key) || waiting.has(key)) return;
      waiting.set(key, job);
      pump();
    },
    unwant(key) {
      waiting.delete(key);
      const controller = running.get(key);
      if (controller) {
        running.delete(key);
        controller.abort();
        pump();
      }
    },
    clear() {
      cleared = true;
      waiting.clear();
      for (const controller of running.values()) controller.abort();
      running.clear();
    },
  };
}
