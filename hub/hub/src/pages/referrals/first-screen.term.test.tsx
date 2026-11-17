// Referrals' first screen at 80x24 shows the person's main link and Copy link well inside the screen:
// the card's rule paragraph ("A new account can become your referral …", seven rows at 80 columns) sat between
// the card title and the codes, and the link was the screen's last row. The paragraph is the card's foot now.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('at 80x24 the main link and Copy link come before the rule paragraph', async () => {
  s = await renderPage({ page: 'referrals', cols: 80, rows: 24 });
  const rows = (await s.settle()).split('\n');
  const link = rows.findIndex((r) => r.includes('signup?ref=k7m2q9xa'));
  const copy = rows.findIndex((r) => r.includes(strings['link.copyMain']));
  expect(link).toBeGreaterThan(-1);
  expect(link).toBeLessThanOrEqual(15);
  expect(copy).toBeGreaterThan(link);
  expect(rows.slice(0, link).join('\n')).not.toContain('A new account can become your referral');
  expect(rows.slice(0, link).join('\n')).toContain(strings['link.share']);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
