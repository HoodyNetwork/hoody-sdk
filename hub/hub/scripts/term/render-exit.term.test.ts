// render.ts exits non-zero when the page drew an error screen instead of itself.
import { describe, expect, test } from 'bun:test';
import { badPagePath, exitCodeOf, type PageSession } from './render';
import { FIXTURE_WEB_ORIGIN } from './fixture-origin';

const session = (frame: string): PageSession => ({ frame, failures: [], settled: true, placeholders: { unsupported: [], allowed: [] } }) as unknown as PageSession;

describe('render exit code', () => {
  test('a page that drew is 0', () => {
    expect(exitCodeOf(session(' HOODY  Schedules\n Home │ Schedules'))).toBe(0);
  });
  test('the router error screen is 1', () => {
    expect(exitCodeOf(session('Something went wrong!\n\nuseSyncExternalStore is not a function'))).toBe(1);
  });
  test('a stack in the frame is 1', () => {
    expect(exitCodeOf(session('TypeError: x is not a function\n    at MatchesInner (Matches.js:32:1)'))).toBe(1);
  });
});

describe('--path must be a path of the page (TERM_BAD_PATH)', () => {
  test('the page path, a search, a hash or a sub-path pass', () => {
    for (const p of ['/schedules', '/schedules?sel=a1', '/schedules#x', '/schedules/a1']) expect(badPagePath(p, '/schedules')).toBeNull();
    expect(badPagePath('/?x=1', '/')).toBeNull();
  });
  test('a bare search, another page or a prefix look-alike are refused, naming the path', () => {
    expect(badPagePath('?sel=a1', '/schedules')).toContain('"/schedules?sel=a1"');
    expect(badPagePath('/keys?sel=a1', '/schedules')).toContain('"/keys?sel=a1" is not under the page\'s route "/schedules"');
    expect(badPagePath('/schedulesx', '/schedules')).not.toBeNull();
    expect(badPagePath('/keys', '/')).not.toBeNull();
  });
});

test('the fixture web origin is https on a reserved .test name (never a real host), an origin with no path', () => {
  const u = new URL(FIXTURE_WEB_ORIGIN);
  expect(u.protocol).toBe('https:');
  expect(u.hostname.endsWith('.test')).toBe(true);
  expect(u.origin).toBe(FIXTURE_WEB_ORIGIN);
});

