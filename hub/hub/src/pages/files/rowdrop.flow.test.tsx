// Vitest: dragging Files rows onto a folder (rowdrag.ts on the kit's DataTable drag/drop). A drop opens
// the same Copy / Move dialog the menus open, never sends by itself: one item → TransferDialog, several → the several
// dialog. In the rows' own pane a drop moves and the copy key (Ctrl here) makes it a copy; on the other pane it copies
// and the key makes it a move. Refused: another computer's pane (with words: no copy between computers yet), the
// rows' own folder, a folder into itself, a payload this tab did not start, while changes are off; on the other pane
// with words saying why (already there, a folder into itself). The whole other pane takes a drop as its folder (its bar
// and its file rows too, the pane marked). Pane A shows /home/ada, pane B /tmp (atlas tree).
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { failListingOnce, putFile, removeItem, resetFiles, sentChanges } from './fixtures';
import { refreshFolders } from './data';
import { joinPath } from './logic';
import { FILES_ROW, draggingRows, dropHow, endRowDragFrom, rowPayloadOf, rowsMayGo, rowsNoGo, sameDrag, startRowDrag } from './rowdrag';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const two = (ap: string, bp: string, b = 'atlas.00a1') => ({ path: `/files?a=atlas.00a1&ap=${enc(ap)}&b=${b}&bp=${enc(bp)}` });
const pane = (k: 'a' | 'b') => screen.findByRole('region', { name: strings[k === 'a' ? 'pane.a' : 'pane.b'] });
const table = async (k: 'a' | 'b') => within(await pane(k)).findByRole('table');
const rowIn = async (k: 'a' | 'b', name: string) => (await within(await table(k)).findByText(name)).closest('[data-row-id]') as HTMLElement;
// The pane's drop frame: its table's, or its empty folder's (/tmp is empty in the atlas tree).
async function frameOf(k: 'a' | 'b'): Promise<HTMLElement> {
  const p = await pane(k);
  await waitFor(() => expect(p.querySelector('[data-drop-frame]')).not.toBeNull());
  return p.querySelector('[data-drop-frame]') as HTMLElement;
}

type Store = Record<string, string>;
function transfer(types: string[] = []) {
  const dt = {
    types: [...types],
    dropEffect: 'unset',
    effectAllowed: 'all',
    store: {} as Store,
    items: [] as unknown[],
    files: [] as File[],
    getData: (t: string) => dt.store[t] ?? '',
    setData: (t: string, v: string) => {
      dt.store[t] = v;
      if (!dt.types.includes(t)) dt.types.push(t);
    },
  };
  return dt;
}
type DT = ReturnType<typeof transfer>;
function fire(el: Element, type: string, dt: DT, init: MouseEventInit = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
}
/** Starts a drag from a row (as the browser does on a press on its name): the transfer the drag carries. */
async function dragFrom(k: 'a' | 'b', name: string): Promise<DT> {
  const r = await rowIn(k, name);
  const dt = transfer();
  fire(within(r).getByText(name), 'mousedown', dt);
  fire(r, 'dragstart', dt);
  return dt;
}
const hint = () => document.querySelector('[data-drop-hint]')?.textContent ?? null;
const endDrag = (dt: DT) => fire(document.body, 'dragend', dt);

beforeEach(() => {
  resetFiles();
  startRowDrag({ pane: 'a', computer: '', folder: '/', items: [] }, false, () => false);
});

