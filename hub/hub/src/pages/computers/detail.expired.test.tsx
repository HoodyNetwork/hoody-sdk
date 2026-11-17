// An expired computer (server_expired: its server's rental ended) offers Start nowhere: the API
// answers 409 COMPUTER_EXPIRED to every lifecycle call on it. Not in the head, not on the Open on tiles, not in the
// computer's menu, not in the list; the head shows the way forward instead (the server it ran on).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import { allowedOps } from './logic';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

const head = async () => {
  const h = await screen.findByRole('heading', { level: 2, name: 'atlas' }, { timeout: 20000 });
  return h.closest('header') as HTMLElement;
};

describe('computers: an expired computer offers no Start', () => {
  it('allowedOps: no lifecycle op on an expired row, whatever its status', () => {
    expect(allowedOps({ status: 'stopped', server_expired: true }, 'all')).toEqual([]);
    expect(allowedOps({ status: 'running', server_expired: true }, 'all')).toEqual([]);
    expect(allowedOps({ status: 'stopped', server_expired: false }, 'all')).toEqual(['start']);
    expect(allowedOps({ status: 'stopped' }, 'all')).toEqual(['start']);
  });

  it('the head has no Start; it links to the server instead', async () => {
    await renderPage(page, { state: 'detailExpired', path: '/computers?sel=atlas.00a1' });
    const hd = await head();
    expect(within(hd).queryByRole('button', { name: new RegExp(`^${strings['menu.start']}`) })).toBeNull();
    const way = within(hd).getByRole('link', { name: interpolate(strings['head.toServer'], { server: 'n12' }) });
    expect(way.getAttribute('href') ?? '').toContain(links.server('n12'));
  }, 40000);

  it('the Open on tiles say Expired, never Start, and the menu holds no Start', async () => {
    await renderPage(page, { state: 'detailExpired', path: '/computers?sel=atlas.00a1' });
    const hd = await head();
    const uses = await screen.findByRole('region', { name: interpolate(strings['uses.title'], { name: 'atlas' }) }, { timeout: 8000 });
    expect(within(uses).queryByText(strings['menu.start'])).toBeNull();
    expect(within(uses).getAllByText(strings['use.expired']).length).toBeGreaterThan(0);
    // "On atlas" never asks to start it either: its programs row says it has expired.
    expect(screen.queryByText(strings['on.programs.notRunning'])).toBeNull();
    expect(screen.getByText(strings['on.programs.expired'])).toBeInTheDocument();
    await userEvent.click(within(hd).getByRole('button', { name: interpolate(strings['menu.actions'], { name: 'atlas' }) }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: new RegExp(`^${strings['menu.start']}`) })).toBeNull();
  }, 40000);
});
