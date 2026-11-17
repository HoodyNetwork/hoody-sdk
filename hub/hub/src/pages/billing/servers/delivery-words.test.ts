// A listing's delivery words count their hours: a server delivered within one hour read "within 1 hours".
import { expect, it } from 'vitest';
import { makeT } from '@kit/strings';
import type { Listing } from './logic';
import { deliveryLine, placeLine } from './parts/Detail.pure';
import strings from './strings.en.json';

const t = makeT(strings);
const listing = (deliveryHours: number): Listing => ({ deliveryHours, setupMinutes: null, country: '', city: '' }) as unknown as Listing;

it('one hour is "1 hour"; more are "N hours"', () => {
  expect(deliveryLine(t, listing(1))).toBe('Delivered within 1 hour of payment.');
  expect(deliveryLine(t, listing(5))).toBe('Delivered within 5 hours of payment.');
  expect(placeLine(t, listing(1))).toBe('delivered in about 1 hour');
  expect(placeLine(t, listing(5))).toBe('delivered in about 5 hours');
});
