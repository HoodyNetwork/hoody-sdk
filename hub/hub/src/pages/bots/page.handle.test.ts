// Vitest: ?computer= takes a computer's handle (name.last4), the address Computers and Logs link with, as well as its id
// (the filter's own value): the handle reads as that computer at once and the URL is rewritten to the id in place, so
// the filter chip, Back and a copied link all agree.
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const param = (router: { state: { location: { search: unknown } } }) => (router.state.location.search as Record<string, string | undefined>).computer;

describe('bots list: ?computer= as a handle', () => {
  it('a running computer\'s handle lists that computer\'s Bots only, and the URL carries its id', async () => {
    const { router } = await renderPage(page, { path: '/bots?computer=atlas.tlas' });
    const table = await screen.findByRole('table', { name: strings.title });
    await within(table).findByRole('row', { name: /Chief/ });
    expect(within(table).queryByRole('row', { name: /Scout/ })).toBeNull();
    await waitFor(() => expect(param(router)).toBe('c-atlas'));
    // Replaced in place: Back does not return to the handle's address (which would be rewritten again).
    expect(router.history.length).toBe(1);
  });

  it('a stopped computer\'s handle says that computer is stopped, never "not one of yours"', async () => {
    const { router } = await renderPage(page, { path: '/bots?computer=boreal.real' });
    expect(await screen.findByText(strings['list.noMatchStopped'].replace('{{name}}', 'boreal'))).toBeInTheDocument();
    expect(screen.queryByText(strings['list.noMatchUnknown'])).toBeNull();
    await waitFor(() => expect(param(router)).toBe('c-boreal'));
  });

  it('a handle of no computer here stays as typed and says so, and rewrites nothing', async () => {
    const { router } = await renderPage(page, { path: '/bots?computer=ghost.0000' });
    expect(await screen.findByText(strings['list.noMatchUnknown'])).toBeInTheDocument();
    expect(screen.queryByText(/ghost/)).toBeNull();
    expect(param(router)).toBe('ghost.0000');
  });

  it('an id still works as it did and is left alone', async () => {
    const { router } = await renderPage(page, { path: '/bots?computer=c-boreal' });
    expect(await screen.findByText(strings['list.noMatchStopped'].replace('{{name}}', 'boreal'))).toBeInTheDocument();
    expect(param(router)).toBe('c-boreal');
  });
});
