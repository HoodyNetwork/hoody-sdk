// Vitest: the schedules page's safety rules (C9 proof, reveal wipe, editable targets).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import defaultFixtures from './fixtures';
import { countCreated, createBaseline, createProven, editProven, model, proofOf, type RawSchedules, type SchedRow } from './logic';
import { opsStore } from './parts/ops';
import { chooseComputer, fixtureWorld } from '@core';
import { act } from '@testing-library/react';
import page from './page';
import type * as Data from './data';
import strings from './strings.en.json';
import { pickRuns } from './testRuns';

/** The band's allow-again press and its second step, the question's own button (never one press). */
async function allowAgain(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: strings['ed.stuck.go'] }));
  const ask = await screen.findByRole('alertdialog', { name: strings['ed.stuck.go'] });
  expect(ask).toHaveTextContent(strings['ed.stuck.body']);
  await userEvent.click(within(ask).getByRole('button', { name: strings['ed.stuck.go'] }));
}

const settleAct = vi.fn();
const settleSave = vi.fn();
vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), settleAct: (a: unknown) => settleAct(a), settleSave: (a: unknown) => settleSave(a) }));

const heldOp = (suffix: string) => [...opsStore.snapshot()].find(([k]) => k.endsWith(`\u0001${suffix}`))?.[1];
const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const m = model(raw);
const rowOf = (key: string) => m.rows.find((r) => r.key === key)!;
const down = (k: 'cron' | 'exec' | 'curl' | 'loop'): RawSchedules => ({ ...raw, [k]: { ...raw[k], state: 'down', complete: false, items: [], ...(k === 'cron' ? { hand: [] } : {}) } }) as RawSchedules;

beforeEach(() => {
  opsStore.reset();
  settleAct.mockClear();
  settleSave.mockClear();
});

describe('proofOf: only an ok, complete read proves anything', () => {
  const del = { act: 'del' as const };
  it('a delete is proven by a row that is gone from an ok read', () => {
    const gone = model({ ...raw, cron: { ...raw.cron, items: raw.cron.items.filter((e) => `cron:${e.user}/${e.id}` !== 'cron:user/a1') } });
    expect(proofOf(gone, rowOf('cron:user/a1'), del)).toBe('proven');
  });
  it('an empty list from a source that is down proves nothing', () => {
    expect(proofOf(model(down('cron')), rowOf('cron:user/a1'), del)).toBe('unreadable');
    expect(proofOf(model(down('loop')), rowOf('loop:sess_01/loop_1a2b3c4d'), { act: 'loop.del' })).toBe('unreadable');
  });
  it('a run cannot be proven by reading the list', () => {
    expect(proofOf(m, rowOf('cron:user/a1'), { act: 'run' })).toBe('unproven');
    expect(proofOf(m, rowOf('cron:user/a1'), { act: 'exec.run' })).toBe('unproven');
  });
  it('a pause is proven when the row reads as asked', () => {
    const r = rowOf('cron:user/a1');
    expect(proofOf(m, r, { act: 'pause', enabled: r.paused })).toBe('unproven');
    expect(proofOf(m, r, { act: 'pause', enabled: !r.paused })).toBe('proven');
  });
});

