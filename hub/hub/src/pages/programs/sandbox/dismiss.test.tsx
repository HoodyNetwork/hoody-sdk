// The sandbox's write and dismiss rules, as the person meets them: a Dismiss of "may have gone through" asks first and frees
// only what it showed; a save re-reads the stored block and never overwrites one that changed meanwhile; a waiting
// start/stop/restart blocks sandbox changes; Re-apply sends the block the failed save carried and is never proved by
// a status that shows it applied; a Check that finds the block saved but not applied says so; a malformed status
// never reads as "no policy"; a failed refresh is never shown as current; network words say what the daemon does.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, heldChanges, queryClient, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Row as ProgramRow } from '../logic';
import { opsStore } from '../parts/ops';
import { sandboxBusy } from './busy';
import { SANDBOX_LOCK, usePart } from './data';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { check, fromBlock, toBlock, formRestricts } from './form';
import { readStatus } from './model';
import { getNote, putNote, swapNote } from './notes';
import { SandboxChip } from './SandboxChip';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import { statusSamples } from './samples';
import strings from './strings.en.json';
import { blockLines } from './words';

const t = makeT(strings);
const rowOf = (o: Partial<ProgramRow> = {}): ProgramRow => ({ key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'], ...o });
let part = '';
let target: Target | null = null;
function Probe() {
  part = usePart();
  return null;
}
function mount(w: SandboxWorld, node: ReactNode) {
  w.onStatus ??= (req) => void (target ??= req.target);
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  return render(<QueryClientProvider client={queryClient}><Probe />{node}</QueryClientProvider>);
}
const panel = (w: SandboxWorld) => mount(w, <SandboxPanel row={rowOf()} />);
const st = (w: SandboxWorld) => w.status as Record<string, unknown>;
async function addMemory(v = '64M') {
  await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
  const d = await screen.findByRole('dialog');
  await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), v);
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
  return d;
}
const pending = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
const closeButton = () => screen.getByRole('button', { name: /stop tracking/i });

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
  target = null;
});
afterEach(() => resetChanges());

describe('Dismiss of a save that may have gone through', () => {
  it('asks first: Cancel keeps the hold, Stop tracking frees it', async () => {
    panel({ status: {}, sent: [], edit: pending });
    await addMemory();
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    await userEvent.click(closeButton());
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(dlg).getByText(t('sb.out.dismissBody'))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: /cancel/i }));
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
    await userEvent.click(closeButton());
    await userEvent.click(await screen.findByRole('button', { name: t('sb.out.dismissOk') }));
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0));
    expect(screen.queryByText(t('sb.out.unknown'))).toBeNull();
  });

  it('an unclear save asks too, and only then lets Save go again', async () => {
    panel({ status: {}, sent: [], edit: () => ({ status: 400, body: { error: 'x'.repeat(70000) } }) });
    await addMemory();
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    await userEvent.click(closeButton());
    expect(screen.getByRole('button', { name: t('sb.add') })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(await screen.findByRole('button', { name: t('sb.out.dismissOk') }));
    await waitFor(() => expect(screen.getByRole('button', { name: t('sb.add') })).not.toHaveAttribute('aria-disabled'));
  });
});

describe('a save never overwrites a policy that changed after the editor opened', () => {
  it('sends nothing, shows the stored policy, then the next Save goes', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    panel(w);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
    const d = await screen.findByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), '64M');
    st(w)['7'] = statusFor({ network: { mode: 'none' } });
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
    expect(await within(d).findByText(t('sb.ed.changed', { lines: t('sb.w.netNone') }))).toBeInTheDocument();
    expect(w.sent).toHaveLength(0);
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
    await waitFor(() => expect(w.sent).toHaveLength(1));
  });

  it('a failed read before the save sends nothing', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    panel(w);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
    const d = await screen.findByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), '64M');
    w.failStatus = true;
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
    expect(await within(d).findByText(t('sb.ed.readFailed'))).toBeInTheDocument();
    expect(w.sent).toHaveLength(0);
  });

  it('opening on a stored empty list is not a change (closing asks nothing)', async () => {
    panel({ status: { '7': statusSamples.restricted }, sent: [] });
    await userEvent.click(await screen.findByRole('button', { name: t('sb.edit') }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('button', { name: t('sb.ed.save') })).toBeDisabled();
  });
});

