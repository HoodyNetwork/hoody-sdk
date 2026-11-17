// Vitest: the Logs bar's "More for this view" menu's share item. Its label is the short verb, and the line under
// it says who the link works for; that line is also the item's accessible description.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import strings from './strings.en.json';

const { default: page } = await import('./page');

describe('Logs page: Copy link', () => {
  it('says who the link works for, under the label and as its description', async () => {
    await renderPage(page);
    await userEvent.setup().click(await screen.findByRole('button', { name: strings['act.barMore'] }));
    const link = await screen.findByRole('menuitem', { name: 'Copy link' });
    expect(link).toHaveAccessibleDescription(strings['v.copyDesc']);
    expect(link).toHaveTextContent(strings['v.copyDesc']);
  });
});
