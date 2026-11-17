// The export dialog counts its rows: a one-row export read "Saved Failures with 1 rows." (controller.ts passes count).
import { expect, it } from 'vitest';
import { makeT } from '@kit/strings';
import strings from './strings.en.json';

const t = makeT(strings);

it('one row is "1 row"; more are "N rows"', () => {
  expect(t('ex.saved', { name: 'Failures', count: 1, n: '1' })).toBe('Saved Failures with 1 row.');
  expect(t('ex.saved', { name: 'Failures', count: 1200, n: '1,200' })).toBe('Saved Failures with 1,200 rows.');
  expect(t('ex.working', { count: 1, n: '1' })).toBe('Reading… 1 row so far');
  expect(t('ex.working', { count: 0, n: '0' })).toBe('Reading… 0 rows so far');
});
