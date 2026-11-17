// Vitest: a note lives in its computer's category:
// on the scripts list, what one computer says about its scripts (turned off, private, no answer, an older Scripts
// program) is the first row of that computer's own group, through the kit's shared group note, never a list above the
// table. A computer with nothing to list still gets its group, with the note as its only row; the note does not name the
// computer again (its group header does).
import { renderPage, screen, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const table = () => screen.findByRole('table', { name: strings.title }, { timeout: 5000 });
const rowsText = () => [...document.querySelectorAll('table tbody tr')].map((tr) => tr.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean);
const noteRows = () => [...document.querySelectorAll('table tbody tr')].filter((tr) => tr.querySelector('[data-group-note]'));
const S = strings as Record<string, string>;

describe('the scripts list: each computer\'s problem in its own group', () => {
  it('turned off, private and older-program computers each say so in their own group, with no list above the table', async () => {
    await renderPage(page);
    const tbl = await table();
    await within(tbl).findAllByRole('row', { name: /Weather lookup/ });
    const texts = rowsText();
    for (const [name, key] of [['borealis', 'group.problem.old'], ['cedar', 'group.problem.off'], ['harbor', 'group.problem.private']] as const) {
      expect(S[key], `${key} is a string`).toBeTruthy();
      const head = texts.findIndex((x) => x.startsWith(name));
      expect(head, `${name} has its group`).toBeGreaterThan(-1);
      expect(texts[head + 1], `${name}'s first row is its note`).toContain(S[key]);
      // The group header names the computer: its note does not, and it is said once (no list above the table too).
      expect(S[key]).not.toContain('{{name}}');
      expect(screen.getAllByText(S[key]!)).toHaveLength(1);
    }
    // One note row per problem computer, and none is also a script row.
    expect(noteRows()).toHaveLength(3);
    expect(document.querySelectorAll('table tbody tr[data-row-id] [data-group-note]')).toHaveLength(0);
  });

  it('a computer with nothing to list keeps its group: its note is its only row', async () => {
    await renderPage(page);
    await within(await table()).findAllByRole('row', { name: /Weather lookup/ });
    const texts = rowsText();
    const cedar = texts.findIndex((x) => x.startsWith('cedar'));
    const harbor = texts.findIndex((x) => x.startsWith('harbor'));
    // cedar (off) then harbor (private): each header, then its note, then the next header.
    expect(harbor - cedar).toBe(2);
  });

  // With no script at all the table draws its empty state and no group, so the notes name their computer
  // above the list instead of being lost.
  it('with no script anywhere, the off computer still says so, naming itself, beside the empty state', async () => {
    await renderPage(page, { state: 'emptyOff' });
    const note = await screen.findByText(`cedar: ${S['group.problem.off']}`, undefined, { timeout: 5000 });
    expect(note.closest('[data-group-notes-empty]')).not.toBeNull();
    expect(screen.getByText(strings['empty.title'])).toBeInTheDocument();
    expect(screen.queryByText(/^atlas: /)).toBeNull();
  });

});
