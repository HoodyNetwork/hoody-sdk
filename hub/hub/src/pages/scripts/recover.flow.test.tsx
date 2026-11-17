// Vitest: a draft this tab does not hold (a reload, another tab's URL) comes back
// from its stored record through the one restore predicate, at page level. One row per case: the record's own project only
// (a record of another project is never bound here), a running attempt's prompt restores the inputs and opens Build, a minted id with a stored record is that
// record's draft, a prompt that is not the Hub's shape asks on Where, a hold moves only on a definite
// read, and the leave guard compares against the restore only when it is a definite one.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  prompt: 'unreadable' as { text: string } | 'none' | 'unreadable',
  reads: 0,
  writes: [] as Array<{ path: string }>,
  // The overview still loading (no data), or showing a computer whose agent reports no writer; wake re-renders its readers.
  loading: false,
  noWriter: false,
  wakers: new Set<() => void>(),
}));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  const { useEffect, useState } = await import('react');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: (() => {
      const normal = fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1')]);
      const writerless = fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1', { owner: undefined })]);
      return () => {
        const [, set] = useState(0);
        useEffect(() => { const w = () => set((x) => x + 1); io.wakers.add(w); return () => { io.wakers.delete(w); }; }, []);
        const o = (io.noWriter ? writerless : normal)();
        return io.loading ? { ...o, data: undefined, items: undefined, isPending: true } : o;
      };
    })(),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useBoundSends: () => ({
      shown: true,
      validate: async () => ({ outcome: 'done', data: { publishable: true, results: { dependencies: {} } } }),
      resolve: async () => ({ outcome: 'done', data: { matched: false } }),
      write: async (v: { path: string }) => { io.writes.push(v); return { outcome: 'pending' }; },
      instantiate: async () => ({ outcome: 'pending' }),
      exists: async () => null,
      clock: async () => 1000,
    }),
    // The attempt's stored prompt, as the test sets it (data.ts attemptPrompt reads the session's transcript).
    attemptPrompt: async () => { io.reads += 1; return io.prompt; },
  };
});

import { capture, dropDraftRecord, fixtureWorld, SCRIPT_ASKS_KEY, switchLosses, type DraftRecord } from '@core';
import page from './page';
import { clearDrafts, getDraft } from './new/draft';
import { mintDraft } from './new/Flow';
import { ATLAS, clearScriptStore, shown } from './new/flowfix';
import { buildPrompt, MARKER } from './new/prompt';
import { beginDeploy, markDeploy, nextAttempt, openRecord, readDraftRecord } from './new/records';
import { NO_WRITER } from './new/record';
import strings from './strings.en.json';

const SLOW = { timeout: 14000 };
const ID = 'rstrdrafta';
const PROJECT = fixtureWorld.computers.find((c) => c.id === ATLAS)?.project_id ?? 'p1';
const HOME = { target: { project: { id: PROJECT }, container: { id: ATLAS } }, realm: 'global', owner: 'fp1', exec: 1 };
const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const PROMPT = (() => { const p = buildPrompt('Mail the weekly digest', { address: '/weekly-digest', schedule: null, exec: 1 }); if (!p.ok) throw new Error(p.why); return p.text; })();

/** The page shown first (the account signs in), then the stored draft with attempt 1, then its URL opened as a reload would. */
async function reloadInto(o: { project?: string; mint?: boolean; exec?: number } = {}) {
  const r = await renderPage(page, { state: 'many', path: '/scripts' });
  await screen.findByRole('heading', { level: 1 }, SLOW);
  const b0 = o.project ? { ...HOME, target: { ...HOME.target, project: { id: o.project } } } : HOME;
  const b = o.exec ? { ...b0, exec: o.exec } : b0;
  const opened = await openRecord(ID, 'ai', b as never);
  expect(opened.ok).toBe(true);
  const n = await nextAttempt(readDraftRecord(ID) as DraftRecord, false);
  expect(n.ok).toBe(true);
  if (o.mint) mintDraft(ID);
  await act(async () => { r.router.history.push(`/scripts/new/${ID}`); });
  return r;
}

beforeEach(async () => {
  clearDrafts();
  shown.id = ATLAS;
  await clearScriptStore();
  io.prompt = 'unreadable';
  io.reads = 0;
  io.writes.length = 0;
  io.loading = false;
  io.noWriter = false;
});

