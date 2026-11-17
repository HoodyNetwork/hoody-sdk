// The computer detail head: the name with its state on one line, one
// meta row (server as a link to its panel, project, realms, Current as a calm label with its meaning in the label's
// tip) and one action cluster (the way in, Make current, the computer's menu). Pinning the terminal to a board is on
// the Terminal tile of Open on, not repeated in the head.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { interpolate } from '@kit';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

const head = async () => {
  const h = await screen.findByRole('heading', { level: 2, name: 'atlas' }, { timeout: 20000 });
  return h.closest('header') as HTMLElement;
};

describe('computers: the detail head', () => {
  it('one meta row: the server links to its panel, the project and the realm by name, Current as a label', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const hd = await head();
    expect(within(hd).getByRole('link', { name: /n12/ }).getAttribute('href') ?? '').toContain(links.server('n12'));
    expect(within(hd).getByText('Home base')).toBeInTheDocument();
    expect(within(hd).getByText('Personal')).toBeInTheDocument();
    expect(within(hd).getByText(strings['current.label'])).toBeInTheDocument();
    // The meaning of Current is the label's own tip, never a loose info button beside it.
    expect(within(hd).queryByRole('button', { name: new RegExp(strings['default.title']) })).toBeNull();
  }, 40000);

  it('the colour mark sits with the name, before it; the state follows the name', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const hd = await head();
    const h2 = within(hd).getByRole('heading', { level: 2, name: 'atlas' });
    const mark = hd.querySelector('[data-computer-color]') as HTMLElement;
    expect(mark.closest('[data-detail-leading]')).not.toBeNull();
    expect(mark.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The state is the only thing beside the name: the mark is not repeated there.
    const state = within(hd).getByText(/running/i);
    expect(h2.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hd.querySelectorAll('[data-computer-color]')).toHaveLength(1);
  }, 40000);

  it('one action cluster: Open terminal and the menu; no board pin in the head', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const hd = await head();
    const way = within(hd).getByRole('button', { name: new RegExp(strings['menu.openTerminal']) });
    const menu = within(hd).getByRole('button', { name: interpolate(strings['menu.actions'], { name: 'atlas' }) });
    // The way in first, the computer's menu last.
    expect(way.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The menu is the kit's, the last control of the head (after the list control).
    expect(within(hd).getAllByRole('button').at(-1)).toBe(menu);
    expect(within(hd).queryByRole('button', { name: /board/i })).toBeNull();
  }, 40000);
});
