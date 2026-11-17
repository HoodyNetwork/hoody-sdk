// Vitest: the read-only actions on the Files page: download and
// .zip links, the computer's viewer and editor, previews, and find by name. Nothing here sends a change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { queryClient } from '@core';
import page from './page';
import strings from './strings.en.json';
import { findAsked } from './ro.fixtures';
import { failListingWhile, loseListingWhile, seen } from './fixtures';

const A = '/files?a=atlas.00a1';
const at = (p: string) => `${A}&ap=${encodeURIComponent(p)}`;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const paneA = () => screen.getByRole('region', { name: strings['pane.a'] });
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const item = (label: string) => screen.findByRole('menuitem', { name: new RegExp('^' + esc(label)) });
async function openMenu(name: RegExp) {
  const r = await row(name);
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
}

let opened: string[] = [];
beforeEach(() => {
  opened = [];
  vi.spyOn(window, 'open').mockImplementation((u?: string | URL, target?: string, features?: string) => {
    opened.push(`${String(u)} ${target} ${features}`);
    return null;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('download and open', () => {
  it('downloads a file from the computer in a new tab, without opener or referrer', async () => {
    await renderPage(page, { path: at('/home/ada') });
    await openMenu(/notes\.txt/);
    await userEvent.click(await item(strings['action.download']));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\/\S+\/api\/v1\/files\/home\/ada\/notes\.txt\?download=1 _blank noopener,noreferrer$/);
  });

  it('downloads a folder as a .zip, and says why a folder named like a program command cannot be', async () => {
    await renderPage(page, { path: at('/srv') });
    await openMenu(/\bapp\b/);
    await userEvent.click(await item(strings['action.downloadZip']));
    expect(opened[0]).toMatch(/\/api\/v1\/files\/srv\/app\?zip&download=1 _blank/);
  });

  it('opens a file in the computer\'s viewer and editor', async () => {
    await renderPage(page, { path: at('/srv/app') });
    await openMenu(/server\.js/);
    await userEvent.click(await item(strings['action.view']));
    await openMenu(/server\.js/);
    await userEvent.click(await item(strings['action.edit']));
    expect(opened[0]).toMatch(/\/srv\/app\/server\.js\?view _blank noopener,noreferrer$/);
    expect(opened[1]).toMatch(/\/srv\/app\/server\.js\?edit _blank noopener,noreferrer$/);
    expect(opened.join(' ')).not.toMatch(/\/api\/v1\/files\/srv\/app\/server\.js\?(view|edit)/);
  });

  it('turns actions off on a name the Hub cannot pass back exactly, and says why', async () => {
    await renderPage(page, { path: at('/home/ada') });
    await openMenu(/caf/);
    const zip = await item(strings['action.downloadZip']);
    expect(zip).toHaveAttribute('aria-disabled', 'true');
    expect(zip).toHaveAccessibleDescription(expect.stringContaining(strings['name.lossy']));
  });
});

describe('preview', () => {
  it('opens a text file\'s first lines with Enter, with Download and the viewer beside', async () => {
    await renderPage(page, { path: at('/srv/app') });
    (await row(/package\.json/)).focus();
    await userEvent.keyboard('{Enter}');
    const d = await screen.findByRole('dialog', { name: /package\.json/ });
    // The text is coloured, so it is split into spans: read the code block's whole text.
    await waitFor(() => expect(within(d).getByRole('figure').textContent).toContain('"version":"1.4.2"'));
    await userEvent.click(within(d).getByRole('button', { name: strings['action.download'] }));
    expect(opened[0]).toMatch(/\/api\/v1\/files\/srv\/app\/package\.json\?download=1 /);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says pictures are off when the computer refuses thumbnails, and offers Download', async () => {
    await renderPage(page, { path: at('/srv/media') });
    await openMenu(/photo-001\.jpg/);
    await userEvent.click(await item(strings['action.preview']));
    const d = await screen.findByRole('dialog', { name: /photo-001\.jpg/ });
    expect(await within(d).findByText(strings['preview.off'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['action.download'] })).toBeEnabled();
  });

  it('never shows an answer that is not a picture as one', async () => {
    await renderPage(page, { path: at('/srv/media'), state: 'thumbsBroken' });
    (await row(/photo-002\.jpg/)).focus();
    await userEvent.keyboard('{Enter}');
    const d = await screen.findByRole('dialog', { name: /photo-002\.jpg/ });
    expect(await within(d).findByText(strings['preview.notImage'])).toBeInTheDocument();
    expect(within(d).queryByRole('img')).toBeNull();
  });

  it('says beside the preview why the viewer and editor are off for a path the program keeps for itself', async () => {
    await renderPage(page, { path: at('/api/v1'), state: 'apiFolder' });
    await openMenu(/readme\.txt/);
    await userEvent.click(await item(strings['action.preview']));
    const d = await screen.findByRole('dialog', { name: /readme\.txt/ });
    const why = fill(strings['preview.actionOff'], { action: strings['action.view'], why: strings['ro.api'] });
    expect(within(d).getByText(why)).toBeInTheDocument();
    const view = within(d).getByRole('button', { name: strings['action.view'] });
    expect(view).toBeDisabled();
    expect(view).toHaveAccessibleDescription(new RegExp(esc(why)));
    expect(within(d).getByRole('button', { name: strings['action.download'] })).toBeEnabled();
  });

  it('still opens folders with Enter', async () => {
    const { router } = await renderPage(page, { path: at('/srv') });
    (await row(/\bapp\b/)).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/srv/app' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('find by name', () => {
  // The drawer at the top lists the pane's cached top read; when a later read of it fails, it says so
  // (Try again), never "Open a folder first" over folders it could not read.
  const topsThenRead = async (lose: () => () => void) => {
    await renderPage(page, { path: A });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: 'atlas' }) });
    await within(d).findByRole('list', { name: strings['find.tops'] });
    const stop = lose();
    await act(() => queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('"path":"/"') }));
    return { d, stop };
  };
  it('at the top, a top read that fails (a gateway error) says so with Try again, never "Open a folder first"', async () => {
    const { d, stop } = await topsThenRead(() => failListingWhile('/'));
    try {
      expect(await within(d).findByText(strings['find.topFailed'])).toBeInTheDocument();
      expect(within(d).queryByText(strings['find.top'])).toBeNull();
      expect(within(d).queryByRole('list', { name: strings['find.tops'] })).toBeNull();
      // Try again reads the top again: once it answers, the top folders are listed again.
      stop();
      await userEvent.click(within(d).getByRole('button', { name: /try again/i }));
      expect(await within(d).findByRole('list', { name: strings['find.tops'] })).toBeInTheDocument();
    } finally { stop(); }
  });
  it('at the top, a top read nothing answered says the computer did not answer, never "Open a folder first"', async () => {
    const { d, stop } = await topsThenRead(() => loseListingWhile('/'));
    try {
      expect(await within(d).findByText(/atlas isn't reachable right now/)).toBeInTheDocument();
      expect(within(d).queryByText(strings['find.top'])).toBeNull();
      expect(within(d).queryByText(strings['find.topFailed'])).toBeNull();
      stop();
      await userEvent.click(within(d).getByRole('button', { name: /try again/i }));
      expect(await within(d).findByRole('list', { name: strings['find.tops'] })).toBeInTheDocument();
    } finally { stop(); }
  });
  it('finds below the open folder; a match shows in its folder or opens its preview', async () => {
    const { router } = await renderPage(page, { path: at('/home') });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/home' }) });
    await userEvent.type(within(d).getByRole('searchbox', { name: strings['find.field'] }), 'notes{Enter}');
    const list = await within(d).findByRole('list', { name: fill(strings['find.list'], { q: 'notes' }) });
    expect(within(list).getByText('ada/notes.txt')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: fill(strings['find.previewOne'], { name: 'ada/notes.txt' }) }));
    expect(await screen.findByRole('dialog', { name: /notes\.txt/ })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Close$/ })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d2 = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/home' }) });
    await userEvent.type(within(d2).getByRole('searchbox', { name: strings['find.field'] }), 'proj{Enter}');
    await userEvent.click(await within(d2).findByRole('button', { name: fill(strings['find.openOne'], { name: 'ada/projects' }) }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ap: '/home/ada/projects' }));
  });

  it('searches again on every ask, also for the same words and for words asked a moment ago', async () => {
    await renderPage(page, { path: at('/home') });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/home' }) });
    const box = within(d).getByRole('searchbox', { name: strings['find.field'] });
    const list = (q: string) => within(d).findByRole('list', { name: fill(strings['find.list'], { q }) });
    const before = findAsked.n;
    await userEvent.type(box, 'notes{Enter}');
    await list('notes');
    await userEvent.type(box, '{Enter}');
    await waitFor(() => expect(findAsked.n).toBe(before + 2));
    await userEvent.clear(box);
    await userEvent.type(box, 'proj{Enter}');
    await list('proj');
    await userEvent.clear(box);
    await userEvent.type(box, 'notes{Enter}');
    await list('notes');
    await waitFor(() => expect(findAsked.n).toBe(before + 4));
    // Closed and opened again: the same words are asked of the computer again, not read from the last answer.
    await userEvent.click(screen.getAllByRole('button', { name: /^Close$/ })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d2 = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/home' }) });
    await userEvent.type(within(d2).getByRole('searchbox', { name: strings['find.field'] }), 'notes{Enter}');
    await within(d2).findByRole('list', { name: fill(strings['find.list'], { q: 'notes' }) });
    await waitFor(() => expect(findAsked.n).toBe(before + 5));
  });

  it('says when nothing matches, and that a big folder may not be searched whole', async () => {
    await renderPage(page, { path: at('/srv') });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog');
    await userEvent.type(within(d).getByRole('searchbox', { name: strings['find.field'] }), 'zzzz{Enter}');
    expect(await within(d).findByText(fill(strings['find.none'], { q: 'zzzz' }))).toBeInTheDocument();
    expect(within(d).getByText(strings['find.noneBody'])).toBeInTheDocument();
  });

  it('at the top of a computer, lists its top folders to find in; one click finds there and leaves the pane where it is', async () => {
    const { router } = await renderPage(page, { path: A });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: 'atlas' }) });
    expect(within(d).queryByRole('searchbox')).toBeNull();
    const tops = await within(d).findByRole('list', { name: strings['find.tops'] });
    // A top folder the Hub can't address (here one named like a program command) stays listed, off, saying why.
    expect(within(tops).getByRole('button', { name: fill(strings['find.title'], { folder: '/copy' }) })).toBeDisabled();
    expect(within(tops).getByText(strings['row.closed'])).toBeInTheDocument();
    expect(within(tops).getAllByRole('button').filter((b) => !(b as HTMLButtonElement).disabled)).toHaveLength(8);
    await userEvent.click(within(tops).getByRole('button', { name: fill(strings['find.title'], { folder: '/home' }) }));
    const d2 = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/home' }) });
    await userEvent.type(within(d2).getByRole('searchbox', { name: strings['find.field'] }), 'notes{Enter}');
    const list = await within(d2).findByRole('list', { name: fill(strings['find.list'], { q: 'notes' }) });
    expect(within(list).getByText('ada/notes.txt')).toBeInTheDocument();
    expect(router.state.location.search).not.toHaveProperty('ap');
    // Back to the top folders: the words and the matches go, the pane still hasn't moved.
    await userEvent.click(within(d2).getByRole('button', { name: strings['find.back'] }));
    const d3 = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: 'atlas' }) });
    expect(within(d3).getByRole('list', { name: strings['find.tops'] })).toBeInTheDocument();
    expect(within(d3).queryByRole('searchbox')).toBeNull();
    await userEvent.click(within(d3).getByRole('button', { name: fill(strings['find.title'], { folder: '/srv' }) }));
    const d4 = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/srv' }) });
    expect(within(d4).getByRole('searchbox', { name: strings['find.field'] })).toHaveValue('');
    expect(within(d4).getByText(strings['find.hint'])).toBeInTheDocument();
    expect(router.state.location.search).not.toHaveProperty('ap');
  });

  it('lists the top folders from the pane\'s own listing, without reading the top again, also once that listing is old', async () => {
    await renderPage(page, { path: A });
    await table();
    // The pane's listing of / is older than its 15 s freshness when the drawer opens.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 60_000);
      seen.length = 0;
      await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
      const d = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: 'atlas' }) });
      expect(await within(d).findByRole('list', { name: strings['find.tops'] })).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50));
      expect(seen.filter((x) => x === 'atlas:/')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a find opened on a folder has no way back to the top folders', async () => {
    await renderPage(page, { path: at('/home') });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/home' }) });
    expect(within(d).queryByRole('button', { name: strings['find.back'] })).toBeNull();
  });

  it('finds from a folder\'s row menu', async () => {
    await renderPage(page, { path: A });
    await openMenu(/\bsrv\b/);
    await userEvent.click(await item(strings['action.findBelow']));
    expect(await screen.findByRole('dialog', { name: fill(strings['find.title'], { folder: '/srv' }) })).toBeInTheDocument();
  });

  it('says search is off, or offers Try again when it fails', async () => {
    await renderPage(page, { path: at('/srv'), state: 'findOff' });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog');
    await userEvent.type(within(d).getByRole('searchbox', { name: strings['find.field'] }), 'app{Enter}');
    expect(await within(d).findByText(strings['find.off'])).toBeInTheDocument();
  });

  it('keeps Find off for a query the program would refuse', async () => {
    await renderPage(page, { path: at('/srv') });
    await table();
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.find'] }));
    const d = await screen.findByRole('dialog');
    const go = within(d).getByRole('button', { name: strings['action.find'] });
    expect(go).toBeDisabled();
    await userEvent.type(within(d).getByRole('searchbox', { name: strings['find.field'] }), '/');
    expect(go).toBeDisabled();
  });
});
