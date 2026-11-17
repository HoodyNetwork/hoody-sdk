// Vitest: the copied view link. Served, it is this page's address with the view in its hash route. In the one-file
// standalone Hub this page's own place (another site, a file) has no Hub, so the link is the served Hub's page.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => ({ standalone: false, served: 'https://hoody.example/auth/home' }));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    isStandalone: () => fx.standalone,
    servedHubUrl: (route = '') => (fx.served ? fx.served + (route ? '#' + route : '') : ''),
  };
});

import { shareLink } from './logic';

const ROUTE = '/logs?src=bots&sev=error';

beforeEach(() => { fx.standalone = false; fx.served = 'https://hoody.example/auth/home'; });

describe('the copied view link', () => {
  it('served: this page, the kept search, the view in the hash route', () => {
    expect(shareLink(ROUTE, { origin: 'https://a.example', pathname: '/auth/home', search: '?hub=v3&x=1' })).toBe(`https://a.example/auth/home?hub=v3#${ROUTE}`);
  });

  it('standalone: the served Hub page with the view, never the file or site the one-file Hub was opened from', () => {
    fx.standalone = true;
    expect(shareLink(ROUTE, { origin: 'file://', pathname: '/home/me/hub.html', search: '' })).toBe(`https://hoody.example/auth/home#${ROUTE}`);
  });

  it('standalone with no Hoody chosen yet: no link', () => {
    fx.standalone = true;
    fx.served = '';
    expect(shareLink(ROUTE, { origin: 'file://', pathname: '/x.html', search: '' })).toBe('');
  });
});