describe('New script: a stored draft comes back through the restore predicate', () => {
  it('a record of another project with the same container id is gone here, never bound to this one', async () => {
    io.prompt = { text: PROMPT };
    await reloadInto({ project: 'pzzzzzzzzzzzzzzzzzzzzzzz' });
    expect(await screen.findByText(strings['flow.gone.title'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(0);
  });

  it('the attempt\'s stored prompt restores the inputs and opens on Build, with no ?step', async () => {
    io.prompt = { text: PROMPT };
    const r = await reloadInto();
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=where`); });
    expect(((await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW)) as HTMLInputElement).value).toBe('/weekly-digest');
    expect(screen.getByText(strings['flow.where.restored'])).toBeTruthy();
  });

  it('a minted id that already has a stored record opens that record\'s draft, never a fresh one', async () => {
    io.prompt = { text: PROMPT };
    const r = await reloadInto({ mint: true });
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=what`); });
    expect(((await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW)) as HTMLTextAreaElement).value).toBe('Mail the weekly digest');
  });

  it('a prompt that is not the Hub\'s shape opens on Where with its proven description, settings to confirm', async () => {
    io.prompt = { text: `Mail the weekly digest\n\n${MARKER}\nLength: 22\nAddress: nope\nRuns: only when its address is called` };
    const r = await reloadInto();
    await waitFor(() => expect(loc(r)).toMatch(/step=where/), SLOW);
    expect(await screen.findByText(strings['flow.where.restored'], undefined, SLOW)).toBeTruthy();
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=check`); });
    // Check is out of reach until the person confirms on Where: the wizard clamps back.
    await waitFor(() => expect(loc(r)).not.toMatch(/step=check/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=what`); });
    expect(((await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW)) as HTMLTextAreaElement).value).toBe('Mail the weekly digest');
  });

  it('with every step done but the restored link not confirmed on Where, Check stays out of reach', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts' });
    await screen.findByRole('heading', { level: 1 }, SLOW);
    expect((await openRecord(ID, 'write', HOME as never)).ok).toBe(true);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=where`); });
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/notes');
    // Write reached by its URL, not by leaving Where forward (that is the confirmation).
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=write`); });
    const code = (await screen.findByRole('textbox', { name: strings['new.code'] }, SLOW)) as HTMLTextAreaElement;
    await user.clear(code);
    await user.type(code, 'export default () => new Response("n");');
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=check`); });
    await waitFor(() => expect(loc(r)).toMatch(/step=(write|where)/), SLOW);
  }, 60000);

  it('leaving Where forward confirms the settings; the restored note then goes', async () => {
    const user = userEvent.setup();
    io.prompt = { text: `Mail the weekly digest\n\n${MARKER}\nLength: 22\nAddress: nope\nRuns: only when its address is called` };
    const r = await reloadInto();
    await waitFor(() => expect(loc(r)).toMatch(/step=where/), SLOW);
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/digest');
    await user.click(screen.getByRole('button', { name: strings['flow.where.build'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=where`); });
    await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    expect(screen.queryByText(strings['flow.where.restored'])).toBeNull();
  });

  it('can\'t tell yet holds with Check again; Check again with a definite read restores', async () => {
    const user = userEvent.setup();
    await reloadInto();
    expect(await screen.findByText(strings['flow.hold.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.gone.title'])).toBeNull();
    const before = io.reads;
    io.prompt = { text: PROMPT };
    await user.click(screen.getByRole('button', { name: strings['flow.hold.check'] }));
    await waitFor(() => expect(io.reads).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText(strings['flow.hold.title'])).toBeNull(), SLOW);
    expect(screen.queryByText(strings['flow.gone.title'])).toBeNull();
  });

  it('a hold moves to DraftGone only on a definite read (the record gone), never by itself', async () => {
    await reloadInto();
    expect(await screen.findByText(strings['flow.hold.title'], undefined, SLOW)).toBeTruthy();
    await new Promise((res) => setTimeout(res, 300));
    expect(screen.getByText(strings['flow.hold.title'])).toBeTruthy();
    await act(async () => { await dropDraftRecord(readDraftRecord(ID) as DraftRecord); });
    expect(await screen.findByText(strings['flow.gone.title'], undefined, SLOW)).toBeTruthy();
  });

  it('the leave guard: a definite restore asks nothing before an edit (a reload brings it all back)', async () => {
    io.prompt = { text: PROMPT };
    const r = await reloadInto();
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await waitFor(() => expect(switchLosses()).toEqual([]));
  });

  it('the leave guard: a confirm restore still names what a reload would lose', async () => {
    io.prompt = { text: 'no block at all' };
    await reloadInto();
    // No proven description: the flow opens on What, which needs it typed again.
    await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW);
    await waitFor(() => expect(switchLosses().length).toBeGreaterThan(0));
  });
});

