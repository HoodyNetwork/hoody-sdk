// Programs > System programs opened, then a program's Logs, then Back: the group is still open. Leaving the
// page unmounts the list, so the open state lives with the table's remembered view, not in the component.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

// Leave the page (as a program's Logs does: another page) and come Back through the same history: the list unmounts and
// mounts again, and the Hub is not booted again.
const leaveAndBack = async (router: Awaited<ReturnType<typeof renderPage>>['router']) => {
  await act(async () => { router.history.push('/elsewhere'); });
  await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
  await act(async () => { router.history.back(); });
};

const sysHeader = async () => screen.findByRole('button', { name: new RegExp(strings['group.system']) }, { timeout: 8000 });

describe('System programs open state', () => {
  beforeEach(() => {
    opsStore.reset();
    // eslint-disable-next-line no-restricted-properties -- a first visit: no remembered table view from an earlier case
    window.localStorage.clear();
  });

  it('collapsed on a first visit', async () => {
    await renderPage(page);
    expect((await sysHeader()).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('hoody-agent')).toBeNull();
  });

  it('opened, the page left and come back to: still open, its programs shown', async () => {
    const { router } = await renderPage(page);
    await userEvent.click(await sysHeader());
    expect(await screen.findByText('hoody-agent')).toBeInTheDocument();
    await leaveAndBack(router);
    await waitFor(async () => expect((await sysHeader()).getAttribute('aria-expanded')).toBe('true'));
    expect(await screen.findByText('hoody-agent')).toBeInTheDocument();
  });

  it('closed again, it comes back closed', async () => {
    const { router } = await renderPage(page);
    await userEvent.click(await sysHeader());
    await screen.findByText('hoody-agent');
    await userEvent.click(await sysHeader());
    await waitFor(() => expect(screen.queryByText('hoody-agent')).toBeNull());
    await leaveAndBack(router);
    expect((await sysHeader()).getAttribute('aria-expanded')).toBe('false');
  });
});
