// The stopped-computer message links to Computers through the shell's page links: a Hub link goes
// through the router, and a hidden page drops the button (no classic Hub to fall back to).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import page from './page';
import strings from './strings.en.json';

const link = vi.hoisted(() => ({ current: undefined as PageLink | null | undefined }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    usePageLink: (id: string) => (id === 'computers' && link.current !== undefined ? link.current : kit.usePageLink(id)),
  };
});

async function stopped() {
  const r = await renderPage(page);
  const fjord = fixtureWorld.computers.find((c) => c.name === 'fjord');
  if (!fjord) throw new Error('no fjord');
  act(() => {
    chooseComputer({ id: fjord.id, project_id: fjord.project_id, status: fjord.status });
  });
  expect(await screen.findByText(strings['st.title.stopped'])).toBeInTheDocument();
  expect(screen.getByText(/fjord is not running/)).toBeInTheDocument();
  return r;
}

describe('programs: Open Computers on a stopped computer', () => {
  afterEach(() => {
    link.current = undefined;
    vi.restoreAllMocks();
  });

  it('a Hub link opens Computers in the Hub', async () => {
    link.current = { kind: 'hub', href: '/computers' };
    const { router } = await stopped();
    await userEvent.click(screen.getByRole('button', { name: strings['st.openComputers'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
  });

  it('a hidden Computers page keeps the message and drops the button', async () => {
    link.current = null;
    await stopped();
    expect(screen.queryByRole('button', { name: strings['st.openComputers'] })).toBeNull();
  });
});
