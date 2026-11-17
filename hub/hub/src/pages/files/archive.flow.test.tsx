// Vitest: archives on the page: Look inside and Extract here… for site.zip in /home/ada on atlas
// (archive.fixtures.ts acts out each case). The files program merges into a folder that is there, so each
// test pins one guard: the folder read fresh right before the send, replaced files said plainly, partial
// changes said. Only the send's own answer settles an extract (a lost, unreadable or other-folder answer
// stays held until Stop tracking, whatever the computer then shows), and what each answer said is kept until closed,
// across leaving Browse and switching computer mid-send. Also capped lists, tar folders and names that cannot pass for
// another.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bump } from '@core/ctx';
import { addDir, failListingWhile, resetFiles, skipInListingWhile } from './fixtures';
import { extractGate, extractsSent } from './archive.fixtures';
import { clearExtractResultsForTest, keepExtractResult, useExtractResults } from './data';
import page from './page';
import strings from './strings.en.json';
import a from './Archive.strings.en.json';

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });

async function rowAction(name: RegExp, action: string) {
  const r = await row(name);
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: action }, { timeout: 15_000 }));
}
async function openExtract(state: string) {
  const r = await renderPage(page, { path: ADA, state });
  await rowAction(/site\.zip/, `${a['action.extract']}…`);
  const d = await screen.findByRole('dialog', { name: fill(a['extract.title'], { name: 'site.zip' }) });
  const field = within(d).getByRole('textbox', { name: a['extract.field'] });
  await waitFor(() => expect(within(d).getByRole('button', { name: a['extract.primary'] })).toBeEnabled());
  return { d, field, r };
}
const press = (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: a['extract.primary'] }));

// The page's first render in a file loads its modules: done once here, so no case spends its 5 s waits on it.
beforeAll(async () => {
  resetFiles();
  await renderPage(page, { path: ADA, state: 'archive' });
  await screen.findByRole('region', { name: strings['pane.a'] }, { timeout: 120_000 });
  cleanup();
}, 150_000);
beforeEach(() => { resetFiles(); clearExtractResultsForTest(); });
afterEach(() => vi.restoreAllMocks());
const heldLine = fill(a['held.extract'], { name: 'site.zip', dest: 'site' });
/** The dialog's own answer is shown, then closed: what stays is the held band. */
const closeDialog = (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: (n, el) => n === a['extract.close'] && !el.hasAttribute('data-dialog-close') }));

describe('Look inside', () => {
  it('lists the archive, folders first; a link is marked and never opened; a file opens straight from the program', async () => {
    await renderPage(page, { path: ADA, state: 'archive' });
    await rowAction(/site\.zip/, `${a['action.look']}…`);
    const list = await screen.findByRole('list', { name: fill(a['look.list'], { name: 'site.zip' }) });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent(a['look.folder']);
    expect(within(list).getByText(a['look.link'])).toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: /^Open /i })).toHaveLength(2);
    expect(extractsSent).toHaveLength(0);
  });

  it('a tar: a folder header without a slash is a folder, its top folder is not listed, a pipe is marked, a direction override is written out', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPage(page, { path: ADA, state: 'archive' });
    await rowAction(/backup\.tar\.gz/, `${a['action.look']}…`);
    const list = await screen.findByRole('list', { name: fill(a['look.list'], { name: 'backup.tar.gz' }) });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent(a['look.folder']);
    expect(items[0]).toHaveTextContent(/^backup/);
    expect(within(list).getByText(a['look.special'])).toBeInTheDocument();
    expect(within(list).getByText('backup/report\\u202efdp.exe')).toBeInTheDocument();
    expect(within(list).queryByText(/\u202E/)).toBeNull();
    const opens = within(list).getAllByRole('button', { name: /^Open /i });
    expect(opens).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: fill(a['look.openOne'], { name: 'backup/report\\u202efdp.exe' }) }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    expect(String(url)).toMatch(/\?preview=backup%2Freport%E2%80%AEfdp\.exe$/);
    expect([target, features]).toEqual(['_blank', 'noopener,noreferrer']);
  });

  it('an archive too big to list says so and keeps Download and Extract', async () => {
    await renderPage(page, { path: ADA, state: 'archiveBig' });
    await rowAction(/site\.zip/, `${a['action.look']}…`);
    expect(await screen.findByText(a['look.tooBig'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['action.download'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: a['action.extract'] })).toBeInTheDocument();
  });
});

