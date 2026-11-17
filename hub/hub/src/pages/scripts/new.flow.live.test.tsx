// Vitest (New script, deploy.ts): Make it live sends exactly the
// checked bytes once, the draft reserved first; a refusal before anything was sent says what fixes it and leaves Make it live
// pressable; no answer of a send frees the reservation (C9): a send known not sent offers Try again under the same op, anything
// else holds the draft ("Not known if it's live") until Check finds the script on the bound computer, or a warned Discard.
// A Check that hoody-exec answers "Script not found" for says no script was found and offers Deploy again: the same op, once
// with a warned Discard; while core still holds a send of the address it says so and moves nothing; one
// with no answer says so, with its cause when known. The script, the public link and an idea's key are
// separate outcomes. The draft records are the real draft records, in this test's localStorage.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Records from './new/records';

type R = { outcome: string; data?: unknown; code?: string };
const io = vi.hoisted(() => ({
  writes: [] as Array<{ compId: string; path: string; content: string; ifRevision: string | null; opId: string }>,
  writeAnswer: { outcome: 'done', data: { revision: 'r1' } } as R,
  writeAnswers: [] as R[],
  clock: 1000 as number | null,
  exists: [] as Array<{ path: string; compId?: string }>,
  existsAnswer: true as boolean | null | 'timeout' | 'unreachable' | 'server',
  // The Check's hold lookups and releases (heldOf / heldAt / release): `holds` false makes core hold no send of the op;
  // `others`: core also holds another send of the address; `freeOk` false: core won't free the op's own send.
  held: [] as Array<{ kind: string; path: string; opId: string; compId?: string }>,
  released: [] as Array<{ kind: string; hold: unknown }>,
  holds: true,
  others: false,
  freeOk: true,
  // The journal's answer for the op a found Check asks about.
  settled: [] as Array<{ opId: string; sentAfter: number }>,
  // null: as hoody-exec's journal would answer the case: fenced when the read finds no script, committed when it finds it.
  settleAnswer: null as { state: string; revision?: string | null } | null,
  aliases: [] as Array<{ target: string; alias?: string }>,
  aliasAnswer: { outcome: 'done' } as R,
  inst: [] as Array<{ name: string; path: string; callerKey?: string; idem?: string }>,
  instAnswer: { outcome: 'done', data: { path: 'health.ts' } } as R,
  // Runs once just before this tab's reservation is taken: another tab wins the draft first.
  beforeBegin: null as null | (() => Promise<void>),
  // The project the Hub's shown target carries, when a test sets one (else the containers list's own project).
  shownProject: null as string | null,
}));