describe('a waiting start, stop or restart blocks sandbox changes', () => {
  it('Edit is off with the reason while this page has one in flight', async () => {
    panel({ status: {}, sent: [] });
    await screen.findByRole('button', { name: t('sb.add') });
    if (!target) throw new Error('no computer');
    opsStore.set(`${part}|prog:7`, { act: 'restart', target, port: null, status: 'unknown', press: { kind: 'prog', id: '7', action: 'restart', port: null, target } } as never);
    expect(await screen.findByText(t('sb.lifeBusy'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('sb.add') })).toHaveAttribute('aria-disabled', 'true');
    opsStore.clear(`${part}|prog:7`);
  });

  it('the list predicate: a held or unclear sandbox save blocks the row', async () => {
    panel({ status: {}, sent: [], edit: () => ({ status: 400, body: { error: 'x'.repeat(70000) } }) });
    await addMemory();
    await screen.findByText(t('sb.out.unknown'));
    expect(sandboxBusy(part, target, 'prog:7', '7')).toBe(true);
    expect(sandboxBusy(part, target, 'prog:8', '8')).toBe(false);
  });
});

describe('Re-apply and Check', () => {
  const failing = 'program 7 saved but NOT applied: nft failed';
  it('Re-apply sends the block the failed save carried, and a Check needs a status that shows it applied', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = (req, id) => {
      st(w)[id] = { ...(statusFor((req.body as { sandbox: never }).sandbox) as object), rev: null, problems: ['sandbox is configured but NOT applied'], firewall: 'degraded' };
      return { status: 400, body: { error: failing } };
    };
    panel(w);
    await addMemory();
    expect(await screen.findByText(t('sb.out.notAppliedT'))).toBeInTheDocument();
    w.edit = pending;
    await userEvent.click(await screen.findByRole('button', { name: t('sb.reapply') }));
    await waitFor(() => expect(w.sent).toHaveLength(2));
    expect(w.sent?.[1]?.body).toEqual({ sandbox: { process: { max_memory: '64M' } } });
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    // The same block is still stored, applied or not: no status field reports the installed definition, so a
    // re-apply stays unconfirmed and the hold stays until it is dismissed.
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.storedUnconfirmed'))).toBeInTheDocument();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
    st(w)['7'] = statusFor({ process: { max_memory: '64M' } });
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.storedUnconfirmed'))).toBeInTheDocument();
    expect(screen.queryByText(t('sb.out.reapplied'))).toBeNull();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
  });

  it('a Check that finds the sent block saved but not applied says so', async () => {
    const w: SandboxWorld = { status: {}, sent: [], edit: pending };
    panel(w);
    await addMemory();
    await screen.findByText(t('sb.out.unknown'));
    st(w)['7'] = { ...(statusFor({ process: { max_memory: '64M' } }) as object), rev: null };
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.notAppliedT'))).toBeInTheDocument();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0);
  });

  it('a failed removal offers no Re-apply (the daemon re-applies only an effective policy)', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.set }, sent: [] };
    w.edit = (_req, id) => {
      st(w)[id] = statusFor(null);
      return { status: 400, body: { error: 'program 7 was updated but its configuration was NOT removed (see daemon log); retry' } };
    };
    panel(w);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.edit') }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.remove') }));
    await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
    expect(await screen.findByText(t('sb.out.removeNotAppliedT'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('sb.reapply') })).toBeNull();
  });
});

