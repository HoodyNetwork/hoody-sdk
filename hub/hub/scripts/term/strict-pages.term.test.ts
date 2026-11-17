// Pages mounted under strict globals (TERM_GLOBAL traps on document, window, ResizeObserver...): the mount draws with
// an empty trap ledger, no page failure and no React console error. Billing and Referrals crashed here on the web
// CutFrame's ResizeObserver (fixed by kit/layouts/CutFrame.term.tsx) and logged a duplicate key ".0" from the compat
// runtime's fragment flattening (term/jsx/dom.ts flatChildren). A new strict crash on these pages fails this test.
import { expect, test } from 'bun:test';
import { renderPage } from './render';

for (const page of ['billing', 'referrals']) {
  test(`${page} mounts clean under strict globals`, async () => {
    const s = await renderPage({ page, strictGlobals: true });
    try {
      expect(s.traps).toEqual([]);
      expect(s.failures.map((f) => f.message.split('\n')[0])).toEqual([]);
      expect(s.errors.filter((e) => !/act\(/.test(e))).toEqual([]);
      expect(s.frame).not.toMatch(/ResizeObserver|TERM_GLOBAL/);
    } finally {
      s.close();
    }
  }, 60_000);
}
