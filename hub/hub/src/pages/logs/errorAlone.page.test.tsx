// Vitest: a failed read shows its error alone; "Nothing to show right now." is not drawn above it.
// A failed read that keeps rows (Everything: the logs read fails, the changes read answers) still says in the header
// that only part of these logs could be read (sum.errSome): the list itself draws no error.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('logs: a failed read', () => {
  for (const state of ['error', 'blocked'] as const) {
    it(`${state}: the page shows its error with Try again and no empty-summary sentence`, async () => {
      await renderPage(page, { state, path: '/logs' });
      // The error has settled once its Try again is drawn.
      expect((await screen.findAllByRole('button', { name: strings['act.retry'] }, { timeout: 14000 })).length).toBeGreaterThan(0);
      expect(document.body.textContent ?? '').not.toContain(strings['sum.err']);
    });
  }

  it('error on Everything with rows kept: the header says only part of these logs could be read', async () => {
    await renderPage(page, { state: 'error', path: '/logs?src=everything' });
    expect(await screen.findByText(strings['sum.errSome'], undefined, { timeout: 14000 })).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain(strings['sum.err']);
    // The band over the kept rows says the same: some of these logs, not all of them.
    expect(screen.getByText(strings['st.failedSome'])).toBeTruthy();
    expect(screen.queryByText(strings['st.failed'])).toBeNull();
  });
});
