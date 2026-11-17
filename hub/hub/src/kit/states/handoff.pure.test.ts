import { describe, expect, test } from 'vitest';
import { declaredPaths, declaredRoute, handoffRoute, hasRepeatedKey, isHubRoute, pageRoute, placeQuery, routeOf, hubWebAddress, shownAddress } from './handoff.pure';

const PAGES = ['/', '/schedules', '/vault', '/files', '/keys', '/ai', '/ai/f'];

describe('handoff.pure', () => {
  test('whole address with an origin, path form without', () => {
    expect(hubWebAddress('/schedules', 'https://hub.example.com', undefined, PAGES)).toBe('https://hub.example.com/auth/home#/schedules');
    expect(hubWebAddress('/vault', null, undefined, PAGES)).toBe('/auth/home#/vault');
  });
  test('refuses what is not a Hub route, and a bad origin', () => {
    for (const bad of ['https://evil.example', '//evil', 'javascript:x', '/a b', '/a\u001b[31m']) expect(isHubRoute(bad)).toBe(false);
    expect(hubWebAddress('https://evil.example', null, undefined, PAGES)).toBe('/auth/home#/');
    expect(hubWebAddress('/keys', 'https://a.example/path', undefined, PAGES)).toBe('/auth/home#/keys');
  });
  test('the place (realm, computer) goes before the #, only in its own shapes', () => {
    const r = '0123456789abcdef01234567';
    const c = 'c0a7150000000000000000a1';
    const realms = [{ id: r }];
    const known = [{ id: c, name: 'atlas' }];
    expect(hubWebAddress('/files', 'https://hub.example.com', { realm: r, computer: c, realms }, PAGES, known)).toBe(`https://hub.example.com/auth/home?realm=${r}&computer=${c}#/files`);
    // The computer is a 24 lower-hex id or nothing.
    for (const bad of ['hdy_reviewcanary', 'c_7-x', c.toUpperCase(), `${c}0`, c.slice(1)]) expect(placeQuery({ computer: bad }, [{ id: bad, name: 'x' }])).toBe('');
    expect(hubWebAddress('/files', null, { realm: 'all', realms }, PAGES)).toBe('/auth/home?realm=all#/files');
    expect(placeQuery({ realm: 'ALL', computer: 'a&b=c', realms })).toBe('');
    expect(placeQuery({ realm: null, computer: null })).toBe('');
    expect(placeQuery(undefined)).toBe('');
  });
  test('a valid-shaped place travels only when a list holds it', () => {
    const r = '0123456789abcdef01234567';
    const c = 'c0a7150000000000000000a1';
    const hex = 'feedfacefeedfacefeedface';
    const known = [{ id: c, name: 'atlas' }];
    expect(placeQuery({ realm: hex, computer: hex, realms: [{ id: r }] }, known)).toBe('');
    // No list: nothing travels, not even 'all' or a listed-looking value.
    expect(placeQuery({ realm: r, computer: c })).toBe('');
    expect(placeQuery({ realm: 'all', computer: c, realms: [] }, [])).toBe('');
    expect(placeQuery({ realm: 'all', computer: c, realms: [{ id: r }] }, known)).toBe(`?realm=all&computer=${c}`);
  });
  test('the drawn address masks every 24-hex run (first and last 4), nothing else', () => {
    const a = 'https://hub.example.com/auth/home?realm=0123456789abcdef01234567&computer=c0a7150000000000000000a1#/board/open/atlas.00a1/terminal-1';
    expect(shownAddress(a)).toBe('https://hub.example.com/auth/home?realm=0123…4567&computer=c0a7…00a1#/board/open/atlas.00a1/terminal-1');
    expect(shownAddress('/auth/home#/keys')).toBe('/auth/home#/keys');
  });
  test('a key given twice is a repeated key, whatever the order or value', () => {
    expect(hasRepeatedKey('?add=a&add=b')).toBe(true);
    expect(hasRepeatedKey('cid=x&add=a&cid=x')).toBe(true);
    expect(hasRepeatedKey('?add=a&cid=b')).toBe(false);
    expect(hasRepeatedKey('')).toBe(false);
  });
  test('only the path travels; every search value and fragment is dropped, whatever it holds', () => {
    const canary = 'hdy_R9canaryQz7x4Lp9Tv';
    for (const to of [`/files?path=${canary}`, `/keys?token=${canary}&tab=2`, `/vault#${canary}`, `/ai?a=1#b=${canary}`]) {
      const a = hubWebAddress(to, 'https://hub.example.com', { realm: 'all', computer: 'pc_9' }, PAGES);
      expect(a).not.toContain(canary);
      expect(a).not.toContain('token');
      expect(a.split('#')[1]).toBe(to.split(/[?#]/)[0]);
    }
    // A path holding anything but a page route's characters is the root (percent-encoding, dots, colons).
    for (const bad of ['/a%20b', '/a/../b', '/a:b', `/${canary}%41`]) expect(handoffRoute(bad)).toBe('/');
    expect(handoffRoute('/computers/pc_9/files')).toBe('/computers/pc_9/files');
  });
  test('only a DECLARED page path travels; anything below it is dropped, whatever its shape', () => {
    const canary = 'hdy_R9canaryQz7x4Lp9Tv';
    // A sub-path is free text below the page's splat route (a folder key, an id, a pasted token): never carried.
    expect(declaredRoute(`/vault/${canary}`, PAGES)).toBe('/vault');
    expect(declaredRoute('/schedules/abcdefabcdefabcdefabcdef/history', PAGES)).toBe('/schedules');
    expect(declaredRoute(`/ai/f/${canary}`, PAGES)).toBe('/ai/f'); // the longest declared prefix wins
    expect(declaredRoute(`/ai/${canary}?x=1`, PAGES)).toBe('/ai');
    expect(declaredRoute('/AI/F/x', PAGES)).toBe('/ai/f'); // matched without case, returned as declared
    // Not under a declared page (a look-alike prefix, an undeclared path, no router): the Hub root.
    for (const to of [`/vaultx/${canary}`, `/${canary}`, '/a%2Fb', 'https://evil.example/vault', '//vault']) expect(declaredRoute(to, PAGES)).toBe('/');
    expect(declaredRoute('/vault', [])).toBe('/');
    // A declared path that is not a plain page path is never used.
    expect(declaredRoute(`/x/${canary}`, ['/x/$id', `/x/${canary}?`, 'x'])).toBe('/');
    const a = hubWebAddress(`/vault/${canary}?k=${canary}#${canary}`, 'https://hub.example.com', { realm: 'all', realms: [{ id: '0123456789abcdef01234567' }] }, PAGES);
    expect(a).toBe('https://hub.example.com/auth/home?realm=all#/vault');
  });
  test('declaredPaths reads the router\'s page routes: splats stripped, parameter paths left out', () => {
    const router = { routesById: { __root__: { fullPath: '' }, '/': { fullPath: '/' }, '/vault/$': { fullPath: '/vault/$' }, '/x/$id': { fullPath: '/x/$id' }, '/$': { fullPath: '/$' }, bad: {} } };
    expect(declaredPaths(router).sort()).toEqual(['/', '/vault']);
    expect(declaredPaths(null)).toEqual([]);
  });
  test('a Board extra travels only when it names a computer of the account\'s list, rebuilt from it', () => {
    const atlas = { id: 'c0a7150000000000000000a1', name: 'atlas' };
    const known = [atlas, { id: '0123456789abcdef01234567', name: 'beta' }];
    const key = 'hdy_r9canaryqz7x4lp9tv';
    expect(pageRoute('/board/open/atlas.00a1/terminal-1', '/board', known)).toBe('/board/open/atlas.00a1/terminal-1');
    expect(pageRoute('/board/open/beta.4567/port-8080', '/board', known)).toBe('/board/open/beta.4567/port-8080');
    expect(pageRoute(`/board?add=terminal-new&cid=${atlas.id}`, '/board', known)).toBe(`/board?add=terminal-new&cid=${atlas.id}`);
    expect(pageRoute(`/board?cid=${atlas.id}&add=display-2&x=${key}`, '/board', known)).toBe(`/board?add=display-2&cid=${atlas.id}`);
    for (const bad of [
      // valid shapes that name no listed computer, or a listed handle with a bad program part
      '/board/open/pastedsecretcanary.xx/terminal-1', '/board/open/pastedsecretcanary.00a1/terminal-1', '/board/open/atlas.k3/terminal-1',
      '/board?add=terminal-new&cid=feedfacefeedfacefeedface', `/board/open/${key}.00a1/terminal-1`, `/board/open/atlas.00a1/${key}-1`,
      '/board/open/atlas.00a1/terminal-0', '/board/open/atlas.00a1/terminal-123456', '/board/open/atlas.00a1/script/x', '/board/open/atlas/terminal-1',
      '/board/open/atlas.00a1/secretprogram-1', `/board?add=${key}&cid=${atlas.id}`, '/board?add=terminal-1', `/board?add=terminal-1&add=terminal-2&cid=${atlas.id}`,
      `/board?add=terminal-1&cid=${atlas.id.toUpperCase()}`, `/board#add=terminal-1&cid=${atlas.id}`,
    ]) expect(pageRoute(bad, '/board', known)).toBe('/board');
    // No list (not loaded, outside a shell): the declared page only.
    expect(pageRoute('/board/open/atlas.00a1/terminal-1', '/board')).toBe('/board');
    expect(pageRoute('/board/open/atlas.00a1/terminal-1', '/board', [])).toBe('/board');
    // Other pages carry nothing extra.
    expect(pageRoute(`/vault/open/atlas.00a1/terminal-1?add=terminal-1&cid=${atlas.id}`, '/vault', known)).toBe('/vault');
    expect(hubWebAddress(`/board/open/atlas.00a1/terminal-1?add=terminal-1&cid=${atlas.id}`, null, undefined, ['/board'], known)).toBe(`/auth/home#/board/open/atlas.00a1/terminal-1?add=terminal-1&cid=${atlas.id}`);
  });
  test('routeOf drops empty values', () => {
    expect(routeOf('/keys', { a: '1', b: '', c: undefined })).toBe('/keys?a=1');
    expect(routeOf('', {})).toBe('/');
  });
});
