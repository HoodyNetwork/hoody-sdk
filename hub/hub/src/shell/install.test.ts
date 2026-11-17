// Installable: the Hub installs as an app. index.html names the web manifest, the theme
// colours (the kit's page ground, light and dark) and the iOS home-screen lines; the manifest opens the Hub
// (/auth/home) in a standalone window whose scope keeps the sign-in pages beside it (/auth/); icons
// 192 and 512 exist for both purposes, checked in as PNGs of their stated size. No service worker.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import indexHtml from '../../index.html?raw';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '../core/test/monorepo';

const PWA = join(__dirname, '../../../public/auth/pwa/');
const tokens = readFileSync(join(__dirname, '../kit/tokens.css'), 'utf8');
const MANIFEST_URL = '/auth/pwa/manifest.webmanifest';
const HUB_ROUTE = '/auth/home';
/** The API server's tree: the /auth/ static server (@fastify/static, whose mime table is @fastify/send's) is installed
 *  there, not in the Hub package. Null outside the monorepo, where the one test that asks it is skipped. */
const API = monorepoPath(process.env.HUB_API_ROOT, 'hoody-api');

interface Icon { src: string; sizes: string; type: string; purpose: string }
interface Manifest { name: string; short_name: string; start_url: string; scope: string; display: string; background_color: string; theme_color: string; icons: Icon[] }

const manifest = (): Manifest => JSON.parse(readFileSync(`${PWA}manifest.webmanifest`, 'utf8')) as Manifest;
const head = new DOMParser().parseFromString(indexHtml, 'text/html').head;
const metas = (name: string) => [...head.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`)];
/** The first --hx-bg in tokens.css is the light ground, the second the dark one. */
const grounds = [...tokens.matchAll(/--hx-bg:\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => m[1]!.toLowerCase());

/** Width and height from a PNG's IHDR, or null when the bytes are not a PNG. */
function pngSize(bytes: Buffer): [number, number] | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b) || bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('index.html: install lines', () => {
  it('names the web manifest', () => {
    expect(head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe(MANIFEST_URL);
  });

  it('theme-color follows the kit page ground, light and dark', () => {
    expect(grounds).toHaveLength(2);
    const byMedia = Object.fromEntries(metas('theme-color').map((m) => [m.getAttribute('media'), m.content.toLowerCase()]));
    expect(byMedia).toEqual({ '(prefers-color-scheme: light)': grounds[0], '(prefers-color-scheme: dark)': grounds[1] });
  });

  it('carries the home-screen lines: standalone, title Hoody, the touch icon', () => {
    expect(metas('apple-mobile-web-app-capable').map((m) => m.content)).toEqual(['yes']);
    expect(metas('mobile-web-app-capable').map((m) => m.content)).toEqual(['yes']);
    expect(metas('apple-mobile-web-app-title').map((m) => m.content)).toEqual(['Hoody']);
    expect(head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/auth/apple-touch-icon.png');
  });

  it('keeps the install lines outside the live-only block, so every mode has them', () => {
    const live = indexHtml.slice(indexHtml.indexOf('<!-- hub:live -->'), indexHtml.indexOf('<!-- /hub:live -->'));
    expect(live).not.toMatch(/manifest|theme-color|apple-/);
  });

  it('registers no service worker', () => {
    expect(indexHtml).not.toMatch(/serviceWorker/);
  });
});

describe('the web manifest', () => {
  it('opens the Hub standalone, scoped so the sign-in pages stay in the app', () => {
    const m = manifest();
    expect({ name: m.name, short_name: m.short_name, display: m.display }).toEqual({ name: 'Hoody Hub', short_name: 'Hoody', display: 'standalone' });
    expect(m.start_url).toBe(HUB_ROUTE);
    expect(m.scope).toBe('/auth/');
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(MANIFEST_URL.startsWith(m.scope)).toBe(true);
  });

  it('colours match the dark ground the icon is drawn on', () => {
    const m = manifest();
    expect(m.background_color.toLowerCase()).toBe(grounds[1]);
    expect(m.theme_color.toLowerCase()).toBe(grounds[1]);
  });

  it('lists 192 and 512 for both purposes, each a PNG of its stated size', () => {
    const icons = manifest().icons;
    expect(icons.map((i) => `${i.purpose} ${i.sizes}`).sort()).toEqual(['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512']);
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/auth/pwa/')).toBe(true);
      const size = pngSize(readFileSync(PWA + icon.src.slice('/auth/pwa/'.length)));
      expect(size?.join('x'), icon.src).toBe(icon.sizes);
    }
  });

  it.skipIf(!API)('is served as application/manifest+json by the /auth/ static server', () => {
    const send = createRequire(join(API!, 'package.json'))('@fastify/send') as { mime: { getType(p: string): string | null } };
    expect(send.mime.getType(MANIFEST_URL)).toBe('application/manifest+json');
  });
});
