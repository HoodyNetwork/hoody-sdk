// Vitest: New note has no "Note created" end state. A create proven to exist closes the dialog and opens
// that note beside the list (the same ?sel= a row click writes: <computer id>~<note id>); Check again proving it does the
// same. A create whose outcome is unknown stays pending in the dialog and goes nowhere.
import { useMemo } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

// Every create the page sends, counted at the Api (the fixtures' own, unchanged otherwise).
const sent = vi.hoisted(() => ({ creates: 0 }));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof Data>();
  return {
    ...m,
    useApi: () => {
      const api = m.useApi();
      return useMemo(() => ({ ...api, send: (...a: Parameters<typeof api.send>) => { sent.creates += 1; return api.send(...a); } }), [api]);
    },
  };
});
beforeEach(() => { sent.creates = 0; });

const ATLAS = 'c0a7150000000000000000a1';
const OURS = new RegExp(`^${ATLAS}~[0-9a-f]{22}08$`);
const sel = (r: Awaited<ReturnType<typeof renderPage>>) => new URLSearchParams(r.router.state.location.searchStr).get('sel');
const gone = ['Note created', 'It is in Notes on', 'It looks like yours'];

async function createNamed(state?: string) {
  const r = await renderPage(page, state ? { state } : {});
  await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }, { timeout: 8000 }))[0] as HTMLElement);
  await userEvent.type(await screen.findByLabelText(strings['new.field']), 'Q4 plan');
  await userEvent.click(screen.getByRole('button', { name: strings['new.create'] }));
  return r;
}
const noCreatedNotice = () => { for (const words of gone) expect(screen.queryByText(new RegExp(words))).toBeNull(); };

describe('New note: after the create', () => {
  it('a proven create closes the dialog and opens the new note, with no "created" notice', async () => {
    const r = await createNamed();
    await waitFor(() => expect(sel(r)).toMatch(OURS), { timeout: 8000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The note itself: its detail (the new-tab button is the detail header's) and its frame.
    expect(await screen.findByRole('button', { name: strings['action.openNoteTab'] })).toBeInTheDocument();
    expect(document.querySelector('iframe')?.getAttribute('src')).toContain((sel(r) ?? '~').split('~')[1]);
    // The list was read again: the new note is a row of its computer, and it is the selected one.
    const row = await within(screen.getByRole('table', { name: strings.table })).findByRole('row', { name: /Q4 plan/ }, { timeout: 8000 });
    expect(row.getAttribute('data-row-id')).toBe(sel(r));
    expect(row).toHaveAttribute('aria-selected', 'true');
    noCreatedNotice();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('an unknown outcome stays pending in the dialog and does not navigate', async () => {
    const r = await createNamed('createPending');
    await screen.findByRole('button', { name: 'Check again' }, { timeout: 8000 });
    expect(screen.getByRole('dialog', { name: strings['new.title'] })).toBeInTheDocument();
    expect(screen.getByText(strings['new.pending'])).toBeInTheDocument();
    expect(sel(r)).toBeNull();
    // Check again reads; not found: still pending, still here.
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText(strings['new.unsure'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(sel(r)).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    // Check again only read: the one create that went out is still the only one.
    expect(sent.creates).toBe(1);
    noCreatedNotice();
  });

  it('Check again proving the note closes the dialog and opens it', async () => {
    const r = await createNamed('createFound');
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }, { timeout: 8000 }));
    await waitFor(() => expect(sel(r)).toMatch(OURS), { timeout: 8000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const row = await within(screen.getByRole('table', { name: strings.table })).findByRole('row', { name: /Q4 plan/ }, { timeout: 8000 });
    expect(row).toHaveAttribute('aria-selected', 'true');
    // Found by a read: the one create that went out is still the only one.
    expect(sent.creates).toBe(1);
    noCreatedNotice();
  });
});
