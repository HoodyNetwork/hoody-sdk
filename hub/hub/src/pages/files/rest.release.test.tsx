// Vitest: Copy the rest when letting the held copy go is refused or not stored (core dismissOne answers
// false: an account switch in its store-lock turn, a failed write). Nothing is sent, it says so, the copy stays held,
// and the press can be made again. The refusal itself is core's (locked.dismissone.test.tsx); here it is stubbed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { queryClient } from '@core';
import type * as Data from './data';
import { addDir, failListingWhile, removeItem, resetFiles, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

// refuse: dismissOne answers false. readGate / rereadGate: while set, the opening read (copy.readBack) and the
// read after the run (rereadCopy) wait on it. real: the real copy hook, for a test that lets the hold go itself.
const h = vi.hoisted(() => ({ refuse: true, asked: [] as unknown[], readGate: null as Promise<void> | null, rereadGate: null as Promise<void> | null, real: null as unknown, held: [] as unknown[], c: null as unknown }));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useFolder: (...a: Parameters<typeof m.useFolder>) => { if (a[0]) h.c = a[0]; return m.useFolder(...a); },
    useHeldOn: (id: string | undefined) => { const rows = m.useHeldOn(id); if (rows.length) h.held = rows.map((r) => r.identity); return rows; },
    rereadCopy: () => (h.rereadGate ? h.rereadGate.then(() => m.rereadCopy()) : m.rereadCopy()),
    useFilesChange: (kind: Data.ChangeKind) => {
      const real = m.useFilesChange(kind);
      if (kind !== 'copy') return real;
      h.real = real;
      return {
        ...real,
        readBack: () => (h.readGate ? h.readGate.then(() => real.readBack()) : real.readBack()),
        dismissOne: (id: unknown) => { h.asked.push(id); return h.refuse ? Promise.resolve(false) : real.dismissOne(id); },
      };
    },
  };
});
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const held = fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' });

beforeEach(() => { resetFiles(); h.refuse = true; h.asked = []; h.readGate = null; h.rereadGate = null; h.real = null; h.held = []; h.c = null; });

