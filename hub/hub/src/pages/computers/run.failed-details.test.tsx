// A refused command says why on the Run tab, with Details under its title.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('computers: a refused command', () => {
  it('shows the reason and Details under its title', async () => {
    await renderPage(page, { state: 'runFailed', path: '/computers?sel=atlas.00a1&tab=run' });
    const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 30000 });
    await userEvent.type(box, 'ls{Enter}');
    const title = await screen.findByText(strings['run.failed'], {}, { timeout: 8000 });
    expect(within(title.parentElement!).getByRole('button', { name: /details/i })).toBeInTheDocument();
  }, 60000);
});

