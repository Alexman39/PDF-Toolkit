import { collectTransferables, deserializeError } from '../workers/messages.js';

/** @typedef {import('../workers/messages.js').PdfOperation} PdfOperation */

/**
 * @typedef {object} JobOptions
 * @property {(done: number, total: number) => void} [onProgress]
 * @property {AbortSignal} [signal]  Aborting terminates the worker, which cancels every job in it.
 */

/**
 * @typedef {object} PdfWorkerClient
 * @property {(op: PdfOperation, payload: object, options?: JobOptions) => Promise<any>} run
 * @property {(reason?: unknown) => void} terminate
 */

/**
 * @typedef {object} PendingJob
 * @property {(result: any) => void} resolve
 * @property {(error: unknown) => void} reject
 * @property {JobOptions['onProgress']} onProgress
 */

/** @returns {Worker} */
function createPdfWorker() {
  // Vite only bundles the worker when `new URL(..., import.meta.url)` is written inline here.
  return new Worker(new URL('../workers/pdf.worker.js', import.meta.url), { type: 'module' });
}

/**
 * Talks to pdf.worker.js. The worker starts on first use and after a cancel, and is
 * terminated (not asked to stop) on cancel, because pdf-lib can't be interrupted mid-save and
 * terminating is the only way to give its memory back immediately.
 * @param {() => Worker} [createWorker]  Injected by tests.
 * @returns {PdfWorkerClient}
 */
export function createPdfWorkerClient(createWorker = createPdfWorker) {
  /** @type {Worker | null} */
  let worker = null;
  /** @type {Map<number, PendingJob>} */
  const jobs = new Map();
  let nextId = 1;

  /** @param {MessageEvent} event */
  function handleMessage({ data }) {
    const job = jobs.get(data.id);
    if (!job) return; // A job cancelled while its last message was in flight.
    if (data.type === 'progress') {
      job.onProgress?.(data.done, data.total);
      return;
    }
    jobs.delete(data.id);
    if (data.type === 'result') job.resolve(data.result);
    else job.reject(deserializeError(data.error));
  }

  function getWorker() {
    if (!worker) {
      worker = createWorker();
      worker.onmessage = handleMessage;
      // Fires when the worker script fails to load or throws outside runJob. Nothing will
      // answer the pending jobs after that, so fail them rather than leave them hanging.
      worker.onerror = (event) => {
        event.preventDefault?.();
        terminate(new Error(`PDF worker crashed: ${event.message ?? 'unknown error'}`));
      };
    }
    return worker;
  }

  /**
   * @param {unknown} [reason]  What pending jobs reject with.
   */
  function terminate(reason = new DOMException('Cancelled', 'AbortError')) {
    worker?.terminate();
    worker = null;
    const pending = [...jobs.values()];
    jobs.clear();
    for (const job of pending) job.reject(reason);
  }

  /**
   * Runs `op` in the worker. ArrayBuffers in `payload` are transferred, so they are empty
   * (detached) afterwards; read the File again if you need the bytes a second time.
   * @param {PdfOperation} op
   * @param {object} payload
   * @param {JobOptions} [options]
   * @returns {Promise<any>}
   */
  function run(op, payload, { onProgress, signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const onAbort = () => terminate(signal.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      const cleanUp = () => signal?.removeEventListener('abort', onAbort);
      jobs.set(id, {
        resolve: (result) => (cleanUp(), resolve(result)),
        reject: (error) => (cleanUp(), reject(error)),
        onProgress,
      });
      getWorker().postMessage({ id, op, payload }, collectTransferables(payload));
    });
  }

  return { run, terminate };
}

/** @type {PdfWorkerClient | null} */
let sharedClient = null;

/**
 * Runs a PDF operation in the app's shared worker.
 * @param {PdfOperation} op
 * @param {object} payload
 * @param {JobOptions} [options]
 * @returns {Promise<any>}
 */
export function runPdfJob(op, payload, options) {
  sharedClient ??= createPdfWorkerClient();
  return sharedClient.run(op, payload, options);
}
