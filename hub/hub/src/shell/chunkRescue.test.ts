// public/auth/hub-chunk-rescue.js, the boot rescue for a deploy that lands between the index and its first
// chunk (the app's own handling is not installed yet). It never reloads by itself: a deploy shows "Hub was updated"
// with a Reload button. Run as the browser runs it: the classic script evaluated here.
import rescueSource from '../../../public/auth/hub-chunk-rescue.js?raw';
import indexHtml from '../../index.html?raw';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const ENTRY = '/auth/hub/assets/index-AbCd1234.js';

let handlers: EventListener[] = [];
let reload: Mock<() => void>;
let reveal: Mock<() => void>;
let fetched: string[] = [];

function server(answer: number | 'unreachable'): void {
  fetched = [];
  vi.spyOn(window, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetched.push(`${init?.method ?? 'GET'} ${String(input)}`);
    if (answer === 'unreachable') throw new TypeError('Failed to fetch');
    return new Response(null, { status: answer });
  });
}

function boot(): void {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, h: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    if (type === 'error') handlers.push(h as EventListener);
    add(type, h, o);
  });
  new Function(rescueSource as string)();
}

/** A resource of the page fails to load, as the browser reports it (an error event at the element, not bubbling). */
async function fail(el: HTMLElement): Promise<void> {
  document.head.appendChild(el);
  el.dispatchEvent(new Event('error'));
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function script(src: string): HTMLScriptElement {
  const s = document.createElement('script');
  s.type = 'module';
  s.src = src;
  return s;
}

const box = () => document.getElementById('hub-chunk-rescue');

beforeEach(() => {
  document.documentElement.removeAttribute('data-hub-chunks');
  reload = vi.fn<() => void>();
  reveal = vi.fn<() => void>();
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, href: window.location.href, origin: window.location.origin, reload } as Location);
  (window as unknown as { HubBootGate?: unknown }).HubBootGate = { reveal };
  server(404);
  boot();
});
afterEach(() => {
  for (const h of handlers) window.removeEventListener('error', h, true);
  handlers = [];
  vi.restoreAllMocks();
  delete (window as unknown as { HubBootGate?: unknown }).HubBootGate;
  document.head.querySelectorAll('script[src], link[href]').forEach((n) => n.remove());
  box()?.remove();
});

describe('boot rescue', () => {
  it('the entry a deploy removed: one HEAD check, "Hub was updated" with a Reload button, the boot veil lifted, no reload', async () => {
    await fail(script(ENTRY));
    expect(fetched).toEqual([`HEAD ${window.location.origin}${ENTRY}`]);
    expect(reload).not.toHaveBeenCalled();
    expect(reveal).toHaveBeenCalled();
    expect(box()?.getAttribute('role')).toBe('status');
    expect(box()?.textContent).toContain('Hub was updated. Reload to continue.');
    const btn = box()?.querySelector('button');
    expect(btn?.textContent).toBe('Reload');
    btn?.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('nothing in the rescue reloads except the Reload button, and it keeps no storage mark', () => {
    const src = rescueSource as string;
    expect(src.match(/\.reload\s*\(/g)).toHaveLength(1);
    expect(src).toMatch(/btn\.addEventListener\('click', function \(\) \{ window\.location\.reload\(\); \}\)/);
    expect(src).not.toMatch(/sessionStorage/);
  });

  it('still there or unreachable: the neutral message, never a reload or an update claim', async () => {
    server(200);
    await fail(script(ENTRY));
    expect(reload).not.toHaveBeenCalled();
    expect(box()?.textContent).toContain("Part of the Hub couldn't load.");
    expect(box()?.textContent).not.toContain('updated');
  });

  it('unreachable: the neutral message', async () => {
    server('unreachable');
    await fail(script(ENTRY));
    expect(reload).not.toHaveBeenCalled();
    expect(box()?.textContent).toContain("Part of the Hub couldn't load.");
  });

  it('offline: nothing checked, the neutral message', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await fail(script(ENTRY));
    expect(fetched).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
    expect(box()?.textContent).toContain("Part of the Hub couldn't load.");
  });

  it('a stylesheet of the Hub assets counts too', async () => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/auth/hub/assets/index-Zz9yX8w7.css';
    await fail(l);
    expect(reload).not.toHaveBeenCalled();
    expect(box()?.textContent).toContain('Hub was updated.');
  });

  it('once the app runs it decides nothing: a deploy is handed to the app, anything else is dropped', async () => {
    const got: unknown[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    document.addEventListener('hub:chunk-rescue', on);
    document.documentElement.setAttribute('data-hub-chunks', 'app');
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/auth/hub/assets/index-Zz9yX8w7.css';
    await fail(l);
    await fail(l);
    server(200);
    await fail(script('/auth/hub/assets/other-Pp0oI9uY.js'));
    document.removeEventListener('hub:chunk-rescue', on);
    expect(got).toEqual([{ status: 404, boot: false }]);
    expect(reload).not.toHaveBeenCalled();
    expect(box()).toBeNull();
  });

  it('a check begun before the app ran and answered after: handed to the app, decided there', async () => {
    const got: unknown[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    document.addEventListener('hub:chunk-rescue', on);
    let resolve: (r: Response) => void = () => undefined;
    vi.spyOn(window, 'fetch').mockImplementation(() => new Promise<Response>((r) => (resolve = r)));
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/auth/hub/assets/index-Zz9yX8w7.css';
    document.head.appendChild(l);
    l.dispatchEvent(new Event('error'));
    document.documentElement.setAttribute('data-hub-chunks', 'app');
    resolve(new Response(null, { status: 404 }));
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    document.removeEventListener('hub:chunk-rescue', on);
    expect(got).toEqual([{ status: 404, boot: true }]);
    expect(reload).not.toHaveBeenCalled();
    expect(box()).toBeNull();
  });

  it('a check that never answers counts as unreachable after 8 s: the neutral message', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(window, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
      const s = script(ENTRY);
      document.head.appendChild(s);
      s.dispatchEvent(new Event('error'));
      await vi.advanceTimersByTimeAsync(8001);
    } finally {
      vi.useRealTimers();
    }
    expect(reload).not.toHaveBeenCalled();
    expect(box()?.textContent).toContain("Part of the Hub couldn't load.");
  });

  it('a file outside the Hub assets, or a script error that is no resource, is not its business', async () => {
    await fail(script('/auth/shared.js'));
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    expect(fetched).toEqual([]);
    expect(box()).toBeNull();
  });

  it('several failures: one check, one message, no reload', async () => {
    await fail(script(ENTRY));
    await fail(script('/auth/hub/assets/vendor-Qq1wE2rT.js'));
    expect(fetched).toHaveLength(1);
    expect(document.querySelectorAll('#hub-chunk-rescue')).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('boot rescue wiring', () => {
  it('index.html loads it after the boot gate and before the app entry', () => {
    const html = indexHtml as string;
    const gate = html.indexOf('/auth/hub-boot-gate.js');
    const rescue = html.indexOf('<script src="/auth/hub-chunk-rescue.js"></script>');
    expect(gate).toBeGreaterThan(-1);
    expect(rescue).toBeGreaterThan(gate);
    expect(rescue).toBeLessThan(html.indexOf('type="module"'));
  });
});
