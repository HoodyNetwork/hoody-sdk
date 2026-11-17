// secrets.ts pageNeedles calls every fixture responder to harvest needles; responders have side effects (keys: a
// create pushes onto the state's live list, counters move). The scan must leave the fixtures the drawing reads
// untouched (keys deleteUnknownListed listed "ci-deploy hdy_3f9a" twice).
import { expect, test } from 'bun:test';
import path from 'node:path';

type Rule = { route?: unknown; answer?: unknown };

test('pageNeedles calls no responder of the fixtures the drawing reads (keys)', async () => {
  const loader = await import('./loader');
  if (!loader.installedContext()) loader.installTermLoader({ flavour: 'fixture', fixtures: true });
  const fx = await import(path.join(import.meta.dir, '../../src/app/fixtures.ts')) as typeof import('../../src/app/fixtures');
  const all = (await fx.loadFixtures('keys')) as unknown as { states: Record<string, Rule[]> };
  const keysFx = await import(path.join(import.meta.dir, '../../src/pages/keys/fixtures.ts')) as { sent: Record<string, number> };
  const { routes } = await import(path.join(import.meta.dir, '../../src/pages/keys/routes.ts')) as { routes: { list: unknown } };
  const list = (st: string): unknown => {
    const r = all.states[st]!.find((x) => x.route === routes.list);
    expect(typeof r?.answer, `${st} has a list responder`).toBe('function');
    return JSON.stringify((r!.answer as (q: unknown) => unknown)({ route: r!.route, method: 'GET', path: '/', query: {}, body: {}, target: null, n: 1 }));
  };
  const before = list('deleteUnknownListed');
  const sentBefore = JSON.stringify(keysFx.sent);
  const { pageNeedles } = await import('./secrets');
  const needles = await pageNeedles('keys');
  expect(needles.length).toBeGreaterThan(0);
  expect(list('deleteUnknownListed')).toBe(before);
  expect(JSON.stringify(keysFx.sent)).toBe(sentBefore);
}, 60_000);