describe('honest reads', () => {
  it('a status without `configured` is malformed, never "no policy"', () => {
    const { configured: _c, ...rest } = statusSamples.none as Record<string, unknown>;
    expect(readStatus(rest)).toBeNull();
    expect(readStatus(statusSamples.none)).not.toBeNull();
  });

  it('a failed refresh over an earlier answer is not shown as current', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.set }, sent: [] };
    mount(w, <><SandboxPanel row={rowOf()} /><SandboxChip row={rowOf()} /></>);
    expect(await screen.findByText(t('sb.chip.set'))).toBeInTheDocument();
    w.failStatus = true;
    await queryClient.refetchQueries();
    expect(await screen.findByText(t('sb.chip.stale'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.staleData'))).toBeInTheDocument();
  });

  it('network words: listening is limited only in restricted mode; inbound names its scope and the exemption', () => {
    expect(blockLines(t, { network: { mode: 'restricted', bind_ports: [8000] } })).toContain(t('sb.w.listen', { ports: '8000' }));
    const full = blockLines(t, { network: { bind_ports: [8000], ingress_allow_from: ['203.0.113.0/24'] } });
    expect(full).not.toContain(t('sb.w.listen', { ports: '8000' }));
    expect(full).toContain(t('sb.w.ports', { ports: '8000' }));
    expect(full).toContain(t('sb.w.platform'));
    expect(blockLines(t, { network: { ingress_allow_from: ['203.0.113.0/24'], ingress_allow_platform: false } })).toContain(t('sb.w.noLocal'));
    expect(() => blockLines(t, { filesystem: { read_only_root: true, writable: 'x' as never } })).not.toThrow();
  });
});

describe('the form carries stored blocks exactly', () => {
  it('a stored path with outer spaces is unsupported, never trimmed', () => {
    expect(fromBlock({ filesystem: { hidden: ['/srv/private '] } }).unsupported).toEqual(['filesystem.hidden']);
  });
  it('a spaced range round-trips as one range', () => {
    const f = fromBlock({ network: { mode: 'restricted', connect_ports: ['8000 - 8003', 443] } }).form;
    expect(toBlock(f)).toEqual({ network: { mode: 'restricted', connect_ports: ['8000-8003', 443] } });
    expect(check(f, null).filter((p) => p.field === 'connectPorts')).toEqual([]);
  });
  it('mirrors the daemon path rules: `.` allowed, `..` refused, a working directory of / is not under /run/user', () => {
    const f = fromBlock({ filesystem: { hidden: ['/srv/./private'] }, process: { max_pids: 8 } }).form;
    expect(check(f, null).filter((p) => p.field === 'hidden')).toEqual([]);
    expect(check({ ...f, hidden: '/srv/../etc' }, null).some((p) => p.code === 'pathTraversal')).toBe(true);
    const facts = { root: false, terminal: false, directory: '/', env: [], displayLiteral: true } as never;
    expect(check(f, facts).some((p) => p.code === 'runUser')).toBe(false);
    expect(check(f, { ...(facts as object), directory: '/run/user/1000/app' } as never).some((p) => p.code === 'runUser')).toBe(true);
  });
  it('typed non-digits in processes still restrict, so Save shows the error instead of reading as a removal', () => {
    const f = fromBlock(null).form;
    expect(formRestricts({ ...f, maxPids: 'abc' })).toBe(true);
    expect(check({ ...f, maxPids: 'abc' }, null).some((p) => p.field === 'maxPids')).toBe(true);
  });
  it('an unclear note is kept by token: a newer note is never replaced by an older action', () => {
    putNote('p|prog:9', { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    expect(sandboxBusy('p', null, 'prog:9', '9')).toBe(true);
    const old = getNote('p|prog:9')!.seq;
    putNote('p|prog:9', { outcome: { kind: 'unclear' }, sentFp: 'c', sentBlock: null, beforeFp: 'b' });
    expect(swapNote('p|prog:9', old, { outcome: { kind: 'saved' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' })).toBe(false);
    expect(getNote('p|prog:9')?.sentFp).toBe('c');
  });
});
