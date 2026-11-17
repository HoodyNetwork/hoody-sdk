// A lazy chunk a deploy removed (the server answers 404 for it) shows "Hub was updated.
// Reload to continue." with a Reload button; the Hub never reloads by itself, the person decides. A failure that is
// not a deploy (unreachable, still there) shows the neutral notice and never claims an update; a module that threw is
// left to the page.
import { act, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CoreNotices } from './notices';
import { pageView, preloadPage } from './preload';
import { PROBE_TIMEOUT_MS, chunkLoadFailed, installStaleChunk, isChunkLoadError, resetStaleChunkForTests, useStaleChunkNotice } from './staleChunk';

const CHUNK = () => `${window.location.origin}/auth/hub/assets/view-abC12345.js`;
const chunkErr = () => new TypeError(`Failed to fetch dynamically imported module: ${CHUNK()}`);
const UPDATED = 'Hub was updated. Reload to continue.';
const FAILED = "Part of the Hub couldn't load. Check your connection, then reload.";

function Shown() {
  return <span data-testid="notice">{useStaleChunkNotice() ?? 'none'}</span>;
}

/** Every location.reload the code under test could reach: the browser's own, spied through the location getter. */
let reload: Mock<() => void>;
let off: () => void = () => undefined;
let fetched: string[] = [];

/** The server's answer to the Hub's check of a chunk: a status (default 404), or unreachable. */
function server(answer: number | 'unreachable' = 404): void {
  fetched = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    fetched.push(`${init?.method ?? 'GET'} ${url}`);
    if (answer === 'unreachable') throw new TypeError('Failed to fetch');
    return new Response(null, { status: answer });
  });
}

