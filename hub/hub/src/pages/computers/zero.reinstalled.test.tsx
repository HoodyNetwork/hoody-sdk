// Vitest: the zero state of an account whose expired computers' server was reinstalled. Nothing renews them:
// the page says what happened and its action opens Projects (where each project's Computers tab deletes them). Beside
// it: Get a computer only when the account has a server or slice with room for one (and this login may create);
// otherwise Rent a server, so an ex-renter with no server left is never stuck.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { links } from './links';
import { links as market } from '../market/links';
import page from './page';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const button = (name: string) => screen.queryByRole('button', { name });

describe('computers zero state: a reinstalled server', () => {
  it('with no server left: says what happened, offers Projects and Rent a server, no Create and no Renew', async () => {
    await renderPage(page, { state: 'emptyReinstalled', realm: R1 });
    expect(await screen.findByText(strings['zero.reinstalled.title'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['zero.reinstalled.body'])).toBeInTheDocument();
    expect(button(strings['zero.reinstalled.projects'])).not.toBeNull();
    expect(await screen.findByRole('button', { name: strings['zero.capacity.rent'] })).toBeInTheDocument();
    expect(button(strings['zero.empty.create'])).toBeNull();
    expect(button(strings['zero.expired.renew'])).toBeNull();
    expect(screen.queryByText(strings['zero.expired.title'])).toBeNull();
  }, 30000);

  it('Rent a server opens the market', async () => {
    const r = await renderPage(page, { state: 'emptyReinstalled', realm: R1 });
    await userEvent.click(await screen.findByRole('button', { name: strings['zero.capacity.rent'] }, { timeout: 8000 }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe(market.list));
  }, 30000);

  it('with a server that has room: offers Projects and Get a computer, no Rent and no Renew', async () => {
    await renderPage(page, { state: 'emptyReinstalledServer', realm: R1 });
    expect(await screen.findByText(strings['zero.reinstalled.title'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(button(strings['zero.reinstalled.projects'])).not.toBeNull();
    expect(await screen.findByRole('button', { name: strings['zero.empty.create'] })).toBeInTheDocument();
    expect(button(strings['zero.capacity.rent'])).toBeNull();
    expect(button(strings['zero.expired.renew'])).toBeNull();
  }, 30000);

  it('with only a slice whose room is not said: Get a computer and Rent a server', async () => {
    await renderPage(page, { state: 'emptyReinstalledSlice', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.empty.create'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(button(strings['zero.capacity.rent'])).not.toBeNull();
    expect(button(strings['zero.reinstalled.projects'])).not.toBeNull();
  }, 30000);

  it('with the server list unreadable: Rent a server, never Get a computer on a guess', async () => {
    await renderPage(page, { state: 'emptyReinstalledServersDown', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.capacity.rent'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(button(strings['zero.reinstalled.projects'])).not.toBeNull();
    expect(button(strings['zero.empty.create'])).toBeNull();
  }, 30000);

  it('an expired account is unchanged: Renew, no Projects, no Rent and no Create', async () => {
    await renderPage(page, { state: 'emptyExpired', realm: R1 });
    expect(await screen.findByText(strings['zero.expired.title'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(button(strings['zero.expired.renew'])).not.toBeNull();
    expect(button(strings['zero.reinstalled.projects'])).toBeNull();
    expect(button(strings['zero.capacity.rent'])).toBeNull();
    expect(button(strings['zero.empty.create'])).toBeNull();
  }, 30000);

  it('Projects opens the Projects view of this page', async () => {
    const r = await renderPage(page, { state: 'emptyReinstalled', realm: R1 });
    await userEvent.click(await screen.findByRole('button', { name: strings['zero.reinstalled.projects'] }, { timeout: 8000 }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe(links.projects));
  }, 30000);

  it('a shared-access (token) session never reads the setup state: the plain empty offer, no reinstalled words, no create', async () => {
    await renderPage(page, { state: 'emptyReinstalledLimited', realm: R1 });
    // A token session never reads the setup state, so it shows the plain empty offer: never the reinstalled words.
    await screen.findByText(strings['zero.empty.title'], undefined, { timeout: 8000 });
    expect(screen.queryByText(strings['zero.reinstalled.title'])).toBeNull();
    expect(button(strings['zero.empty.create'])).toBeNull();
    expect(button(strings['zero.capacity.rent'])).toBeNull();
  }, 30000);
});
