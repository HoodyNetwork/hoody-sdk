// Programs > Ports & aliases: a Hoody kit port's Program cell must not run the "Hoody kit" tag
// into the program's name ("Hoody kit hoody-n..."), cut while the Address column had room. The cell is the kit's
// CellLines now: the name on its own line, the tag as its sub-line; the column fits its longest name.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const PATH = '/programs?tab=ports';

describe('Ports: a Hoody kit program cell', () => {
  it('shows the name on its own line and the Hoody kit tag under it, never one run of text', async () => {
    await renderPage(page, { path: PATH });
    const table = await screen.findByRole('table', { name: strings['pa.ports.title'] }, { timeout: 10000 });
    const name = await within(table).findByText('hoody-notes', undefined, { timeout: 10000 });
    const tag = within(name.closest('td') as HTMLElement).getByText(strings['pa.ports.kit']);
    expect(name.contains(tag), 'the tag is not inside the name line').toBe(false);
    expect(tag.contains(name)).toBe(false);
    // One cell, the name first and the tag after it: the name is a line of its own (its whole text), never a text run
    // beside the tag (today's cell: "Hoody kit hoody-notes" in one line, so no element holds the name alone).
    expect(name.closest('td')).toBe(tag.closest('td'));
    expect(name.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