/** Let a failure's check and its outcome settle. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  resetStaleChunkForTests();
  reload = vi.fn<() => void>();
  const real = window.location;
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...real, href: real.href, origin: real.origin, reload } as Location);
  server(404);
  off = installStaleChunk();
});
afterEach(() => {
  off();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const s of Array.from(document.head.querySelectorAll('script[data-test-entry]'))) s.remove();
});

function shownNow(): string {
  render(<Shown />);
  return screen.getByTestId('notice').textContent ?? '';
}

function entryScript(): void {
  const s = document.createElement('script');
  s.type = 'module';
  s.src = '/auth/hub/assets/index-AbCd1234.js';
  s.setAttribute('data-test-entry', '');
  document.head.appendChild(s);
}

describe('isChunkLoadError', () => {
  it('knows the failed lazy load of each browser and nothing else', () => {
    expect(isChunkLoadError(chunkErr())).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: x.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /auth/hub/assets/a-1.css'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('is it a deploy', () => {
  it('checks the failed chunk with a HEAD that skips the cache; a 404 shows the update notice', async () => {
    await chunkLoadFailed(chunkErr());
    expect(fetched[0]).toBe(`HEAD ${CHUNK()}`);
    const init = (globalThis.fetch as unknown as Mock).mock.calls[0]?.[1] as RequestInit;
    expect(init.cache).toBe('no-store');
    expect(shownNow()).toBe('updated');
  });

  it("a message without a URL (Safari) checks this tab's entry script", async () => {
    entryScript();
    await chunkLoadFailed(new TypeError('Importing a module script failed.'));
    expect(fetched).toEqual([`HEAD ${window.location.origin}/auth/hub/assets/index-AbCd1234.js`]);
    expect(shownNow()).toBe('updated');
  });

  it('a URL on another origin is never checked', async () => {
    await chunkLoadFailed(new TypeError('Failed to fetch dynamically imported module: https://elsewhere.test/a-AbCd1234.js'));
    expect(fetched).toEqual([]);
    expect(shownNow()).toBe('failed');
  });

  it('the chunk still there: the neutral notice', async () => {
    server(200);
    await chunkLoadFailed(chunkErr());
    expect(shownNow()).toBe('failed');
  });

  it('the server unreachable: the neutral notice, no update claimed', async () => {
    server('unreachable');
    await chunkLoadFailed(chunkErr());
    expect(shownNow()).toBe('failed');
  });

  it('offline: nothing is checked, the neutral notice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await chunkLoadFailed(chunkErr());
    expect(fetched).toEqual([]);
    expect(shownNow()).toBe('failed');
  });

  it('a server error is not a deploy', async () => {
    server(503);
    await chunkLoadFailed(chunkErr());
    expect(shownNow()).toBe('failed');
  });

  it('failures arriving together share one check', async () => {
    await Promise.all([chunkLoadFailed(chunkErr()), chunkLoadFailed(chunkErr()), chunkLoadFailed(chunkErr())]);
    expect(fetched).toHaveLength(1);
    expect(shownNow()).toBe('updated');
  });

  it('a later failure checks again', async () => {
    server(200);
    await chunkLoadFailed(chunkErr());
    expect(shownNow()).toBe('failed');
    server(404);
    await act(async () => {
      await chunkLoadFailed(chunkErr());
    });
    expect(fetched).toHaveLength(1);
    expect(screen.getByTestId('notice').textContent).toBe('updated');
  });

  it('an update shown is never taken back by a later neutral failure', async () => {
    await chunkLoadFailed(chunkErr());
    server(200);
    await chunkLoadFailed(chunkErr());
    expect(shownNow()).toBe('updated');
  });

  it('an error that is not a failed chunk load does nothing, not even a check', async () => {
    await chunkLoadFailed(new Error('render failed'));
    expect(fetched).toEqual([]);
    expect(shownNow()).toBe('none');
  });
});

describe('never reloads by itself', () => {
  const hand = (detail: unknown) => document.dispatchEvent(new CustomEvent('hub:chunk-rescue', { detail }));
  const vite = (payload: unknown) => {
    const ev = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
    ev.payload = payload;
    window.dispatchEvent(ev);
  };
  const failing = (): Pick<PageManifest, 'load'> => ({ load: () => Promise.reject(chunkErr()) });

  it('no chunk failure of any kind calls location.reload; a deploy shows the update notice', async () => {
    entryScript();
    for (const answer of [404, 200, 503, 'unreachable'] as const) {
      server(answer);
      await chunkLoadFailed(chunkErr());
      await chunkLoadFailed(new TypeError('Importing a module script failed.'));
      vite(chunkErr());
      await settle();
      await pageView(failing()).then(
        () => undefined,
        () => undefined,
      );
      preloadPage(failing());
      await settle();
    }
    hand({ status: 404, boot: true });
    hand({ status: 404, boot: false });
    hand({ status: null, boot: true });
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(shownNow()).toBe('updated');
  });

  it('a deploy found on the first failure of a fresh page: the notice, no reload', async () => {
    await chunkLoadFailed(chunkErr());
    expect(reload).not.toHaveBeenCalled();
    expect(shownNow()).toBe('updated');
  });
});

describe('boot rescue hand-over', () => {
  const hand = (detail: unknown) => document.dispatchEvent(new CustomEvent('hub:chunk-rescue', { detail }));

  it('a check begun before the app ran that found a deploy: the update notice', () => {
    hand({ status: 404, boot: true });
    expect(reload).not.toHaveBeenCalled();
    expect(shownNow()).toBe('updated');
  });

  it('a check begun before the app ran that found no deploy: the neutral notice', () => {
    hand({ status: null, boot: true });
    expect(shownNow()).toBe('failed');
  });

  it('a check begun before the app ran that found the file there: the neutral notice', () => {
    hand({ status: 200, boot: true });
    expect(shownNow()).toBe('failed');
  });

  it('an initial asset failing after the app ran: the update notice for a deploy; nothing otherwise', async () => {
    hand({ status: 200, boot: false });
    hand({ status: null, boot: false });
    hand(null);
    expect(shownNow()).toBe('none');
    await act(async () => {
      hand({ status: 404, boot: false });
    });
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toBe('updated');
  });

  it('uninstalled: a hand-over shows nothing', () => {
    off();
    hand({ status: 404, boot: true });
    expect(shownNow()).toBe('none');
  });
});

describe('a check that never answers', () => {
  it('counts as unreachable after the timeout: the neutral notice', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_u: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      );
      const p = chunkLoadFailed(chunkErr());
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
      await p;
    } finally {
      vi.useRealTimers();
    }
    expect(reload).not.toHaveBeenCalled();
    expect(shownNow()).toBe('failed');
  });
});

describe("Vite's report of a failed chunk", () => {
  function preloadError(payload: unknown): Event {
    const ev = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
    ev.payload = payload;
    window.dispatchEvent(ev);
    return ev;
  }

  it('a chunk a deploy removed: the update notice, the error still thrown', async () => {
    const ev = preloadError(chunkErr());
    await settle();
    expect(ev.defaultPrevented).toBe(false);
    expect(shownNow()).toBe('updated');
  });

  it('a module that threw while it ran: nothing (the page handles its own error)', async () => {
    // Even with an entry script a check would find gone: an error that is no failed load is never checked.
    entryScript();
    preloadError(new Error('boom'));
    await settle();
    expect(fetched).toEqual([]);
    expect(shownNow()).toBe('none');
  });

  it('unreachable or still there: nothing, never an update claim', async () => {
    server('unreachable');
    preloadError(chunkErr());
    await settle();
    expect(shownNow()).toBe('none');
    server(200);
    preloadError(chunkErr());
    await settle();
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('uninstalled: a report shows nothing', async () => {
    off();
    preloadError(chunkErr());
    await settle();
    expect(fetched).toEqual([]);
    expect(shownNow()).toBe('none');
  });
});

describe('install', () => {
  it('main.tsx installs the notice-only handler', () => {
    const main = fs.readFileSync(path.join(import.meta.dirname, '../app/main.tsx'), 'utf-8');
    expect(main).toContain('installStaleChunk();');
    expect(main).not.toMatch(/location\.reload/);
  });

  it('installing tells the boot rescue the app took over', () => {
    expect(document.documentElement.getAttribute('data-hub-chunks')).toBe('app');
  });

  it('nothing in the handler reloads the page by itself', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, 'staleChunk.ts'), 'utf-8');
    expect(src).not.toMatch(/\.reload\s*\(/);
    expect(src).not.toMatch(/sessionStorage/);
  });
});

describe('page views', () => {
  const failing = (): Pick<PageManifest, 'load'> => ({ load: () => Promise.reject(chunkErr()) });

  it('a page view a render reads that a deploy removed shows the update notice', async () => {
    const v = pageView(failing());
    await v.then(
      () => undefined,
      () => undefined,
    );
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(shownNow()).toBe('updated');
  });

  it('a page loaded ahead of a visit that fails shows nothing and checks nothing', async () => {
    preloadPage(failing());
    await settle();
    expect(fetched).toEqual([]);
    expect(shownNow()).toBe('none');
  });
});

describe('notice', () => {
  it('a deploy: the shell shows "Hub was updated" with a Reload button that reloads only when pressed', async () => {
    render(<CoreNotices />);
    expect(screen.queryByText(UPDATED)).toBeNull();
    await act(async () => {
      await chunkLoadFailed(chunkErr());
    });
    expect(screen.getByRole('status')).toHaveTextContent(UPDATED);
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      screen.getByRole('button', { name: 'Reload' }).click();
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('not a deploy: the neutral text with Reload, never "Hub was updated"', async () => {
    server('unreachable');
    render(<CoreNotices />);
    await act(async () => {
      await chunkLoadFailed(chunkErr());
    });
    expect(screen.getByRole('status')).toHaveTextContent(FAILED);
    expect(screen.queryByText(UPDATED)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
