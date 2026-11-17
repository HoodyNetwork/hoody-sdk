// A page that reads a DOM global crashes the live terminal Hub, so the runners must fail it too (a
// non-strict render or a `traps` list in the goldens would show pages as fine while they
// crash live). Mounts the demo page with its view replaced by one that reads `document` (withDemoView: for these
// tests only, so the files after this one in the process draw the real demo page).
import { afterAll, expect, test } from 'bun:test';
// This file pins the fixture clock (freezeClock in a test): it gives the real clock back to the next file of the process.
afterAll(async () => { (await import('./clock')).thawClock(); });
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { expectTraps } from '../../src/term/env/strict-globals';
import { withDemoView } from './demo-view';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `strict-trap-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

function ReadsDocument() {
  // As DataTableLayout.measure did: a guard-free read while drawing.
  const t = (globalThis as { document?: { title?: string } }).document?.title ?? 'none';
  return createElement('text', {}, `title ${t}`);
}

test('a page reading `document` fails render (exit 1, the trap named with its source line)', () => withDemoView(ReadsDocument, async () => {
  expectTraps('document'); // this test traps on purpose; the session must still fail
  const { renderPage, exitCodeOf } = await import('./render');
  const s = await renderPage({ page: 'demo' });
  try {
    expect(s.traps).toContain('document');
    expect(s.trapsAt.some((t) => t.startsWith('document at ') && t.includes('strict-trap-fail.term.test.ts'))).toBe(true);
    expect(exitCodeOf(s)).toBe(1);
  } finally { s.close(); }
}), 60_000);

test('goldens: a trap is a hard `trap` problem that an allowance listing it does not accept', () => withDemoView(ReadsDocument, async () => {
  expectTraps('document');
  const { runPageGoldens } = await import('./goldens');
  const { freezeClock } = await import('./clock');
  freezeClock();
  const dir = path.join(TMP, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'allowance.json'), JSON.stringify({ crashes: ['*'], placeholders: [], holes: [], traps: ['document'], domRefused: [], domUnsupported: [], consoleErrors: [], untranslatable: 99 }));
  const { renderPage } = await import('./render');
  const r = await runPageGoldens('demo', { update: false, render: (o) => renderPage(o), dir, loading: [] });
  const traps = r.problems.filter((p) => p.rule === 'trap');
  expect(traps.length).toBeGreaterThan(0);
  expect(traps[0]!.message).toContain('document at ');
  expect(r.problems.some((p) => p.rule === 'new-traps')).toBe(false);
}), 180_000);
