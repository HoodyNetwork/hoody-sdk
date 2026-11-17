// Vitest: useFontsReady waits for the faces the kit measures in, not for document.fonts.status
// alone: a cold load can read 'loaded' before any face was requested, and widths measured then (in a fallback) would stay.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CELL_FONT } from './DataTableLayout';
import { useFontsReady } from './fontsReady';
import { statusPillMetrics } from './pillMetrics';

const real = Object.getOwnPropertyDescriptor(document, 'fonts');
function stubFonts(f: Partial<FontFaceSet>) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: f });
}
afterEach(() => {
  if (real) Object.defineProperty(document, 'fonts', real);
  else delete (document as { fonts?: unknown }).fonts;
});

describe('useFontsReady', () => {
  it('a cold load that reads loaded before any face was requested waits for its faces to load', async () => {
    let finish: () => void = () => undefined;
    const loaded = new Promise<FontFace[]>((r) => {
      finish = () => r([]);
    });
    const load = vi.fn((_face: string) => loaded);
    stubFonts({ status: 'loaded', check: () => false, load, ready: Promise.resolve() as unknown as Promise<FontFaceSet> });
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(false);
    // It asked for each face the kit measures in: the two cell fonts and the pill's own face.
    expect(load.mock.calls.map((c) => c[0])).toEqual([CELL_FONT.sans, CELL_FONT.mono, statusPillMetrics().font]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current, 'still waiting for its faces, though fonts.ready alone has settled').toBe(false);
    await act(async () => {
      finish();
      await loaded;
    });
    expect(result.current).toBe(true);
  });

  it('faces that already read loaded make it true at once, with no load asked for', () => {
    const load = vi.fn((_face: string) => Promise.resolve([]));
    stubFonts({ status: 'loaded', check: () => true, load, ready: Promise.resolve() as unknown as Promise<FontFaceSet> });
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('a partial font API without load waits for fonts.ready alone (the Logs list test stub, an older engine)', async () => {
    let settle: () => void = () => undefined;
    stubFonts({ status: 'loading', ready: new Promise<void>((r) => { settle = r; }) as unknown as Promise<FontFaceSet> });
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(false);
    await act(async () => {
      settle();
    });
    expect(result.current).toBe(true);
  });

  it('a face that fails to load still settles: the fallback measure is the best there is', async () => {
    stubFonts({ status: 'loading', check: () => false, load: () => Promise.reject(new Error('blocked')), ready: Promise.resolve() as unknown as Promise<FontFaceSet> });
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current).toBe(true);
  });
});
