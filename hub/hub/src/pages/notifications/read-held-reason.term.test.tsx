// A notice whose Mark read may have gone through (ack-lost) disables its Mark read row action; the kit's menu model
// logs "ActionMenu: disabled item(s) without a reason: read" for a disabled item with no disabledReason (seen on the
// shot-ack-unconfirmed render). The item now says why.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('a held Mark read says why, so drawing logs no menu error', async () => {
  s = await renderPage({ page: 'notifications', fx: 'ack-lost', path: '/notifications?sel=4e0000000000000000000000', cols: 120, rows: 40 });
  await s.settle();
  expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
  expect(s.trapsAt).toEqual([]);
}, 240_000);
