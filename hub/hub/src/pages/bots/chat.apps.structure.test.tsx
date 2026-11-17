// Vitest: a chat app's Settings tab draws its named groups as one kind of section. "This chat app" and "Main settings"
// are sibling sections with the same heading (same level, same look), not a bare group above a framed one.
import { renderPage, screen, userEvent } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('chat app settings: sections', () => {
  it('This chat app and Main settings are the same kind of section', async () => {
    await renderPage(page, { state: undefined, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=ch-tg` });
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.settings'] }));
    const app = await screen.findByRole('heading', { name: strings['chan.set.app'] });
    const main = await screen.findByRole('heading', { name: strings['set.main'] });
    expect(app.tagName).toBe(main.tagName);
    expect(app.className).toBe(main.className);
    // Both headings name a section of the tab; the group of rows inside keeps the name for assistive tech.
    expect(app.closest('section')?.id).toBe('bot-chat-app');
    expect(main.closest('section')?.id).toBe('bot-chat-settings-main');
    expect(screen.getByRole('group', { name: strings['chan.set.app'] })).toBeInTheDocument();
  }, 60_000);
});
