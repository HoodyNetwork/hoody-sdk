// The wallet band's Referral credit lines in a terminal (parts/ReferralLines.term.tsx): the sentence and both links are
// whole at 80 columns. On the web the links run on in the sentence; in cells that line could not wrap and lost "What
// these amounts are" at 80x24.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const fx of ['wallet-referral', 'wallet-referral-owed']) {
  for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
    test(`${fx} at ${cols}x${rows}: the credit sentence and both links are whole`, async () => {
      s = await renderPage({ page: 'billing', fx, path: '/billing?view=wallet', cols, rows });
      const frame = await s.settle();
      expect(s.failures).toEqual([]);
      expect(frame).toContain('Referral credit $12.40 · spent first on servers');
      expect(frame).toContain('What these amounts are');
      expect(frame).toMatch(/Referrals {2}What these amounts are/);
    }, 120_000);
  }
}
