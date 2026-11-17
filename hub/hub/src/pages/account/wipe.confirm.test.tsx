// Vitest (fail closed): Remove all local data. The confirm asks to close other Hub tabs, names what
// may already have gone through and asks for a second tick when it names anything; a payment not settled keeps it
// disabled with a link to Billing; core's verdict decides what the dialog says, and only 'started' closes it.
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import { wipeReason } from './parts/WipeSection';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

async function dialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });
}
const plural = (key: 'w.held' | 'w.asks', count: number, page = '') =>
  strings[`${key}_${count === 1 ? 'one' : 'other'}`].replace('{{count}}', String(count)).replace('{{page}}', page);

describe('remove all local data', () => {
  it('the This browser row opens the confirm, kept in the URL', async () => {
    const { router } = await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: strings['w.open'] }, { timeout: 8000 }));
    const d = await dialog();
    expect(router.state.location.search).toMatchObject({ sheet: 'wipe' });
    expect(within(d).getByText(strings['w.bodyShort'])).toBeInTheDocument();
  });

  it('with nothing tracked the confirm asks for no tick, and confirming closes it', async () => {
    const { router } = await renderPage(page, { path: '/account?sheet=wipe' });
    const d = await dialog();
    expect(within(d).queryByRole('checkbox')).not.toBeInTheDocument();
    const go = await within(d).findByRole('button', { name: strings['w.confirm'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ sheet: 'wipe' }));
  });

  it('names the changes and questions that may have gone through, and needs the tick first', async () => {
    const { router } = await renderPage(page, { state: 'wipe-items', path: '/account?sheet=wipe' });
    const d = await dialog();
    expect(await within(d).findByText(plural('w.held', 2, strings['w.page.computers']))).toBeInTheDocument();
    expect(within(d).getByText(plural('w.held', 1, strings['w.page.other']))).toBeInTheDocument();
    expect(within(d).getByText(plural('w.asks', 1))).toBeInTheDocument();
    // Sends still out are named as such.
    expect(within(d).getAllByText(strings['w.sending']).length).toBe(1);
    const go = within(d).getByRole('button', { name: strings['w.confirm'] });
    expect(go).toBeDisabled();
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['w.tick'] }));
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ sheet: 'wipe' }));
  });

  it("a list that grew since the confirm opened ('changed'): it stays open, says so, and the tick is needed again", async () => {
    await renderPage(page, { state: 'wipe-changed', path: '/account?sheet=wipe' });
    const d = await dialog();
    const tick = await within(d).findByRole('checkbox', { name: strings['w.tick'] });
    await userEvent.click(tick);
    await userEvent.click(within(d).getByRole('button', { name: strings['w.confirm'] }));
    expect(await within(d).findByText(strings['w.changed'])).toBeInTheDocument();
    // A definite refusal: titled "Nothing was removed", never the C9 "may have gone through".
    expect(within(d).getByText(strings['w.notRemoved'])).toBeInTheDocument();
    expect(within(d).queryByText(kitStrings['outcome.pending.title'])).toBeNull();
    expect(d.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(d.querySelector('[data-outcome="not_sent"]')).not.toBeNull();
    expect(within(d).getByRole('checkbox', { name: strings['w.tick'] })).not.toBeChecked();
    expect(within(d).getByRole('button', { name: strings['w.confirm'] })).toBeDisabled();
  });

  it('the confirm asks to close the other Hub tabs first', async () => {
    await renderPage(page, { path: '/account?sheet=wipe' });
    const d = await dialog();
    expect(await within(d).findByText(strings['w.oneTab'])).toBeInTheDocument();
  });

  it('other tabs open: it says to close them, nothing was removed, and stays open', async () => {
    await renderPage(page, { state: 'wipe-tabs', path: '/account?sheet=wipe' });
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: strings['w.confirm'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(strings['w.tabs'])).toBeInTheDocument();
    expect(within(d).getByText(strings['w.tabsLead'], { exact: false })).toBeInTheDocument();
    expect(within(d).getByText(strings['w.notRemoved'])).toBeInTheDocument();
  });

  it('stores it could not check are named, and nothing was removed', async () => {
    await renderPage(page, { state: 'wipe-unchecked', path: '/account?sheet=wipe' });
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: strings['w.confirm'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    const what = [strings['w.check.databases'], strings['w.check.payments']].join(', ');
    expect(await within(d).findByText(strings['w.unchecked'].replace('{{what}}', what))).toBeInTheDocument();
  });

  it('a payment not settled keeps the confirm disabled and links to Billing', async () => {
    await renderPage(page, { state: 'wipe-payments', path: '/account?sheet=wipe' });
    const d = await dialog();
    expect(await within(d).findByText(strings['w.payHeld'], { exact: false })).toBeInTheDocument();
    expect(within(d).getByText(strings['w.billing'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['w.confirm'] })).toBeDisabled();
  });

  it('a wipe that could not start says nothing was removed and stays open', async () => {
    await renderPage(page, { state: 'wipe-failed', path: '/account?sheet=wipe' });
    const d = await dialog();
    const go = await within(d).findByRole('button', { name: strings['w.confirm'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(strings['w.failed'])).toBeInTheDocument();
    expect(within(d).getByText(strings['w.notRemoved'])).toBeInTheDocument();
    expect(within(d).queryByText(kitStrings['outcome.pending.title'])).toBeNull();
  });

  it('Cancel closes the confirm and runs nothing', async () => {
    const { router } = await renderPage(page, { state: 'wipe-failed', path: '/account?sheet=wipe' });
    const d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ sheet: 'wipe' }));
    expect(screen.queryByText(strings['w.failed'])).not.toBeInTheDocument();
  });

  it('a suspended account gets neither the row nor the confirm from a link', async () => {
    await renderPage(page, { state: 'suspended', path: '/account?sheet=wipe' });
    expect(await screen.findByText(strings['suspended.title'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['w.open'] })).not.toBeInTheDocument();
    expect(document.querySelector('[role="alertdialog"], [role="dialog"]')).toBeNull();
  });
});

