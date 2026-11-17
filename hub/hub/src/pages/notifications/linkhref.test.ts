// Vitest: a notice's page link. A Hub link goes through the router as it is; any other link is resolved against the
// origin whose /auth/ pages are this Hub's (core hubSiteOrigin), and links nothing while none is chosen.
import { afterEach, describe, expect, it, vi } from 'vitest';

const site = vi.hoisted(() => ({ origin: null as string | null }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), hubSiteOrigin: () => site.origin ?? window.location.origin }));

import type { PageLink } from '@kit';
import { linkHref } from './parts/Inbox';

const other = (href: string) => ({ kind: 'web', href }) as unknown as PageLink;

afterEach(() => {
  site.origin = null;
});

describe('notice links', () => {
  it('a Hub link is kept as it is', () => {
    expect(linkHref({ kind: 'hub', href: '/computers' })).toBe('/computers');
  });

  it('served: a relative link resolves against this page origin, as before', () => {
    expect(linkHref(other('/auth/home#/logs'))).toBe(`${window.location.origin}/auth/home#/logs`);
  });

  it('one-file Hub: against the chosen Hoody; none chosen: no link', () => {
    site.origin = 'https://hoody.test';
    expect(linkHref(other('/auth/home#/logs'))).toBe('https://hoody.test/auth/home#/logs');
    site.origin = '';
    expect(linkHref(other('/auth/home#/logs'))).toBe('');
  });
});
