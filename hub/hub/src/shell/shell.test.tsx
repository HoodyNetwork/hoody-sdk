// Shell pieces without the router: nav placement, avatar initials.
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { initials } from './context';
import { navEntries } from './nav';

const page = (id: string, group: 'main' | 'build' | 'account' | 'help', order: number): PageManifest =>
  ({ id, path: `/${id}`, title: 't', nav: { group, order, icon: 'apps', label: 't' }, layout: 'custom', status: 'ready', sensitive: false, strings: { t: 'T' }, load: async () => ({ default: () => null }) }) as unknown as PageManifest;

describe('navEntries', () => {
  it('places known pages by the shell nav table, whatever their manifest says', () => {
    const got = navEntries([page('logs', 'main', 100), page('scripts', 'main', 40), page('home', 'main', 0), page('keys', 'main', 100)]);
    expect(got.map((e) => [e.page.id, e.group, e.order])).toEqual([
      ['home', 'main', 10],
      ['keys', 'account', 30],
      ['scripts', 'build', 30],
      ['logs', 'build', 40],
    ]);
  });
  it('Files sits in the main group between Computers and Bots', () => {
    const got = navEntries([page('bots', 'main', 1), page('files', 'build', 99), page('computers', 'main', 2)]);
    expect(got.map((e) => [e.page.id, e.group, e.order])).toEqual([
      ['computers', 'main', 20],
      ['files', 'main', 25],
      ['bots', 'main', 30],
    ]);
  });
  it('keeps the manifest place for a page the table does not know; skips pages without nav', () => {
    const noNav = { ...page('hidden', 'main', 1), nav: undefined } as PageManifest;
    const got = navEntries([page('demo', 'main', 100), noNav, page('computers', 'main', 99)]);
    expect(got.map((e) => [e.page.id, e.group, e.order])).toEqual([
      ['computers', 'main', 20],
      ['demo', 'main', 100],
    ]);
  });
});

describe('initials', () => {
  it('takes up to two initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('ada')).toBe('A');
    expect(initials('  Grace  Brewster Hopper ')).toBe('GB');
    expect(initials('')).toBe('?');
    expect(initials(undefined)).toBe('?');
  });
});

describe('shell strings', () => {
  it('use only {{name}} placeholders (kit/strings fills nothing else)', async () => {
    const table = (await import('./strings.en.json')).default as Record<string, string>;
    for (const [k, v] of Object.entries(table)) expect([k, v.replace(/\{\{\w+\}\}/g, '')]).not.toEqual([k, expect.stringMatching(/[{}]/)]);
  });
});

describe('countText', () => {
  it('shows the same cap format everywhere', async () => {
    const { countText } = await import('./context');
    expect(countText(5)).toBe('5');
    expect(countText(99)).toBe('99');
    expect(countText(99, true)).toBe('99+');
    expect(countText(250)).toBe('99+');
    expect(countText(40, true)).toBe('40+');
  });
});
