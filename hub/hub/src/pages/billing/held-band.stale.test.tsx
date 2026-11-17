// The held bands say when they may be wrong: a refresh that failed keeps the
// last read's bands with an out-of-date note and Try again; a list cut short says a held server may be missing, on every
// view but Wallet & usage, whose subscriptions table already says the list is incomplete or out of date.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({ fail: false, refetch: vi.fn() }));
vi.mock('./data', async (orig) => {
  const a = await orig<{ useSubs: () => Record<string, unknown> }>();
  return {
    ...a,
    // A failed refresh: the read keeps its last answer and says it failed.
    useSubs: () => {
      const r = a.useSubs();
      return fx.fail ? { ...r, isError: true, error: new Error('refresh failed'), refetch: fx.refetch } : r;
    },
  };
});

beforeEach(() => {
  fx.fail = false;
  fx.refetch.mockReset();
});

const held = async () => {
  await waitFor(() => expect(document.querySelector('[data-band="held-server"]')).not.toBeNull(), { timeout: 10_000 });
  return document.querySelector('[data-band="held-server"]') as HTMLElement;
};
const staleBand = () => document.querySelector('[data-band="held-stale"]') as HTMLElement | null;
const partialBand = () => document.querySelector('[data-band="held-partial"]') as HTMLElement | null;

describe('held bands after a failed refresh', () => {
  for (const path of ['/billing', '/billing?view=plans', '/billing?view=servers']) {
    it(`on ${path}: the last read stays, says it may be out of date, Try again reads again, Pay now stays`, async () => {
      fx.fail = true;
      await renderPage(page, { path });
      const b = await held();
      expect(b).toHaveTextContent(/^fra-7: On hold/);
      const s = staleBand();
      expect(s).not.toBeNull();
      expect(s).toHaveTextContent(strings['subs.heldStale']);
      // Enabled and not the kit's soft disable, which toBeEnabled passes.
      const pay = within(b).getByRole('button', { name: /^Pay now/ });
      expect(pay).toBeEnabled();
      expect(pay).not.toHaveAttribute('aria-disabled', 'true');
      // Nothing reads again on its own, so the one call below is the button's.
      expect(fx.refetch).not.toHaveBeenCalled();
      await userEvent.click(within(s as HTMLElement).getByRole('button', { name: strings['action.tryAgain'] }));
      expect(fx.refetch).toHaveBeenCalledTimes(1);
    });
  }

  it('a healthy read says nothing about being out of date', async () => {
    await renderPage(page, { path: '/billing' });
    await held();
    expect(staleBand()).toBeNull();
  });

  it('on Wallet & usage: one warning for one failed read, the table\'s own, with the held band still shown', async () => {
    // Both the wallet and the held band fail to refresh.
    fx.fail = true;
    await renderPage(page, { path: '/billing?view=wallet' });
    const b = await held();
    const note = await screen.findByText(kitStrings['table.staleData'], undefined, { timeout: 10_000 });
    expect(staleBand()).toBeNull();
    expect(screen.queryByText(strings['subs.heldStale'])).toBeNull();
    // The one warning keeps its own retry, and the held band keeps Pay now.
    const pay = within(b).getByRole('button', { name: /^Pay now/ });
    expect(pay).toBeEnabled();
    expect(pay).not.toHaveAttribute('aria-disabled', 'true');
    expect(fx.refetch).not.toHaveBeenCalled();
    await userEvent.click(within(note.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: kitStrings['action.retry'] }));
    expect(fx.refetch).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh with no held server: no held bands and no out-of-date note', async () => {
    fx.fail = true;
    await renderPage(page, { state: 'empty', path: '/billing' });
    await screen.findByRole('heading', { name: strings.plans }, { timeout: 10_000 });
    await waitFor(() => expect(document.querySelector('[data-section="plans"] [data-kit="plan-card"]')).not.toBeNull(), { timeout: 10_000 });
    expect(document.querySelector('[data-band="held-server"]')).toBeNull();
    expect(staleBand()).toBeNull();
  });
});

describe('held bands on a list cut short', () => {
  for (const path of ['/billing', '/billing?view=plans', '/billing?view=servers']) {
    it(`on ${path}: says a held server may be missing, with the counts`, async () => {
      fx.fail = false;
      await renderPage(page, { state: 'partial', path });
      await waitFor(() => expect(partialBand()).not.toBeNull(), { timeout: 10_000 });
      expect(partialBand()).toHaveTextContent(strings['subs.heldPartial'].replace('{{shown}}', '4').replace('{{total}}', '9'));
    });
  }

  it('on Wallet & usage: no held note, the table says the list is incomplete', async () => {
    await renderPage(page, { state: 'partial', path: '/billing?view=wallet' });
    await waitFor(() => expect(document.querySelector('[data-band="partial"]')).not.toBeNull(), { timeout: 10_000 });
    expect(partialBand()).toBeNull();
  });

  it('a whole list: no held note', async () => {
    await renderPage(page, { path: '/billing' });
    await held();
    expect(partialBand()).toBeNull();
  });
});