describe('the wipe confirm says why it is off, and its question link is the dialog\'s own', () => {
  it('names why the confirm is off: still reading, then the tick; a payment not settled has its own banner', () => {
    expect(wipeReason(null, false, 0, false)).toBe('w.reason.reading');
    expect(wipeReason(null, true, 3, true)).toBe('w.reason.reading');
    const w = {} as Parameters<typeof wipeReason>[0];
    expect(wipeReason(w, false, 2, false)).toBe('w.reason.tick');
    expect(wipeReason(w, false, 2, true)).toBeNull();
    expect(wipeReason(w, false, 0, false)).toBeNull();
    expect(wipeReason(w, true, 2, false)).toBeNull();
  });

  it('with things named, the off confirm says to tick the box, in a polite status line, and the line empties once ticked', async () => {
    await renderPage(page, { state: 'wipe-items', path: '/account?sheet=wipe' });
    const d = await dialog();
    const reason = await within(d).findByText(strings['w.reason.tick']);
    const line = reason.closest('[role="status"]')!;
    expect(line).toHaveAttribute('aria-live', 'polite');
    expect(within(d).getByRole('button', { name: strings['w.confirm'] })).toBeDisabled();
    await userEvent.click(within(d).getByRole('checkbox', { name: strings['w.tick'] }));
    await waitFor(() => expect(within(d).queryByText(strings['w.reason.tick'])).toBeNull());
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent('');
  });

  it('the link to the whole answer is the dialog\'s question slot, not a paragraph of the body', async () => {
    await renderPage(page, { path: '/account?sheet=wipe' });
    const d = await dialog();
    const link = await within(d).findByRole('link', { name: strings['w.more'] });
    expect(link.closest('[data-dialog-faq]')).not.toBeNull();
  });
});
