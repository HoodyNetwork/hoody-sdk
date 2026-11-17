// Network > Firewall on real core (fixture transport): the changes. A fake host keeps the rules and
// acts like the host firewall script (first exact match, an unsent field matches anything, a switch ignores the state).
// Covers add, the lock-out typed confirmation, C9 holds (one send, Check again, no second send while held), delete
// and switch naming checks, the two-step edit (add, re-read, then remove; "the old rule is still there"), presets and
// reset.
import { answers, bootFixtureCore, queryClient, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { bump, setRealm } from '@core/ctx';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { isOff } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { firewallRoutes, useAddRule } from '../firewall.data';
import type { Computer } from '../types';
import { Firewall } from './Firewall';
import strings from './Firewall.strings.en.json';

/** The rules table (kit DataTable) reads the URL: the part mounts inside a memory router, one per mount, so a rerender
 *  keeps the part's state. */
const Mounted = createContext<ReactNode>(null);
function Routed({ children }: { children?: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: function Root() { return <>{useContext(Mounted)}</>; } }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  );
  return <Mounted.Provider value={children}><RouterProvider router={router} /></Mounted.Provider>;
}
const render = (ui: ReactElement, o?: RenderOptions) => rtlRender(ui, { wrapper: Routed, ...o });

/** A rule's row in the rules table: its cells, read together, are the rule's sentence (verb, what, where). */
/** A rule's sentence against its row: the row's cells drop the sentence's "from"/"to" (the column says it), so both are
 *  compared without them and without spaces; an off rule's Off tag (in the Action cell, after the verb) is dropped too. */
const squash = (x: string) => x.replace(/\b(from|to)\b/g, '').replace(/\s+/g, '').replace(/(Block|Refuse|Allow)Off/g, '$1');
async function ruleRow(sentence: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: strings['fw.title'] });
  return waitFor(() => {
    const row = within(table).getAllByRole('row').find((r) => squash(r.textContent ?? '').includes(squash(sentence)));
    if (!row) throw new Error(`no rule row: ${sentence}`);
    return row;
  });
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A name as the kit shows it on a control that opens something: the label, with or without its "…". */
const opening = (x: string) => new RegExp(`^${esc(x)}…?$`);
/** The Firewall section's ⋯ (More actions), then each item of the path (the presets are a group in it). */
async function fwMenu(...path: string[]) {
  // Presets and Reset are offered once the rules are read, as is Add a rule: wait for it first.
  await screen.findByRole('button', { name: opening(strings['fw.add']) });
  const sec = (await screen.findByRole('heading', { name: strings['fw.title'] })).closest('section') as HTMLElement;
  await userEvent.click(within(sec).getByRole('button', { name: 'More actions' }));
  for (const name of path) await userEvent.click(await screen.findByRole('menuitem', { name: opening(name) }));
}

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
type Wire = Record<string, string>;
type Dir = 'ingress' | 'egress';
const FIELDS = ['action', 'state', 'description', 'source', 'destination', 'protocol', 'source_port', 'destination_port', 'icmp_type', 'icmp_code'];
const re = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

interface Host { ingress: Wire[]; egress: Wire[]; sent: FixtureRequest[]; failReads: boolean; badIngress: boolean }
interface Opts { slowRemove?: boolean; slowAdd?: (n: number) => boolean; lostUnapplied?: (n: number) => boolean; ingress?: Wire[]; egress?: Wire[]; addAnswer?: (n: number) => FixtureAnswer | null; removeAnswer?: (n: number) => FixtureAnswer | null; hideAddsFromReads?: boolean }
function boot(o: Opts = {}): Host {
  const h: Host = { ingress: [...(o.ingress ?? [])], egress: [...(o.egress ?? [])], sent: [], failReads: false, badIngress: false };
  let adds = 0;
  let removes = 0;
  const matches = (r: Wire, crit: Wire, withState: boolean) => FIELDS.every((k) => (k === 'state' && !withState) || crit[k] === undefined || r[k] === crit[k]);
  const add = (dir: Dir) => (r: FixtureRequest) => {
    h.sent.push(r);
    adds++;
    if (o.lostUnapplied?.(adds)) return answers.pending5xx();
    if (o.slowAdd?.(adds)) return answers.slow({ statusCode: 201, data: {} }, 3000);
    // A definite refusal changes nothing; a forced 5xx below models an answer lost after the add applied.
    const forced = o.addAnswer?.(adds);
    if (forced && forced.status !== undefined && forced.status < 500) return forced;
    const body = { state: 'enabled', ...(r.body as Wire) };
    const dup = h[dir].some((x) => JSON.stringify(Object.entries(x).sort()) === JSON.stringify(Object.entries(body).sort()));
    if (!dup) h[dir].push(body);
    return forced ?? answers.ok({ statusCode: dup ? 200 : 201, data: { ingress: h.ingress, egress: h.egress } });
  };
  const remove = (dir: Dir) => (r: FixtureRequest) => {
    h.sent.push(r);
    removes++;
    const forced = o.removeAnswer?.(removes);
    // A remove that applies at once and answers late: the page is mid-send for a while.
    if (o.slowRemove) {
      const at = h[dir].findIndex((x) => matches(x, r.body as Wire, true));
      if (at >= 0) h[dir].splice(at, 1);
      return answers.slow({ statusCode: 200, data: { direction: dir, removed_count: 1 } }, 1500);
    }
    if (forced && forced.status !== undefined && forced.status < 500) return forced;
    const i = h[dir].findIndex((x) => matches(x, r.body as Wire, true));
    if (i < 0) return answers.refused(404, 'RULE_NOT_FOUND');
    h[dir].splice(i, 1);
    return forced ?? answers.ok({ statusCode: 200, data: { direction: dir, removed_count: 1 } });
  };
  const toggle = (dir: Dir) => (r: FixtureRequest) => {
    h.sent.push(r);
    const b = r.body as Wire;
    const i = h[dir].findIndex((x) => matches(x, b, false));
    if (i < 0) return answers.refused(404, 'RULE_NOT_FOUND');
    h[dir][i] = { ...h[dir][i], state: b.state as string };
    return answers.ok({ statusCode: 200, data: {} });
  };
  const visible = (xs: Wire[]) => (o.hideAddsFromReads ? xs.slice(0, (dir0(xs) ?? []).length) : xs);
  const dir0 = (xs: Wire[]) => (xs === h.ingress ? o.ingress : o.egress);
  const rules: FixtureRule[] = [
    reply(firewallRoutes.rules, () => h.failReads ? answers.refused(503, 'FIREWALL_HOST_UNAVAILABLE') : answers.ok({ statusCode: 200, data: { ingress: [...visible(h.ingress), ...(h.badIngress ? [{ action: 'boom' }] : [])], egress: visible(h.egress), rule_count: h.ingress.length + h.egress.length, max_rules: 500 } })),
    reply(firewallRoutes.addIn, add('ingress')),
    reply(firewallRoutes.addOut, add('egress')),
    reply(firewallRoutes.removeIn, remove('ingress')),
    reply(firewallRoutes.removeOut, remove('egress')),
    reply(firewallRoutes.toggleIn, toggle('ingress')),
    reply(firewallRoutes.toggleOut, toggle('egress')),
    reply(firewallRoutes.reset, (r) => {
      h.sent.push(r);
      h.ingress = [];
      h.egress = [];
      return answers.ok({ statusCode: 200, data: { rules: { ingress: [], egress: [] } } });
    }),
  ];
  bootFixtureCore({ rules });
  return h;
}
let probeAdd: ReturnType<typeof useAddRule> | null = null;
/** Another part (or tab) sending a firewall change of the same computer. */
function AddProbe() {
  probeAdd = useAddRule('ingress');
  return null;
}
const mount = () => render(<QueryClientProvider client={queryClient}><Firewall c={C} canWrite /></QueryClientProvider>);
const writes = (h: Host) => h.sent.map((r) => `${r.method} ${r.path.replace(/^.*\/firewall\//, '')}`);

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept (core's held changes)
  localStorage.clear();
});

