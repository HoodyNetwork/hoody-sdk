// The Overview's Features section on real core (fixture transport): every feature is a row whether on or off; AI, the
// RAM disk and Autostart are switches that send one PUT of one key and hold an unknown outcome; the kits
// are read-only; KVM is always a row, sends exactly one PUT on a bare-metal server, and on shared hardware its press
// opens a dialog and sends nothing.
import { answers, bootFixtureCore, computerLifecycleRoute, containersRoute, heldChanges, lifecycleLock, queryClient, reply, useComputersAll, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the section's one link out, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { useReducer } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { kvmSetRoute } from '../../vms/fixtures.links';
import { kvmStrings } from '../../vms/links';
import { FEATURE_LOCK, featureRoute } from '../features';
import { FEATURES } from '../features-logic';
import strings from '../strings.en.json';
import type { Computer, Project } from '../types';
import { Features } from './Features';

const WAIT = { timeout: 10000 };
const ID = 'c'.repeat(24);
type Row = Record<string, unknown>;
const BARE = { id: 's'.repeat(24), name: 'n12', is_free: false, paid_subserver: false, kvm_supported: true };
const PAID = { id: 't'.repeat(24), name: 'fra-7', is_free: false, paid_subserver: true, kvm_supported: false };
const FREE = { id: 'u'.repeat(24), name: 'ash-3', is_free: true, paid_subserver: false, kvm_supported: false };
const atlas = (over: Row = {}): Row => ({
  id: ID, name: 'atlas', status: 'stopped', project_id: 'a'.repeat(24), server_id: BARE.id, server_name: 'n12', server: BARE, realm_ids: [],
  ai: true, hoody_kit: true, dev_kit: true, kvm: false, autostart: true, ramdisk: true, ...over,
});
const say = (text: string, vars: Record<string, string> = {}) => Object.entries({ name: 'atlas', ...vars }).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), text);

/** How a change answers: applied, lost (applied or not), or refused. */
type Answer = 'ok' | { lost: true; applied: boolean } | { status: number; code: string };

let row: Row = atlas();
let featureLog: FixtureRequest[] = [];
let kvmLog: FixtureRequest[] = [];
let lifecycleLog: FixtureRequest[] = [];
let router: ReturnType<typeof createRouter>;
/** The projects list the section is given (the owner rule reads it); empty unless a case sets it. */
let projects: Project[] = [];

/** Draws the Host again after a case changed `projects` (a projects answer arriving late). */
let redraw: () => void = () => undefined;
function Host() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  redraw = bump;
  const all = useComputersAll();
  const c = all.rows?.find((r) => r.id === ID);
  return c ? <Features c={c as unknown as Computer} projects={projects} /> : null;
}

