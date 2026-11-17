// Vitest: Upload of new names (one batch hold per
// computer, stop at the first unknown, HELD_OVERLAP both ways, queued files Not sent after a reload).
/* eslint-disable no-restricted-globals -- the test plays a reload: the batch's hold lives in browser storage, kept
   across a fresh boot and announced through the storage event. */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { exists, failListingOnce, putFile, slowListingOnce, resetFiles, sentChanges, setHashOf, sizeOf, uploadFaults } from './fixtures';
import { fixtureWorld } from '@core';
import { blockingUploadsOn, refreshFolders, uploadsOn } from './data';
import { resetUploads } from './uploadRun';
import page from './page';
import strings from './strings.en.json';
import us from './Upload.strings.en.json';

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));
const plural = (base: string, n: number, v: Record<string, string | number> = {}) => fill((us as Record<string, string>)[`${base}_${n === 1 ? 'one' : 'other'}`]!, { count: n, ...v });
const at = (path: string) => ({ path: `/files?a=atlas.00a1&ap=${encodeURIComponent(path)}` });
const pane = () => screen.findByRole('region', { name: strings['pane.a'] });
const table = async () => within(await pane()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const dialog = () => screen.findByRole('dialog');
const txt = (name: string, body = 'abc') => new File([body], name, { type: 'text/plain' });
async function pick(files: File[]) {
  const p = await pane();
  await waitFor(() => expect(within(p).getByRole('button', { name: us['action.upload'] })).not.toHaveAttribute('aria-disabled', 'true'));
  const input = within(await pane()).getByLabelText(us['pick.label']) as HTMLInputElement;
  await userEvent.upload(input, files);
  return dialog();
}
const press = async (d: HTMLElement, n: number) => userEvent.click(within(d).getByRole('button', { name: plural('primary', n) }));
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (body: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
const holds = () => {
  const ids = new Set<string>();
  for (const k of Object.keys(localStorage)) { const m = /files\.upload:([^"\\]+)/.exec(localStorage.getItem(k) ?? ''); if (m) ids.add(m[1]!); }
  return [...ids].flatMap((c) => uploadsOn(c));
};
const uploads = () => sentChanges.filter((x) => x.startsWith('upload:'));

// The page's view loads lazily: load it once up front, so the first case's waits are not spent on that load (a cold
// transform under load takes longer than one 5 s wait).
beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => { resetFiles(); resetUploads(); localStorage.clear(); });

describe('Upload: the plan', () => {
  it('two new names: the dialog sums them up, Upload sends each once, the folder lists them, nothing stays held', async () => {
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt'), txt('b.txt', 'hello')]);
    expect(within(d).getByText(fill(us.summary_other, { count: 2, bytes: '8 B' }))).toBeInTheDocument();
    await press(d, 2);
    await waitFor(() => expect(uploads().sort()).toEqual(['upload:/tmp/a.txt', 'upload:/tmp/b.txt']));
    expect(await within(d).findByText(plural('result.done', 2))).toBeInTheDocument();
    expect(within(d).getAllByText(us['row.done'])).toHaveLength(2);
    expect(exists('/tmp/a.txt') && exists('/tmp/b.txt')).toBe(true);
    await waitFor(() => expect(holds()).toEqual([]));
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    expect(await within(await table()).findByRole('row', { name: /a\.txt/ })).toBeInTheDocument();
  });

  it('a taken name: Keep both is the default and goes as name-1 (create only); Skip leaves it out', async () => {
    await renderPage(page, at('/home/ada'));
    let d = await pick([txt('notes.txt'), txt('new.txt')]);
    expect(within(d).getByRole('radio', { name: us['choice.keep'] })).toBeChecked();
    expect(within(d).getByText(fill(us['row.as'], { name: 'notes-1.txt' }))).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('radio', { name: us['choice.skip'] }));
    expect(within(d).getByText(us['row.skip'])).toBeInTheDocument();
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/home/ada/new.txt']));
    expect(sizeOf('/home/ada/notes.txt')).toBe(1204);
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    d = await pick([txt('notes.txt')]);
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/home/ada/new.txt', 'upload:/home/ada/notes-1.txt']));
    expect(sizeOf('/home/ada/notes.txt')).toBe(1204);
  });

  it('Skip sends a pick whose name is free even when Keep both would have used it for a taken one', async () => {
    await renderPage(page, at('/home/ada'));
    const d = await pick([txt('notes.txt'), txt('notes-1.txt')]);
    await userEvent.click(within(d).getByRole('radio', { name: us['choice.skip'] }));
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/home/ada/notes-1.txt']));
    expect(sizeOf('/home/ada/notes.txt')).toBe(1204);
  });

  it('Skip on the only file leaves nothing to send', async () => {
    await renderPage(page, at('/home/ada'));
    const d = await pick([txt('notes.txt')]);
    await userEvent.click(within(d).getByRole('radio', { name: us['choice.skip'] }));
    expect(within(d).getByRole('button', { name: plural('primary', 0) })).toBeDisabled();
  });

  it('a name the computer refuses is shown and never sent; the batch limits stop the whole upload', async () => {
    await renderPage(page, at('/tmp'));
    let d = await pick([txt(' lead.txt'), txt('ok.txt')]);
    expect(within(d).getByText(us['bad.name'])).toBeInTheDocument();
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/tmp/ok.txt']));
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    d = await pick(Array.from({ length: 5001 }, (_, k) => txt(`f${k}.txt`, '')));
    expect(within(d).getByText(us['problem.tooMany'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: plural('primary', 5001) })).toBeDisabled();
    expect(uploads()).toEqual(['upload:/tmp/ok.txt']);
  });

  it('files dropped on the folder open the same plan', async () => {
    // The listing takes a moment (180 ms), so a drop sent before it lands would be refused (nothing is taken while the
    // folder shown is not listed): the case waits for the loaded folder. /tmp is empty, so that is the empty folder,
    // never a table (a table found here was only the loading one).
    await renderPage(page, { ...at('/tmp'), latency: 'normal' });
    await within(await pane()).findByText(strings['empty.title']);
    // The folder's frame takes the drop (OP-A, the kit's DataTable drop): it is the folder shown.
    const box = (await pane()).querySelector('[data-drop-frame]') as HTMLElement;
    const f = txt('dropped.txt');
    const dataTransfer = { types: ['Files'], files: [f], items: [{ kind: 'file', getAsFile: () => f }] };
    fireEvent.dragOver(box, { dataTransfer });
    fireEvent.drop(box, { dataTransfer });
    const d = await dialog();
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/tmp/dropped.txt']));
    // Its answer takes the same moment: the batch ends here, never in the next case (whose reset drops it).
    expect(await within(d).findByText(plural('result.done', 1))).toBeInTheDocument();
  });
});

describe('Upload: files dropped on a folder row (OP-A)', () => {
  const dt = (fs: File[]) => ({ types: ['Files'], files: fs, items: fs.map((f) => ({ kind: 'file', getAsFile: () => f })) });
  const rowOf = async (name: string) => (await within(await table()).findByText(name)).closest('[data-row-id]') as HTMLElement;

  it('a drop on a folder row uploads into that folder, planned against its own names; the row shows while dragging', async () => {
    await renderPage(page, at('/home'));
    const r = await rowOf('ada');
    const f = txt('notes.txt');
    fireEvent.dragOver(r, { dataTransfer: dt([f]) });
    expect(r).toHaveAttribute('data-drop-over');
    fireEvent.drop(r, { dataTransfer: dt([f]) });
    expect(r).not.toHaveAttribute('data-drop-over');
    const d = await dialog();
    expect(within(d).getByRole('heading', { name: fill(us.title, { folder: '/home/ada' }) })).toBeInTheDocument();
    // /home/ada already holds notes.txt: Keep both, as name-1
    expect(await within(d).findByText(fill(us['row.as'], { name: 'notes-1.txt' }))).toBeInTheDocument();
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/home/ada/notes-1.txt']));
    expect(sizeOf('/home/ada/notes.txt')).toBe(1204);
  });

  it('a drop on a file row goes to the folder shown; leaving the box clears the mark', async () => {
    await renderPage(page, at('/home/ada'));
    const r = await rowOf('report.pdf');
    const f = txt('x.txt');
    fireEvent.dragOver(r, { dataTransfer: dt([f]) });
    expect(r).not.toHaveAttribute('data-drop-over');
    const folderRow = await rowOf('projects');
    fireEvent.dragOver(folderRow, { dataTransfer: dt([f]) });
    expect(folderRow).toHaveAttribute('data-drop-over');
    fireEvent.dragLeave(folderRow, { relatedTarget: document.body });
    expect(folderRow).not.toHaveAttribute('data-drop-over');
    fireEvent.drop(r, { dataTransfer: dt([f]) });
    const d = await dialog();
    expect(within(d).getByRole('heading', { name: fill(us.title, { folder: '/home/ada' }) })).toBeInTheDocument();
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/home/ada/x.txt']));
  });

  it('a folder row that can not take files (an unreadable name) refuses the drop: no mark, no plan, never the folder shown instead', async () => {
    await renderPage(page, at('/home/ada'));
    const r = await rowOf('caf\uFFFD');
    const f = txt('x.txt');
    const ev = fireEvent.dragOver(r, { dataTransfer: dt([f]) });
    expect(ev).toBe(false); // taken over (the browser never opens the file), dropEffect none
    expect(r).not.toHaveAttribute('data-drop-over');
    fireEvent.drop(r, { dataTransfer: dt([f]) });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(uploads()).toEqual([]);
  });

  it('the plan waits for the folder\'s names: Upload stays off until they are read', async () => {
    await renderPage(page, at('/home'));
    const r = await rowOf('ada');
    slowListingOnce('/home/ada');
    fireEvent.drop(r, { dataTransfer: dt([txt('a.txt')]) });
    const d = await dialog();
    expect(within(d).getByRole('button', { name: plural('primary', 1) })).toBeDisabled();
    expect(uploads()).toEqual([]);
  });

  it('nothing is taken while the folder shown is not listed (a failed read)', async () => {
    failListingOnce('/tmp');
    await renderPage(page, at('/tmp'));
    const p = await pane();
    expect((await within(p).findAllByText(/couldn|can.t|try again/i)).length).toBeGreaterThan(0);
    const box = p.querySelector('[data-drop-frame]') ?? p;
    fireEvent.dragOver(box, { dataTransfer: dt([txt('a.txt')]) });
    fireEvent.drop(box, { dataTransfer: dt([txt('a.txt')]) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a folder whose listing fails: the plan says so and sends nothing', async () => {
    await renderPage(page, at('/home'));
    const r = await rowOf('ada');
    failListingOnce('/home/ada');
    fireEvent.drop(r, { dataTransfer: dt([txt('a.txt')]) });
    const d = await dialog();
    expect(await within(d).findByText(us['problem.unlisted'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: plural('primary', 1) })).toBeDisabled();
    expect(uploads()).toEqual([]);
  });
});

describe('Upload: answers', () => {
  it('412 (another writer took the name in the gap): not uploaded, nothing overwritten, the rest goes on', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'taken' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt'), txt('b.txt')]);
    await press(d, 2);
    expect(await within(d).findByText(us['row.taken'])).toBeInTheDocument();
    await waitFor(() => expect(exists('/tmp/b.txt')).toBe(true));
    expect(sizeOf('/tmp/a.txt')).toBe(1);
    await waitFor(() => expect(holds()).toEqual([]));
  });

  it('a refusal before anything was written (403, 409): not uploaded, never sent again by itself', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'refused' }, { match: '/tmp/b.txt', mode: 'busy' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt'), txt('b.txt'), txt('c.txt')]);
    await press(d, 3);
    await waitFor(() => expect(within(d).getAllByText(us['row.refused'])).toHaveLength(2));
    expect(await within(d).findByText(plural('result.failed', 2), { exact: false })).toBeInTheDocument();
    expect(uploads().filter((x) => x === 'upload:/tmp/a.txt')).toHaveLength(1);
    expect(exists('/tmp/c.txt')).toBe(true);
    await waitFor(() => expect(holds()).toEqual([]));
  });
});

describe('Upload: an unknown outcome (C9)', () => {
  it('stops at the first unknown: the rest is not sent, the computer is held, other Files changes wait', async () => {
    // Three go at once: a's answer is lost (in 300 ms) while b and c take 1.5 s, so d is still waiting for a worker.
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'lost' }, { match: '/tmp/b.txt', mode: 'slow', ms: 1500 }, { match: '/tmp/c.txt', mode: 'slow', ms: 1500 });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt'), txt('b.txt'), txt('c.txt'), txt('d.txt')]);
    await press(d, 4);
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    expect(await within(d).findByText(us['row.notSent'], undefined, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(within(d).getAllByText(us['row.done'])).toHaveLength(2), { timeout: 4000 });
    expect(uploads().sort()).toEqual(['upload:/tmp/a.txt', 'upload:/tmp/b.txt', 'upload:/tmp/c.txt']);
    expect(exists('/tmp/d.txt')).toBe(false);
    const h = holds();
    expect(h).toHaveLength(1);
    expect(h[0]!.meta!.files.map((f) => [f.path, f.phase])).toEqual([['/tmp/a.txt', 'unknown']]);
    expect(h[0]!.meta!.files[0]!.sha256).toBe(await sha('abc'));
    expect(blockingUploadsOn(h[0]!.meta!.computer)).toHaveLength(1);
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    // The band says what may have gone through; New folder on this computer is held back (nothing sent).
    expect(await screen.findByText(plural('held.unknown', 1, { folder: '/tmp', names: 'a.txt' }), { exact: false })).toBeInTheDocument();
    await userEvent.click(within(await pane()).getByRole('button', { name: strings['action.newFolder'] }));
    const nd = await dialog();
    await userEvent.type(within(nd).getByRole('textbox', { name: strings['name.label'] }), 'fresh');
    await userEvent.click(within(nd).getByRole('button', { name: strings['action.create'] }));
    expect(await within(nd).findByText(strings['changes.overlap'], { exact: false })).toBeInTheDocument();
    expect(sentChanges.some((x) => x.startsWith('mkdir:'))).toBe(false);
    expect(exists('/tmp/fresh')).toBe(false);
  });

  it('Check again (reads only): there with the same SHA-256 → uploaded; the hold goes and Continue sends the rest', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'lost' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt'), txt('b.txt', 'bbb')]);
    await press(d, 2);
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    setHashOf('/tmp/a.txt', await sha('abc'));
    const before = uploads().length;
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(fill(us['note.uploaded'], { name: 'a.txt', folder: '/tmp' }))).toBeInTheDocument();
    expect(uploads()).toHaveLength(before);
    await waitFor(() => expect(blockingUploadsOn(holds()[0]?.meta?.computer ?? 'x')).toEqual([]));
    if (!exists('/tmp/b.txt')) {
      await userEvent.click(await screen.findByRole('button', { name: us.continue }));
      await waitFor(() => expect(exists('/tmp/b.txt')).toBe(true));
    }
    await waitFor(() => expect(holds()).toEqual([]));
  });

  it('Check again: not there → not uploaded; Continue sends it again (this tab still has it)', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'none' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt')]);
    await press(d, 1);
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(fill(us['note.absent'], { name: 'a.txt', folder: '/tmp' }))).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: us.continue }));
    await waitFor(() => expect(exists('/tmp/a.txt')).toBe(true));
    expect(uploads()).toEqual(['upload:/tmp/a.txt', 'upload:/tmp/a.txt']);
    await waitFor(() => expect(holds()).toEqual([]));
  });

  it('Check again: other bytes under the name → another file has it; nothing is sent again', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'none', before: () => putFile('/tmp/a.txt', 9) });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt')]);
    await press(d, 1);
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(fill(us['note.other'], { name: 'a.txt', folder: '/tmp' }))).toBeInTheDocument();
    expect(sizeOf('/tmp/a.txt')).toBe(9);
    await waitFor(() => expect(holds()).toEqual([]));
  });

  it('a failed read decides nothing: the hold stays, the line says it could not check, and nothing is sent again', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'error' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt')]);
    await press(d, 1);
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    failListingOnce('/tmp');
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(us.checkFailed, { exact: false })).toBeInTheDocument();
    expect(holds()[0]!.meta!.files).toHaveLength(1);
    expect(uploads()).toEqual(['upload:/tmp/a.txt']);
    // The next Check again reads the folder again: the 500 wrote nothing, so the name is not there.
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(fill(us['note.absent'], { name: 'a.txt', folder: '/tmp' }))).toBeInTheDocument();
    await waitFor(() => expect(blockingUploadsOn(holds()[0]?.meta?.computer ?? 'x')).toEqual([]));
  });

  it('after a reload: unknown files read as unknown, files never sent read "pick them again"', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'lost' }, { match: '/tmp/b.txt', mode: 'slow', ms: 1500 }, { match: '/tmp/c.txt', mode: 'slow', ms: 1500 });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt'), txt('b.txt'), txt('c.txt'), txt('d.txt')]);
    await press(d, 4);
    expect(await within(d).findByText(us['row.notSent'], undefined, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(holds()[0]?.hold.inFlight).toBeFalsy());
    const left = holds()[0]!.meta!.left;
    expect(left).toBeGreaterThan(0);
    resetUploads();
    const stored = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? '']));
    await renderPage(page, at('/tmp'));
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'hub.v3.changes' }));
    expect((await screen.findAllByText(plural('held.unknown', 1, { folder: '/tmp', names: 'a.txt' }), { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getAllByText(plural('held.left', left)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: us.continue })).toBeNull();
  });

  it('Stop tracking is warned and frees the hold; nothing is sent', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'lost' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt')]);
    await press(d, 1);
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => n === us.close && !el.hasAttribute('data-dialog-close') }));
    await userEvent.click(await screen.findByRole('button', { name: us.stop }));
    const sd = await screen.findByRole('dialog', { name: us.stopTitle });
    await userEvent.click(within(sd).getByRole('button', { name: us.stop }));
    await waitFor(() => expect(holds()).toEqual([]));
    expect(uploads()).toEqual(['upload:/tmp/a.txt']);
  });

  it('Cancel: a file whose request had left is unknown (never "not uploaded"); the rest is not sent', async () => {
    uploadFaults.push({ match: '/tmp/a.txt', mode: 'slow' });
    await renderPage(page, at('/tmp'));
    const d = await pick([txt('a.txt')]);
    await press(d, 1);
    await waitFor(() => expect(uploads()).toEqual(['upload:/tmp/a.txt']));
    await userEvent.click(within(d).getByRole('button', { name: us.cancel }));
    expect(await within(d).findByText(us['row.unknown'])).toBeInTheDocument();
    expect(holds()[0]!.meta!.files.map((f) => f.phase)).toEqual(['unknown']);
  });
});

describe('Upload and other Files changes refuse each other (HELD_OVERLAP)', () => {
  it('a Files change whose outcome is unknown holds uploads back: nothing is sent, no hold is left', async () => {
    await renderPage(page, at('/tmp'));
    await userEvent.click(within(await pane()).getByRole('button', { name: strings['action.newFolder'] }));
    const nd = await dialog();
    await userEvent.type(within(nd).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    // Its answer is lost and the read-back of /tmp fails: it stays held, its outcome unknown.
    failListingOnce('/tmp');
    await userEvent.click(within(nd).getByRole('button', { name: strings['action.create'] }));
    expect(await screen.findAllByText(/may have gone through/i)).not.toHaveLength(0);
    await userEvent.click(within(nd).getByRole('button', { name: (n, el) => /^(close|cancel)$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The failed read was the page's own listing too: read it again (the change stays held).
    refreshFolders(fixtureWorld.computers.find((c) => c.name === 'atlas')!.id);
    const d = await pick([txt('a.txt')]);
    await press(d, 1);
    expect(await within(d).findByText(fill(us['result.overlap'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(uploads()).toEqual([]);
    expect(holds()).toEqual([]);
  });
});