describe('drag Files rows onto a folder', () => {
  it('a row dropped on the other pane opens Copy for it, in the effect, the hint and the dialog; nothing is sent until the press', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    expect(JSON.parse(dt.store[FILES_ROW]!)).toEqual({ pane: 'a', computer: 'c0a7150000000000000000a1', folder: '/home/ada', items: [expect.objectContaining({ path: '/home/ada/notes.txt', name: 'notes.txt', dir: false })], drag: expect.stringMatching(/^[a-z0-9-]{8,64}$/) });
    expect(dt.store['text/plain']).toBe('notes.txt');
    const b = await frameOf('b');
    const over = fire(b, 'dragover', dt);
    expect(over.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('copy');
    expect(hint()).toBe(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'tmp', key: 'Ctrl' }));
    fire(b, 'drop', dt);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeInTheDocument();
    expect(sentChanges).toEqual([]);
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']));
    endDrag(dt);
  });

  it('on the other pane the copy key makes it a move, in the effect, the hint and the dialog', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const b = await frameOf('b');
    fire(b, 'dragover', dt, { ctrlKey: true });
    expect(dt.dropEffect).toBe('move');
    expect(hint()).toBe(fill(strings['drop.moveKey'], { what: 'notes.txt', folder: 'tmp' }));
    fire(b, 'drop', dt, { ctrlKey: true });
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['move.title'], { name: 'notes.txt' }) })).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['move:/home/ada/notes.txt>/tmp/notes.txt']));
    endDrag(dt);
  });

  it('from pane B to pane A it copies the same way: the source pane is the payload\'s, not pane A', async () => {
    await renderPage(page, two('/tmp', '/home/ada'));
    const dt = await dragFrom('b', 'notes.txt');
    expect(JSON.parse(dt.store[FILES_ROW]!)).toMatchObject({ pane: 'b' });
    const a = await frameOf('a');
    fire(a, 'dragover', dt);
    expect(dt.dropEffect).toBe('copy');
    expect(hint()).toBe(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'tmp', key: 'Ctrl' }));
    fire(a, 'drop', dt);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeInTheDocument();
    endDrag(dt);
  });

  it('a folder dropped on the other pane opens the folder copy, which walks the tree first', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'projects');
    const b = await frameOf('b');
    fire(b, 'dragover', dt);
    fire(b, 'drop', dt);
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(fill(ts['walk.plan'], { name: 'projects', count: '4' }))).toBeInTheDocument();
    endDrag(dt);
  });

  it('a drop on a folder row in the same pane goes into that folder', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const projects = await rowIn('a', 'projects');
    fire(projects, 'dragover', dt);
    expect(projects).toHaveAttribute('data-drop-over');
    expect(hint()).toBe(fill(strings['drop.move'], { what: 'notes.txt', folder: 'projects', key: 'Ctrl' }));
    fire(projects, 'drop', dt);
    const d = await screen.findByRole('dialog');
    const go = within(d).getByRole('button', { name: ts['move.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['move:/home/ada/notes.txt>/home/ada/projects/notes.txt']));
    endDrag(dt);
  });

  it('in the same pane the copy key still makes it a copy', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const projects = await rowIn('a', 'projects');
    fire(projects, 'dragover', dt, { ctrlKey: true });
    expect(dt.dropEffect).toBe('copy');
    expect(hint()).toBe(fill(strings['drop.copy'], { what: 'notes.txt', folder: 'projects' }));
    fire(projects, 'drop', dt, { ctrlKey: true });
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeInTheDocument();
    endDrag(dt);
  });

  it('selected rows drag together and open the several dialog', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await userEvent.click(within(await rowIn('a', 'notes.txt')).getByRole('checkbox'));
    await userEvent.click(within(await rowIn('a', 'report.pdf')).getByRole('checkbox'));
    const dt = await dragFrom('a', 'report.pdf');
    const b = await frameOf('b');
    fire(b, 'dragover', dt);
    expect(hint()).toBe(fill(strings['drop.copyKey'], { what: fill(strings['drop.items_other'], { count: '2' }), folder: 'tmp', key: 'Ctrl' }));
    fire(b, 'drop', dt);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['several.copyTitle'], { count: '2' }) })).toBeInTheDocument();
    expect(sentChanges).toEqual([]);
    endDrag(dt);
  });

  it('never into the rows\' own folder, nor a folder into itself: no effect, no hint, no dialog', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    // Its own folder: the body of its own pane, or a file row there.
    let dt = await dragFrom('a', 'notes.txt');
    const own = await rowIn('a', 'report.pdf');
    fire(own, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(hint()).toBeNull();
    fire(own, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(dt);
    // A folder onto itself.
    dt = await dragFrom('a', 'projects');
    const self = await rowIn('a', 'projects');
    fire(self, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    fire(self, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(dt);
  });

  it("the other pane that can't take them says why: already in its folder, or a folder into itself; nothing opens", async () => {
    await renderPage(page, two('/home/ada', '/home/ada'));
    let dt = await dragFrom('a', 'notes.txt');
    const there = await rowIn('b', 'report.pdf');
    fire(there, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(hint()).toBe(fill(strings['drop.here'], { folder: 'ada' }));
    expect(document.querySelector('[data-drop-over]')).toBeNull();
    fire(there, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(dt);
    // A folder onto its own row in the other pane.
    dt = await dragFrom('a', 'projects');
    const self = await rowIn('b', 'projects');
    fire(self, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(hint()).toBe(strings['drop.intoItself']);
    fire(self, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(dt);
    expect(sentChanges).toEqual([]);
  });

  it('anywhere in the other pane takes the drop as its folder: its folder bar and its file rows, the whole pane marked', async () => {
    await renderPage(page, two('/home/ada', '/home/ada/projects'));
    const dt = await dragFrom('a', 'notes.txt');
    const b = await pane('b');
    const area = await frameOf('b');
    // The folder bar's path: the crumb of the folder above the one it shows.
    const bar = within(b).getAllByRole('link', { name: 'ada' })[0]!;
    fire(bar, 'dragover', dt);
    expect(dt.dropEffect).toBe('copy');
    expect(hint()).toBe(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'projects', key: 'Ctrl' }));
    expect(area).toHaveAttribute('data-drop-over');
    // A file row of its table means the same place, marked the same way (never the row).
    const readme = await rowIn('b', 'README.md');
    fire(readme, 'dragover', dt);
    expect(readme).not.toHaveAttribute('data-drop-over');
    expect(area).toHaveAttribute('data-drop-over');
    expect(document.querySelectorAll('[data-drop-over]')).toHaveLength(1);
    fire(bar, 'drop', dt);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeInTheDocument();
    expect(within(d).getByText(/ \/home\/ada\/projects\/notes\.txt$/)).toBeInTheDocument();
    expect(sentChanges).toEqual([]);
    endDrag(dt);
  });

  it("another computer's pane takes no rows, and says copying between computers isn't available yet, key or not", async () => {
    await renderPage(page, { ...two('/home/ada', '/', 'granite.0107'), realm: 'all' });
    const dt = await dragFrom('a', 'notes.txt');
    const b = await frameOf('b');
    for (const ctrlKey of [false, true]) {
      fire(b, 'dragover', dt, { ctrlKey });
      expect(dt.dropEffect).toBe('none');
      expect(hint()).toBe(strings['drop.otherComputer']);
      expect(document.querySelector('[data-drop-hint]')).toHaveAttribute('data-drop-refused');
      expect(b.hasAttribute('data-drop-over')).toBe(false);
      // The words are announced, once (the live region holds them; the same words again change nothing).
      expect(screen.getAllByRole('status').filter((x) => x.textContent === strings['drop.otherComputer'])).toHaveLength(1);
    }
    // Leaving the pane takes the words away; back over it, they show again.
    fire(b, 'dragleave', dt, { relatedTarget: document.body });
    expect(hint()).toBeNull();
    fire(b, 'dragover', dt);
    expect(hint()).toBe(strings['drop.otherComputer']);
    // The drop (key held or not: a drop ends the drag) opens nothing and sends nothing.
    fire(b, 'drop', dt, { ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hint()).toBeNull();
    expect(sentChanges).toEqual([]);
    endDrag(dt);
  });

  it('a payload this tab did not start (another tab, an old drag) is never taken', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    endDrag(dt);
    expect(draggingRows()).toBeNull();
    const b = await frameOf('b');
    fire(b, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    fire(b, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    // A forged payload while a real drag runs: refused at the drop.
    const real = await dragFrom('a', 'report.pdf');
    const forged = transfer([FILES_ROW]);
    forged.store[FILES_ROW] = JSON.stringify({ ...JSON.parse(real.store[FILES_ROW]!), items: [{ path: '/home/ada/notes.txt', name: 'notes.txt', dir: false, size: 1, modified: null }] });
    fire(b, 'drop', forged);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(real);
  });
});

describe('the source pane', () => {
  it('a dropped payload naming the other pane than the kept drag (same rows, same id) opens nothing', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const b = await frameOf('b');
    fire(b, 'dragover', dt);
    expect(hint()).toBe(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'tmp', key: 'Ctrl' }));
    // The browser hands back the same drag with its pane rewritten: a drop on B that would now read as B's own (a move).
    const forged = transfer([FILES_ROW]);
    forged.store[FILES_ROW] = JSON.stringify({ ...JSON.parse(dt.store[FILES_ROW]!), pane: 'b' });
    fire(b, 'drop', forged);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sentChanges).toEqual([]);
    endDrag(dt);
  });

  it("pane B's folder changes mid-drag (same computer): a drop on it still copies, into its new folder", async () => {
    const r = await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    await act(async () => {
      r.router.history.push(`/files?a=atlas.00a1&ap=${enc('/home/ada')}&b=atlas.00a1&bp=${enc('/home/ada/projects')}`);
    });
    expect(await within(await table('b')).findByText('README.md')).toBeInTheDocument();
    const b = await frameOf('b');
    fire(b, 'dragover', dt);
    expect(dt.dropEffect).toBe('copy');
    expect(hint()).toBe(fill(strings['drop.copyKey'], { what: 'notes.txt', folder: 'projects', key: 'Ctrl' }));
    fire(b, 'drop', dt);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: fill(ts['copy.title'], { name: 'notes.txt' }) })).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/home/ada/projects/notes.txt']));
    endDrag(dt);
  });

  it('the panes swapped mid-drag (A now shows B\'s folder and B A\'s): the drag is over, neither pane takes it', async () => {
    const r = await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    await act(async () => {
      r.router.history.push(`/files?a=atlas.00a1&ap=${enc('/tmp')}&b=atlas.00a1&bp=${enc('/home/ada')}`);
    });
    expect(await within(await table('b')).findByText('notes.txt')).toBeInTheDocument();
    for (const k of ['a', 'b'] as const) {
      const f = await frameOf(k);
      const replay = transfer([FILES_ROW]);
      replay.store[FILES_ROW] = dt.store[FILES_ROW]!;
      fire(f, 'dragover', replay);
      expect(replay.dropEffect).toBe('none');
      expect(hint()).toBeNull();
      fire(f, 'drop', replay);
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    endDrag(dt);
  });

  it('one pane chosen mid-drag from pane B: B is gone, so its drag is over and pane A takes nothing', async () => {
    const r = await renderPage(page, two('/tmp', '/home/ada'));
    const dt = await dragFrom('b', 'notes.txt');
    expect(draggingRows()).not.toBeNull();
    await act(async () => {
      r.router.history.push(`/files?a=atlas.00a1&ap=${enc('/tmp')}&b=atlas.00a1&bp=${enc('/home/ada')}&panes=one`);
    });
    await waitFor(() => expect(screen.queryByRole('region', { name: strings['pane.b'] })).toBeNull());
    expect(draggingRows()).toBeNull();
    const a = await frameOf('a');
    fire(a, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    expect(hint()).toBeNull();
    fire(a, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(dt);
  });
});

describe('rows that cannot change', () => {
  it('a row whose name the program sent lossy does not drag', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    expect((await rowIn('a', 'caf\uFFFD')).hasAttribute('draggable')).toBe(false);
    expect((await rowIn('a', 'notes.txt')).getAttribute('draggable')).toBe('true');
  });

  it('a selection holding such a row drags, but no folder takes it (as Move selected is off)', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    await userEvent.click(within(await rowIn('a', 'notes.txt')).getByRole('checkbox'));
    await userEvent.click(within(await rowIn('a', 'caf\uFFFD')).getByRole('checkbox'));
    const dt = await dragFrom('a', 'notes.txt');
    expect(JSON.parse(dt.store[FILES_ROW]!).items).toHaveLength(2);
    const b = await frameOf('b');
    fire(b, 'dragover', dt);
    expect(dt.dropEffect).toBe('none');
    fire(b, 'drop', dt);
    expect(screen.queryByRole('dialog')).toBeNull();
    endDrag(dt);
  });
});

