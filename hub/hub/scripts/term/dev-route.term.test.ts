// `dev.ts --page realms` once opened /realms ("No page at this address"): the default must be the page's path.
import { expect, test } from 'bun:test';
import { discoverPages, visiblePages } from '../../src/app/pages';
import { devRoute } from './dev-route';

const pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });

test('no --path opens the page at its own path (realms: /realms/new)', () => {
  expect(devRoute('realms', undefined, pages)).toEqual({ page: 'realms', path: '/realms/new' });
  for (const p of pages) expect(devRoute(p.id, undefined, pages).path).toBe(p.path);
});

test('--path wins; an unknown page is refused with the page list', () => {
  expect(devRoute('schedules', '/schedules?sel=a', pages)).toEqual({ page: 'schedules', path: '/schedules?sel=a' });
  expect(() => devRoute('nope', undefined, pages)).toThrow(/^TERM_NO_PAGE: nope \(have: /);
});

// A bare `dev.ts` opened Schedules; the first screen of a hand test is Home.
test('no --page opens Home at its own path', () => {
  const home = pages.find((p) => p.id === 'home')!;
  expect(devRoute(undefined, undefined, pages)).toEqual({ page: 'home', path: home.path });
});
