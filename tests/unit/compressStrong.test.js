import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EncryptedPdfError } from '../../src/core/errors.js';
import { compressStrong } from '../../src/lib/compressStrong.js';
import { runPdfJob } from '../../src/lib/pdfWorkerClient.js';
import { rasterisePdf } from '../../src/lib/rasterise.js';

vi.mock('../../src/lib/pdfWorkerClient.js', () => ({ runPdfJob: vi.fn() }));
vi.mock('../../src/lib/rasterise.js', () => ({ rasterisePdf: vi.fn() }));

const PAGES = [{ jpeg: new Uint8Array([1]), width: 10, height: 10 }];
const OUTPUT = new Uint8Array([9]);
const file = { arrayBuffer: async () => new ArrayBuffer(4) };
const settings = { dpi: 110, quality: 0.7 };

beforeEach(() => {
  vi.mocked(runPdfJob).mockReset();
  vi.mocked(rasterisePdf).mockReset().mockResolvedValue(PAGES);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('compressStrong', () => {
  it('renders in the worker when it can', async () => {
    vi.mocked(runPdfJob).mockResolvedValue({ bytes: OUTPUT });
    const signal = new AbortController().signal;
    const onProgress = vi.fn();
    const result = await compressStrong(file, {
      ...settings,
      canRenderInWorker: true,
      signal,
      onProgress,
    });
    expect(result).toBe(OUTPUT);
    expect(runPdfJob).toHaveBeenCalledWith(
      'compressStrong',
      { bytes: expect.any(ArrayBuffer), dpi: 110, quality: 0.7 },
      { signal, onProgress },
    );
    expect(rasterisePdf).not.toHaveBeenCalled();
  });

  it('renders on the main thread and builds in the worker otherwise', async () => {
    vi.mocked(runPdfJob).mockResolvedValue({ bytes: OUTPUT });
    const signal = new AbortController().signal;
    const result = await compressStrong(file, { ...settings, canRenderInWorker: false, signal });
    expect(result).toBe(OUTPUT);
    expect(rasterisePdf).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ dpi: 110, quality: 0.7, signal }),
    );
    expect(runPdfJob).toHaveBeenCalledOnce();
    expect(runPdfJob).toHaveBeenCalledWith('buildImagePdf', { pages: PAGES }, { signal });
  });

  it('falls back to the main thread when worker rendering hits a bug', async () => {
    vi.mocked(runPdfJob)
      .mockRejectedValueOnce(new Error('OffscreenCanvas broke'))
      .mockResolvedValueOnce({ bytes: OUTPUT });
    const result = await compressStrong(file, {
      ...settings,
      canRenderInWorker: true,
      signal: new AbortController().signal,
    });
    expect(result).toBe(OUTPUT);
    expect(rasterisePdf).toHaveBeenCalledOnce();
  });

  it('does not retry problems with the file itself', async () => {
    vi.mocked(runPdfJob).mockRejectedValue(new EncryptedPdfError());
    await expect(
      compressStrong(file, {
        ...settings,
        canRenderInWorker: true,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(EncryptedPdfError);
    expect(rasterisePdf).not.toHaveBeenCalled();
  });

  it('does not retry after a cancel', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(runPdfJob).mockRejectedValue(controller.signal.reason);
    await expect(
      compressStrong(file, { ...settings, canRenderInWorker: true, signal: controller.signal }),
    ).rejects.toThrow();
    expect(rasterisePdf).not.toHaveBeenCalled();
  });
});
