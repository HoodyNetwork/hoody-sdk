// Network > Internet access: a neutral Allowed | Blocked choice with the read state beside it
// in words and tone (Allowed ok, Blocked danger, Partly blocked / Can't tell warn), the confirm before blocking, the
// reason under the choice while it can't be used, and the glance facts read from the same queries (no second fetch).
// Normal internet never renders a danger tone (the old red "No internet" switch read as already on).
import { answers, bootFixtureCore, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { isOff } from '@app/testing';
import { egressRoutes } from '../data';
import { firewallRoutes } from '../firewall.data';
import { routes } from '../routes';
import type { Computer } from '../types';
import { accessPill, Firewall } from './Firewall';
import strings from './Firewall.strings.en.json';
import net from './Network.strings.en.json';
import { NetworkSummary } from './NetworkSummary';
import { NO_INTERNET_MARK, type NoInternetState } from './NoInternet.logic';

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

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
type Wire = Record<string, string>;
const TCP: Wire = { action: 'drop', protocol: 'tcp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' };
const UDP: Wire = { action: 'drop', protocol: 'udp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' };
const PING: Wire = { action: 'drop', protocol: 'icmp4', description: NO_INTERNET_MARK, state: 'enabled' };
const MAIL: Wire = { action: 'drop', protocol: 'tcp', description: 'No outbound mail', destination_port: '25', state: 'enabled' };

function boot(o: { egress?: unknown[]; fail?: boolean; failAfter?: number; up?: Record<string, unknown> } = {}): { reads: () => number; sent: FixtureRequest[] } {
  let reads = 0;
  const sent: FixtureRequest[] = [];
  const egress = [...(o.egress ?? [])];
  const rules: FixtureRule[] = [
    reply(firewallRoutes.rules, () => {
      reads++;
      return o.fail || (o.failAfter !== undefined && reads > o.failAfter) ? answers.refused(503, 'FIREWALL_HOST_UNAVAILABLE') : answers.ok({ statusCode: 200, data: { ingress: [], egress, rule_count: egress.length, max_rules: 500 } });
    }),
    reply(routes.list, () => answers.ok({ data: { computers: [C] } })),
    reply(egressRoutes.upstream, () => answers.ok({ ...(o.up ?? { enabled: false, state: 'direct' }), config_path: '/x' })),
    reply(firewallRoutes.addOut, (r) => { sent.push(r); return answers.ok({ statusCode: 201, data: {} }); }),
    reply(firewallRoutes.removeOut, (r) => { sent.push(r); return answers.ok({ statusCode: 200, data: {} }); }),
  ];
  bootFixtureCore({ rules });
  return { reads: () => reads, sent };
}
const mount = (canWrite = true) =>
  render(<QueryClientProvider client={queryClient}><NetworkSummary c={C} /><Firewall c={C} canWrite={canWrite} /></QueryClientProvider>);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A head action's name: its label, with "…" when it opens a dialog. */
const opening = (x: string) => new RegExp(`^${esc(x)}…?$`);
/** The Internet access section's one head action: Block when allowed (asks first), Allow when blocked. */
const headNow = (): HTMLElement => {
  const b = screen.queryByRole('button', { name: opening(strings['ni.blockGo']) }) ?? screen.queryByRole('button', { name: opening(strings['ni.allowGo']) });
  if (!b) throw new Error('no Internet access action');
  return b;
};
const head = () => waitFor(headNow);
const blockedNow = () => screen.queryByRole('button', { name: opening(strings['ni.allowGo']) }) !== null;
/** Press the head action once it can act. */
async function flip() {
  const b = await waitFor(() => {
    const x = headNow();
    if (isOff(x)) throw new Error('the action is off');
    return x;
  });
  await userEvent.click(b);
}
/** The read-state pill of the Internet access section (the segment labels carry the same words). */
const pillOf = async (word: string) => {
  const section = (await screen.findByRole('heading', { name: strings['ni.title'] })).closest('section') as HTMLElement;
  return waitFor(() => {
    const pill = section.querySelector<HTMLElement>('.pill');
    expect(pill).toHaveTextContent(word);
    return pill as HTMLElement;
  });
};
const fill = (k: string, name = 'atlas') => k.replaceAll('{{name}}', name);

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept (core's held changes)
  localStorage.clear();
});