async function openAdd() {
  await userEvent.click(await screen.findByRole('button', { name: strings['fw.add'] }));
  return screen.getByRole('dialog', { name: strings['fw.form.addTitle'] });
}
async function fill(g: HTMLElement, o: { ports?: string; addresses?: string; description?: string }) {
  if (o.ports !== undefined) await userEvent.type(within(g).getByLabelText(re(strings['fw.form.ports'])), o.ports);
  if (o.addresses !== undefined) await userEvent.type(within(g).getByLabelText(re(strings['fw.form.addresses.in'])), o.addresses);
  await userEvent.type(within(g).getByLabelText(re(strings['fw.form.description'])), o.description ?? 'test rule');
}
/** A row's action: its inline button when the row shows one (Edit), else the item in its Row actions menu. */
async function rowAction(sentence: string, action: string, row?: HTMLElement) {
  const r = row ?? (await ruleRow(sentence));
  const inline = within(r).queryByRole('button', { name: opening(action) });
  if (inline) return userEvent.click(inline);
  await userEvent.click(within(r).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: opening(action) }));
}
const confirm = async (label: string) => userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: label }));

describe('Network > Firewall: adding a rule', () => {
  it('sends one add with the tidied body and shows the rule', async () => {
    const h = boot();
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080, 8081', addresses: '203.0.113.5' });
    expect(within(g).getByText(/This rule: Block TCP ports 8080, 8081 from 203.0.113.5/)).toBeInTheDocument();
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress']));
    expect(h.sent[0]?.body).toEqual({ action: 'drop', protocol: 'tcp', description: 'test rule', destination_port: '8080,8081', source: '203.0.113.5', state: 'enabled' });
    expect(await screen.findByText(/Added: Block TCP ports 8080, 8081/)).toBeInTheDocument();
  });
  it('SSH: a block covering 22 shows the plain note and sends without the typed name (SSH from Hoody does not pass it)', async () => {
    const h = boot();
    mount();
    const g = await openAdd();
    await fill(g, { ports: '22' });
    // The note is the ports field's own description now, after its usual help.
    expect(within(g).getByLabelText(re(strings['fw.form.ports']))).toHaveAccessibleDescription(strings['fw.form.ports.helpSsh']);
    expect(strings['fw.form.ports.helpSsh']).toContain(strings['fw.ssh.note']);
    expect(within(g).queryByText(/You will be asked to type/)).toBeNull();
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress']));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('lock-out: a block covering a Hoody kit port asks for the computer name before anything is sent', async () => {
    const h = boot();
    mount();
    const g = await openAdd();
    await fill(g, { ports: '3990-4000' });
    expect(within(g).getByText(/This blocks ports 3998, 3999/)).toBeInTheDocument();
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('This can cut atlas off from the Hub');
    const go = within(dlg).getByRole('button', { name: strings['fw.cut.go'] });
    expect(go).toBeDisabled();
    expect(h.sent).toEqual([]);
    await userEvent.type(within(dlg).getByRole('textbox'), 'atlas');
    await userEvent.click(go);
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress']));
  });
  it('a refusal (4xx: the rule limit) says nothing changed, keeps the drawer, holds nothing', async () => {
    const h = boot({ addAnswer: () => answers.refused(400, 'COMPUTER_FIREWALL_RULE_LIMIT') });
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080' });
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    expect(await within(g).findByText(/has no room for another rule/)).toBeInTheDocument();
    expect(h.sent).toHaveLength(1);
    expect(h.ingress).toEqual([]);
    expect(screen.queryByText(/may have gone through/)).toBeNull();
  });
  it('C9: a lost answer that did not apply stays held: every change waits, Check again reads (never resends), only a warned Dismiss frees it', async () => {
    const h = boot({ lostUnapplied: (n) => n === 1 });
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080' });
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    expect(await screen.findByText(/Adding “Block TCP port 8080 from anywhere” may have gone through/)).toBeInTheDocument();
    expect(isOff(screen.getByRole('button', { name: strings['fw.add'] }))).toBe(true);
    await fwMenu();
    expect(await screen.findByRole('menuitem', { name: opening(strings['fw.reset']) })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: strings['fw.held.check'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: strings['fw.held.check'] })).not.toHaveAttribute('data-pending'));
    expect(screen.getByText(/may have gone through/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
    await userEvent.click(screen.getByRole('button', { name: strings['fw.held.dismiss'] }));
    await confirm(strings['fw.held.dismissGo']);
    await waitFor(() => expect(screen.queryByText(/may have gone through/)).toBeNull());
    expect(isOff(screen.getByRole('button', { name: strings['fw.add'] }))).toBe(false);
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('C9: a lost answer that did apply is freed by a fresh read, with no second send', async () => {
    const h = boot({ addAnswer: (n) => (n === 1 ? answers.pending5xx() : null) });
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080' });
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    const check = await screen.findByRole('button', { name: strings['fw.held.check'] }).catch(() => null);
    if (check) await userEvent.click(check);
    await waitFor(() => expect(screen.queryByText(/may have gone through/)).toBeNull());
    expect(await ruleRow('Block TCP port 8080 from anywhere')).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
  });
});

describe('Network > Firewall: a realm switch never offers a second send (C9)', () => {
  const R1 = 'a'.repeat(24);
  const R2 = 'b'.repeat(24);
  const switchTo = (r: string) => act(() => { setRealm(r); bump('switch'); });
  afterEach(() => { setRealm('all'); bump('switch'); });

  it('a held add shows in another realm view, keeps every change of the computer off there, and is never sent again', async () => {
    const h = boot({ lostUnapplied: (n) => n === 1 });
    switchTo(R1);
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080' });
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    expect(await screen.findByText(/Adding “Block TCP port 8080 from anywhere” may have gone through/)).toBeInTheDocument();
    switchTo(R2);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(await screen.findByText(/Adding “Block TCP port 8080 from anywhere” may have gone through/)).toBeInTheDocument();
    expect(isOff(screen.getByRole('button', { name: strings['fw.add'] }))).toBe(true);
    await fwMenu();
    expect(await screen.findByRole('menuitem', { name: opening(strings['fw.reset']) })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(writes(h)).toEqual(['POST ingress']);
  });
});

describe('Network > Firewall: a refusal keeps its facts', () => {
  it('a refused add says why in the form and offers the kit\'s Details (code, status) without sending again', async () => {
    const h = boot({ addAnswer: () => answers.refused(422, 'INVALID_RULE_DEFINITION') });
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080' });
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    expect(await within(g).findByText(strings['fw.refused.invalid'])).toBeInTheDocument();
    // The refusal sits in the drawer's footer beside the button that sent it, in the page's words, once.
    const foot = within(g).getByRole('button', { name: strings['fw.form.go'] }).closest('footer') as HTMLElement;
    expect(within(foot).getByText(strings['fw.refused.invalid'])).toBeInTheDocument();
    expect(within(g).getAllByText(strings['fw.refused.invalid'])).toHaveLength(1);
    await userEvent.click(within(foot).getByRole('button', { name: /^Details/ }));
    expect(await screen.findByText(/INVALID_RULE_DEFINITION/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('a refusal, then a retry whose answer is lost: the old refusal goes, the hold stays', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }], removeAnswer: (n) => (n === 1 ? answers.refused(429, 'RATE_LIMITED') : answers.pending5xx()) });
    mount();
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.delete']);
    await confirm(strings['fw.delete.go']);
    expect(await screen.findByText(strings['fw.refused.rate'])).toBeInTheDocument();
    h.failReads = true;
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.delete']);
    await confirm(strings['fw.delete.go']);
    expect(await screen.findByRole('button', { name: strings['fw.held.check'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['fw.refused.rate'])).toBeNull();
    expect(writes(h)).toEqual(['DELETE ingress', 'DELETE ingress']);
  });
  it('a refused delete says why in the band and offers the kit\'s Details', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }], removeAnswer: () => answers.refused(403, 'FORBIDDEN') });
    mount();
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.delete']);
    await confirm(strings['fw.delete.go']);
    expect(await screen.findByText(strings['fw.refused.denied'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Details/ }));
    expect(await screen.findByText(/FORBIDDEN/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['DELETE ingress']);
  });
});

