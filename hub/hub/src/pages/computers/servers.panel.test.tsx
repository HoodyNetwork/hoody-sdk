// On the Servers view the whole row opens the server panel; its "N computers" link still goes to the list.
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import sd from './parts/ServerDetail.strings.en.json';

const SERVER = fixtureWorld.servers[0];
if (!SERVER) throw new Error('fixture servers');
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;

describe('computers: Servers rows open the server panel', () => {
  it('pressing a row opens its panel, titled with the server, and closing it leaves no id in the URL', async () => {
    await renderPage(page, { path: '/computers/servers' });
    await userEvent.click(await rowOf(SERVER.name));
    const d = await screen.findByRole('dialog', { name: SERVER.name });
    expect(d).toBeInTheDocument();
    expect(window.location.href).not.toContain(SERVER.id);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // The rental's Status fact, as read in the panel.
  const statusOf = (d: HTMLElement) => [...d.querySelectorAll('dt')].find((x) => x.textContent === sd['sd.status'])?.nextElementSibling?.textContent;
  it('with rental history, each row opens its own rental, not the first one of that server', async () => {
    await renderPage(page, { path: '/computers/servers', state: 'rentalHistory' });
    const rows = async () => (await screen.findAllByText(SERVER.name, { selector: 'strong' }, { timeout: 8000 })).map((n) => n.closest('[data-row-id]') as HTMLElement);
    const [older, newer] = await rows();
    expect(older?.getAttribute('data-row-id')).not.toBe(newer?.getAttribute('data-row-id'));
    await userEvent.click(newer!);
    expect(statusOf(await screen.findByRole('dialog', { name: SERVER.name }))).toBe(sd['sd.status.active']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click((await rows())[0]!);
    const d = await screen.findByRole('dialog', { name: SERVER.name });
    expect(statusOf(d)).toBe(sd['sd.status.expired']);
  });

  it('the computers link in the row goes to the list instead of opening the panel', async () => {
    await renderPage(page, { path: '/computers/servers' });
    const link = within(await rowOf(SERVER.name)).getByRole('link');
    expect(link.getAttribute('href')).toContain(`server=${SERVER.id}`);
    await userEvent.click(link);
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByRole('dialog', { name: SERVER.name })).toBeNull();
  });
});
