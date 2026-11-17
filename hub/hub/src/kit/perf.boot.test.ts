// Performance mode on a link to a signed-out Hub: index.html runs fouc.js before the boot gate, so
// ?perf=1 is stored and leaves the address before the gate sends the visitor to sign in (the gate carries only the
// Hub's own hub/view params). fouc.js and the gate run here as the browser runs them, in index.html's order.
import { afterEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import foucSource from '../../../public/auth/fouc.js?raw';
import gateSource from '../../../public/auth/hub-boot-gate.js?raw';
import { PERF_KEY } from './perf';

const root = document.documentElement;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  root.removeAttribute('data-hx-perf');
  root.classList.remove('hub-boot-away');
  root.style.visibility = '';
  delete (window as { HubBootGate?: unknown }).HubBootGate;
  history.replaceState(null, '', '/');
});

describe('Performance mode before sign-in', () => {
  it('index.html loads fouc.js before the boot gate', () => {
    const html = indexHtml as string;
    const fouc = html.indexOf('<script src="/auth/fouc.js"></script>');
    expect(fouc).toBeGreaterThan(-1);
    expect(fouc).toBeLessThan(html.indexOf('/auth/hub-boot-gate.js'));
  });

  it('?perf=1 on a signed-out Hub address is stored and gone from the address before the redirect to sign in', () => {
    history.replaceState(null, '', '/auth/hub/?view=keys&perf=1#/keys');
    const real = window.location;
    const seen: { url: string; stored: string | null; address: string }[] = [];
    const replace = vi.fn((url: string) => {
      seen.push({ url, stored: localStorage.getItem(PERF_KEY), address: real.pathname + real.search + real.hash });
    });
    // The live address, with replace() recorded instead of leaving the page.
    vi.spyOn(window, 'location', 'get').mockReturnValue(
      new Proxy(real, { get: (t, k) => (k === 'replace' ? replace : (Reflect.get(t, k) as unknown)) }) as Location,
    );
    for (const src of (indexHtml as string).match(/\/auth\/(fouc|hub-boot-gate)\.js/g)!)
      new Function((src.includes('fouc') ? foucSource : gateSource) as string)();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(seen[0]).toEqual({ url: '/auth/login?view=keys', stored: '1', address: '/auth/hub/?view=keys#/keys' });
    expect(root.getAttribute('data-hx-perf')).toBe('on');
  });
});