describe('Network > Firewall: naming one rule before a delete or switch', () => {
  const withSource = { action: 'drop', protocol: 'tcp', description: 'x', destination_port: '22', source: '203.0.113.5', state: 'enabled' };
  const noSource = { action: 'drop', protocol: 'tcp', description: 'x', destination_port: '22', state: 'enabled' };
  it('a delete the host would apply to another rule first is refused, unsent', async () => {
    const h = boot({ ingress: [withSource, noSource] });
    mount();
    await rowAction('Block TCP port 22 from anywhere', strings['fw.row.delete']);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(/Another rule matches its fields and comes first/);
    expect(within(dlg).getByRole('button', { name: strings['fw.delete.go'] })).toBeDisabled();
    expect(h.sent).toEqual([]);
  });
  it('a delete of the first match says how many others match, then sends every field of the rule', async () => {
    const h = boot({ ingress: [noSource, withSource] });
    mount();
    await rowAction('Block TCP port 22 from anywhere', strings['fw.row.delete']);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/1 other rules also match/);
    await confirm(strings['fw.delete.go']);
    await waitFor(() => expect(writes(h)).toEqual(['DELETE ingress']));
    expect(h.sent[0]?.body).toEqual(noSource);
    expect(h.ingress).toEqual([withSource]);
  });
  it('a re-read while the delete dialog is open re-judges THE rule shown: gone from the list, nothing can be sent', async () => {
    const h = boot({ ingress: [noSource, withSource] });
    mount();
    await rowAction('Block TCP port 22 from anywhere', strings['fw.row.delete']);
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('button', { name: strings['fw.delete.go'] })).toBeEnabled();
    // Someone else removes it; the list re-reads with only the source-specific rule at its row.
    h.ingress.splice(0, 1);
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(dlg).toHaveTextContent(strings['fw.match.gone']));
    expect(within(dlg).getByRole('button', { name: strings['fw.delete.go'] })).toBeDisabled();
    expect(h.sent).toEqual([]);
  });
  it('a switch of a rule that shares its fields with another (on/off twin) is refused', async () => {
    const h = boot({ ingress: [noSource, { ...noSource, state: 'disabled' }] });
    mount();
    // The enabled twin's row (the one that can be turned off).
    const row = await waitFor(() => {
      const r = within(screen.getByRole('table', { name: strings['fw.title'] })).getAllByRole('row').find((x) => squash(x.textContent ?? '').includes(squash('Block TCP port 22 from anywhere')) && !(x.textContent ?? '').includes('Off'));
      if (!r) throw new Error('no enabled twin');
      return r;
    });
    await rowAction('', strings['fw.row.off'], row);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(/Another rule has the same fields/);
    expect(within(dlg).getByRole('button', { name: strings['fw.row.off'] })).toBeDisabled();
    expect(h.sent).toEqual([]);
  });
  it('turning on a disabled all-port TCP block (no port on the rule) asks for the name first', async () => {
    const allPorts = { action: 'drop', protocol: 'tcp', description: 'old', state: 'disabled' };
    const h = boot({ ingress: [allPorts] });
    mount();
    await rowAction('Block TCP all ports from anywhere', strings['fw.row.on']);
    await confirm(strings['fw.row.on']);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('This can cut atlas off from the Hub');
    expect(h.sent).toEqual([]);
  });
  it('turning on a disabled SSH block says the plain SSH note in its confirmation, then sends (no typed name)', async () => {
    const h = boot({ ingress: [{ ...noSource, state: 'disabled' }] });
    mount();
    await rowAction('Block TCP port 22 from anywhere', strings['fw.row.on']);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(strings['fw.ssh.note']);
    await confirm(strings['fw.row.on']);
    await waitFor(() => expect(writes(h)).toEqual(['PATCH ingress']));
    expect(h.ingress[0]?.state).toBe('enabled');
  });
  it('the typed confirmation judges the list as read at its press: a rule replaced meanwhile sends nothing', async () => {
    const allPorts = { action: 'drop', protocol: 'tcp', description: 'old', state: 'disabled' };
    const h = boot({ ingress: [allPorts] });
    mount();
    await rowAction('Block TCP all ports from anywhere', strings['fw.row.on']);
    await confirm(strings['fw.row.on']);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('This can cut atlas off from the Hub');
    // Someone else replaces it with the same rule limited to one address; the list re-reads.
    h.ingress.splice(0, 1, { ...allPorts, source: '203.0.113.5' });
    await act(async () => { await queryClient.invalidateQueries(); });
    expect(await ruleRow('Block TCP all ports from 203.0.113.5')).toBeInTheDocument();
    await userEvent.type(within(dlg).getByRole('textbox'), 'atlas');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['fw.cut.go'] }));
    expect(await screen.findByText(strings['fw.match.changed'])).toBeInTheDocument();
    expect(h.sent).toEqual([]);
  });
});