describe('a restore waits for its computer, keeps its folder and address, and needs no agent writer', () => {
  it('while the overview is still loading the restore never clamps to Where; it lands on Build once it can judge', async () => {
    io.prompt = { text: PROMPT };
    io.loading = true;
    const r = await reloadInto();
    await waitFor(() => expect(io.reads).toBeGreaterThan(0), SLOW);
    await act(async () => { await new Promise((z) => setTimeout(z, 300)); });
    expect(loc(r)).not.toMatch(/step=where/);
    io.loading = false;
    await act(async () => { for (const w of io.wakers) w(); });
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    expect(loc(r)).not.toMatch(/step=where/);
  }, 60000);

  it('a folder-3 draft opened without ?exec opens in folder 3 (the page address follows the record)', async () => {
    const p = buildPrompt('Mail the weekly digest', { address: '/weekly-digest', schedule: null, exec: 3 });
    if (!p.ok) throw new Error(p.why);
    io.prompt = { text: p.text };
    const r = await reloadInto({ exec: 3 });
    await waitFor(() => expect(loc(r)).toMatch(/exec=3/), SLOW);
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=where&exec=1`); });
    await waitFor(() => expect(loc(r)).toMatch(/exec=3/), SLOW);
  }, 60000);

  it('a reservation reloaded past open shows its own address, never a suggested one', async () => {
    const r = await renderPage(page, { state: 'many', path: '/scripts' });
    await screen.findByRole('heading', { level: 1 }, SLOW);
    expect((await openRecord(ID, 'write', HOME as never)).ok).toBe(true);
    expect((await beginDeploy(readDraftRecord(ID) as DraftRecord, { kind: 'write', path: 'default/1/notes.ts', opId: 'a'.repeat(32), sentAfter: 1000, attempt: 0 })).ok).toBe(true);
    await markDeploy(readDraftRecord(ID) as DraftRecord, 'a'.repeat(32), 'held');
    await act(async () => { r.router.history.push(`/scripts/new/${ID}`); });
    await waitFor(() => expect(loc(r)).toMatch(/step=live/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=where`); });
    expect(((await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW)) as HTMLInputElement).value).toBe('/notes');
  }, 60000);

  it('a written draft on a computer whose agent reports no writer is recorded, sent, and restores', async () => {
    const user = userEvent.setup();
    io.noWriter = true;
    mintDraft('nowriter01');
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/nowriter01' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/notes');
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=write/), SLOW);
    const code = screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement;
    await user.clear(code);
    await user.type(code, 'export default () => new Response("n");');
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await screen.findByText(strings['flow.check.ready'], undefined, SLOW);
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=live/), SLOW);
    await user.click(await screen.findByRole('button', { name: strings['flow.live.go'] }, SLOW));
    await waitFor(() => expect(io.writes).toHaveLength(1), SLOW);
    const stored = readDraftRecord('nowriter01') as DraftRecord;
    expect(stored.owner).toBe(NO_WRITER);
  }, 90000);
});

describe('a restored draft keeps its edits and its build baseline, and Check again reads its record again', () => {
  const describeBox = async () => (await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW)) as HTMLTextAreaElement;

  it('an edit made before a conflicting ?exec survives the folder correction (the flow stays mounted)', async () => {
    const user = userEvent.setup();
    const p = buildPrompt('Mail the weekly digest', { address: '/weekly-digest', schedule: null, exec: 3 });
    if (!p.ok) throw new Error(p.why);
    io.prompt = { text: p.text };
    const r = await reloadInto({ exec: 3 });
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=what&exec=3`); });
    await user.type(await describeBox(), ' now');
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=what&exec=1`); });
    await waitFor(() => expect(loc(r)).toMatch(/exec=3/), SLOW);
    expect((await describeBox()).value).toBe('Mail the weekly digest now');
  }, 60000);

  it('the attempt\'s build baseline survives leaving the wizard and coming back to the edited draft', async () => {
    const user = userEvent.setup();
    io.prompt = { text: PROMPT };
    const r = await reloadInto();
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=what`); });
    await user.type(await describeBox(), ' now');
    await act(async () => { r.router.history.push('/scripts'); });
    await screen.findByRole('heading', { level: 1 }, SLOW);
    await act(async () => { r.router.history.push(`/scripts/new/${ID}?step=what`); });
    expect((await describeBox()).value).toBe('Mail the weekly digest now');
    const c = capture();
    const held = getDraft(c.account ?? '', c.realm ?? '', ID);
    // Check compares against what the attempt was asked with, never the inputs as edited since.
    expect(held?.builtWith).toEqual({ description: 'Mail the weekly digest', route: '/weekly-digest', schedule: null, compId: ATLAS });
    expect(held?.description).toBe('Mail the weekly digest now');
  }, 60000);

  it('Check again reads a record that could not be read again, with no store change in between', async () => {
    const user = userEvent.setup();
    io.prompt = { text: PROMPT };
    const r = await renderPage(page, { state: 'many', path: '/scripts' });
    await screen.findByRole('heading', { level: 1 }, SLOW);
    expect((await openRecord(ID, 'ai', HOME as never)).ok).toBe(true);
    expect((await nextAttempt(readDraftRecord(ID) as DraftRecord, false)).ok).toBe(true);
    // eslint-disable-next-line no-restricted-properties -- the test plays a browser that cannot read its storage (as apps/github/held.accept.test.ts)
    const store = globalThis.localStorage;
    const real = store.getItem.bind(store);
    const spy = vi.spyOn(store, 'getItem').mockImplementation((k: string) => {
      if (k === SCRIPT_ASKS_KEY) throw new Error('storage unavailable');
      return real(k);
    });
    try {
      await act(async () => { r.router.history.push(`/scripts/new/${ID}`); });
      expect(await screen.findByText(strings['flow.hold.title'], undefined, SLOW)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
    await user.click(screen.getByRole('button', { name: strings['flow.hold.check'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=build/), SLOW);
  }, 60000);
});
