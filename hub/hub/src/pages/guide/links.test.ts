// Vitest: the guide's security checks (computer links, section index URLs).
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import strings from './strings.en.json';
import page from './page';

// A jump scrolls the page's own scroller through the kit (scrollSettingsSection).
const jump = vi.hoisted(() => vi.fn());
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), scrollSettingsSection: jump }));

describe('guide links', () => {
  it('the facts rail links the computer by name.last4, never the full id', async () => {
    await renderPage(page);
    const link = await screen.findByRole('link', { name: /atlas/ });
    expect(link.getAttribute('href')).toMatch(/sel=atlas\.[0-9a-f]{4}(&|$)/);
    expect(link.getAttribute('href')).not.toMatch(/[0-9a-f]{24}/);
  });

  it('the section index keeps a real router URL, so a new tab opens the section', async () => {
    await renderPage(page);
    const link = await screen.findByRole('link', { name: strings['ix.connect'] });
    expect(link.getAttribute('href')).toBe('#/guide#connect');
  });

  it('"Make a key" goes to the keys page and its footer link is a nav link, not blue inline text', async () => {
    await renderPage(page, { path: '/guide?door=coding' });
    const link = await screen.findByRole('link', { name: strings['link.keys'] });
    expect(link.getAttribute('href')).toBe('#/keys');
    expect(link.className).toMatch(/nav/);
  });
});

describe('guide j/k', () => {
  it('moves between sections with j, and not while a dialog or menu is open', async () => {
    jump.mockClear();
    await renderPage(page);
    await screen.findByRole('link', { name: strings['ix.connect'] });
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    await userEvent.keyboard('j');
    expect(jump).not.toHaveBeenCalled();
    menu.remove();
    await userEvent.keyboard('j');
    await waitFor(() => expect(jump).toHaveBeenCalledTimes(1));
  });
});
