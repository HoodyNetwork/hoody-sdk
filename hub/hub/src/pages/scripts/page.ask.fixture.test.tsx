// Vitest on the Ask drawer in fixture mode (the offline Hub): the fixture twin of the ask hook has no store, so the answer
// carries what its press hid, and the drawer puts the answer into a proposal exactly as it does live.
import { renderPage, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

describe('the Ask drawer in fixture mode', () => {
  it('an answer is a proposal: the press\'s own hidden values come back with it', async () => {
    await renderPage(page, { path: '/scripts?sel=atlas.00a1~weather.ts&ai=1' });
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }, { timeout: 5000 }), 'return 404 for unknown cities');
    await userEvent.click(await screen.findByRole('button', { name: strings['ai.send'] }));
    expect(await screen.findByText('Adds a 404 for unknown cities.', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText(strings['ai.err.reopened'])).toBeNull();
  });
});