describe('schedules page: safety rules', () => {
  it('re-masks the revealed command when another row is selected', async () => {
    await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa1' });
    await userEvent.click(await screen.findByRole('button', { name: strings['a.show'] }));
    // The revealed command is a shell CodeBlock (a figure named by its label), coloured token by token.
    expect((await screen.findByRole('figure', { name: strings['a.show'] })).textContent).toMatch(/restic backup/);
    const t = await screen.findByRole('table', { name: strings.title });
    await userEvent.click(within(t).getByRole('row', { name: /morning-check/ }));
    await waitFor(() => expect(screen.queryByRole('figure', { name: strings['a.show'] })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: strings['a.copyExact'] })).not.toBeInTheDocument();
  });

  it('does not open the editor for a schedule that cannot be edited, by URL', async () => {
    await renderPage(page, { path: '/schedules?edit=timer%3Auser%2Fa6' });
    await screen.findAllByText(/morning-check/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps an unconfirmed save held after the drawer closes and shows it again on reopen', async () => {
    const first = await renderPage(page, { state: 'save-pending', path: '/schedules?sel=cron%3Auser%2Fa1&edit=cron%3Auser%2Fa1' });
    await pickRuns('weekdays');
    await userEvent.click(screen.getByRole('button', { name: strings['ed.save'] }));
    await waitFor(() => expect(heldOp('save:cron:user/a1')?.status).toBe('unknown'));
    // Closing the drawer and opening it again shows the held save; leaving the page keeps it (it lives in
    // module state, not in a node, and no unmount bumps core).
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.close'] }))[0] as HTMLElement);
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.edit'] }))[0] as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    first.unmount();
    expect(heldOp('save:cron:user/a1')?.status).toBe('unknown');
  });

  it('releases the lock when a pending run is dismissed after a check that proved nothing', async () => {
    await renderPage(page, { state: 'act-pending', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('unknown'));
    await userEvent.click((await screen.findAllByRole('button', { name: strings['u.check'] }))[0] as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.stuck).toBe(true));
    // A read never frees a run: the lock stays, and Close says it allows a second run.
    expect(settleAct).not.toHaveBeenCalled();
    expect((await screen.findAllByText(new RegExp(strings['op.stuck.run'].slice(0, 30)))).length).toBeGreaterThan(0);
    await userEvent.click((await screen.findAllByRole('button', { name: /^Stop tracking…?$/ }))[0] as HTMLElement);
    // The kit asks first on a pending banner: nothing is released until "Stop tracking".
    expect(settleAct).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Stop tracking( anyway)?$/ }));
    expect(settleAct).toHaveBeenCalledTimes(1);
    expect(heldOp('cron:user/a3')).toBeUndefined();
  });

  it('a held edit that Check again cannot prove stays held, says so, and allows another try only on request', async () => {
    await renderPage(page, { state: 'save-pending', path: '/schedules?edit=cron%3Auser%2Fa1' });
    await pickRuns('weekdays');
    await userEvent.click(screen.getByRole('button', { name: strings['ed.save'] }));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    await userEvent.click(screen.getAllByRole('button', { name: /Check again/ })[0] as HTMLElement);
    expect(await screen.findByText(strings['ed.stuck'])).toBeInTheDocument();
    expect(settleSave).not.toHaveBeenCalled();
    await allowAgain();
    expect(settleSave).toHaveBeenCalledTimes(1);
  });
});

describe('schedules page: held changes', () => {
  it('says "may have gone through" when core refuses a repeat press, never "not sent"', async () => {
    await renderPage(page, { state: 'act-readback', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('unknown'));
    // An earlier try is held: no read can confirm it, so the note says so and offers the warned Close.
    expect((await screen.findAllByText((t) => t.includes(strings['op.earlier']))).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['op.refused'])).not.toBeInTheDocument();
  });

  it('keeps a held change when the person switches computers and shows it again on coming back', async () => {
    await renderPage(page, { state: 'act-pending', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('unknown'));
    const [a, b] = fixtureWorld.computers;
    act(() => void chooseComputer(b!));
    await waitFor(() => expect(screen.queryAllByRole('button', { name: strings['u.check'] })).toHaveLength(0));
    expect(heldOp('cron:user/a3')?.status).toBe('unknown');
    act(() => void chooseComputer(a!));
    expect((await screen.findAllByRole('button', { name: strings['u.check'] })).length).toBeGreaterThan(0);
  });
});

describe('countCreated: a create is proven only by a matching command that was not there before', () => {
  const entry = { user: 'user', id: 'x', schedule: '0 2 * * *', command: 'echo one', name: 'n' };
  const withItems = (items: object[], state: 'ok' | 'down' = 'ok', complete = true): RawSchedules => ({ ...raw, cron: { ...raw.cron, state, complete, items: items as never } });
  const want = { user: 'user', schedule: '0 2 * * *', command: 'echo one', name: 'n' };
  it('counts matching entries', () => {
    expect(countCreated(withItems([]), want)).toBe(0);
    expect(countCreated(withItems([entry]), want)).toBe(1);
    expect(countCreated(withItems([entry, { ...entry, id: 'y' }]), want)).toBe(2);
    expect(countCreated(withItems([{ ...entry, command: 'echo two' }]), want)).toBe(0);
  });
  it('proves nothing from a list that did not answer, or that hides a command', () => {
    expect(countCreated(withItems([], 'down', false), want)).toBeNull();
    expect(countCreated(withItems([{ ...entry, command: undefined }]), want)).toBeNull();
  });
});

describe('held changes: session end', () => {
  it('drops held changes when the account context ends (a core boot is not a keeping bump)', async () => {
    const first = await renderPage(page, { state: 'act-pending', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('unknown'));
    first.unmount();
    await renderPage(page, { state: 'act-pending', path: '/schedules?sel=cron%3Auser%2Fa3' });
    expect(heldOp('cron:user/a3')).toBeUndefined();
  });

});

describe('a held action whose row left the list', () => {
  it('keeps a banner with Check again outside the row (Dismiss follows a check that finds nothing)', async () => {
    await renderPage(page, { state: 'act-pending', path: '/schedules?sel=cron%3Auser%2Fa3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.runNow'] })).at(-1) as HTMLElement);
    await waitFor(() => expect(heldOp('cron:user/a3')?.status).toBe('unknown'));
    const key = [...opsStore.snapshot()].find(([k]) => k.endsWith('\u0001cron:user/a3'))![0];
    const before = screen.getAllByRole('button', { name: strings['op.check'] }).length;
    const gone = { ...rowOf('cron:user/a1'), key: 'cron:user/zz' } as SchedRow;
    act(() => opsStore.set(key.replace('cron:user/a3', 'cron:user/zz'), { act: 'del', status: 'unknown', row: gone }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: strings['op.check'] }).length).toBe(before + 1));
  });
});

