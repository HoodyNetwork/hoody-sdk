// "Add one from another realm" lists each computer with its
// colour mark (kit ComputerMark, the API's colour as the account list gives it) and keeps its realms line; a hostile
// or missing colour draws no mark.
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

const LAB = fixtureWorld.realm('Lab').id;

describe('computers: the import picker draws each computer\'s colour', () => {
  it('atlas shows its mark (#3B82F6 in the fixture) and still says which realms hold it', async () => {
    await renderPage(page, { path: '/computers', state: 'emptyElsewhere', realm: LAB });
    await userEvent.click(await screen.findByRole('button', { name: strings['zero.empty.import'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['importd.title'] });
    const atlas = await within(d).findByRole('radio', { name: /^atlas\b/ }, { timeout: 8000 });
    expect(atlas.querySelector('[data-computer-color]')?.getAttribute('data-computer-color')).toBe('#3B82F6');
    expect(atlas).toHaveTextContent(interpolate(strings['importd.in'], { realms: 'Personal' }));
    for (const row of within(d).getAllByRole('radio')) expect(row.querySelectorAll('[data-computer-color]').length).toBe(1);
  }, 40000);

  it('a hostile colour (atlas) and a missing one (borealis) draw no mark and reach no style; the others keep theirs', async () => {
    await renderPage(page, { path: '/computers', state: 'emptyElsewhereColours', realm: LAB });
    await userEvent.click(await screen.findByRole('button', { name: strings['zero.empty.import'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['importd.title'] });
    const markOf = async (name: string) => (await within(d).findByRole('radio', { name: new RegExp(`^${name}\\b`) }, { timeout: 8000 })).querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null;
    expect(await markOf('atlas')).toBeNull();
    expect(await markOf('borealis')).toBeNull();
    expect(await markOf('granite')).not.toBeNull();
    expect(within(d).getByRole('radio', { name: /^atlas\b/ })).toHaveTextContent(interpolate(strings['importd.in'], { realms: 'Personal' }));
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style')).not.toContain('url(');
  }, 40000);
});