describe('Extract here…', () => {
  it('extracts into a new folder beside it, says the counts and the link left out, and the folder lists it', async () => {
    const { d, field } = await openExtract('archive');
    expect(field).toHaveValue('site');
    await press(d);
    expect(await within(d).findByText(/Extracted 2 files into site\. 1 entry was not extracted\./)).toBeInTheDocument();
    expect(extractsSent).toEqual(['/home/ada/site.zip -> /home/ada/site']);
    expect(await row(/\bsite\b(?!\.zip)/)).toBeInTheDocument();
  });

  it('files replaced in a folder that appeared before the run are said as replaced, never a plain "Extracted"', async () => {
    const { d } = await openExtract('archiveReplaced');
    await press(d);
    expect(await within(d).findByText(/site already existed: 2 files there were replaced\./)).toBeInTheDocument();
    expect(within(d).queryByText(/^Extracted/)).toBeNull();
  });

  it('the folder is read fresh right before the send: a folder of that name there now sends nothing and offers the next name', async () => {
    const { d, field } = await openExtract('archive');
    addDir('/home/ada/site'); // made after the list was read: only a fresh read sees it
    await press(d);
    expect(await within(d).findByText(a['extract.taken'])).toBeInTheDocument();
    expect(extractsSent).toHaveLength(0);
    expect(field).toHaveValue('site (2)');
  });

  it('lists the program caps are read whole: the full counts are said', async () => {
    const { d } = await openExtract('archiveCapped');
    await press(d);
    expect(await within(d).findByText(/site already existed: 1200 files there were replaced\. 1500 entries were not extracted\./)).toBeInTheDocument();
  });

  it('a failure that says it changed files in a folder made meanwhile says what it left there, never just "couldn\'t"', async () => {
    const { d } = await openExtract('archiveFailedChanged');
    await press(d);
    expect(await within(d).findByText(/Couldn't extract site\.zip\. 1 file was added to site before it stopped\. 1 file in site was replaced before it stopped\./)).toBeInTheDocument();
  });

  it('a failure answer that contradicts itself (success true beside an error) says files may have changed, never "nothing changed"', async () => {
    const { d } = await openExtract('archiveContradicted');
    await press(d);
    expect(await within(d).findByText(/Couldn't extract site\.zip\. Files in site may have changed\./)).toBeInTheDocument();
  });

  it('a folder whose listing leaves an entry out right before the send sends nothing: the name may be taken', async () => {
    const { d } = await openExtract('archive');
    const stop = skipInListingWhile('/home/ada', 'site');
    await press(d);
    expect(await within(d).findByText(a['extract.unread'])).toBeInTheDocument();
    stop();
    expect(extractsSent).toHaveLength(0);
  });

  it('a folder that cannot be read right before the send sends nothing', async () => {
    const { d } = await openExtract('archive');
    const stop = failListingWhile('/home/ada');
    await press(d);
    expect(await within(d).findByText(a['extract.unread'])).toBeInTheDocument();
    stop();
    expect(extractsSent).toHaveLength(0);
  });

  it('extract off on the computer: Extract stays off with the reason; nothing is sent', async () => {
    await renderPage(page, { path: ADA, state: 'archiveOff' });
    await rowAction(/site\.zip/, `${a['action.extract']}…`);
    const d = await screen.findByRole('dialog', { name: fill(a['extract.title'], { name: 'site.zip' }) });
    expect(await within(d).findByText(a['extract.off'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: a['extract.primary'] })).toBeDisabled();
    expect(extractsSent).toHaveLength(0);
  });
});

describe('only the send\'s own answer settles it (the program names no client attempt)', () => {
  it('a success answer that does not read whole stays held after the dialog closes; Check again only reads', async () => {
    const { d } = await openExtract('archiveMalformed');
    await press(d);
    expect(await within(d).findByText(/may have gone through/i, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByText(/^Extracted/)).toBeNull();
    await closeDialog(d);
    expect(await screen.findByText(heldLine, {}, { timeout: 10_000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await new Promise((res) => setTimeout(res, 2_500));
    expect(screen.getByText(heldLine)).toBeInTheDocument();
    expect(extractsSent).toHaveLength(1);
  });

  it('a success answer naming another folder stays held, never "Extracted"', async () => {
    const { d } = await openExtract('archiveOtherDest');
    await press(d);
    expect(await within(d).findByText(/may have gone through/i, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByText(/^Extracted/)).toBeNull();
    await closeDialog(d);
    expect(await screen.findByText(heldLine, {}, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('a lost answer stays held though the run completed and the folder is there; Stop tracking asks first, then frees it', async () => {
    const { d } = await openExtract('archiveLost');
    await press(d);
    await userEvent.click(await within(d).findByRole('button', { name: a['extract.close'] }, { timeout: 10_000 }));
    expect(await screen.findByText(heldLine, {}, { timeout: 10_000 })).toBeInTheDocument();
    // The folder shows (the person can look), and nothing the computer shows settles it.
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await row(/\bsite\b(?!\.zip)/)).toBeInTheDocument();
    await new Promise((res) => setTimeout(res, 2_500));
    expect(screen.getByText(heldLine)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: a['held.stop'] }));
    const ask = await screen.findByRole('alertdialog', { name: a['held.stopTitle'] }).catch(() => screen.findByRole('dialog', { name: a['held.stopTitle'] }));
    expect(screen.getByText(heldLine)).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: a['held.stop'] }));
    await waitFor(() => expect(screen.queryByText(heldLine)).toBeNull());
    expect(extractsSent).toHaveLength(1);
  });
});

describe('what each answer said is kept until the person closes it', () => {
  it('leaving Browse, then switching computer, while each runs: both results show on return; closing one leaves the other', async () => {
    const { d, r } = await openExtract('archiveGated');
    await press(d);
    await waitFor(() => expect(extractsSent).toHaveLength(1));
    act(() => r.router.history.push(`${ADA}&tab=transfers`));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    extractGate.open();
    act(() => r.router.history.push(ADA));
    const first = /site already existed: 2 files there were replaced\./;
    expect(await screen.findByText(first, {}, { timeout: 10_000 })).toBeInTheDocument();
    // A second one: its answer comes while another computer shows.
    extractGate.close();
    await rowAction(/backup\.tar\.gz/, `${a['action.extract']}…`);
    const d2 = await screen.findByRole('dialog', { name: fill(a['extract.title'], { name: 'backup.tar.gz' }) });
    await waitFor(() => expect(within(d2).getByRole('button', { name: a['extract.primary'] })).toBeEnabled());
    await press(d2);
    await waitFor(() => expect(extractsSent).toHaveLength(2));
    act(() => r.router.history.push('/files?a=borealis.00b2'));
    await waitFor(() => expect(screen.queryByText(first)).toBeNull());
    extractGate.open();
    await new Promise((res) => setTimeout(res, 500));
    act(() => r.router.history.push(ADA));
    const second = /backup already existed: 2 files there were replaced\./;
    expect(await screen.findByText(second, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText(first)).toBeInTheDocument();
    // Only the person closes one, and only that one goes.
    // Oldest first: the first result's Close is the first.
    await userEvent.click(screen.getAllByRole('button', { name: /^close$/i })[0]!);
    await waitFor(() => expect(screen.queryByText(first)).toBeNull());
    expect(screen.getByText(second)).toBeInTheDocument();
  }, 60_000);

  it('a result shown in the dialog stays after leaving Browse without closing it: the band shows it on return', async () => {
    const { d, r } = await openExtract('archiveReplaced');
    await press(d);
    const words = /site already existed: 2 files there were replaced\./;
    expect(await within(d).findByText(words)).toBeInTheDocument();
    act(() => r.router.history.push(`${ADA}&tab=transfers`));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => r.router.history.push(ADA));
    expect(await screen.findByText(words, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a context end (a realm fallback) closes the dialog but keeps its result: the band shows it until the person closes it', async () => {
    const { d } = await openExtract('archiveReplaced');
    await press(d);
    const words = /site already existed: 2 files there were replaced\./;
    expect(await within(d).findByText(words)).toBeInTheDocument();
    await act(async () => { bump('fallback'); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(words, {}, { timeout: 10_000 })).toBeInTheDocument();
    await new Promise((res) => setTimeout(res, 300));
    expect(screen.getByText(words)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^close$/i })[0]!);
    await waitFor(() => expect(screen.queryByText(words)).toBeNull());
  });

  it('results belong to their realm and computer: another computer or realm shows none of them', () => {
    keepExtractResult('r1', 'c-atlas', 'op1', { tone: 'warn', words: 'kept' });
    expect(renderHook(() => useExtractResults('r1', 'c-atlas', true)).result.current.map((x) => x.op)).toEqual(['op1']);
    expect(renderHook(() => useExtractResults('r1', 'c-bolt', true)).result.current).toEqual([]);
    expect(renderHook(() => useExtractResults('r2', 'c-atlas', true)).result.current).toEqual([]);
  });

  it('the dialog shows its own result and the band does not; closing the dialog closes it', async () => {
    const { d } = await openExtract('archiveReplaced');
    await press(d);
    const words = /site already existed: 2 files there were replaced\./;
    expect(await within(d).findByText(words)).toBeInTheDocument();
    expect(screen.getAllByText(words)).toHaveLength(1);
    await closeDialog(d);
    await new Promise((res) => setTimeout(res, 300));
    expect(screen.queryByText(words)).toBeNull();
  });
});