/** Copies projects to /tmp, cut part way (README.md only), and closes the dialog. */
async function cut(state = 'folderCutFirst') {
  await renderPage(page, { path: `/files?a=atlas.00a1&ap=${enc('/home/ada')}&b=atlas.00a1&bp=${enc('/tmp')}`, state });
  const pane = await screen.findByRole('region', { name: strings['pane.a'] });
  const r = await within(await within(pane).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) })).findByRole('row', { name: /projects/ });
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
  const d = await screen.findByRole('dialog');
  const first = within(d).getByRole('button', { name: ts['copy.primary'] });
  await waitFor(() => expect(first).toBeEnabled());
  await userEvent.click(first);
  expect(await within(d).findByText(fill(ts['held.copyPart'], { count: '3', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
  await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}
const openRest = async () => {
  await userEvent.click((await screen.findAllByRole('button', { name: ts['rest.action'] }, { timeout: 10_000 }))[0]!);
  return screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
};

describe('Copy the rest: what it reads before it plans, and after the run', () => {
  it('no plan before the opening read has answered: the compare read before it is never planned from', async () => {
    await cut();
    const g = gate();
    h.readGate = g.p;
    const d = await openRest();
    // The compare read before opening (site missing) is there, but the read on opening has not answered yet.
    expect(await within(d).findByText(fill(ts['rest.checking'], { dest: '/tmp/projects' }))).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(within(d).queryByRole('list', { name: ts['several.listLabel'] })).toBeNull();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    g.open();
    expect(await within(d).findByRole('list', { name: ts['several.listLabel'] }, { timeout: 10_000 })).toBeInTheDocument();
  }, 40_000);

  it('after the run nothing is said of what is left until the copy is read again', async () => {
    h.refuse = false;
    await cut();
    const g = gate();
    h.rereadGate = g.p;
    const d = await openRest();
    await within(d).findByRole('list', { name: ts['several.listLabel'] }, { timeout: 10_000 });
    // site is made meanwhile (empty): the dialog stays open to say so, and then what is left.
    addDir('/tmp/projects/site');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    expect(await within(d).findByText(ts['several.madeMeanwhile'], {}, { timeout: 10_000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(within(d).queryByText(/still missing or different|holds the whole copy/i)).toBeNull();
    g.open();
    expect(await within(d).findByText(fill(ts['rest.afterPart'], { count: '2', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
  }, 40_000);

  it('every item sent, but the read since finds one missing: it stays open, says so, and offers the next press', async () => {
    h.refuse = false;
    await cut();
    const g = gate();
    h.rereadGate = g.p;
    const d = await openRest();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects', 'copy:/home/ada/projects/site>/tmp/projects/site']), { timeout: 10_000 });
    // Meanwhile something else takes README.md out of the copy.
    removeItem('/tmp/projects/README.md');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) })).toBeInTheDocument();
    g.open();
    expect(await within(d).findByText(fill(ts['rest.afterPart_one'], { count: '1', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['rest.action'] })).toBeEnabled();
  }, 40_000);

  it('every item sent, but the read since fails: it stays open and says it cannot tell (no next press)', async () => {
    h.refuse = false;
    await cut();
    const g = gate();
    h.rereadGate = g.p;
    const d = await openRest();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toHaveLength(2), { timeout: 10_000 });
    // No read in flight (the read since would join a pane's refetch already answered), then every /tmp listing fails
    // until the dialog has its answer (under load a pane's refetch answered it, and the dialog said the copy was whole).
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), { timeout: 10_000 });
    const stop = failListingWhile('/tmp');
    g.open();
    expect(await within(d).findByText(fill(ts['rest.afterFailed'], { dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    stop();
    expect(screen.getByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: ts['rest.action'] })).toBeNull();
  }, 40_000);

  it('its copy let go and the same copy held again under another press: that new hold is not its own, so nothing is sent', async () => {
    await cut('folderCutFirstLost');
    const d = await openRest();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    const real = h.real as { dismissOne(id: unknown): Promise<boolean>; run(v: unknown): Promise<unknown> };
    const first = h.held[0] as { op?: string };
    await act(async () => { await real.dismissOne(first); });
    // Another press of the same folder copy (its own op), whose answer is lost: held again, same paths.
    // (The part-made copy was taken away first, so this press is not refused as a name taken.)
    removeItem('/tmp/projects');
    await act(async () => { await real.run({ c: h.c, path: '/home/ada/projects', dest: '/tmp/projects', op: 'another-press', dir: true, size: null, modified: null }); });
    await waitFor(() => expect(h.held).toEqual([expect.objectContaining({ path: '/home/ada/projects', dest: '/tmp/projects', op: 'another-press' })]), { timeout: 10_000 });
    expect(first.op).not.toBe('another-press');
    await waitFor(() => expect(go).toBeDisabled(), { timeout: 10_000 });
    await userEvent.click(go);
    expect(h.asked).toEqual([]);
    expect(sentChanges).toHaveLength(2);
  }, 40_000);

  it('a hold already gone by the press (let go elsewhere) is not asked for again: the rest is sent', async () => {
    await cut();
    const d = await openRest();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    // Dismissed in the band meanwhile (the real hook, warned there).
    expect(h.held).toEqual([expect.objectContaining({ kind: 'copy', path: '/home/ada/projects', dest: '/tmp/projects' })]);
    await act(async () => { await (h.real as { dismissOne(id: unknown): Promise<boolean> }).dismissOne(h.held[0]); });
    await waitFor(() => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0));
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects', 'copy:/home/ada/projects/site>/tmp/projects/site']), { timeout: 10_000 });
    expect(h.asked).toEqual([]);
    expect(within(d).queryByText(ts['rest.releaseFailed'])).toBeNull();
  }, 40_000);
});

describe('Copy the rest: the held copy is not let go', () => {
  it('nothing is sent, the dialog says so, the copy stays held; the next press lets it go and sends', async () => {
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${enc('/home/ada')}&b=atlas.00a1&bp=${enc('/tmp')}`, state: 'folderCutFirst' });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    const r = await within(await within(pane).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) })).findByRole('row', { name: /projects/ });
    await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
    let d = await screen.findByRole('dialog');
    const first = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(first).toBeEnabled());
    await userEvent.click(first);
    expect(await within(d).findByText(fill(ts['held.copyPart'], { count: '3', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    await userEvent.click((await screen.findAllByRole('button', { name: ts['rest.action'] }, { timeout: 10_000 }))[0]!);
    d = await screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    expect(await within(d).findByText(ts['rest.releaseFailed'])).toBeInTheDocument();
    expect(h.asked).toEqual([expect.objectContaining({ kind: 'copy', path: '/home/ada/projects', dest: '/tmp/projects' })]);
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
    expect(screen.getAllByText(held, { exact: false }).length).toBeGreaterThan(0);
    // Not frozen: the press can be made again; this time the copy is let go and the rest is sent.
    h.refuse = false;
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects', 'copy:/home/ada/projects/site>/tmp/projects/site']), { timeout: 10_000 });
    await waitFor(() => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0), { timeout: 10_000 });
  }, 40_000);
});
