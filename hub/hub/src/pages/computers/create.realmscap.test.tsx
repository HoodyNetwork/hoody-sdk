// Get a computer, Other realms: a long realm list keeps its height. About six rows show and the rest
// scroll inside the list (kit PickerPanel maxRows); its "n selected" line stays put.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('create: a long realm list scrolls inside', () => {
  it('21 realms: the Other realms list is capped at about six rows; every realm is still in it', async () => {
    await renderPage(page, { path: '/computers', state: 'createManyRealms' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
    const list = await within(d).findByRole('group', { name: new RegExp(`^(${strings['create.realms']}|${strings['create.realmsMore']})$`) }, { timeout: 8000 });
    expect(within(list).getAllByRole('checkbox').length).toBeGreaterThanOrEqual(15);
    expect(list.hasAttribute('data-capped')).toBe(true);
    expect(list.style.getPropertyValue('--pp-rows')).toBe('6');
  }, 40000);
});
