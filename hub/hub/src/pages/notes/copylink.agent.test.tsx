// Vitest: Copy for an agent beside Copy link (the command, what it is and its
// caveat said on the item; disabled with its reason for an id a command cannot carry), and a link whose computer is past
// the page's first MAX_COMPUTERS still opens the note.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld, manyComputers } from '@core';
import page from './page';
import strings from './strings.en.json';

afterEach(() => { vi.restoreAllMocks(); });

const clipboard = () => {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
  return written;
};
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const NB = 'b2c3d4e5f6a7b8c9d0e1f2a3'; // the fixture Notes' notebook (data.ts fixtureApi)

async function menuOf(title: RegExp, state?: string) {
  await renderPage(page, state ? { state } : {});
  const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
  const row = await within(table).findByRole('row', { name: title }, { timeout: 8000 });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menuitem', { name: new RegExp(`^${strings['action.copyAgent']}`) });
}

describe('Notes: Copy for an agent', () => {
  it('copies the command that reads this note on its computer, and says what it is and who can read it', async () => {
    const item = await menuOf(/Weekly plan/);
    expect(item.textContent).toContain(strings['action.copyAgentHint'].replace('{{computer}}', 'atlas'));
    const written = clipboard();
    fireEvent.click(item);
    await waitFor(() => expect(written.length).toBe(1));
    expect(written[0]).toMatch(new RegExp(`^hoody --computer ${atlas.id} notes document get --notebook-id ${NB} --node-id [0-9a-z]{24} --format md$`));
  });

  it('is disabled with its reason when an id cannot be written as a command, never a cut-short command', async () => {
    const item = await menuOf(/Weekly plan/, 'hostileId');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item.textContent).toContain(strings['action.copyAgentNo']);
    const written = clipboard();
    fireEvent.click(item);
    await new Promise((r) => setTimeout(r, 50));
    expect(written).toEqual([]);
    // Copy link still works there: the link encodes the id.
    expect(screen.getByRole('menuitem', { name: strings['action.copyLink'] })).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Notes: a link past the first computers', () => {
  it('opens a note of the ninth computer', async () => {
    const ninth = manyComputers(1, 9)[0]!; // fixtures.ts state nine
    await renderPage(page, { state: 'nine', path: `/notes?sel=${ninth.id}~0f0e0d0c0b0a090807060504` });
    expect(await screen.findByRole('button', { name: strings['action.openNoteTab'] }, { timeout: 8000 })).toBeInTheDocument();
    const frame = screen.getByTitle(strings['note.frame'].replace('{{title}}', strings['note.title']));
    expect(frame.getAttribute('src')).toContain('/0f0e0d0c0b0a090807060504?sidebar=hidden');
  });
});