describe('editProven: every field that was sent must read back', () => {
  const entry = (extra: Record<string, unknown> = {}, rev = 'r1') => ({ ...rowOf('cron:user/a1'), ref: { ...rowOf('cron:user/a1').ref, revision: rev }, ...extra }) as SchedRow;
  const before = entry();
  const nameOf = (r: SchedRow) => ('name' in r.label ? r.label.name : '');
  const sent = { row: before, name: 'Renamed', command: '', schedule: before.sched.expr ?? '' };

  it('a name-only edit is not proven by an unchanged entry', () => {
    expect(editProven(sent, before)).toBe(false);
  });
  it('is proven when the name, the schedule and the revision all read back', () => {
    const after = { ...entry({}, 'r2'), label: { ...before.label, name: 'Renamed' } } as SchedRow;
    expect(nameOf(after)).toBe('Renamed');
    expect(editProven(sent, after)).toBe(true);
  });
  it('a command-only edit needs the revision to move; the same schedule and name prove nothing', () => {
    const cmdOnly = { ...sent, name: nameOf(before), command: 'echo new' };
    expect(editProven(cmdOnly, before)).toBe(false);
    expect(editProven(cmdOnly, entry({}, 'r2'))).toBe(true);
  });
  it('without a revision, a typed command cannot be proven at all', () => {
    const bare = { ...before, ref: { ...before.ref, revision: null } } as SchedRow;
    expect(editProven({ row: bare, name: nameOf(bare), command: 'echo new', schedule: bare.sched.expr ?? '' }, bare)).toBe(false);
  });
  it('a cleared name is not proven by an entry that still has its name, with or without a revision', () => {
    const named = { ...before, ref: { ...before.ref, revision: null }, label: { ...before.label, name: 'Old name' } } as SchedRow;
    expect(editProven({ row: named, name: '', command: '', schedule: named.sched.expr ?? '' }, named)).toBe(false);
    const cleared = { ...named, label: { ...named.label, name: '' } } as SchedRow;
    expect(editProven({ row: named, name: '', command: '', schedule: named.sched.expr ?? '' }, cleared)).toBe(true);
  });
  it('an entry that is gone proves nothing', () => {
    expect(editProven(sent, undefined)).toBe(false);
  });
});

describe('create proof: the baseline is a fresh read taken just before the send', () => {
  const a = { user: 'user', schedule: '0 3 * * *', command: 'echo one', name: 'one' };
  const withEntry = (r: RawSchedules): RawSchedules => ({ ...r, cron: { ...r.cron, items: [...r.cron.items, { user: 'user', id: 'zz1', name: 'one', command: 'echo one', schedule: '0 3 * * *', schedule_human: '', enabled: true, run_reports: true, next_runs: [] }] } }) as RawSchedules;

  it('a read that could not be taken leaves no baseline, so nothing proves the create', () => {
    expect(createBaseline(undefined, a)).toBeNull();
    expect(createBaseline(null, a)).toBeNull();
    expect(createProven(createBaseline(undefined, a), 1)).toBe(false);
  });
  it('a read that cannot prove anything (source down) leaves no baseline', () => {
    expect(createBaseline(down('cron'), a)).toBeNull();
  });
  it('an entry that already existed at the send is not the create: the stale baseline would have proven it', () => {
    const cachedBefore = createBaseline(raw, a); // the list as it was minutes ago
    const atSend = createBaseline(withEntry(raw), a); // another tab added the same line before the press
    const afterLostAnswer = countCreated(withEntry(raw), a);
    expect(createProven(cachedBefore, afterLostAnswer)).toBe(true); // the old, wrong proof
    expect(createProven(atSend, afterLostAnswer)).toBe(false);
  });
  it('proves only a rise above the fresh baseline', () => {
    const base = createBaseline(raw, a);
    expect(createProven(base, countCreated(withEntry(raw), a))).toBe(true);
    expect(createProven(base, countCreated(raw, a))).toBe(false);
    expect(createProven(base, null)).toBe(false);
  });
});