describe('Internet access: words and tone per state', () => {
  it('the tone table: allowed ok, blocked danger, partly and unknown warn; never danger unless blocked', () => {
    const cases: Array<[NoInternetState, string, string]> = [['off', 'ok', 'ni.allowed'], ['on', 'danger', 'ni.blockedState'], ['partial', 'warn', 'ni.partlyState'], ['unknown', 'warn', 'ni.unknownState']];
    for (const [ni, tone, key] of cases) expect(accessPill(ni)).toEqual({ tone, key });
  });

  it('normal internet: the pill says Allowed in ok tone, the one action blocks, the line says what that means now', async () => {
    boot({ egress: [MAIL] });
    mount();
    const pill = await pillOf(strings['ni.allowed']);
    expect(pill.className).toMatch(/\bok\b/);
    await waitFor(() => expect(isOff(headNow())).toBe(false));
    expect(headNow()).toHaveAccessibleName(opening(strings['ni.blockGo']));
    expect(blockedNow()).toBe(false);
    expect(screen.getByText(fill(strings['ni.now.off']))).toBeInTheDocument();
    // What is blocked lives behind the section's info tip, not as a description.
    expect(screen.getByRole('button', { name: `About ${strings['ni.title']}` })).toBeInTheDocument();
    expect(document.querySelector('.pill.danger')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('blocked: the pill says Blocked in danger tone and the one action allows again', async () => {
    boot({ egress: [MAIL, TCP, UDP, PING] });
    mount();
    const pill = await pillOf(strings['ni.blockedState']);
    expect(pill.className).toMatch(/\bdanger\b/);
    await waitFor(() => expect(blockedNow()).toBe(true));
    expect(screen.getByText(fill(strings['ni.now.on']))).toBeInTheDocument();
  });

  it('blocking asks first; nothing is sent until the confirm', async () => {
    const h = boot({ egress: [MAIL] });
    mount();
    await pillOf(strings['ni.allowed']);
    await flip();
    const d = await screen.findByRole('alertdialog', { name: fill(strings['ni.ask.title']) });
    expect(h.sent).toHaveLength(0);
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    expect(h.sent).toHaveLength(0);
    expect(blockedNow()).toBe(false);
  });

  it('allowing again asks nothing: the removals go out at once', async () => {
    const h = boot({ egress: [MAIL, TCP, UDP, PING] });
    mount();
    await pillOf(strings['ni.blockedState']);
    await flip();
    await waitFor(() => expect(h.sent.length).toBeGreaterThan(0));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('partly blocked: warn pill, the action is off with its reason said, Finish/Remove shown', async () => {
    boot({ egress: [TCP] });
    mount();
    expect(await screen.findByText(fill(strings['ni.partial']).replace('{{have}}', '1').replace('{{total}}', '3'))).toBeInTheDocument();
    expect((await pillOf(strings['ni.partlyState'])).className).toMatch(/\bwarn\b/);
    await waitFor(() => expect(headNow()).toHaveAccessibleDescription(strings['ni.reason.partial']));
    expect(isOff(await head())).toBe(true);
    expect(screen.getByRole('button', { name: strings['ni.finish'] })).toBeInTheDocument();
    expect(document.querySelector('.pill.danger')).toBeNull();
  });

  it("a failed read: Can't tell in warn tone, the action off with the reason, never danger", async () => {
    boot({ fail: true });
    mount();
    expect(await screen.findByText(fill(strings['ni.unknown']))).toBeInTheDocument();
    expect((await pillOf(strings['ni.unknownState'])).className).toMatch(/\bwarn\b/);
    await waitFor(() => expect(headNow()).toHaveAccessibleDescription(strings['ni.reason.unknown']));
    expect(isOff(headNow())).toBe(true);
    expect(document.querySelector('.pill.danger')).toBeNull();
  });

  it('no write access: no Internet access action at all; the state and its line stay', async () => {
    boot({ egress: [MAIL] });
    mount(false);
    await pillOf(strings['ni.allowed']);
    expect(screen.getByText(fill(strings['ni.now.off']))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: opening(strings['ni.blockGo']) })).toBeNull();
    expect(screen.queryByRole('button', { name: opening(strings['ni.allowGo']) })).toBeNull();
  });

  it('the rules made by Internet access are one group note tagged "Set by Internet access", not rows', async () => {
    boot({ egress: [MAIL, TCP, UDP, PING] });
    mount();
    const table = await screen.findByRole('table', { name: strings['fw.title'] });
    const note = `${strings['ni.group'].replace('{{count}}', '3')} (${strings['ni.setBy']})`;
    await waitFor(() => expect((table.closest('section') ?? table).textContent).toContain(note));
  });
});

describe('Internet access: the confirm is bound to its computer and to write access', () => {
  it('losing write access while the confirm is open closes it, and nothing is sent', async () => {
    const h = boot({ egress: [MAIL] });
    const r = mount();
    await flip();
    await screen.findByRole('alertdialog', { name: fill(strings['ni.ask.title']) });
    r.rerender(<QueryClientProvider client={queryClient}><NetworkSummary c={C} /><Firewall c={C} canWrite={false} /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // Access coming back does not reopen the old confirm: a new choice is needed.
    r.rerender(<QueryClientProvider client={queryClient}><NetworkSummary c={C} /><Firewall c={C} canWrite /></QueryClientProvider>);
    await waitFor(() => expect(isOff(headNow())).toBe(false));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.sent).toHaveLength(0);
  });

  it('another computer shown while the confirm is open closes it, and nothing is sent', async () => {
    const h = boot({ egress: [MAIL] });
    const r = mount();
    await flip();
    await screen.findByRole('alertdialog', { name: fill(strings['ni.ask.title']) });
    const other = { ...C, id: 'd'.repeat(24), name: 'beacon' } as Computer;
    r.rerender(<QueryClientProvider client={queryClient}><Firewall c={other} canWrite /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(h.sent).toHaveLength(0);
  });
});

describe('At a glance', () => {
  it('reads the same rules query as the sections (one read), with access words and the rule count', async () => {
    const h = boot({ egress: [MAIL, TCP, UDP, PING] });
    mount();
    const glance = (await screen.findByRole('heading', { name: net['glance.title'] })).closest('section') as HTMLElement;
    await waitFor(() => expect(within(glance).getByText('4 of 500')).toBeInTheDocument());
    expect(within(glance).getByText(strings['ni.blockedState'])).toBeInTheDocument();
    expect(h.reads()).toBe(1);
  });

  it("a failed read: access and firewall facts say Can't tell, never a count or a state", async () => {
    boot({ fail: true });
    mount();
    const glance = (await screen.findByRole('heading', { name: net['glance.title'] })).closest('section') as HTMLElement;
    await waitFor(() => expect(within(glance).getAllByText(net['glance.cantTell']).length).toBeGreaterThanOrEqual(2));
    expect(within(glance).queryByText(/^\d+ of \d+$/)).toBeNull();
    expect(within(glance).queryByText(strings['ni.allowed'])).toBeNull();
  });

  it("a read holding a rule the page can't read: access and firewall say Can't tell, never a count", async () => {
    boot({ egress: [MAIL, 'not a rule'] });
    mount();
    const glance = (await screen.findByRole('heading', { name: net['glance.title'] })).closest('section') as HTMLElement;
    await waitFor(() => expect(within(glance).getAllByText(net['glance.cantTell']).length).toBeGreaterThanOrEqual(2));
    expect(within(glance).queryByText(/^\d+ of \d+$/)).toBeNull();
  });

  it("a refresh that fails after a good read: the facts fall back to Can't tell, not the old count", async () => {
    boot({ egress: [MAIL], failAfter: 1 });
    mount();
    const glance = (await screen.findByRole('heading', { name: net['glance.title'] })).closest('section') as HTMLElement;
    await waitFor(() => expect(within(glance).getByText('1 of 500')).toBeInTheDocument());
    await queryClient.refetchQueries();
    await waitFor(() => expect(within(glance).queryByText('1 of 500')).toBeNull());
    expect(within(glance).getAllByText(net['glance.cantTell']).length).toBeGreaterThanOrEqual(2);
  });

  it('an exit the program does not report on: the fact says so, never an unqualified destination', async () => {
    boot({ up: { enabled: true, scheme: 'http', host: 'proxy.example.com', port: 8080, auth: false } });
    render(<QueryClientProvider client={queryClient}><NetworkSummary c={C} /></QueryClientProvider>);
    expect(await screen.findByText(/not reported whether it works/)).toBeInTheDocument();
  });

  it("the firewall fact counts the API's rule_count, not the rows read", async () => {
    bootFixtureCore({ rules: [
      reply(firewallRoutes.rules, () => answers.ok({ statusCode: 200, data: { ingress: [], egress: [MAIL], rule_count: 7, max_rules: 500 } })),
      reply(egressRoutes.upstream, () => answers.ok({ enabled: false, state: 'direct', config_path: '/x' })),
    ] });
    render(<QueryClientProvider client={queryClient}><NetworkSummary c={C} /></QueryClientProvider>);
    const glance = (await screen.findByRole('heading', { name: net['glance.title'] })).closest('section') as HTMLElement;
    await waitFor(() => expect(within(glance).getByText('7 of 500')).toBeInTheDocument());
  });

  it("another computer shown: the glance shows that computer's facts, never the one before", async () => {
    const other = { ...C, id: 'd'.repeat(24), name: 'beacon' } as Computer;
    const sent: FixtureRequest[] = [];
    bootFixtureCore({ rules: [
      reply(firewallRoutes.rules, (r) => answers.ok({ statusCode: 200, data: r.path.includes(C.id) ? { ingress: [], egress: [MAIL, TCP, UDP, PING], rule_count: 4, max_rules: 500 } : { ingress: [], egress: [MAIL], rule_count: 1, max_rules: 500 } })),
      reply(routes.list, () => answers.ok({ data: { computers: [C, other] } })),
      reply(egressRoutes.upstream, () => answers.ok({ enabled: false, state: 'direct', config_path: '/x' })),
      reply(firewallRoutes.addOut, (r) => { sent.push(r); return answers.ok({ statusCode: 201, data: {} }); }),
    ] });
    const r = render(<QueryClientProvider client={queryClient}><NetworkSummary c={C} /></QueryClientProvider>);
    const glanceOf = async () => (await screen.findByRole('heading', { name: net['glance.title'] })).closest('section') as HTMLElement;
    await waitFor(async () => expect(within(await glanceOf()).getByText('4 of 500')).toBeInTheDocument());
    r.rerender(<QueryClientProvider client={queryClient}><NetworkSummary c={other} /></QueryClientProvider>);
    await waitFor(async () => expect(within(await glanceOf()).getByText('1 of 500')).toBeInTheDocument());
    const g = await glanceOf();
    expect(within(g).queryByText('4 of 500')).toBeNull();
    expect(within(g).queryByText(strings['ni.blockedState'])).toBeNull();
    expect(within(g).getByText(fill(net['glance.exit.direct'], 'beacon'))).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('a stopped computer: the exit fact says it is not read while stopped', async () => {
    boot();
    render(<QueryClientProvider client={queryClient}><NetworkSummary c={{ ...C, status: 'stopped' } as Computer} /></QueryClientProvider>);
    expect(await screen.findByText(fill(net['glance.exit.stopped']))).toBeInTheDocument();
  });
});
