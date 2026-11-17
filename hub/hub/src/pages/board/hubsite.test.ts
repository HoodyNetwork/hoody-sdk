// Vitest: a conversation tile's link names the origin whose /auth/ pages are this Hub's (core hubSiteOrigin): this
// page's own origin when served, the chosen Hoody's in the one-file Hub, and nothing while none is chosen (no link).
import { afterEach, describe, expect, it, vi } from 'vitest';

const site = vi.hoisted(() => ({ origin: null as string | null }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), hubSiteOrigin: () => site.origin ?? window.location.origin }));

import { convTileUrl, hubOrigin, parseConvTileUrl } from './links';

const REF = { sid: 's-1', computer: 'atlas.00a1', realm: 'global' } as const;

afterEach(() => {
  site.origin = null;
});

describe('Board conversation links: the Hub site origin', () => {
  it('served: this page origin, as before', () => {
    expect(hubOrigin()).toBe(window.location.origin);
    const url = convTileUrl(hubOrigin(), REF);
    expect(url.startsWith(`${window.location.origin}/auth/home#/ai/c/s-1?`)).toBe(true);
  });

  it('one-file Hub with a Hoody chosen: that Hoody origin, read back as a conversation', () => {
    site.origin = 'https://hoody.test';
    expect(hubOrigin()).toBe('https://hoody.test');
    const url = convTileUrl(hubOrigin(), REF);
    expect(url.startsWith('https://hoody.test/auth/home#/ai/c/s-1?')).toBe(true);
    expect(parseConvTileUrl(url, hubOrigin())).toEqual(REF);
  });

  it('one-file Hub with none chosen: no link', () => {
    site.origin = '';
    expect(hubOrigin()).toBe('');
    expect(convTileUrl(hubOrigin(), REF)).toBe('');
  });
});