describe('Network > Firewall: a change on its way is never called not sent', () => {
  it("while this page's own Delete is out, nothing on the page says 'nothing was sent'; Add a rule is off, the reason naming the change as the person's own", async () => {
    const rule = { action: 'drop', protocol: 'tcp', description: 'x', destination_port: '9998', state: 'enabled' };
    const h = boot({ ingress: [rule], slowRemove: true });
    mount();
    await rowAction('Block TCP port 9998 from anywhere', strings['fw.row.delete']);
    await confirm(strings['fw.delete.go']);
    await waitFor(() => expect(writes(h)).toEqual(['DELETE ingress']));
    // The DELETE left and has not answered: the section waits, in words that claim nothing about what was sent.
    const sec = (await screen.findByRole('heading', { name: strings['fw.title'] })).closest('section') as HTMLElement;
    await waitFor(() => expect(sec).toHaveTextContent(strings['fw.reason.own'].replace('{{name}}', 'atlas')));
    expect(document.body).not.toHaveTextContent(strings['ni.reason.wait'].replace('{{name}}', 'atlas'));
    expect(document.body).not.toHaveTextContent(/nothing was sent/);
    expect(isOff(within(sec).getByRole('button', { name: opening(strings['fw.add']) }))).toBe(true);
    // It ends as deleted, with one send.
    expect(await screen.findByText(re('Deleted: '), undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(writes(h)).toEqual(['DELETE ingress']);
  });
});

describe('Network > Firewall: editing is add, re-read, then remove', () => {
  const old = { action: 'drop', protocol: 'tcp', description: 'web', destination_port: '8080', state: 'enabled' };
  async function editPortTo(port: string) {
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.edit']);
    const g = screen.getByRole('dialog', { name: strings['fw.form.editTitle'] });
    const ports = within(g).getByLabelText(re(strings['fw.form.ports']));
    await userEvent.clear(ports);
    await userEvent.type(ports, port);
    expect(within(g).getByText(strings['fw.form.replaceNote'])).toBeInTheDocument();
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.save'] }));
  }
  it('the new rule is added, read back, then the old one removed', async () => {
    const h = boot({ ingress: [old] });
    mount();
    await editPortTo('9090');
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']));
    expect(h.ingress).toEqual([{ ...old, destination_port: '9090' }]);
    expect(await screen.findByText(strings['fw.edit.done'])).toBeInTheDocument();
  });
  // Live recheck: "The old rule is still there … Remove it" showed for seconds while the edit's own re-read and
  // remove were still out. While they run the page says it is working; that text is for a remove that did not go.
  it("while the edit's own remove is out, the page says it is working, never that the old rule is still there", async () => {
    // The fake host applies the remove at once and answers 1.5 s later: the page is mid-send meanwhile.
    const h = boot({ ingress: [old], slowRemove: true });
    mount();
    await editPortTo('9090');
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']));
    expect(screen.getByText(strings['fw.edit.working'])).toBeInTheDocument();
    expect(screen.queryByText(/The old rule is still there/)).toBeNull();
    expect(screen.queryByRole('button', { name: strings['fw.left.remove'] })).toBeNull();
    expect(await screen.findByText(strings['fw.edit.done'], {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/The old rule is still there/)).toBeNull();
    expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']);
  });
  it('an add with a lost answer sends no remove; after Check proves it, the old rule is still there with Remove it', async () => {
    const h = boot({ ingress: [old], addAnswer: (n) => (n === 1 ? answers.pending5xx() : null) });
    mount();
    await editPortTo('9090');
    // Held until a fresh read proves the add (core may prove it on the page's own re-read already).
    await waitFor(() => expect(screen.queryByText(/may have gone through/) ?? screen.queryByText(/The old rule is still there/)).not.toBeNull());
    expect(writes(h)).toEqual(['POST ingress']);
    const check = screen.queryByRole('button', { name: strings['fw.held.check'] });
    if (check) await userEvent.click(check);
    expect(await screen.findByText(/The old rule is still there: Block TCP port 8080/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
    await userEvent.click(screen.getByRole('button', { name: strings['fw.left.remove'] }));
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']));
    expect(h.ingress).toEqual([{ ...old, destination_port: '9090' }]);
  });
  it('the old rule left by an edit: a read-only session gets no Remove it, the notice and Check again stay', async () => {
    const h = boot({ ingress: [old], addAnswer: (n) => (n === 1 ? answers.pending5xx() : null) });
    const ui = (w: boolean) => <QueryClientProvider client={queryClient}><Firewall c={C} canWrite={w} /></QueryClientProvider>;
    const r = render(ui(true));
    await editPortTo('9090');
    await waitFor(() => expect(screen.queryByText(/may have gone through/) ?? screen.queryByText(/The old rule is still there/)).not.toBeNull());
    const check = screen.queryByRole('button', { name: strings['fw.held.check'] });
    if (check) await userEvent.click(check);
    expect(await screen.findByText(/The old rule is still there: Block TCP port 8080/)).toBeInTheDocument();
    r.rerender(ui(false));
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['fw.left.remove'] })).toBeNull());
    expect(screen.getByText(/The old rule is still there: Block TCP port 8080/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['fw.held.check'] })).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('a refused remove leaves both rules and says the old one is still there', async () => {
    const h = boot({ ingress: [old], removeAnswer: () => answers.refused(429, 'RATE_LIMITED') });
    mount();
    await editPortTo('9090');
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']));
    expect(await screen.findByText(/The old rule is still there/)).toBeInTheDocument();
    expect(h.ingress).toHaveLength(2);
  });
  it('the old rule not named first by its fields (an earlier rule also matches): no remove is sent, both stay', async () => {
    const earlier = { ...old, source: '203.0.113.5' };
    const h = boot({ ingress: [earlier, old] });
    mount();
    await editPortTo('9090');
    expect(await screen.findByText(strings['fw.left.notFirst'])).toBeInTheDocument();
    expect(screen.getByText(/The old rule is still there/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
    expect(h.ingress).toEqual([earlier, old, { ...old, destination_port: '9090' }]);
  });
  it('the re-read after the add fails: the old rule is kept, no remove sent (a cached list never counts)', async () => {
    const h = boot({ ingress: [old], addAnswer: () => { h.failReads = true; return null; } });
    mount();
    await editPortTo('9090');
    expect(await screen.findByText(strings['fw.left.readFailed'])).toBeInTheDocument();
    expect(screen.getByText(/The old rule is still there/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('an unreadable rule in that direction after the add: the old rule is not taken as gone', async () => {
    const h = boot({ ingress: [old], addAnswer: () => { h.ingress.splice(0, 1); h.badIngress = true; return null; } });
    mount();
    await editPortTo('9090');
    expect(await screen.findByText(/The old rule is still there/)).toBeInTheDocument();
    expect(screen.queryByText(strings['fw.edit.done'])).toBeNull();
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('the remove applied but its answer was lost: a read proving it finishes the edit, nothing re-sent', async () => {
    const h = boot({ ingress: [old], removeAnswer: () => answers.pending5xx() });
    mount();
    await editPortTo('9090');
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']));
    expect(h.ingress).toEqual([{ ...old, destination_port: '9090' }]);
    const check = screen.queryByRole('button', { name: strings['fw.held.check'] });
    if (check) await userEvent.click(check);
    expect(await screen.findByText(strings['fw.edit.done'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/The old rule is still there/)).toBeNull());
    expect(writes(h)).toEqual(['POST ingress', 'DELETE ingress']);
  });
  it('the new rule not showing on the re-read: the old rule is kept, no remove sent', async () => {
    const h = boot({ ingress: [old], hideAddsFromReads: true });
    mount();
    await editPortTo('9090');
    expect(await screen.findByText(strings['fw.left.notShown'])).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress']);
  });
});

describe('Network > Firewall: presets and reset', () => {
  it('Block inbound TCP except web adds its rules one by one, none asking for the name', async () => {
    const h = boot();
    mount();
    await fwMenu(strings['fw.preset.inboundExceptWeb']);
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: /^Add 2 rules$/ }));
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress', 'POST ingress']));
    expect(await screen.findByText('Added 2 rules.')).toBeInTheDocument();
  });
  it('Block outbound mail is one rule: "Add 1 rule", then "Added 1 rule."', async () => {
    const h = boot();
    mount();
    await fwMenu(strings['fw.preset.mail']);
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: /^Add 1 rule$/ }));
    await waitFor(() => expect(writes(h)).toEqual(['POST egress']));
    expect(await screen.findByText('Added 1 rule.')).toBeInTheDocument();
  });
  it('an open Reset waits once another change of this computer is held (sent elsewhere), and sends nothing', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }], lostUnapplied: (n) => n === 1 });
    render(<QueryClientProvider client={queryClient}><AddProbe /><Firewall c={C} canWrite /></QueryClientProvider>);
    await fwMenu(strings['fw.reset']);
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'atlas');
    await act(async () => { await probeAdd!.mutateAsync({ computer: C.id, rule: { direction: 'ingress', action: 'drop', protocol: 'tcp', description: 'other tab', destination_port: '9999', state: 'enabled' } }).catch(() => undefined); });
    await waitFor(() => expect(dlg).toHaveTextContent(strings['ni.reason.wait'].replace('{{name}}', 'atlas')));
    expect(dlg).not.toHaveTextContent(/nothing was sent/);
    // A DangerConfirm waits as in flight: its button is aria-disabled (pressing it does nothing).
    expect(within(dlg).getByRole('button', { name: strings['fw.reset.go'] })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['fw.reset.go'] }));
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('an open Delete waits once another change of this computer is held (sent elsewhere), and sends nothing', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }], lostUnapplied: (n) => n === 1 });
    render(<QueryClientProvider client={queryClient}><AddProbe /><Firewall c={C} canWrite /></QueryClientProvider>);
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.delete']);
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('button', { name: strings['fw.delete.go'] })).toBeEnabled();
    await act(async () => { await probeAdd!.mutateAsync({ computer: C.id, rule: { direction: 'ingress', action: 'drop', protocol: 'tcp', description: 'other tab', destination_port: '9999', state: 'enabled' } }).catch(() => undefined); });
    await waitFor(() => expect(within(dlg).getByRole('button', { name: strings['fw.delete.go'] })).toBeDisabled());
    expect(dlg).toHaveTextContent(strings['ni.reason.wait'].replace('{{name}}', 'atlas'));
    expect(dlg).not.toHaveTextContent(/nothing was sent/);
    expect(writes(h)).toEqual(['POST ingress']);
  });
  it('an open Reset waits while another change of this computer is still on its way (no answer yet, no hold)', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }], slowAdd: (n) => n === 1 });
    render(<QueryClientProvider client={queryClient}><AddProbe /><Firewall c={C} canWrite /></QueryClientProvider>);
    await fwMenu(strings['fw.reset']);
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'atlas');
    let inFlight: Promise<unknown> = Promise.resolve();
    act(() => { inFlight = probeAdd!.mutateAsync({ computer: C.id, rule: { direction: 'ingress', action: 'drop', protocol: 'tcp', description: 'other tab', destination_port: '9999', state: 'enabled' } }).catch(() => undefined); });
    await waitFor(() => expect(within(dlg).getByRole('button', { name: strings['fw.reset.go'] })).toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['fw.reset.go'] }));
    expect(writes(h)).toEqual(['POST ingress']);
    // Let the other send answer before the next test (core's sends are module state).
    await act(async () => { await inFlight; });
  }, 20_000);
  it('a preset stops before its next rule once another change of this computer started meanwhile', async () => {
    const other = { direction: 'ingress', action: 'drop', protocol: 'tcp', description: 'other tab', destination_port: '9999', state: 'enabled' } as const;
    const h = boot({
      lostUnapplied: (n) => n === 2,
      // The first preset add answers a moment later; meanwhile another part sends a change of this computer.
      addAnswer: (n) => { if (n !== 1) return null; void probeAdd!.mutateAsync({ computer: C.id, rule: other }).catch(() => undefined); return answers.slow({ statusCode: 201, data: {} }, 400); },
    });
    render(<QueryClientProvider client={queryClient}><AddProbe /><Firewall c={C} canWrite /></QueryClientProvider>);
    await fwMenu(strings['fw.preset.privateOut']);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Add 2 rules$/ }));
    expect(await screen.findByText(/another firewall change of atlas started meanwhile/)).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST egress', 'POST ingress']);
  });
  it('a failed re-read sends nothing against the last list: an open Reset stays but sends nothing, Presets and Reset say why', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }] });
    h.badIngress = true;
    mount();
    expect(await screen.findByText(strings['fw.unreadable'].replace('{{count}}', '1'))).toBeInTheDocument();
    await fwMenu(strings['fw.reset']);
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'atlas');
    h.failReads = true;
    await act(async () => { await queryClient.refetchQueries(); });
    const why = strings['fw.reason.stale'].replace('{{name}}', 'atlas');
    // The open dialog stays, its typing kept, and says why; its Confirm sends nothing until a read succeeds.
    await waitFor(() => expect(within(dlg).getByText(new RegExp(why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument());
    expect(within(dlg).getByRole('textbox')).toHaveValue('atlas');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['fw.reset.go'] }));
    expect(writes(h)).toEqual([]);
    // The last list's unreadable count is not said as current.
    expect(screen.queryByText(strings['fw.unreadable'].replace('{{count}}', '1'))).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const sec = (await screen.findByRole('heading', { name: strings['fw.title'] })).closest('section') as HTMLElement;
    await userEvent.click(within(sec).getByRole('button', { name: 'More actions' }));
    for (const name of [strings['fw.reset'], strings['fw.preset.port']]) {
      const item = await screen.findByRole('menuitem', { name: opening(name) });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAccessibleDescription(why);
    }
    expect(writes(h)).toEqual([]);
  });
  it('losing write access closes an open Reset: nothing can be sent from it', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }] });
    const ui = (w: boolean) => <QueryClientProvider client={queryClient}><Firewall c={C} canWrite={w} /></QueryClientProvider>;
    const r = render(ui(true));
    await fwMenu(strings['fw.reset']);
    await userEvent.type(within(await screen.findByRole('alertdialog')).getByRole('textbox'), 'atlas');
    r.rerender(ui(false));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(writes(h)).toEqual([]);
  });
  it('an open Add drawer keeps its draft through a failed re-read, with Add off and the reason said', async () => {
    const h = boot({});
    mount();
    const g = await openAdd();
    await fill(g, { ports: '8080' });
    h.failReads = true;
    await act(async () => { await queryClient.refetchQueries(); });
    const why = strings['fw.reason.stale'].replace('{{name}}', 'atlas');
    expect(await within(g).findByText(why)).toBeInTheDocument();
    expect(within(g).getByLabelText(re(strings['fw.form.ports']))).toHaveValue('8080');
    await userEvent.click(within(screen.getByRole('dialog', { name: strings['fw.form.addTitle'] })).getByRole('button', { name: strings['fw.form.go'] }));
    expect(writes(h)).toEqual([]);
  });
  it('a preset already sending stops before its next rule once write access is lost', async () => {
    const h = boot({ addAnswer: (n) => (n === 1 ? answers.slow({ statusCode: 201, data: {} }, 400) : null) });
    const ui = (w: boolean) => <QueryClientProvider client={queryClient}><Firewall c={C} canWrite={w} /></QueryClientProvider>;
    const r = render(ui(true));
    await fwMenu(strings['fw.preset.privateOut']);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Add 2 rules$/ }));
    await waitFor(() => expect(writes(h)).toEqual(['POST egress']));
    r.rerender(ui(false));
    const why = strings['ni.reason.noWrite'].replace('{{name}}', 'atlas');
    const stopped = `${strings['fw.preset.partial'].replace('{{done}}', '1').replace('{{total}}', '2')} ${why}`;
    expect(await screen.findByText(stopped, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST egress']);
  });
  it('Reset needs the typed name, then sends one reset', async () => {
    const h = boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '8080', state: 'enabled' }] });
    mount();
    await fwMenu(strings['fw.reset']);
    const dlg = await screen.findByRole('alertdialog');
    const go = within(dlg).getByRole('button', { name: strings['fw.reset.go'] });
    expect(go).toBeDisabled();
    await userEvent.type(within(dlg).getByRole('textbox'), 'atlas');
    await userEvent.click(go);
    await waitFor(() => expect(writes(h)).toEqual(['POST reset']));
    expect(await screen.findByText('No firewall rules')).toBeInTheDocument();
  });
});

