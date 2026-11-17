// The market's prices on live data. A row could show its cheapest first payment bare ("$27.99")
// under a toolbar saying "from $39/month": a 7-day term read as a month. The row now names its term, as a one-time payment ("$27.99 for 7 days"), never a rate. The order summary
// drew "$27", "$0.99", "$27.99" (whole dollars drop the cents): a summary that adds up shows cents on every line.
// Display only: no amount sent changes.
import { expect, test } from 'bun:test';
import { makeT } from '@kit/strings';
import { moneyIn, money } from './logic';
import { priceText } from './parts/words';
import strings from './strings.en.json';

const t = makeT(strings);

test('a row names its term', () => {
  expect(priceText(t, { totalCents: 2799, days: 7 })).toBe('$27.99 for 7 days');
  expect(priceText(t, { totalCents: 6900, days: 30 })).toBe('$69 for 30 days');
  expect(priceText(t, { totalCents: 500, days: 1 })).toBe('$5 for 1 day');
  expect(priceText(t, null)).toBe('Not for sale');
});

test('a summary with cents on one line shows cents on every line', () => {
  const lines = [2700, 99, 2799];
  expect(lines.map((c) => moneyIn(c, lines))).toEqual(['$27.00', '$0.99', '$27.99']);
  const whole = [17900, 4900, 22800];
  expect(whole.map((c) => moneyIn(c, whole))).toEqual(['$179', '$49', '$228']);
  expect(moneyIn(2700, [2700, null, 2799])).toBe('$27.00');
  expect(moneyIn(null, lines)).toBe('');
  // money() itself is unchanged: whole dollars still drop the cents everywhere else.
  expect(money(2700)).toBe('$27');
});
