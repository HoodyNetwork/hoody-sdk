// Home reads the computers list through core's computersPage. A body without a list is a
// read error; the list is whole only when its pagination says one page, else when it holds fewer than 100 rows; "no computers"
// (Get a computer) is claimed only from a whole read that succeeded, otherwise the read error shows with Try again (a failed
// refetch: the stale band over the last whole answer, so a held setup change keeps its controls).
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { resetActionHolds } from './data';
import { sent } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import './testWaits';

beforeEach(() => resetActionHolds());

const absent = () => screen.queryByText(/has no computers yet|You have no computers yet/);

describe('home: the computers list read', () => {
  it('an empty realm read whole and fine says it has no computers (the control)', async () => {
    await renderPage(page, { state: 'emptyRealm' });
    await waitFor(() => expect(absent()).not.toBeNull());
  });

  it('a 200 without a list is a read error with Try again, never "no computers"', async () => {
    await renderPage(page, { state: 'badBody' });
    expect(await screen.findByText(strings['failed.title'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['action.tryAgain'] })).toBeInTheDocument();
    expect(absent()).toBeNull();
  });

  it('a full page with no pagination is not the whole list: the chooser, never "no computers"', async () => {
    await renderPage(page, { state: 'fullPageNoPaging' });
    expect(await screen.findByText(strings['pick.title'])).toBeInTheDocument();
    expect(absent()).toBeNull();
  });

  it('a refetch that fails after a whole empty read shows the read error (stale band, Try again) over that read', async () => {
    const r = await renderPage(page, { state: 'emptyThenFail' });
    await waitFor(() => expect(absent()).not.toBeNull());
    await act(async () => {
      await r.queryClient.refetchQueries();
    });
    expect(await screen.findByText(strings['band.stale'])).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['action.tryAgain'] })).not.toHaveLength(0);
  });

  it('a refetch that fails after rows were read keeps the rows, with the stale band and Try again', async () => {
    const r = await renderPage(page, { state: 'manyThenFail' });
    expect(await screen.findAllByText('atlas')).not.toHaveLength(0);
    await act(async () => {
      await r.queryClient.refetchQueries();
    });
    expect(await screen.findByText(strings['band.stale'])).toBeInTheDocument();
    expect(screen.getAllByText('atlas')).not.toHaveLength(0);
    expect(screen.queryByText(strings['failed.title'])).toBeNull();
  });

  it('a refetch whose body holds no list after rows were read keeps the rows, with the stale band', async () => {
    const r = await renderPage(page, { state: 'manyThenBad' });
    expect(await screen.findAllByText('atlas')).not.toHaveLength(0);
    await act(async () => {
      await r.queryClient.refetchQueries();
    });
    expect(await screen.findByText(strings['band.stale'])).toBeInTheDocument();
    expect(screen.getAllByText('atlas')).not.toHaveLength(0);
  });

  it('a held redeem stays held when the read-back lists only rows with no usable id (they prove no computer)', async () => {
    sent.redeem = 0;
    await renderPage(page, { state: 'inviteRedeemJunk', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    await waitFor(() => expect(document.body.textContent).toMatch(/may have gone through/i));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await act(async () => {
      await new Promise((x) => setTimeout(x, 300));
    });
    expect(document.body.textContent).toMatch(/may have gone through/i);
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(sent.redeem).toBe(1);
  });

  it('with no computer and the setup state still being read, the skeleton shows, never "being prepared"', async () => {
    await renderPage(page, { state: 'setupUnread', realm: 'all' });
    expect(await screen.findByText(strings['loading'])).toBeInTheDocument();
    await act(async () => {
      await new Promise((x) => setTimeout(x, 500));
    });
    expect(screen.queryByText(strings['setup.provisioning.title'])).toBeNull();
    expect(screen.getByText(strings['loading'])).toBeInTheDocument();
  });

  it('with no computer and an unreadable setup state, the read error with Try again, never "being prepared"', async () => {
    await renderPage(page, { state: 'setupFailed', realm: 'all' });
    // The computer list was read (it is empty); what failed is the setup read, and the words say that.
    expect(await screen.findByText(strings['setupFailed.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['setupFailed.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['failed.title'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['action.tryAgain'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['setup.provisioning.title'])).toBeNull();
  });

  it('a held redeem keeps Check again and Stop tracking while the list read fails', async () => {
    const r = await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    await userEvent.type(await screen.findByLabelText(strings['setup.invite.field']), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: strings['setup.invite.redeem'] }));
    await waitFor(() => expect(document.body.textContent).toMatch(/may have gone through/i));
    await act(async () => {
      await r.queryClient.refetchQueries();
    });
    expect(await screen.findByText(strings['band.stale'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: kitStates['err.stopTracking'] })).toBeInTheDocument();
  });
});
