// The app boot registers core's page resolver (core errors.ts setPageResolver): error details name a page by its
// title and link; without it they show the plain id and no link.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { errorPage, setPageResolver } from '@core';
import { hubHref } from './hrefs';
import { registerPageResolver } from './page-resolver';
import { discoverPages } from './pages';

afterEach(() => { setPageResolver(null); });

describe('page resolver', () => {
  it('main.tsx registers it at boot with the visible pages, before the router is built', () => {
    const main = readFileSync(join(import.meta.dirname, 'main.tsx'), 'utf8');
    const at = main.indexOf('registerPageResolver(visible);');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(main.indexOf('buildRouter(visible'));
  });
  it('registered, a page id reads as its title and its link; an unknown id falls back', () => {
    const { pages } = discoverPages();
    const p = pages[0]!;
    registerPageResolver(pages);
    const shown = errorPage(p.id);
    expect(shown.title).toBe((p.strings as Record<string, string>)[p.title]);
    expect(shown.title).not.toBe('');
    expect(shown.href).toBe(hubHref(p.path));
    expect(shown.href!.startsWith('#/')).toBe(true);
    expect(errorPage('no-such-page')).toEqual({ title: 'no-such-page', href: null });
  });
  it('with nothing registered, the title is the plain id and there is no link', () => {
    expect(errorPage('keys')).toEqual({ title: 'keys', href: null });
  });
});