describe('an abandoned or ended drag, and dot parts in paths', () => {
  it('a payload equal to the kept drag but with another id (another page) opens nothing', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const kept = JSON.parse(dt.store[FILES_ROW]!) as Record<string, unknown>;
    const forged = transfer([FILES_ROW]);
    forged.store[FILES_ROW] = JSON.stringify({ ...kept, drag: 'f0f0f0f0-1234' });
    const b = await frameOf('b');
    fire(b, 'dragover', forged);
    fire(b, 'drop', forged);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sentChanges).toEqual([]);
  });

  it('an abandoned drag is over once its source row gets dragend out of the page: its payload brought back later opens nothing', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const row = await rowIn('a', 'notes.txt');
    // The row left the page while its file stayed listed (a virtual list scrolled on), and the drag was cancelled: its
    // dragend goes to the row alone, never to the document (a dragend that does not bubble stands for it). The pointer
    // moves on, with no press here.
    act(() => void row.dispatchEvent(new Event('dragend')));
    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
    expect(draggingRows()).toBeNull();
    expect(document.querySelector('[data-dragging]')).toBeNull();
    const replay = transfer([FILES_ROW]);
    replay.store[FILES_ROW] = dt.store[FILES_ROW]!;
    const b = await frameOf('b');
    fire(b, 'dragover', replay);
    expect(replay.dropEffect).toBe('none');
    fire(b, 'drop', replay);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sentChanges).toEqual([]);
  });

  it('the very payload, id included, brought back after its source row is gone: nothing takes it, with no pointer event', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    // A refresh removes the dragged row: its dragend can't reach the document, and the pointer is elsewhere.
    removeItem('/home/ada/notes.txt');
    act(() => refreshFolders('c0a7150000000000000000a1'));
    const a = await pane('a');
    await waitFor(() => expect(within(a).queryByText('notes.txt')).toBeNull());
    const replay = transfer([FILES_ROW]);
    replay.store[FILES_ROW] = dt.store[FILES_ROW]!;
    const b = await frameOf('b');
    fire(b, 'dragover', replay);
    expect(replay.dropEffect).toBe('none');
    fire(b, 'drop', replay);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sentChanges).toEqual([]);
  });

  it('the source pane moved to another folder, even one holding the same names: its drag is over', async () => {
    // The parent holds a notes.txt too: only the folder tells the two apart.
    putFile('/home/notes.txt', 1);
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    const a = await pane('a');
    // Up by key (Backspace in the list): no pointer event, so only the source check can end the drag.
    const list = await table('a');
    act(() => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    });
    expect(await within(a).findByText('ada')).toBeInTheDocument();
    expect(within(a).getByText('notes.txt')).toBeInTheDocument();
    const replay = transfer([FILES_ROW]);
    replay.store[FILES_ROW] = dt.store[FILES_ROW]!;
    const b = await frameOf('b');
    fire(b, 'dragover', replay);
    expect(replay.dropEffect).toBe('none');
    fire(b, 'drop', replay);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the source pane switched to another computer with the same folder and names: its drag is over', async () => {
    const r = await renderPage(page, { ...two('/', '/home/ada'), realm: 'all' });
    const dt = await dragFrom('a', 'tmp');
    // No pointer event: the address changes (granite's / also lists home, srv and tmp).
    await act(async () => {
      r.router.history.push(`/files?a=granite.0107&ap=${enc('/')}&b=atlas.00a1&bp=${enc('/home/ada')}`);
    });
    const a = await pane('a');
    expect(await within(a).findByRole('table', { name: fill(strings['table.label'], { name: 'granite' }) })).toBeInTheDocument();
    expect(within(a).getByText('tmp')).toBeInTheDocument();
    const replay = transfer([FILES_ROW]);
    replay.store[FILES_ROW] = dt.store[FILES_ROW]!;
    const b = await frameOf('b');
    fire(b, 'dragover', replay);
    expect(replay.dropEffect).toBe('none');
    fire(b, 'drop', replay);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the view the drag came from unmounting ends the drag', async () => {
    const r = await renderPage(page, two('/home/ada', '/tmp'));
    await dragFrom('a', 'notes.txt');
    expect(draggingRows()).not.toBeNull();
    r.unmount();
    expect(draggingRows()).toBeNull();
  });

  it('the source listing failing on a refresh mid-drag ends the drag: an old listing proves nothing', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const dt = await dragFrom('a', 'notes.txt');
    failListingOnce('/home/ada');
    act(() => refreshFolders('c0a7150000000000000000a1'));
    const a = await pane('a');
    expect((await within(a).findAllByText(/couldn|can.t|try again/i)).length).toBeGreaterThan(0);
    const replay = transfer([FILES_ROW]);
    replay.store[FILES_ROW] = dt.store[FILES_ROW]!;
    const b = await frameOf('b');
    fire(b, 'dragover', replay);
    expect(replay.dropEffect).toBe('none');
    fire(b, 'drop', replay);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('with no folder table on the page (a failed read), a file from the computer is still refused, not opened', async () => {
    failListingOnce('/tmp');
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${enc('/tmp')}` });
    const p = await pane('a');
    expect((await within(p).findAllByText(/couldn|can.t|try again/i)).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    const over = transfer(['Files']);
    const e = fire(p, 'dragover', over);
    expect(e.defaultPrevented).toBe(true);
    expect(over.dropEffect).toBe('none');
    expect(fire(p, 'drop', transfer(['Files'])).defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('rowdrag.ts', () => {
  const ok = { pane: 'a' as const, computer: 'c1', folder: '/home/ada', items: [{ path: '/home/ada/projects', name: 'projects', dir: true, size: null, modified: 5 }], drag: 'd1d2d3d4-0001' };
  it('checks a dropped payload field by field', () => {
    expect(rowPayloadOf(ok)).toEqual(ok);
    expect(rowPayloadOf(null)).toBeNull();
    expect(rowPayloadOf({ ...ok, computer: '' })).toBeNull();
    // The source pane: a or b only.
    for (const pane of [undefined, '', 'c', 'A', 1]) expect(rowPayloadOf({ ...ok, pane })).toBeNull();
    expect(rowPayloadOf({ ...ok, pane: 'b' })).toEqual({ ...ok, pane: 'b' });
    expect(rowPayloadOf({ ...ok, folder: 'home' })).toBeNull();
    expect(rowPayloadOf({ ...ok, folder: '/home//ada' })).toBeNull();
    // Dot parts, even with item paths joined from the same folder.
    for (const dotted of ['/home/../ada', '/home/./ada']) {
      expect(rowPayloadOf({ ...ok, folder: dotted, items: [{ ...ok.items[0], path: joinPath(dotted, 'projects') }] })).toBeNull();
    }
    // No drag id, or one that is not an id.
    expect(rowPayloadOf({ ...ok, drag: undefined })).toBeNull();
    expect(rowPayloadOf({ ...ok, drag: 'x' })).toBeNull();
    expect(rowPayloadOf({ ...ok, drag: 'D1D2D3D4<script>' })).toBeNull();
    // A folder written loosely (a trailing slash), even with items whose paths are joined from it the same way.
    const loose = '/home/ada/';
    expect(rowPayloadOf({ ...ok, folder: loose, items: [{ ...ok.items[0], path: joinPath(loose, 'projects') }] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [{ ...ok.items[0], path: '/etc/passwd' }] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [{ ...ok.items[0], name: 'a/b', path: '/home/ada/a/b' }] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [{ ...ok.items[0], dir: 'yes' }] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [{ ...ok.items[0], size: '1' }] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [{ ...ok.items[0], modified: Infinity }] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: [null] })).toBeNull();
    expect(rowPayloadOf({ ...ok, items: Array.from({ length: 5001 }, () => ok.items[0]) })).toBeNull();
    // Extra fields are dropped.
    expect(rowPayloadOf({ ...ok, extra: 1, items: [{ ...ok.items[0], extra: 2 }] })).toEqual(ok);
  });
  it('decides a drop: same pane move (key: copy), other pane copy (key: move), other computer refused', () => {
    const at = (pane: 'a' | 'b', computer: string, dest: string) => ({ pane, computer, dest });
    // The table: same pane, other pane same computer, other pane other computer, each with and without the key.
    expect(dropHow(ok, at('a', 'c1', '/tmp'), false)).toBe('move');
    expect(dropHow(ok, at('a', 'c1', '/tmp'), true)).toBe('copy');
    expect(dropHow(ok, at('b', 'c1', '/tmp'), false)).toBe('copy');
    expect(dropHow(ok, at('b', 'c1', '/tmp'), true)).toBe('move');
    expect(dropHow(ok, at('b', 'c2', '/tmp'), false)).toBe('otherComputer');
    expect(dropHow(ok, at('b', 'c2', '/tmp'), true)).toBe('otherComputer');
    expect(dropHow({ ...ok, pane: 'b' }, at('a', 'c1', '/tmp'), false)).toBe('copy');
    expect(dropHow({ ...ok, pane: 'b' }, at('a', 'c1', '/tmp'), true)).toBe('move');
    // Every rowsMayGo refusal stays one, on either pane, key or not.
    for (const pane of ['a', 'b'] as const) {
      for (const key of [false, true]) {
        for (const dest of ['/home/ada', '/home/ada/projects', '/home/ada/projects/x', '/a/b\\c']) expect(dropHow(ok, at(pane, 'c1', dest), key)).toBeNull();
      }
    }
    // The same pane on another computer (a source that moved): no drop, never the cross-computer words.
    expect(dropHow(ok, at('a', 'c2', '/tmp'), false)).toBeNull();
  });
  it('judges a destination', () => {
    expect(rowsMayGo(ok, 'c1', '/tmp')).toBe(true);
    expect(rowsMayGo(ok, 'c2', '/tmp')).toBe(false);
    expect(rowsMayGo(ok, 'c1', '/home/ada')).toBe(false);
    expect(rowsMayGo(ok, 'c1', '/home/ada/projects')).toBe(false);
    expect(rowsMayGo(ok, 'c1', '/home/ada/projects/x')).toBe(false);
    expect(rowsMayGo(ok, 'c1', '/home/ada/projects2')).toBe(true);
    expect(rowsMayGo({ ...ok, items: [{ ...ok.items[0]!, dir: false }] }, 'c1', '/home/ada/projects/x')).toBe(true);
    expect(rowsMayGo(ok, 'c1', '/a/b\\c')).toBe(false);
  });
  it('says why rows cannot go into a destination on their computer: already there, a folder into itself, a blocked path', () => {
    expect(rowsNoGo(ok, '/home/ada')).toBe('here');
    expect(rowsNoGo(ok, '/home/ada/projects')).toBe('intoItself');
    expect(rowsNoGo(ok, '/home/ada/projects/x')).toBe('intoItself');
    expect(rowsNoGo(ok, '/a/b\\c')).toBe('blocked');
    expect(rowsNoGo(ok, '/tmp')).toBeNull();
    expect(rowsNoGo(ok, '/home/ada/projects2')).toBeNull();
    expect(rowsNoGo({ ...ok, items: [{ ...ok.items[0]!, dir: false }] }, '/home/ada/projects/x')).toBeNull();
  });
  const { drag: _id, ...rows } = ok;
  const held = () => true;
  it('keeps the drag this tab started until it ends; a refused start keeps none', () => {
    const p = startRowDrag(rows, true, held);
    expect(draggingRows()).toBe(p);
    expect(sameDrag(rowPayloadOf(JSON.parse(JSON.stringify(p)))!, p)).toBe(true);
    document.body.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(draggingRows()).toBeNull();
    startRowDrag(rows, false, held);
    expect(draggingRows()).toBeNull();
  });

  it('each drag gets its own id: the same rows dragged again, or sent by another page, are not the kept drag', () => {
    const a = startRowDrag(rows, true, held);
    const b = startRowDrag(rows, true, held);
    expect(a.drag).not.toBe(b.drag);
    expect(sameDrag(rowPayloadOf(JSON.parse(JSON.stringify(a)))!, b)).toBe(false);
    // An equal payload built elsewhere (another tab, another page) with its own id.
    expect(sameDrag(rowPayloadOf({ ...rows, drag: 'f0f0f0f0-1234' })!, b)).toBe(false);
  });

  it('a drag still held ends on a drop here, or at the next press, even when its dragend never comes', () => {
    // A detached source: its dragend never reaches the document.
    const src = document.createElement('div');
    startRowDrag(rows, true, held);
    src.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(draggingRows()).not.toBeNull();
    document.body.dispatchEvent(new Event('drop', { bubbles: true }));
    expect(draggingRows()).toBeNull();
    startRowDrag(rows, true, held);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(draggingRows()).toBeNull();
  });

  it('a pointer move never ends the drag: Firefox and WebKit send one right after dragstart (files-drag)', () => {
    // Forgetting the drag there left every target refusing it in both browsers: no outline, no words, no drop.
    const p = startRowDrag(rows, true, held);
    window.dispatchEvent(new Event('pointermove'));
    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
    document.body.dispatchEvent(new Event('mousemove', { bubbles: true }));
    expect(draggingRows()).toBe(p);
    document.body.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(draggingRows()).toBeNull();
  });

  it('the window losing focus ends the drag: a press in another page is never seen here', () => {
    startRowDrag(rows, true, held);
    window.dispatchEvent(new Event('blur'));
    expect(draggingRows()).toBeNull();
  });

  it('a view ending ends only its own drag, never one another view started', () => {
    const mine = () => true;
    const other = () => true;
    const p = startRowDrag(rows, true, mine);
    endRowDragFrom(other);
    expect(draggingRows()).toBe(p);
    endRowDragFrom(mine);
    expect(draggingRows()).toBeNull();
  });

  it('a drag its source no longer holds is over at once, with no event at all', () => {
    let holds = true;
    const p = startRowDrag(rows, true, (q) => holds && q === p);
    expect(draggingRows()).toBe(p);
    holds = false;
    expect(draggingRows()).toBeNull();
    // Over for good: the source holding it again does not bring it back.
    holds = true;
    expect(draggingRows()).toBeNull();
  });
});
