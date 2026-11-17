// Vitest: the fixture path keeps an unknown top-up like core does, so hub:dev and the shots can show the page band
// after the drawer closes: the same hold, Check again that stays unknown, a warned Dismiss. The page integration of the
// band (it stays whatever drawer opens or closes; a Forget inside Add funds is the person's own) runs here through the
// real Add funds drawer; the band's own rules run against the real core in topup-band-live.test.tsx.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const band = () => document.querySelector('[data-band="topup-unknown"]') as HTMLElement | null;

async function leaveUnknown() {
  const r = await renderPage(page, { state: 'topup-unknown', path: '/billing?sheet=funds' });
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(await within(dialog).findByRole('button', { name: strings['top.go'] }));
  await within(dialog).findByText(strings['top.unknownTitle']);
  await userEvent.click(within(dialog).getByRole('button', { name: strings['action.cancel'] }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  return r;
}

describe('an unknown top-up on a fixture page', () => {
  beforeEach(() => resetUnknownCheckouts());

  it('stays on the page as a band with its amount after the drawer closes', async () => {
    await leaveUnknown();
    await waitFor(() => expect(band()).not.toBeNull());
    expect(within(band() as HTMLElement).getByText(strings['band.topupTitleAmount'].replace('{{amount}}', '$20.00'))).toBeInTheDocument();
  });

  it('a Check again that is still unknown keeps the band and the amount', async () => {
    await leaveUnknown();
    await waitFor(() => expect(band()).not.toBeNull());
    await userEvent.click(within(band() as HTMLElement).getByRole('button', { name: strings['buy.checkAgain'] }));
    await within(band() as HTMLElement).findByText(strings['top.unknown']);
    expect(within(band() as HTMLElement).getByText(strings['band.topupTitleAmount'].replace('{{amount}}', '$20.00'))).toBeInTheDocument();
  });

  it('Dismiss, confirmed, clears it; reopening Add funds then starts a fresh form', async () => {
    const { router } = await leaveUnknown();
    await waitFor(() => expect(band()).not.toBeNull());
    await userEvent.click(within(band() as HTMLElement).getByRole('button', { name: strings['hold.dismiss'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
    await waitFor(() => expect(band()).toBeNull());
    act(() => router.history.push('/billing?sheet=funds'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: strings['top.go'] })).toBeInTheDocument();
  });

  it('stays on screen while Add funds opens over it and after it closes: the drawer shows the same hold, never zero', async () => {
    const { router } = await leaveUnknown();
    await waitFor(() => expect(band()).not.toBeNull());
    act(() => router.history.push('/billing?sheet=funds'));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(strings['top.unknownTitle']);
    expect(band()).not.toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(band()).not.toBeNull();
  });

  it('stays on screen while another drawer (a checkout) is open', async () => {
    const { router } = await leaveUnknown();
    await waitFor(() => expect(band()).not.toBeNull());
    act(() => router.history.push('/billing?checkout=buy&plan=fam-plus'));
    await screen.findByRole('dialog');
    expect(band()).not.toBeNull();
  });

  it('a Forget confirmed inside Add funds is the person\'s own Dismiss: the band goes and says nothing about it', async () => {
    const { router } = await leaveUnknown();
    await waitFor(() => expect(band()).not.toBeNull());
    act(() => router.history.push('/billing?sheet=funds'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['top.forget'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
    await waitFor(() => expect(band()).toBeNull());
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(band()).toBeNull();
    expect(screen.queryByText(strings['top.resolvedTitle'])).toBeNull();
  });

  it('shows no band when no top-up is held', async () => {
    await renderPage(page, { state: 'topup-unknown', path: '/billing' });
    await screen.findAllByRole('button', { name: strings.addFunds });
    expect(band()).toBeNull();
  });
});