// The rule drawer's closing plate says the rule as one sentence (kit Verdict, calm); an edit's save path is
// the subtitle; the allow note is the action's description; the notes are no loose lines under the form.
describe('firewall: the rule drawer', () => {
  // The form's structure: the fields in three sections, then the rule as a sentence in the closing block. Nothing is
  // pinned: the closing block is a plain last section, so no field (the On switch least of all) is ever under it.
  it('the fields stand in three sections, and the sentence closes the form', async () => {
    boot();
    mount();
    const g = await openAdd();
    const sections = [...g.querySelectorAll<HTMLElement>('[data-form-section]')];
    expect(sections.map((x) => x.dataset.formSection)).toEqual(['group', 'group', 'group', 'group']);
    expect(g.querySelector('[data-form-section="summary"]')).toBeNull();
    const [rule, match, name, summary] = sections as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    // The leading group has no visible title; the next two are named by a heading.
    expect(rule).toHaveAccessibleName(strings['fw.form.sec.rule']);
    expect(within(rule).queryByRole('heading')).toBeNull();
    expect(within(match).getByRole('heading', { name: strings['fw.form.sec.match'] })).toBeInTheDocument();
    expect(within(name).getByRole('heading', { name: strings['fw.form.sec.name'] })).toBeInTheDocument();
    // Each field is in its section.
    // Traffic shows its label, as every other field of the form does.
    expect(within(rule).getByText(strings['fw.form.direction'])).toBeVisible();
    expect(within(rule).getByLabelText(re(strings['fw.form.action']))).toBeInTheDocument();
    expect(within(match).getByLabelText(re(strings['fw.form.protocol']))).toBeInTheDocument();
    expect(within(match).getByLabelText(re(strings['fw.form.ports']))).toBeInTheDocument();
    expect(within(match).getByLabelText(re(strings['fw.form.addresses.in']))).toBeInTheDocument();
    expect(within(name).getByLabelText(re(strings['fw.form.description']))).toBeInTheDocument();
    expect(within(name).getByRole('switch', { name: strings['fw.form.enabled'] })).toBeInTheDocument();
    // The sentence is the closing block: the last section, and no field stands outside a section.
    expect(within(summary).getByRole('group', { name: strings['fw.form.previewLabel'] })).toBeInTheDocument();
    expect(summary.parentElement?.lastElementChild).toBe(summary);
    for (const field of g.querySelectorAll('input, select, textarea, [role="switch"], [role="radiogroup"]')) expect(field.closest('[data-form-section]'), field.outerHTML.slice(0, 80)).not.toBeNull();
  });

  // A warning stands where it applies, in view when the drawer opens, never after the last field: the cut-off warning
  // right under the ports it is about and before the addresses, not in the closing block.
  it('the cut-off warning stands under the ports, before the addresses and the closing sentence', async () => {
    boot();
    mount();
    const g = await openAdd();
    const sections = [...g.querySelectorAll<HTMLElement>('[data-form-section]')];
    const [, match, , closing] = sections as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    // A new rule blocks every TCP port until Ports is filled in: the warning is there from the start.
    const warn = within(g).getByText(/^This blocks ports /);
    expect(match.contains(warn)).toBe(true);
    expect(closing.contains(warn)).toBe(false);
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(within(match).getByLabelText(re(strings['fw.form.ports'])), warn)).toBe(true);
    expect(after(warn, within(match).getByLabelText(re(strings['fw.form.addresses.in'])))).toBe(true);
    // A port the Hub does not use: the warning goes, and nothing else took its place in the closing block.
    await fill(g, { ports: '8080' });
    expect(within(g).queryByText(/^This blocks ports /)).toBeNull();
    expect(closing.querySelector('[role="alert"], [data-band]')).toBeNull();
  });

  it('the plate says the rule once it is whole, and a placeholder until then', async () => {
    boot();
    mount();
    const g = await openAdd();
    const plate = within(g).getByRole('group', { name: strings['fw.form.previewLabel'] });
    expect(plate).toHaveTextContent(strings['fw.form.previewEmpty']);
    await fill(g, { ports: '8080', addresses: '203.0.113.5' });
    expect(plate).toHaveTextContent(/This rule: Block TCP port 8080 from 203.0.113.5/);
    expect(within(g).queryByText(strings['fw.form.previewEmpty'])).toBeNull();
  });

  // A port alone left Add rule off with the placeholder sentence and no reason (Description is
  // required by the API and its "needed" was never shown). The plate and the footer now name the one field missing.
  it('only a port typed: the plate and the footer say Description is missing, Add rule stays off; a description then shows the rule and turns it on', async () => {
    const h = boot();
    mount();
    const g = await openAdd();
    const plate = within(g).getByRole('group', { name: strings['fw.form.previewLabel'] });
    await userEvent.type(within(g).getByLabelText(re(strings['fw.form.ports'])), '9999');
    expect(plate).toHaveTextContent(strings['fw.form.previewNeeds.description']);
    expect(within(g).queryByText(strings['fw.form.previewEmpty'])).toBeNull();
    expect(within(g).getByText(strings['fw.form.description.needed'])).toBeInTheDocument();
    expect(isOff(within(g).getByRole('button', { name: strings['fw.form.go'] }))).toBe(true);
    await userEvent.type(within(g).getByLabelText(re(strings['fw.form.description'])), 'game');
    expect(plate).toHaveTextContent(/This rule: Block TCP port 9999 from anywhere/);
    expect(within(g).queryByText(strings['fw.form.description.needed'])).toBeNull();
    expect(isOff(within(g).getByRole('button', { name: strings['fw.form.go'] }))).toBe(false);
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    await waitFor(() => expect(writes(h)).toEqual(['POST ingress']));
  });
  it('an address typed with Ports and Description empty: the plate asks for the port, not for something to match', async () => {
    boot();
    mount();
    const g = await openAdd();
    await userEvent.type(within(g).getByLabelText(re(strings['fw.form.addresses.in'])), '203.0.113.5');
    const plate = within(g).getByRole('group', { name: strings['fw.form.previewLabel'] });
    expect(plate).toHaveTextContent(strings['fw.form.previewNeeds.ports']);
    expect(within(g).queryByText(strings['fw.form.previewEmpty'])).toBeNull();
  });
  it('only a description typed: the plate and the footer ask for the port', async () => {
    boot();
    mount();
    const g = await openAdd();
    await userEvent.type(within(g).getByLabelText(re(strings['fw.form.description'])), 'game');
    expect(within(g).getByRole('group', { name: strings['fw.form.previewLabel'] })).toHaveTextContent(strings['fw.form.previewNeeds.ports']);
    expect(within(g).getByText(strings['fw.form.ports.needed'])).toBeInTheDocument();
    expect(isOff(within(g).getByRole('button', { name: strings['fw.form.go'] }))).toBe(true);
  });
  // An edit opened and cancelled untouched asked "Discard changes?".
  it('an untouched edit or add closes on Cancel without the leave ask; a changed one asks', async () => {
    boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'web', destination_port: '8080', state: 'enabled' }] });
    mount();
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.edit']);
    let g = screen.getByRole('dialog', { name: strings['fw.form.editTitle'] });
    await userEvent.click(within(g).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['fw.form.editTitle'] })).toBeNull(), { timeout: 3000 });
    g = await openAdd();
    await userEvent.click(within(g).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['fw.form.addTitle'] })).toBeNull(), { timeout: 3000 });
    g = await openAdd();
    await userEvent.type(within(g).getByLabelText(re(strings['fw.form.ports'])), '9999');
    await userEvent.click(within(g).getByRole('button', { name: 'Cancel' }));
    expect(await within(g).findByRole('button', { name: /^Keep editing/ })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: strings['fw.form.addTitle'] })).toBeInTheDocument();
  });
  it('an untouched edit says no "Unsaved changes" in its footer; a changed one does', async () => {
    boot({ ingress: [{ action: 'drop', protocol: 'tcp', description: 'web', destination_port: '8080', state: 'enabled' }] });
    mount();
    await rowAction('Block TCP port 8080 from anywhere', strings['fw.row.edit']);
    const g = screen.getByRole('dialog', { name: strings['fw.form.editTitle'] });
    expect(within(g).queryByText('Unsaved changes')).toBeNull();
    expect(isOff(within(g).getByRole('button', { name: strings['fw.form.save'] }))).toBe(false);
    await userEvent.type(within(g).getByLabelText(re(strings['fw.form.description'])), ' site');
    expect(await within(g).findByText('Unsaved changes')).toBeInTheDocument();
  });

  it('the allow note is the Action field description, not a line under it', async () => {
    boot();
    mount();
    const g = await openAdd();
    await userEvent.click(within(g).getByRole('button', { name: re(strings['fw.form.action']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['fw.form.action.allow'] }));
    const field = within(g).getByRole('button', { name: re(strings['fw.form.action']) });
    expect(field).toHaveAccessibleDescription(re(strings['fw.form.allowNote']));
  });
});