vi.mock('./new/records', async (orig) => {
  const real = await orig<typeof Records>();
  return { ...real, beginDeploy: async (...a: Parameters<typeof real.beginDeploy>) => { const f = io.beforeBegin; io.beforeBegin = null; if (f) await f(); return real.beginDeploy(...a); } };
});

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    // An empty shown id: no computer selected in the Hub.
    useScriptsTarget: () => (fx.shown.id ? (io.shownProject ? { project: { id: io.shownProject }, container: { id: fx.shown.id } } : fx.targetOf(fx.shown.id)) : null),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    // The bound sends: each goes to the draft's computer (recorded with the binding's target).
    useBoundSends: (b: { target: { container: { id: string } } } | null) => {
      const at = b ? { compId: b.target.container.id } : {};
      return {
        shown: true,
        validate: async () => ({ outcome: 'done', data: { publishable: true, results: { dependencies: {} } } }),
        resolve: async () => ({ outcome: 'done', data: { matched: false } }),
        write: async (v: object) => { io.writes.push({ ...v, ...at } as never); return io.writeAnswers.shift() ?? io.writeAnswer; },
        instantiate: async (v: object) => { io.inst.push({ ...v, ...at } as never); return io.instAnswer; },
        exists: async (path: string) => { io.exists.push({ path, ...at }); return io.existsAnswer; },
        heldOf: async (kind: string, path: string, opId: string) => { io.held.push({ kind, path, opId, ...at }); return io.holds ? { hold: `h-${opId}`, at: 1, identity: { path, opId }, target: null, account: 'acc' } : undefined; },
        heldAt: async (_kind: string, path: string) => {
          const op = io.held[io.held.length - 1]?.opId;
          return [
            ...(io.holds && op ? [{ hold: `h-${op}`, at: 1, identity: { path, opId: op }, target: null, account: 'acc' }] : []),
            ...(io.others ? [{ hold: 'h-other', at: 1, identity: { path, opId: 'other' }, target: null, account: 'acc' }] : []),
          ];
        },
        release: async (kind: string, hold: unknown) => { io.released.push({ kind, hold }); return io.freeOk; },
        clock: async () => io.clock,
        settle: async (opId: string, sentAfter: number) => { io.settled.push({ opId, sentAfter }); return io.settleAnswer ?? (io.existsAnswer === false ? { state: 'not_sent' } : { state: 'done', revision: 'r1' }); },
      };
    },
    useAliasCreate: () => ({ mutateAsync: async (v: never) => { io.aliases.push(v); return io.aliasAnswer; } }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import { BOREALIS, clearScriptStore, shown, targetOf } from './new/flowfix';
import { beginDeploy, finishDeploy, markAbsent, readDraftRecord } from './new/records';
import type { DraftRecord } from '@core';
import strings from './strings.en.json';
import { pathFor } from './logic';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const codeBox = () => screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement;
const btn = (key: keyof typeof strings) => screen.getByRole('button', { name: strings[key] });
const off = (b: HTMLElement) => (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true';
const fill = (key: keyof typeof strings, v: Record<string, string>) => Object.entries(v).reduce((t, [k, x]) => t.replace(`{{${k}}}`, x), strings[key] as string);
const CODE = 'export default () => new Response("notes");';
const ATLAS_ID = 'c0a7150000000000000000a1';

async function toLive(o: { link?: boolean; code?: string } = {}) {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
  const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
  await user.clear(address);
  await user.type(address, '/notes');
  if (o.link) await user.click(screen.getByRole('switch', { name: strings['link.also'] }));
  await user.click(btn('flow.continue'));
  await waitFor(() => expect(loc(r)).toMatch(/step=write/));
  await user.clear(codeBox());
  await user.type(codeBox(), o.code ?? CODE);
  await user.click(btn('flow.continue'));
  await screen.findByText(strings['flow.check.ready'], undefined, SLOW);
  await user.click(btn('flow.continue'));
  await waitFor(() => expect(loc(r)).toMatch(/step=live/));
  return { r, user };
}

beforeEach(async () => {
  vi.useRealTimers();
  clearDrafts(); mintDraft('aaaaaaaaaa');
  shown.id = ATLAS_ID;
  io.beforeBegin = null;
  io.shownProject = null;
  await clearScriptStore();
  io.writes.length = 0;
  io.writeAnswers.length = 0;
  io.exists.length = 0;
  io.held.length = 0;
  io.released.length = 0;
  io.holds = true;
  io.others = false;
  io.freeOk = true;
  io.settled.length = 0;
  io.settleAnswer = null;
  io.aliases.length = 0;
  io.inst.length = 0;
  io.clock = 1000;
  io.existsAnswer = true;
  io.writeAnswer = { outcome: 'done', data: { revision: 'r1' } };
  io.aliasAnswer = { outcome: 'done' };
  io.instAnswer = { outcome: 'done', data: { path: 'health.ts' } };
});

describe('New script flow: Make it live', () => {
  it('sends exactly the checked bytes as a create; "It\'s live" shows its address; Done opens the new row', async () => {
    const { r, user } = await toLive();
    expect(screen.getByText(fill('flow.live.lead', { route: '/notes', computer: 'atlas' }))).toBeTruthy();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(1);
    expect(io.writes[0]).toMatchObject({ compId: ATLAS_ID, path: pathFor('/notes'), content: CODE, ifRevision: null });
    expect(io.writes[0]?.opId).toMatch(/^[0-9a-f]{32}$/);
    expect(screen.getByText(/\/notes$/)).toBeTruthy();
    // No link was asked for: nothing about one.
    expect(io.aliases).toHaveLength(0);
    await user.click(btn('flow.live.finish'));
    await waitFor(() => expect(loc(r)).toMatch(/^\/scripts\?sel=/));
    expect(loc(r)).not.toMatch(/tab=/);
  });

  it('once it is live nothing walks back into the made draft: no Cancel, no Back, no step of the strip is a press; Done is the way out', async () => {
    const { user } = await toLive();
    // Before the send: Cancel, Back and the strip's done steps are there.
    expect(btn('new.cancel')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Go back to step/ }).length).toBeGreaterThan(0);
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['new.cancel'] })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Go back to step/ })).toHaveLength(0);
    expect(btn('flow.live.finish')).toBeTruthy();
  });

  it('once it is live the browser\'s Back (an earlier ?step) does not reopen the made draft: the receipt stays', async () => {
    const { r, user } = await toLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    await act(async () => { r.router.history.back(); });
    await waitFor(() => expect(loc(r)).toMatch(/step=live/), SLOW);
    expect(screen.getByText(strings['flow.live.done'])).toBeTruthy();
    expect(btn('flow.live.finish')).toBeTruthy();
    // A typed earlier step is put back too.
    await act(async () => { await r.router.navigate({ to: r.router.state.location.pathname, search: { step: 'write' } as never }); });
    await waitFor(() => expect(loc(r)).toMatch(/step=live/), SLOW);
    expect(screen.getByText(strings['flow.live.done'])).toBeTruthy();
  });

  it('a script its code turns off says so before and after it is made live: never that it answers', async () => {
    const { user } = await toLive({ code: `// @enabled false\n${CODE}` });
    expect(screen.getByText(fill('flow.live.leadOff', { route: '/notes', computer: 'atlas' }))).toBeTruthy();
    expect(screen.getByText(strings['flow.live.startsOff'])).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.starts'])).toBeNull();
    expect(screen.queryByText(fill('flow.live.lead', { route: '/notes', computer: 'atlas' }))).toBeNull();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes[0]?.content).toBe(`// @enabled false\n${CODE}`);
    expect(screen.getByText(strings['flow.live.off'])).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.answering'])).toBeNull();
  });

  it('Try it opens the new script\'s Test tab', async () => {
    const { r, user } = await toLive();
    await user.click(btn('flow.live.go'));
    const tryIt = await screen.findByRole('button', { name: strings['flow.live.try'] }, SLOW);
    // Try it, Open and Another: one kit inline row that never folds; one primary per
    // screen, the wizard foot's Finish; Try it is an ordinary action.
    const row = screen.getByRole('group', { name: strings['flow.live.doneActions'] });
    expect([...row.querySelectorAll('[data-action-id]')].map((b) => b.getAttribute('data-action-id'))).toEqual(['try', 'open', 'another']);
    expect(tryIt).not.toHaveAttribute('data-variant', 'primary');
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary').map((b) => b.textContent)).toEqual([strings['flow.live.finish']]);
    await user.click(tryIt);
    await waitFor(() => expect(loc(r)).toMatch(/tab=test/));
  });

  it('a refusal before anything was sent says so and leaves Make it live pressable; nothing is written', async () => {
    io.clock = null;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['live.notSent'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(0);
    await waitFor(() => expect(off(btn('flow.live.go'))).toBe(false));
    io.clock = 1000;
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(1);
  });

  it('the computer\'s definite refusal of a first send says not made, in its own words, and frees the draft: Change the address, Make it live off with its reason, never "It may be live"', async () => {
    io.writeAnswer = { outcome: 'failed', code: 'REVISION_MISMATCH' };
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['live.taken.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(fill('live.taken.body', { route: '/notes', computer: 'atlas' }))).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.held.titleRefused'])).toBeNull();
    expect(screen.queryByText(strings['flow.live.held.title'])).toBeNull();
    expect(screen.queryByText(fill('flow.live.held.refused', { computer: 'atlas' }))).toBeNull();
    expect(screen.getByRole('button', { name: strings['flow.live.act.changeAddress'] })).toBeTruthy();
    // The address is the only way on: Make it live waits for a new one, and says so.
    expect(off(btn('flow.live.go'))).toBe(true);
    expect(screen.getByRole('button', { name: strings['flow.live.go'], description: strings['flow.live.pickAnother'] })).toBeTruthy();
    await user.click(btn('flow.live.go'));
    expect(screen.queryByText(strings['flow.live.done'])).toBeNull();
    expect(io.writes).toHaveLength(1);
  });

  it('after the address was just taken, Make it live stays off on the same address and comes back with a new one; the send goes to the new address', async () => {
    io.writeAnswer = { outcome: 'failed', code: 'REVISION_MISMATCH' };
    const { r, user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['live.taken.title'], undefined, SLOW);
    // Back to Check and on again on the same address: still off.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
    await user.click(await screen.findByRole('button', { name: strings['flow.continue'] }, SLOW));
    await waitFor(() => expect(loc(r)).toMatch(/step=live/));
    expect(off(btn('flow.live.go'))).toBe(true);
    // Change the address: a new one, through Write and Check again, and Make it live sends it.
    await user.click(screen.getByRole('button', { name: strings['flow.live.act.changeAddress'] }));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/notes2');
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=write/));
    await user.click(btn('flow.continue'));
    await screen.findByText(strings['flow.check.ready'], undefined, SLOW);
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=live/));
    io.writeAnswer = { outcome: 'done', data: { revision: 'r1' } };
    expect(off(btn('flow.live.go'))).toBe(false);
    await user.click(btn('flow.live.go'));
    await waitFor(() => expect(io.writes).toHaveLength(2));
    expect(JSON.stringify(io.writes[1])).toContain('notes2');
  });

  it('an outcome it cannot tell says it is not known if it\'s live, no cause claimed; a Check with no answer says so, with its cause; only the script found there releases it', async () => {
    io.writeAnswer = { outcome: 'pending' };
    io.existsAnswer = 'timeout';
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.held.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['flow.live.held.body'])).toBeTruthy();
    // Before any Check nothing is known about why: the band names no cause (a lost answer, core's refusal, a stale beat look alike).
    expect(screen.getByText("Not known if it's live")).toBeTruthy();
    expect(screen.queryByText(/didn.t answer/i)).toBeNull();
    expect(off(btn('flow.live.go'))).toBe(true);
    // Check and Discard are offered, never Try again or Deploy again.
    expect(screen.getByRole('button', { name: strings['flow.live.discard'] })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.deployAgain'] })).toBeNull();
    // The band's three are one kit inline row: Open scripts, Discard, then Check again as the primary.
    const band = screen.getByRole('group', { name: strings['flow.live.bandActions'] });
    expect([...band.querySelectorAll('[data-action-id]')].map((b) => b.getAttribute('data-action-id'))).toEqual(['openScripts', 'discard', 'checkAgain']);
    expect(btn('flow.live.act.checkAgain')).toHaveAttribute('data-variant', 'primary');
    await user.click(btn('flow.live.act.checkAgain'));
    const said = `${fill('flow.live.why.timeout', { computer: 'atlas' })} ${strings['flow.live.held.notKnownWhy']}`;
    await screen.findByText(/Check again\.$/, undefined, SLOW);
    expect(screen.getByText(said)).toBeTruthy();
    expect(off(btn('flow.live.go'))).toBe(true);
    io.existsAnswer = 'server';
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(`${fill('flow.live.why.server', { computer: 'atlas' })} ${strings['flow.live.held.notKnownWhy']}`, undefined, SLOW)).toBeTruthy();
    io.existsAnswer = null;
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(strings['flow.live.held.notKnown'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(said)).toBeNull();
    expect(off(btn('flow.live.go'))).toBe(true);
    // No answer frees nothing: core's hold of the send is looked up before each read, never released.
    expect(io.released).toEqual([]);
    io.existsAnswer = true;
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.exists.map((e) => e.path)).toEqual([pathFor('/notes'), pathFor('/notes'), pathFor('/notes'), pathFor('/notes')]);
    expect(io.exists[0]?.compId).toBe(ATLAS_ID);
    expect(io.held.map((h) => h.opId)).toEqual(Array(4).fill(io.writes[0]?.opId));
    // The script found frees core's hold of this write (the write creates, never replaces) once the journal
    // settles the op: exactly it, once, asked with the deploy's own clock.
    expect(io.settled).toEqual([{ opId: io.writes[0]?.opId, sentAfter: 1000 }]);
    expect(io.released).toEqual([{ kind: 'write', hold: expect.objectContaining({ hold: `h-${io.writes[0]?.opId}` }) }]);
    expect(io.writes).toHaveLength(1);
  });

  it('a Check that finds no script there says so once the journal fences the op; Deploy again sends it once more under a fresh op id', async () => {
    io.writeAnswers.push({ outcome: 'pending' });
    io.existsAnswer = false;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    await waitFor(() => expect(readDraftRecord('aaaaaaaaaa')).toMatchObject({ deploy: { phase: 'didnt' } }), SLOW);
    expect(await screen.findByText(strings['flow.live.absent.title'], undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(fill('flow.live.absent.body', { computer: 'atlas', route: '/notes' }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.checkAgain'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.tryAgain'] })).toBeNull();
    // Core's hold of this op's own send, taken before the read, is the one freed.
    const op = io.writes[0]!.opId;
    expect(io.held).toEqual([{ kind: 'write', path: pathFor('/notes'), opId: op, compId: ATLAS_ID }]);
    expect(io.released).toEqual([{ kind: 'write', hold: expect.objectContaining({ hold: `h-${op}` }) }]);
    expect(readDraftRecord('aaaaaaaaaa')).toMatchObject({ state: 'deploying', deploy: { phase: 'didnt' } });
    await user.click(btn('flow.live.act.deployAgain'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(2);
    // The fenced op can never land: Deploy again goes under a fresh op id, asked once of the journal.
    expect(io.settled).toEqual([{ opId: op, sentAfter: 1000 }]);
    expect(io.writes[1]!.opId).not.toBe(op);
    expect(io.writes[1]).toMatchObject({ path: pathFor('/notes'), content: io.writes[0]!.content, compId: ATLAS_ID });
    expect(io.released).toHaveLength(1);
  });

  it('a Check that finds no script while core still holds another send of the address moves nothing: it says so, no Deploy again; once that send is settled, Deploy again goes under a fresh op id (the journal fenced this one)', async () => {
    io.writeAnswers.push({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    io.existsAnswer = false;
    io.holds = false;
    io.others = true;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    await screen.findByText(/Check again( later)?\.$/, undefined, SLOW);
    expect(screen.getByText(strings['flow.live.held.absentHeld'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.deployAgain'] })).toBeNull();
    expect(screen.getByRole('button', { name: strings['flow.live.act.checkAgain'] })).toBeTruthy();
    expect(io.released).toEqual([]);
    const op = io.writes[0]!.opId;
    expect(readDraftRecord('aaaaaaaaaa')).toMatchObject({ deploy: { opId: op, phase: 'held' } });
    io.others = false;
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(strings['flow.live.absent.title'], undefined, SLOW)).toBeTruthy();
    await user.click(btn('flow.live.act.deployAgain'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(2);
    expect(io.writes[1]!.opId).not.toBe(op);
    expect(io.settled).toEqual([{ opId: op, sentAfter: 1000 }]);
    expect(io.released).toEqual([]);
  });

  it("a Check that finds no script while core won't free the deploy's own send keeps it held: it says so, plainly, no Deploy again", async () => {
    io.writeAnswers.push({ outcome: 'pending' });
    io.existsAnswer = false;
    io.freeOk = false;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    await screen.findByText(/Check again( later)?\.$/, undefined, SLOW);
    expect(screen.getByText(strings['flow.live.held.absentKept'])).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.held.absentHeld'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.deployAgain'] })).toBeNull();
    expect(io.released).toHaveLength(1);
    expect(readDraftRecord('aaaaaaaaaa')).toMatchObject({ deploy: { opId: io.writes[0]!.opId, phase: 'held' } });
    expect(io.writes).toHaveLength(1);
  });

  // A script is found there that this deploy did not make (settled fenced), but core won't free the deploy's
  // own send yet: the sentence says a script is there and to check again later, never that the check couldn't tell.
  it("a Check that finds another writer's script while core won't free the deploy's own send keeps it held: a script is there, Check again later", async () => {
    io.writeAnswers.push({ outcome: 'pending' });
    io.existsAnswer = true;
    io.settleAnswer = { state: 'not_sent' };
    io.freeOk = false;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    await screen.findByText(/Check again( later)?\.$/, undefined, SLOW);
    expect(screen.getByText(strings['flow.live.held.takenKept'])).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.held.notKnown'])).toBeNull();
    expect(screen.queryByText(strings['flow.live.done'])).toBeNull();
    expect(io.released).toHaveLength(1);
    expect(readDraftRecord('aaaaaaaaaa')).toMatchObject({ state: 'deploying', deploy: { opId: io.writes[0]!.opId, phase: 'held' } });
    expect(io.writes).toHaveLength(1);
  });

  // No script there, but the journal says this deploy made it: someone removed it
  // since. Its own words, Deploy again and a warned Discard; never "Check again later" for good.
  it('a Check that finds no script while the journal says this deploy made it: made, then removed, with Deploy again', async () => {
    io.writeAnswers.push({ outcome: 'pending' });
    io.existsAnswer = false;
    io.settleAnswer = { state: 'done', revision: 'r1' };
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(strings['flow.live.removed.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.absent.title'])).toBeNull();
    expect(screen.queryByText(strings['flow.live.held.absentKept'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['flow.live.discard'] })).toBeTruthy();
    const op = io.writes[0]!.opId;
    await user.click(btn('flow.live.act.deployAgain'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(2);
    expect(io.writes[1]!.opId).not.toBe(op);
  });

  it('Discard of a draft a Check found absent warns first: a request still on its way could make it later', async () => {
    // (Every didnt's Discard is warned the same way: after a reload nothing tells the two apart; see the Try again test.)
    io.writeAnswers.push({ outcome: 'pending' });
    io.existsAnswer = false;
    const { r, user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    await screen.findByText(strings['flow.live.absent.title'], undefined, SLOW);
    await user.click(btn('flow.live.discard'));
    // The warning dialog, or (unwarned) the page left for the Scripts list: either ends the wait, then its words must be these.
    await waitFor(() => expect(screen.queryByText(strings['flow.live.discardWarn.title']) !== null || /^\/scripts(\?|$)/.test(loc(r))).toBe(true), SLOW);
    expect(screen.getByText(fill('flow.live.discardWarn.didntBody', { computer: 'atlas' }))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: strings['flow.live.discardWarn.keep'] }));
    await waitFor(() => expect(screen.queryByText(fill('flow.live.discardWarn.didntBody', { computer: 'atlas' }))).toBeNull());
    expect(screen.getByText(strings['flow.live.absent.title'])).toBeTruthy();
    expect((readDraftRecord('aaaaaaaaaa') as DraftRecord).state).toBe('deploying');
    await user.click(btn('flow.live.discard'));
    const dialog = await screen.findByRole('alertdialog', undefined, SLOW).catch(() => screen.findByRole('dialog', undefined, SLOW));
    await user.click(within(dialog).getByRole('button', { name: strings['flow.live.discard'] }));
    await waitFor(() => expect(loc(r)).toMatch(/^\/scripts(\?|$)/));
    expect(io.writes).toHaveLength(1);
  });

  it('a send known not sent says Didn\'t deploy; its Discard is warned; Try again sends under the same op id', async () => {
    io.writeAnswers.push({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    const { r, user } = await toLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.didnt.body'], undefined, SLOW)).toBeTruthy();
    // The band's own row never folds: Discard, then Try again as the primary, and no More menu.
    const band = screen.getByRole('group', { name: strings['flow.live.bandActions'] });
    expect(band).toHaveAttribute('data-hub-inline-actions');
    expect(within(band).getAllByRole('button').map((b) => b.textContent)).toEqual([strings['flow.live.discard'], strings['flow.live.act.tryAgain']]);
    expect(within(band).getByRole('button', { name: strings['flow.live.act.tryAgain'] })).toHaveAttribute('data-variant', 'primary');
    await user.click(btn('flow.live.discard'));
    // The warning dialog, or (unwarned) the page left for the Scripts list: either ends the wait, then its words must be these.
    await waitFor(() => expect(screen.queryByText(strings['flow.live.discardWarn.title']) !== null || /^\/scripts(\?|$)/.test(loc(r))).toBe(true), SLOW);
    expect(screen.getByText(fill('flow.live.discardWarn.didntBody', { computer: 'atlas' }))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: strings['flow.live.discardWarn.keep'] }));
    await waitFor(() => expect(screen.queryByText(fill('flow.live.discardWarn.didntBody', { computer: 'atlas' }))).toBeNull());
    await user.click(btn('flow.live.act.tryAgain'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.writes).toHaveLength(2);
    expect(io.writes[1]?.opId).toBe(io.writes[0]?.opId);
  });

  it('a not-sent that core holds (an earlier send of the change) holds the draft: no Try again', async () => {
    io.writeAnswer = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.held.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.tryAgain'] })).toBeNull();
  });

  it('Discard while it may be live warns first; Keep the draft keeps it held', async () => {
    io.writeAnswer = { outcome: 'pending' };
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.discard'));
    expect(await screen.findByText(fill('flow.live.discardWarn.body', { computer: 'atlas' }), undefined, SLOW)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: strings['flow.live.discardWarn.keep'] }));
    await waitFor(() => expect(screen.queryByText(fill('flow.live.discardWarn.body', { computer: 'atlas' }))).toBeNull());
    expect(screen.getByText(strings['flow.live.held.title'])).toBeTruthy();
  });

  it('a confirmed Discard while it may be live drops the draft and leaves the flow', async () => {
    io.writeAnswer = { outcome: 'pending' };
    const { r, user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.discard'));
    const dialog = await screen.findByRole('alertdialog', undefined, SLOW).catch(() => screen.findByRole('dialog', undefined, SLOW));
    await user.click(within(dialog).getByRole('button', { name: strings['flow.live.discard'] }));
    await waitFor(() => expect(loc(r)).toMatch(/^\/scripts(\?|$)/));
    expect(io.writes).toHaveLength(1);
  });

  it('Check reads the reservation\'s own computer, never the one the draft was moved to since', async () => {
    io.writeAnswer = { outcome: 'pending' };
    io.existsAnswer = null;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(btn('flow.live.act.checkAgain'));
    await waitFor(() => expect(io.exists.length).toBe(1));
    // The Hub now shows borealis: the held draft pauses on a band that only offers to show atlas (its reservation never
    // moves: no "Use borealis instead"), and nothing is read or sent meanwhile.
    shown.id = BOREALIS;
    expect(await screen.findByText(fill('flow.pause.title', { bound: 'atlas', shown: 'borealis' }), undefined, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('flow.pause.show', { name: 'atlas' }) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('flow.pause.use', { name: 'borealis' }) })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.checkAgain'] })).toBeNull();
    expect(io.exists.length).toBe(1);
    // Showing atlas again brings the recovery back: Check reads the reservation's computer.
    shown.id = ATLAS_ID;
    await user.click(await screen.findByRole('button', { name: strings['flow.live.act.checkAgain'] }, SLOW));
    await waitFor(() => expect(io.exists.length).toBe(2));
    expect(io.exists.map((e) => e.compId)).toEqual([ATLAS_ID, ATLAS_ID]);
    io.existsAnswer = true;
    await user.click(btn('flow.live.act.checkAgain'));
    await waitFor(() => expect(io.exists.length).toBe(3));
    expect(io.exists[2]?.compId).toBe(ATLAS_ID);
  });

  it('Check reads only the reservation\'s own project: the same computer id listed under another project is never read', async () => {
    io.writeAnswer = { outcome: 'pending' };
    io.existsAnswer = true;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    // The stored reservation names another project than the one the containers list puts atlas's id in.
    const { putDraftRecord } = await import('@core');
    const held = readDraftRecord('aaaaaaaaaa') as DraftRecord;
    expect(await putDraftRecord({ ...held, project: '6a00000000000000000000ff' }, held)).toBe('ok');
    // The Hub shows atlas's id under its own project, not the reservation's: the draft pauses, and since no row of the
    // reservation's project is listed, the band offers no Show it could not act on and no recovery control.
    expect(await screen.findByText(fill('flow.pause.title', { bound: 'atlas', shown: 'atlas' }), undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('flow.pause.show', { name: 'atlas' }) })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.checkAgain'] })).toBeNull();
    await act(async () => { await new Promise((z) => setTimeout(z, 300)); });
    expect(io.exists).toHaveLength(0);
    expect(screen.queryByText(strings['flow.live.done'])).toBeNull();
    expect(io.writes).toHaveLength(1);
  });

  it('Check reads nothing when the Hub shows the reservation\'s project but the containers list has its computer only under another', async () => {
    io.writeAnswer = { outcome: 'pending' };
    io.existsAnswer = true;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    // The shell shows atlas's id under the reservation's (new) project: no band, but that project lists no such computer.
    const other = '6a00000000000000000000ff';
    io.shownProject = other;
    const { putDraftRecord } = await import('@core');
    const held = readDraftRecord('aaaaaaaaaa') as DraftRecord;
    expect(await putDraftRecord({ ...held, project: other }, held)).toBe('ok');
    const check = await screen.findByRole('button', { name: strings['flow.live.act.checkAgain'] }, SLOW);
    expect(screen.queryByText(fill('flow.pause.title', { bound: 'atlas', shown: 'atlas' }))).toBeNull();
    await user.click(check);
    await act(async () => { await new Promise((z) => setTimeout(z, 300)); });
    expect(io.exists).toHaveLength(0);
    expect(screen.queryByText(strings['flow.live.done'])).toBeNull();
    expect(io.writes).toHaveLength(1);
  });

  it('with no computer selected, a held draft pauses on its reservation and offers only to show it', async () => {
    io.writeAnswer = { outcome: 'pending' };
    io.existsAnswer = false;
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    shown.id = '';
    expect(await screen.findByText(fill('flow.pause.none', { bound: 'atlas' }), undefined, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('flow.pause.show', { name: 'atlas' }) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.checkAgain'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['flow.live.discard'] })).toBeNull();
    await act(async () => { await new Promise((z) => setTimeout(z, 300)); });
    expect(io.exists).toHaveLength(0);
    // The reservation's computer shown again: Check comes back and reads it.
    shown.id = ATLAS_ID;
    await user.click(await screen.findByRole('button', { name: strings['flow.live.act.checkAgain'] }, SLOW));
    await waitFor(() => expect(io.exists.length).toBe(1));
    expect(io.exists[0]?.compId).toBe(ATLAS_ID);
  });

  it('Where cannot move a held draft: it names the reservation\'s computer, offers no picker, and the band follows the reservation', async () => {
    io.writeAnswer = { outcome: 'pending' };
    const { user } = await toLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.step.where']) }));
    expect(await screen.findByText(fill('flow.where.on', { name: 'atlas' }), undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(strings['new.computer']) })).toBeNull();
    expect(screen.queryByRole('combobox', { name: new RegExp(strings['new.computer']) })).toBeNull();
    // The Hub shows borealis: the band still names atlas (the reservation), never anything the draft holds.
    shown.id = BOREALIS;
    expect(await screen.findByText(fill('flow.pause.title', { bound: 'atlas', shown: 'borealis' }), undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('flow.pause.use', { name: 'borealis' }) })).toBeNull();
    expect(io.writes).toHaveLength(1);
  });

  it('another tab\'s heartbeat going stale shows Check and Discard without anything else happening', async () => {
    await toLive();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    // Another tab reserves the draft and sends; then it is closed (its beats stop).
    const { openRecord } = await import('./new/records');
    const { readDraftRecord: rd } = await import('./new/records');
    // The reservation names atlas where the containers list has it (its own project): the band would pause on any other.
    const b = { target: targetOf(ATLAS_ID), realm: 'global', owner: 'fp1', exec: 1 };
    let rec = rd('aaaaaaaaaa');
    if (!rec || rec === 'unreadable') { const o = await openRecord('aaaaaaaaaa', 'write', b as never); rec = o.ok ? o.record : null; }
    await act(async () => { await beginDeploy(rec as DraftRecord, { kind: 'write', path: pathFor('/notes')!, opId: 'f'.repeat(32), sentAfter: 1000, attempt: 0 }); });
    expect(await screen.findByText(strings['flow.live.elsewhere'], undefined, SLOW)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(await screen.findByText(strings['flow.live.held.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['flow.live.act.checkAgain'] })).toBeTruthy();
    vi.useRealTimers();
  });

  it('the public link is its own outcome: unknown says so while the script is live', async () => {
    io.aliasAnswer = { outcome: 'pending' };
    const { user } = await toLive({ link: true });
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.linkUnknown'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['flow.live.done'])).toBeTruthy();
    expect(io.aliases[0]?.target).toBe(pathFor('/notes'));
  });

  it('the link is sent once, after the script is live, with the name as it was typed; nothing re-sends it', async () => {
    // The create answer carries the link's record, its own address included: "made" then shows that address.
    const LINK = 'https://quiet-river-k3x9.links.example.test';
    io.aliasAnswer = { outcome: 'done', data: { url: LINK } };
    const { user } = await toLive({ link: true });
    expect(io.aliases).toHaveLength(0);
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.linkMade'], undefined, SLOW)).toBeTruthy();
    expect(document.body.textContent).toContain(LINK);
    expect(io.writes).toHaveLength(1);
    expect(io.aliases).toHaveLength(1);
    expect(io.aliases[0]?.target).toBe(pathFor('/notes'));
    expect(typeof io.aliases[0]?.alias).toBe('string');
    expect(io.aliases[0]?.alias).toMatch(/\S/);
    await new Promise((res) => setTimeout(res, 300));
    expect(io.aliases).toHaveLength(1);
  });

  it('a write that may have gone through sends no link', async () => {
    io.writeAnswer = { outcome: 'pending' };
    io.existsAnswer = 'timeout';
    const { user } = await toLive({ link: true });
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.held.title'], undefined, SLOW)).toBeTruthy();
    await new Promise((res) => setTimeout(res, 300));
    expect(io.aliases).toHaveLength(0);
  });

  it('a refused write sends no link', async () => {
    io.writeAnswer = { outcome: 'failed', code: 'BAD_REQUEST' };
    const { user } = await toLive({ link: true });
    await user.click(btn('flow.live.go'));
    await waitFor(() => expect(io.writes).toHaveLength(1), SLOW);
    await new Promise((res) => setTimeout(res, 300));
    expect(screen.queryByText(strings['flow.live.done'])).toBeNull();
    expect(io.aliases).toHaveLength(0);
  });
});

describe('New script flow: an idea made live', () => {
  async function ideaToLive() {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa?idea=kv-note' });
    await screen.findByRole('radio', { name: new RegExp(strings['idea.kv-note']) }, SLOW);
    await user.click(btn('flow.continue'));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/note');
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
    await user.click(btn('flow.continue'));
    await waitFor(() => expect(loc(r)).toMatch(/step=live/));
    return { r, user };
  }

  it('sends a caller key made here and shows it once it is made', async () => {
    const { user } = await ideaToLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['new.secretTitle'], undefined, SLOW)).toBeTruthy();
    expect(io.inst[0]).toMatchObject({ name: 'kv-note', path: pathFor('/note') });
    expect(typeof io.inst[0]?.callerKey).toBe('string');
    expect(io.inst[0]?.idem).toMatch(/\S/);
  });

  it('the key made here is a secret field: no part of it is in the page until Show', async () => {
    const { user } = await ideaToLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['new.secretTitle'], undefined, SLOW)).toBeTruthy();
    const key = io.inst[0]?.callerKey ?? '';
    expect(key.length).toBeGreaterThan(12);
    // A copy field drew its first and last four characters (the id mask); a masked secret field holds bullets only.
    expect(document.body.innerHTML).not.toContain(`${key.slice(0, 4)}…${key.slice(-4)}`);
    expect(document.body.innerHTML).not.toContain(key);
  });

  it('a tab that lost the draft to another tab never shows a key: only its own done send made one', async () => {
    const { user } = await ideaToLive();
    // Another tab takes the reservation first and makes the draft live with its own key.
    io.beforeBegin = async () => {
      const r = readDraftRecord('aaaaaaaaaa') as DraftRecord;
      const m = await beginDeploy(r, { kind: 'instantiate', path: pathFor('/note')!, opId: 'e'.repeat(32), sentAfter: null, attempt: r.current });
      if (m.ok) await finishDeploy(m.record);
    };
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.inst).toHaveLength(0);
    expect(screen.queryByText(strings['new.secretTitle'])).toBeNull();
  });

  it('a Check that finds no script keeps an idea held (no journal fences a late send); a later Check that finds it makes it live', async () => {
    io.instAnswer = { outcome: 'pending' };
    io.existsAnswer = false;
    const { user } = await ideaToLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    expect(screen.getByText(strings['new.secretUnseen'])).toBeTruthy();
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(strings['flow.live.held.absentUnproven'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['flow.live.held.title'])).toBeTruthy();
    expect(screen.queryByText(strings['flow.live.absent.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['flow.live.act.deployAgain'] })).toBeNull();
    expect(io.released).toEqual([]);
    // The late request lands: the next Check finds the script.
    io.existsAnswer = true;
    await user.click(btn('flow.live.act.checkAgain'));
    expect(await screen.findByText(strings['flow.live.done'], undefined, SLOW)).toBeTruthy();
    expect(io.inst).toHaveLength(1);
  });

  it("another tab's Check found no script: this tab, which sent it, sends its own request again unchanged on Try again", async () => {
    io.instAnswer = { outcome: 'pending' };
    const { user } = await ideaToLive();
    await user.click(btn('flow.live.go'));
    await screen.findByText(strings['flow.live.held.title'], undefined, SLOW);
    // The other tab's Check: no script there, its own core freed the send, the reservation marked didnt.
    await act(async () => { const m = await markAbsent(readDraftRecord('aaaaaaaaaa') as DraftRecord, io.inst[0]!.idem!); if (!m.ok) throw new Error('markAbsent'); });
    expect(await screen.findByText(strings['flow.live.didnt.body'], undefined, SLOW)).toBeTruthy();
    io.instAnswer = { outcome: 'done', data: { path: pathFor('/note') } };
    await user.click(btn('flow.live.act.tryAgain'));
    expect(await screen.findByText(strings['new.secretTitle'], undefined, SLOW)).toBeTruthy();
    expect(io.inst).toHaveLength(2);
    expect(io.inst[1]).toEqual(io.inst[0]);
  });

  it('an unknown outcome never shows a key: it says the key may have been made', async () => {
    io.instAnswer = { outcome: 'pending' };
    const { user } = await ideaToLive();
    await user.click(btn('flow.live.go'));
    expect(await screen.findByText(strings['new.secretUnseen'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['new.secretTitle'])).toBeNull();
    expect(off(btn('flow.live.go'))).toBe(true);
    await act(async () => undefined);
  });
});

describe('New script flow: reload and leaving', () => {
  // The world's atlas lives in its Home base project: a stored record names that project, as a real binding would.
  const HOME = { target: { project: { id: '6a0000000000000000000001' }, container: { id: ATLAS_ID } }, realm: 'global', owner: 'fp1', exec: 1 };

  it('a draft id this tab never made and no record names shows "can\'t be opened here", never a fresh form', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new/zzzzzzzzzz' });
    expect(await screen.findByText(strings['flow.gone.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: strings['flow.what.describe'] })).toBeNull();
  });

  it('a reload of a draft whose deploy is held opens on Make it live as held: never a fresh draft, never done, nothing sent', async () => {
    const { openRecord, markDeploy } = await import('./new/records');
    // The record is the signed-in account's: the page is shown first, then the record is made, then the draft's URL opens.
    const r = await renderPage(page, { state: 'many', path: '/scripts' });
    await screen.findByRole('heading', { level: 1 }, SLOW);
    const o = await openRecord('yyyyyyyyyy', 'write', HOME as never);
    expect(o.ok).toBe(true);
    const m = await beginDeploy(readDraftRecord('yyyyyyyyyy') as DraftRecord, { kind: 'write', path: pathFor('/notes')!, opId: 'd'.repeat(32), sentAfter: 1000, attempt: 0 });
    expect(m.ok).toBe(true);
    await markDeploy(readDraftRecord('yyyyyyyyyy') as DraftRecord, 'd'.repeat(32), 'held');
    // This tab never held the draft in memory (a reload): the stored record restores it, on Make it live without ?step, held.
    await act(async () => { r.router.history.push('/scripts/new/yyyyyyyyyy'); });
    expect(await screen.findByText(strings['flow.live.held.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.gone.title'])).toBeNull();
    expect(screen.queryByRole('textbox', { name: strings['flow.what.describe'] })).toBeNull();
    expect(screen.queryByText(strings['flow.live.done'])).toBeNull();
    expect(io.writes).toHaveLength(0);
    expect(io.exists).toHaveLength(0);
    // The record is untouched: still held, never moved to done or discarded by opening the page.
    expect((readDraftRecord('yyyyyyyyyy') as DraftRecord).state).toBe('deploying');
  });

  it('a realm switch or sign-out asks first while the draft holds what a reload cannot bring back', async () => {
    const { switchLosses } = await import('@core');
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    expect(switchLosses()).toEqual([]);
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
    await waitFor(() => expect(switchLosses()).toEqual([fill('new.leave', { what: strings['new.leave.typed'] })]));
  });

  it('a changed address on the write way, before any code, still asks before leaving', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/notes');
    await user.click(screen.getByRole('button', { name: strings['new.cancel'] }));
    expect(await screen.findByText(strings['flow.leave.title'], undefined, SLOW)).toBeTruthy();
  });
});
