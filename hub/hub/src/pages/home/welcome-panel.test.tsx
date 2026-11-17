// Vitest: Home's Welcome panel ("What is Hoody?") and the computer it shows on the map. The panel appears exactly when
// it did before; what it draws beside the line follows what Home read: no card without a shown computer, the selected
// computer's name, state word and place otherwise, and no pin for a country the map table does not hold.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it } from 'vitest';
import './testWaits';
import page from './page';
import strings from './strings.en.json';

const panel = () => document.querySelector('[aria-labelledby="home-welcome-lead"]') as HTMLElement | null;
const stage = () => panel()!.querySelector('[data-intro-stage]') as HTMLElement;

describe('Home: the Welcome panel on the map', () => {
  it('one running computer: the eyebrow, the line, Open, the tour, Hide, and the card with its name, state word and tiles, pinned', async () => {
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    await screen.findByRole('link', { name: strings['intro.tour'] }, { timeout: 10000 });
    const p = panel()!;
    expect(p.textContent).toContain(strings['intro.reopen']);
    expect(screen.getByText(strings['intro.lead'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['intro.hideLabel'] })).toBeTruthy();
    const s = stage();
    expect(s.textContent).toContain(strings['context.running']);
    for (const id of ['agent', 'terminal', 'desktop', 'files', 'browser'] as const) expect(s.textContent).toContain(strings[`intro.tile.${id}`]);
    expect(s.querySelectorAll('circle').length).toBe(2);
    // A picture: nothing in it takes focus.
    expect(s.querySelector('a, button, [tabindex]')).toBeNull();
  });

  it('several computers: the card is the selected one (the one the header names)', async () => {
    await renderPage(page, { state: 'many', path: '/home?intro=1' });
    await screen.findByRole('link', { name: strings['intro.tour'] }, { timeout: 10000 });
    // The card names one computer, and it is the one the page's header names too.
    const name = stage().querySelector('strong')!.textContent!;
    expect(name.length).toBeGreaterThan(0);
    const outside = Array.from(document.querySelectorAll('header, h1, [data-context-line], nav')).some((el) => el.textContent!.includes(name));
    expect(outside || screen.getAllByText(name).length >= 2).toBe(true);
  });

  it('no shown computer (an empty realm): the panel without the card and the pin', async () => {
    await renderPage(page, { state: 'emptyRealm', path: '/home?intro=1' });
    await screen.findByText(strings['intro.lead']);
    expect(stage().textContent).toBe('');
    expect(stage().querySelectorAll('circle').length).toBe(0);
  });

  it('Hide closes the panel', async () => {
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    const hide = await screen.findByRole('button', { name: strings['intro.hideLabel'] }, { timeout: 10000 });
    await userEvent.click(hide);
    await waitFor(() => expect(panel()).toBeNull());
  });
});
