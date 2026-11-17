// The Code tab on the page (fixtures): the header's assistant button shows on this tab and opens its drawer on the
// script shown; the editor's toolbar holds Copy code and Download.
import { renderPage, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

describe('the Code tab on the page', () => {
  it('Ask the assistant, in the header, opens the assistant drawer from the Code tab', async () => {
    await renderPage(page, { path: '/scripts?sel=atlas.00a1~weather.ts&tab=code' });
    expect(await screen.findByRole('button', { name: strings['code.copy'] }, { timeout: 20000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['code.download'] })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: strings['ai.primary'] }));
    expect(await screen.findByRole('textbox', { name: strings['ai.ask'] }, { timeout: 5000 })).toBeTruthy();
  }, 60000);
});
