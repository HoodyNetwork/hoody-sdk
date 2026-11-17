// Outside links: openOutside reads browser-1 first, starts it only when the kit says none
// runs, and opens the address as a new tab only after a running browser is known. A lost answer is never sent again.
import { bootFixtureCore } from '@core';
import { setProxyDomain } from '@core/hosts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardComputer } from '../computers';
import fixtures, { browsed, resetFixtureSessions } from '../fixtures';
import { framedHere, hostOf, openOutside, outsideHost } from './outside';

const atlas = { id: 'c1', name: 'atlas', project_id: 'p1', server_name: 'n12', status: 'running' } as BoardComputer;
const boot = (state: keyof typeof fixtures.states) => bootFixtureCore({ rules: fixtures.states[state] });

beforeEach(() => { resetFixtureSessions(); });

describe('openOutside', () => {
  it('browser up: opens the address as written, once, with nothing started', async () => {
    boot('browserUp');
    expect(await openOutside(atlas, 'https://example.org')).toBe('opened');
    expect(browsed).toEqual(['https://example.org/']);
  });

  it('browser down: starts it once, then opens the address', async () => {
    boot('default');
    expect(await openOutside(atlas, 'https://example.org/news')).toBe('opened');
    expect(browsed).toEqual(['https://example.org/news']);
  });

  it('the read fails: nothing is started or sent', async () => {
    boot('browserReadFailed');
    expect(await openOutside(atlas, 'https://example.org/')).toEqual({ failed: 'read' });
    expect(browsed).toEqual([]);
  });

  it('the start answer is lost: pending, and the address is not sent', async () => {
    boot('browserStartPending');
    expect(await openOutside(atlas, 'https://example.org/')).toEqual({ pending: 'start' });
    expect(browsed).toEqual([]);
  });

  it('the open answer is lost: pending, sent once and never again', async () => {
    boot('browsePending');
    expect(await openOutside(atlas, 'https://example.org/')).toEqual({ pending: 'open' });
    expect(browsed).toEqual(['https://example.org/']);
  });

  it('the browser refuses the address: failed open, with its cause', async () => {
    boot('browserUp');
    const r = await openOutside(atlas, 'https://example.net/');
    expect(r).toMatchObject({ failed: 'open' });
    expect(browsed).toEqual(['https://example.net/']);
  });

  it('a private, local or data: address is never sent, and nothing is read or started', async () => {
    boot('browserUp');
    for (const u of ['http://127.0.0.1/', 'http://localhost:3000/', 'http://192.168.1.1/', 'data:text/html,x', 'http://[::1]/']) {
      expect([u, await openOutside(atlas, u)]).toEqual([u, { failed: 'open' }]);
    }
    expect(browsed).toEqual([]);
  });
});

describe('outsideHost, hostOf, framedHere', () => {
  it('names the host an outside address goes to, and nothing for one never sent', () => {
    expect(outsideHost('https://Example.org/a')).toBe('example.org');
    expect(outsideHost('http://10.0.0.1/')).toBeNull();
    expect(hostOf('https://example.org:8443/x')).toBe('example.org');
    expect(hostOf('not a url')).toBe('');
  });

  it('frames nothing without a proxy domain', () => {
    expect(framedHere('https://example.org/')).toBe(false);
  });

  it("frames only https on the default port under the proxy domain or its family twin, as the Hub page's CSP frame-src", () => {
    setProxyDomain('computers.hoody.test');
    try {
      expect(framedHere('https://p1-c1-http-3000.sv1.computers.hoody.test/')).toBe(true);
      // The family twin is in the CSP too (the API lists both family labels): framed, not a card.
      expect(framedHere('https://p1-c1-http-3000.sv1.containers.hoody.test/')).toBe(true);
      expect(framedHere('https://containers.hoody.test/')).toBe(false);
      expect(framedHere('https://a.containers.hoody.test./')).toBe(false);
      expect(framedHere('https://a.containers.hoody.test.evil.org/')).toBe(false);
      expect(framedHere('https://computers.hoody.test/')).toBe(false);
      expect(framedHere('http://a.computers.hoody.test/')).toBe(false);
      expect(framedHere('https://a.computers.hoody.test:8443/')).toBe(false);
      expect(framedHere('https://evilcomputers.hoody.test/')).toBe(false);
    } finally {
      setProxyDomain(null);
    }
  });
});
