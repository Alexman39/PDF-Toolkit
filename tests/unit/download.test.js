import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBytes } from '../../src/lib/download.js';

describe('downloadBytes', () => {
  let link;

  beforeEach(() => {
    vi.useFakeTimers();
    link = { click: vi.fn(), remove: vi.fn() };
    // A minimal DOM stand-in; jsdom isn't a dependency and this is all download.js touches.
    vi.stubGlobal('document', {
      createElement: () => link,
      body: { append: vi.fn() },
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clicks a link with the file name and a PDF blob', () => {
    downloadBytes(new Uint8Array([1, 2, 3]), 'merged.pdf');
    const [blob] = URL.createObjectURL.mock.calls[0];
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(3);
    expect(link).toMatchObject({ href: 'blob:fake', download: 'merged.pdf' });
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
  });

  it('revokes the object URL after a delay, not immediately', () => {
    downloadBytes(new Uint8Array([1]), 'a.pdf');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('passes a Blob through unchanged', () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    downloadBytes(blob, 'parts.zip');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });
});
