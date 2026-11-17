// Vitest: a Projects card shows its name and its row menu in one band at its top
// (DataTable cardShape 'band'), the facts under it, and no bottom band holding only the menu.
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureWorld, localSetting } from '@core';
import { renderPage, screen, within } from '@app/testing';
import page from './page';

const present = () => localSetting('hub.v3.table.present.machines');
afterEach(() => {
  present().set(null);
});

const HOME = fixtureWorld.projects[0]!;

describe('projects: the header band', () => {
  it("puts the project's name and its row menu in the card's top band, with no bottom band", async () => {
    await renderPage(page, { path: '/computers/projects' });
    const name = await screen.findByText(HOME.name, { selector: 'strong' }, { timeout: 8000 });
    const card = name.closest('[data-row-id]') as HTMLElement;
    const head = card.querySelector('[class*="cardHeadBand"]') as HTMLElement | null;
    expect(head).not.toBeNull();
    expect(head!.contains(name)).toBe(true);
    expect(head!.contains(within(card).getByRole('button', { name: /actions/i }))).toBe(true);
    expect(card.querySelector('[class*="cardBottom"]')).toBeNull();
  });
});
