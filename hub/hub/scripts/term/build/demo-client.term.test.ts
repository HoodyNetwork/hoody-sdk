// demo-client.ts is compiled into the release binary's `hoody hub --demo`: nothing a user's start loads may refuse
// outside the test boundary, and measure.ts keeps serving the same fake to the gates.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { reaches, staticImports } from '../static-imports';
import { DEMO_CONTEXT, demoClient, fakeClient } from './demo-client';
import * as measure from './measure';

const here = (f: string): string => path.join(import.meta.dir, f);
/** What the SDK's compile entry imports from this directory (hoody-sdk cli/hub-build-step.ts). */
const SHIPPED = ['demo-client.ts', 'hub-cache.ts', 'hub-main.ts'].map(here);
/** Modules that exit outside the test boundary, and the test-side entry that imports one. */
const BOUNDARY = ['../netns-required.ts', '../netns-first.ts', 'measure.ts', 'ship-run.ts'].map(here);

test('no module a user start loads reaches a test-boundary module', () => {
  for (const b of BOUNDARY) expect(fs.existsSync(b), b).toBe(true);
  for (const f of SHIPPED) for (const b of BOUNDARY) expect(reaches(f, b), `${path.basename(f)} -> ${path.basename(b)}`).toBeNull();
});

test('the shipped modules import nothing of hub/src (the bundle is the only copy of the Hub)', () => {
  const seen = new Set<string>();
  const walk = (f: string): void => { if (seen.has(f)) return; seen.add(f); for (const n of staticImports(f, { dynamic: true })) walk(n); };
  SHIPPED.forEach(walk);
  for (const f of seen) expect(f.includes(`${path.sep}src${path.sep}`), f).toBe(false);
});

test('measure.ts serves the same fake', () => {
  expect(measure.fakeClient).toBe(fakeClient);
});

test('the gates\' fake answers from memory and refuses what it does not know', async () => {
  const c = fakeClient([], 'empty');
  expect(c.identity.kind).toBe('account');
  expect(DEMO_CONTEXT.realmId).toMatch(/^[0-9a-f]{24}$/);
  expect(await c.request('GET', '/computers')).toMatchObject({ statusCode: 200 });
  await expect(c.request('POST', '/computers')).rejects.toMatchObject({ status: 404 });
  expect((await c.fetch('https://x.invalid/')).status).toBe(404);
  expect(typeof demoClient).toBe('function');
});

test('the standalone executable reaches a test-boundary module on its --measure branch only', async () => {
  const { demoEntry } = await import('./hub-ship');
  const src = demoEntry();
  const end = src.indexOf('return 0;');
  expect(end).toBeGreaterThan(0);
  const [measured, person] = [src.slice(0, end), src.slice(end)];
  expect(measured).toContain(JSON.stringify(here('measure.ts')));
  for (const b of BOUNDARY) expect(person.includes(JSON.stringify(b)), path.basename(b)).toBe(false);
  expect(person).toContain(JSON.stringify(here('demo-client.ts')));
  // The same account and mount as `hoody hub --demo`: the demo client, its context, on the demo mount. Never the
  // gates' empty account, and never a demo client handed to the live mount (which refuses it).
  expect(person).toContain('client: () => demoClient()');
  expect(person).toContain('context: { ...DEMO_CONTEXT }');
  expect(person).toMatch(/hubMain\(\{[^\n]*\bdemo: true\b/);
  expect(person).not.toContain('fakeClient');
});