async function show(first: Row, o: { feature?: Answer; kvm?: Answer } = {}) {
  row = first;
  featureLog = [];
  kvmLog = [];
  lifecycleLog = [];
  const answer = (a: Answer, apply: () => void) => {
    if (a === 'ok') { apply(); return answers.ok({ statusCode: 200, data: row }); }
    if ('lost' in a) { if (a.applied) apply(); return answers.lost(20); }
    return answers.refused(a.status, a.code);
  };
  const rules: FixtureRule[] = [
    reply(containersRoute, () => answers.ok({ data: { computers: [row] } })),
    reply(featureRoute, (r) => {
      featureLog.push(r);
      return answer(o.feature ?? 'ok', () => { row = { ...row, ...(r.body as Row) }; });
    }),
    reply(kvmSetRoute, (r) => {
      kvmLog.push(r);
      return answer(o.kvm ?? 'ok', () => { row = { ...row, kvm: (r.body as { kvm?: unknown }).kvm === true }; });
    }),
    reply(computerLifecycleRoute, (r) => {
      lifecycleLog.push(r);
      return answers.ok({ statusCode: 200, data: {} });
    }),
  ];
  bootFixtureCore({ rules });
  const root = createRootRoute({ component: Host });
  const any = createRoute({ getParentRoute: () => root, path: '$', component: () => null });
  router = createRouter({ routeTree: root.addChildren([any]), history: createMemoryHistory({ initialEntries: ['/computers'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await screen.findByRole('heading', { name: strings['feat.title'] }, WAIT);
}

const section = () => screen.getByRole('heading', { name: strings['feat.title'] }).closest('section') as HTMLElement;
const theSwitch = (id: 'ai' | 'ramdisk' | 'autostart' | 'kvm') => within(section()).getByRole('switch', { name: strings[`feat.${id}`] });
/** A feature's row (the kit marks each setting row). */
const rowOf = (id: (typeof FEATURES)[number]) => within(section()).getByText(strings[`feat.${id}`]).closest('[data-sg-row]') as HTMLElement;
const sent = () => [...featureLog, ...kvmLog, ...lifecycleLog];
const settle = () => new Promise((r) => setTimeout(r, 300));

afterEach(() => {
  projects = [];
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept (held changes)
  localStorage.clear();
});

describe('Features: every feature is a row, on or off', () => {
  it('all on: six rows, the kits read On, the rest are switches that are on', async () => {
    await show(atlas({ kvm: true }));
    for (const id of FEATURES) expect(within(section()).getByText(strings[`feat.${id}`])).toBeInTheDocument();
    for (const id of ['ai', 'ramdisk', 'autostart', 'kvm'] as const) expect(theSwitch(id)).toBeChecked();
    for (const id of ['hoody_kit', 'dev_kit'] as const) expect(rowOf(id)).toHaveTextContent(strings['feat.on']);
    // The kits are never switches.
    expect(within(section()).queryByRole('switch', { name: strings['feat.hoody_kit'] })).toBeNull();
    expect(within(section()).queryByRole('switch', { name: strings['feat.dev_kit'] })).toBeNull();
  });

  it('all off: the same six rows, the kits read Off, the switches are off', async () => {
    await show(atlas({ ai: false, hoody_kit: false, dev_kit: false, kvm: false, autostart: false, ramdisk: false }));
    for (const id of FEATURES) expect(within(section()).getByText(strings[`feat.${id}`])).toBeInTheDocument();
    for (const id of ['ai', 'ramdisk', 'autostart', 'kvm'] as const) expect(theSwitch(id)).not.toBeChecked();
    for (const id of ['hoody_kit', 'dev_kit'] as const) expect(rowOf(id)).toHaveTextContent(strings['feat.off']);
  });

  it('a row that gives no values: six rows that say Not known, no switch claims off', async () => {
    const { ai: _a, hoody_kit: _h, dev_kit: _d, kvm: _k, autostart: _s, ramdisk: _r, ...bare } = atlas();
    await show(bare);
    for (const id of FEATURES) expect(within(section()).getByText(strings[`feat.${id}`])).toBeInTheDocument();
    for (const id of FEATURES) expect(rowOf(id)).toHaveTextContent(strings['feat.unknown']);
    expect(within(section()).queryAllByRole('switch')).toHaveLength(0);
  });

  it('never offers the RAM disk scope', async () => {
    await show(atlas({ ramdisk_scope: 'project' }));
    expect(section().textContent ?? '').not.toMatch(/scope|ramdisk_scope/i);
    await userEvent.click(theSwitch('ai'));
    await waitFor(() => expect(featureLog).toHaveLength(1), WAIT);
    for (const r of sent()) expect(Object.keys((r.body ?? {}) as Row)).not.toContain('ramdisk_scope');
  });
});

describe('Features: the switches', () => {
  it('AI off: exactly one PUT /computers/:id with only {ai:false}; the switch then reads off', async () => {
    await show(atlas());
    await userEvent.click(theSwitch('ai'));
    await waitFor(() => expect(theSwitch('ai')).not.toBeChecked(), WAIT);
    expect(featureLog).toHaveLength(1);
    expect(featureLog[0]!.method).toBe('PUT');
    expect(featureLog[0]!.path).toBe(`/computers/${ID}`);
    expect(featureLog[0]!.body).toEqual({ ai: false });
    expect(kvmLog).toEqual([]);
  });

  it('Autostart on: one PUT with only {autostart:true}', async () => {
    await show(atlas({ autostart: false }));
    await userEvent.click(theSwitch('autostart'));
    await waitFor(() => expect(theSwitch('autostart')).toBeChecked(), WAIT);
    expect(featureLog.map((r) => r.body)).toEqual([{ autostart: true }]);
  });

  it('RAM disk off is confirmed first: Cancel sends nothing, the confirm sends one PUT {ramdisk:false}', async () => {
    await show(atlas());
    await userEvent.click(theSwitch('ramdisk'));
    const title = say(strings['feat.ask.ramdiskOff.title']);
    expect(await screen.findByText(title, undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText(title)).toBeNull(), WAIT);
    expect(sent()).toEqual([]);
    await userEvent.click(theSwitch('ramdisk'));
    await userEvent.click(await screen.findByRole('button', { name: strings['feat.ask.ramdiskOff.go'] }, WAIT));
    await waitFor(() => expect(featureLog.map((r) => r.body)).toEqual([{ ramdisk: false }]), WAIT);
  });

  it('RAM disk on is not confirmed', async () => {
    await show(atlas({ ramdisk: false }));
    await userEvent.click(theSwitch('ramdisk'));
    await waitFor(() => expect(featureLog.map((r) => r.body)).toEqual([{ ramdisk: true }]), WAIT);
  });

  it('a lost answer is held: the switch takes no press, nothing is sent again, and a read showing the old value proves nothing', async () => {
    await show(atlas(), { feature: { lost: true, applied: false } });
    await userEvent.click(theSwitch('ai'));
    const held = say(strings['feat.held.off'], { what: strings['feat.ai'] });
    expect(await screen.findByText(held, undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(FEATURE_LOCK).map((h) => h.identity)).toEqual([{ computer: ID, feature: 'ai', on: false }]);
    expect(theSwitch('ai')).toBeDisabled();
    await userEvent.click(theSwitch('ai'));
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await settle();
    expect(screen.getByText(held)).toBeInTheDocument();
    expect(featureLog).toHaveLength(1);
    // Another switch of the same computer is not held by it.
    expect(theSwitch('autostart')).not.toBeDisabled();
  });

  it('a lost answer that did arrive: Check again proves it from the list and frees the switch', async () => {
    await show(atlas(), { feature: { lost: true, applied: true } });
    await userEvent.click(theSwitch('ai'));
    const held = say(strings['feat.held.off'], { what: strings['feat.ai'] });
    expect(await screen.findByText(held, undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.queryByText(held)).toBeNull(), WAIT);
    expect(theSwitch('ai')).not.toBeChecked();
    expect(theSwitch('ai')).not.toBeDisabled();
    expect(featureLog).toHaveLength(1);
    expect(heldChanges(FEATURE_LOCK)).toEqual([]);
  });

  it('a definite refusal stays on its row, holds nothing, and the switch keeps its value', async () => {
    await show(atlas(), { feature: { status: 403, code: 'INSUFFICIENT_PERMISSIONS' } });
    await userEvent.click(theSwitch('ai'));
    await waitFor(() => expect(featureLog).toHaveLength(1), WAIT);
    await settle();
    expect(featureLog).toHaveLength(1);
    expect(theSwitch('ai')).toBeChecked();
    expect(theSwitch('ai')).not.toBeDisabled();
    expect(heldChanges(FEATURE_LOCK)).toEqual([]);
  });

  it('a project proven to be someone else\'s: the three switches are off limits and say why; nothing is sent', async () => {
    projects = [{ id: String(atlas().project_id), name: 'Shared', owner: 'someone-else' }];
    await show(atlas());
    for (const id of ['ai', 'ramdisk', 'autostart'] as const) expect(theSwitch(id)).toBeDisabled();
    expect(within(section()).getAllByText(new RegExp(strings['feat.why.notOwner'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBe(3);
    expect(sent()).toEqual([]);
  });

  it('the RAM disk confirm is withdrawn when the projects answer then shows another owner: nothing is sent', async () => {
    await show(atlas({ ramdisk: true }));
    await userEvent.click(theSwitch('ramdisk'));
    const title = say(strings['feat.ask.ramdiskOff.title']);
    await screen.findByRole('alertdialog', { name: title }, WAIT);
    act(() => {
      projects = [{ id: String(atlas().project_id), name: 'Shared', owner: 'someone-else' }];
      redraw();
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: title })).toBeNull());
    expect(theSwitch('ramdisk')).toBeDisabled();
    await settle();
    expect(sent()).toEqual([]);
  });

  it('a project whose owner the list does not name proves nothing: the switches stay live', async () => {
    projects = [{ id: String(atlas().project_id), name: 'Home base' }];
    await show(atlas());
    for (const id of ['ai', 'ramdisk', 'autostart'] as const) expect(theSwitch(id)).not.toBeDisabled();
  });

  it('an expired computer: every switch is off limits and says why', async () => {
    await show(atlas({ server_expired: true }));
    for (const id of ['ai', 'ramdisk', 'autostart'] as const) expect(theSwitch(id)).toBeDisabled();
    expect(within(section()).getAllByText(new RegExp(strings['feat.why.expired'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThanOrEqual(3);
    expect(sent()).toEqual([]);
  });
});

describe('Features: KVM', () => {
  const whyTitle = strings['feat.kvm.why.title'];

  it.each([['a paid slice of a shared host', PAID], ['a free server', FREE]])('on %s the switch takes the press, opens the dialog and sends nothing', async (_n, server) => {
    await show(atlas({ server, server_id: server.id, server_name: server.name, status: 'running' }));
    const sw = theSwitch('kvm');
    expect(sw).not.toBeChecked();
    expect(sw).not.toBeDisabled();
    expect(within(section()).getByText(strings['feat.kvm.help.shared'])).toBeInTheDocument();
    await userEvent.click(sw);
    const dialog = await screen.findByRole('dialog', { name: whyTitle }, WAIT);
    expect(within(dialog).getByText(say(strings['feat.kvm.why.body']))).toBeInTheDocument();
    expect(strings['feat.kvm.why.body']).toMatch(/virtual machines/);
    expect(strings['feat.kvm.why.body']).toMatch(/bare-metal server/);
    expect(strings['feat.kvm.why.body']).toMatch(/shared hardware/);
    expect(strings['feat.kvm.why.body']).toMatch(/\/dev\/kvm/);
    await settle();
    expect(sent()).toEqual([]);
    expect(heldChanges(lifecycleLock.lock)).toEqual([]);
    // Close leaves the switch as it was and still sends nothing. The footer button, not the header x (both read "Close").
    const close = dialog.querySelector<HTMLElement>('[data-dialog-cancel]')!;
    expect(close).toHaveTextContent(strings['feat.kvm.why.close']);
    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: whyTitle })).toBeNull(), WAIT);
    expect(theSwitch('kvm')).not.toBeChecked();
    expect(sent()).toEqual([]);
  });

  it('the dialog\'s action goes to the bare-metal servers and sends nothing', async () => {
    await show(atlas({ server: PAID, server_id: PAID.id, server_name: PAID.name }));
    await userEvent.click(theSwitch('kvm'));
    const dialog = await screen.findByRole('dialog', { name: whyTitle }, WAIT);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['feat.kvm.why.go'] }));
    await waitFor(() => expect(router.state.location.href).toBe('/billing?view=servers'), WAIT);
    expect(sent()).toEqual([]);
  });

  it('bare metal, stopped: one press sends exactly one PUT …/kvm {kvm:true} and no dialog opens', async () => {
    await show(atlas());
    await userEvent.click(theSwitch('kvm'));
    await waitFor(() => expect(theSwitch('kvm')).toBeChecked(), WAIT);
    expect(kvmLog).toHaveLength(1);
    expect(kvmLog[0]!.method).toBe('PUT');
    expect(kvmLog[0]!.path).toBe(`/computers/${ID}/kvm`);
    expect(kvmLog[0]!.body).toEqual({ kvm: true });
    expect(screen.queryByRole('dialog', { name: whyTitle })).toBeNull();
    expect(featureLog).toEqual([]);
    // Start computer is offered, never pressed for the person.
    expect(await screen.findByRole('button', { name: kvmStrings['kvm.start'] }, WAIT)).toBeInTheDocument();
    expect(lifecycleLog).toEqual([]);
  });

  it('bare metal, a lost answer: held under the computer\'s lifecycle lock, the switch takes no press, never sent again', async () => {
    await show(atlas(), { kvm: { lost: true, applied: false } });
    await userEvent.click(theSwitch('kvm'));
    const held = say(kvmStrings['kvm.held.on']);
    expect(await screen.findByText(held, undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(lifecycleLock.lock).map((h) => h.identity)).toEqual([{ computer: ID, op: 'kvm', kvm: true }]);
    expect(theSwitch('kvm')).toBeDisabled();
    await userEvent.click(theSwitch('kvm'));
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await settle();
    expect(screen.getByText(held)).toBeInTheDocument();
    expect(kvmLog).toHaveLength(1);
  });

  it('bare metal, running: asks to stop first and sends neither the KVM change nor anything else until confirmed', async () => {
    await show(atlas({ status: 'running' }));
    await userEvent.click(theSwitch('kvm'));
    expect(await screen.findByText(say(kvmStrings['kvm.ask.stopOn.title']), undefined, WAIT)).toBeInTheDocument();
    await settle();
    expect(sent()).toEqual([]);
  });

  it('a server whose kind is not known is never called shared: the row says so and the API decides', async () => {
    const { server: _s, ...unknown } = atlas();
    await show(unknown, { kvm: { status: 403, code: 'INSUFFICIENT_PERMISSIONS' } });
    expect(within(section()).queryByText(strings['feat.kvm.help.shared'])).toBeNull();
    expect(within(section()).getByText(new RegExp(strings['feat.kvm.kindUnknown'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    await userEvent.click(theSwitch('kvm'));
    await waitFor(() => expect(kvmLog).toHaveLength(1), WAIT);
    expect(screen.queryByRole('dialog', { name: whyTitle })).toBeNull();
    expect(await screen.findByText(kvmStrings['kvm.err.forbiddenOn'], undefined, WAIT)).toBeInTheDocument();
  });

  it('bare metal that allows no VMs: the row is shown, the switch is off limits and says why', async () => {
    await show(atlas({ server: { ...BARE, kvm_supported: false } }));
    expect(theSwitch('kvm')).toBeDisabled();
    expect(within(section()).getByText(new RegExp(strings['feat.kvm.notAllowed'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(sent()).toEqual([]);
  });

  it('KVM on, on shared hardware: turning it off is the normal change, never the dialog', async () => {
    await show(atlas({ server: PAID, server_id: PAID.id, server_name: PAID.name, kvm: true }));
    await userEvent.click(theSwitch('kvm'));
    expect(await screen.findByText(say(kvmStrings['kvm.ask.off.title']), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: whyTitle })).toBeNull();
    expect(sent()).toEqual([]);
  });
});
