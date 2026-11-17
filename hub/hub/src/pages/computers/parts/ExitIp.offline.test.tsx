// "Use another exit" › Block internet access: a fourth choice that is no exit at all. It blocks outgoing
// connections only, by asking Internet access on the same tab (the Firewall's own Block question and rules, never a
// copy), and it sends nothing to the exit: the exit chosen is kept, says so, and is still the exit after internet
// access is blocked and allowed again. Rendered as the Network tab composes it (Network.tsx).
import { answers, bootFixtureCore, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { egressRoutes } from '../data';
import { firewallRoutes } from '../firewall.data';
import { routes } from '../routes';
import type { Computer } from '../types';
import strings from './ExitIp.strings.en.json';
import fw from './Firewall.strings.en.json';
import { Network } from './Network';
import { NO_INTERNET_MARK, NO_INTERNET_RULES } from './NoInternet.logic';

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

/** Use another exit… as a live button: until the exit is read the section head draws it disabled, with its reason. */
async function changeButton(root: HTMLElement = document.body): Promise<HTMLElement> {
  const name = strings['exit.change'];
  await waitFor(() => expect(within(root).getByRole('button', { name })).not.toHaveAttribute('aria-disabled'));
  return within(root).getByRole('button', { name });
}

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'a'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const T = (k: keyof typeof strings) => strings[k].replaceAll('{{name}}', C.name);
type Wire = Record<string, string>;
interface Up { scheme: string; host: string; port: number; auth: boolean }
const EXIT: Up = { scheme: 'socks5h', host: 'exit.example.net', port: 1080, auth: false };

function boot(seed: Up | null) {
  const exitWrites: FixtureRequest[] = [];
  const fwWrites: FixtureRequest[] = [];
  let up = seed;
  const egress: Wire[] = [];
  const blob = () => (up ? { enabled: true, state: 'active', ...up } : { enabled: false, state: 'direct' });
  const rules: FixtureRule[] = [
    reply(routes.list, () => answers.ok({ data: { computers: [C] } })),
    reply(egressRoutes.upstream, () => answers.ok({ ...blob(), config_path: '/x' })),
    reply(egressRoutes.set, (r) => {
      exitWrites.push(r);
      return answers.refused(400, 'UNEXPECTED');
    }),
    reply(egressRoutes.clear, (r) => {
      exitWrites.push(r);
      up = null;
      return answers.ok(blob());
    }),
    reply(firewallRoutes.rules, () => answers.ok({ statusCode: 200, data: { ingress: [], egress, rule_count: egress.length, max_rules: 500 } })),
    reply(firewallRoutes.addIn, (r) => {
      fwWrites.push(r);
      return answers.refused(400, 'UNEXPECTED');
    }),
    reply(firewallRoutes.addOut, (r) => {
      fwWrites.push(r);
      egress.push({ state: 'enabled', ...(r.body as Wire) });
      return answers.ok({ statusCode: 201, data: { ingress: [], egress } });
    }),
    reply(firewallRoutes.removeOut, (r) => {
      fwWrites.push(r);
      const crit = r.body as Wire;
      const i = egress.findIndex((x) => Object.entries(crit).every(([k, v]) => v === undefined || x[k] === v));
      if (i < 0) return answers.refused(404, 'RULE_NOT_FOUND');
      egress.splice(i, 1);
      return answers.ok({ statusCode: 200, data: { direction: 'egress', removed_count: 1 } });
    }),
  ];
  bootFixtureCore({ rules });
  return { exitWrites, fwWrites, egress };
}
const mount = () => render(<QueryClientProvider client={queryClient}><Network c={C} canWrite /></QueryClientProvider>);
const exitSection = () => screen.getByRole('heading', { name: strings['exit.title'] }).closest('section') as HTMLElement;
const drawer = async () => {
  const change = await changeButton(await waitFor(exitSection));
  await waitFor(() => expect(change).toBeEnabled());
  await userEvent.click(change);
  return screen.findByRole('dialog', { name: strings['exit.form.title'] });
};
const offChoice = (d: HTMLElement) => within(d).getByRole('radio', { name: new RegExp(`^${strings['exit.pick.off']}`) });
/** Internet access's head action while blocked: Allow internet access. */
const allowGo = () => screen.getByRole('button', { name: new RegExp(`^${fw['ni.allowGo']}`) });
const exitNamed = () => within(exitSection()).getByRole('list', { name: strings['exit.title'] });

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept
  localStorage.clear();
});

describe('Use another exit: Block internet access', () => {
  it('is offered with what stays reachable and that the exit chosen is kept', async () => {
    boot(EXIT);
    mount();
    const d = await drawer();
    const off = offChoice(d);
    await waitFor(() => expect(off).toBeEnabled());
    // The choice says it in one sentence; the full account is the answer of the Why under the choices.
    expect(d).toHaveTextContent(strings['exit.pick.off.desc']);
    expect(strings['exit.pick.off.desc']).toMatch(/stays reachable and the exit chosen here is kept/);
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.pick.off.whyQ'] }));
    expect(d).toHaveTextContent(strings['exit.pick.off.why']);
    // The choice and its button carry the name of Internet access's own control.
    expect(strings['exit.pick.off']).toBe(fw['ni.blockGo']);
    expect(strings['exit.off.go']).toBe(fw['ni.blockGo']);
    expect(strings['exit.pick.off.why']).toMatch(/^Blocks new outgoing TCP and UDP connections and IPv4 ping; DNS and DHCP with its host stay open\. These rules do not block incoming connections or their replies/);
    expect(strings['exit.pick.off.why']).toMatch(/ports stay reachable; other firewall rules still apply, and a program that needs new outgoing connections can stop working once its open connections end/);
    // That the exit comes back with internet access is the blocked state's own line (and the choice's description says it is kept).
    expect(strings['exit.pick.off.on']).toMatch(/exit chosen here is kept and applies again when internet access is turned back on/);
  }, 20000);

  it("asks Internet access's own Block question, adds its three rules, and sends nothing to the exit", async () => {
    const h = boot(EXIT);
    mount();
    const d = await drawer();
    await waitFor(() => expect(offChoice(d)).toBeEnabled());
    await userEvent.click(offChoice(d));
    expect(d).toHaveTextContent(T('exit.off.body'));
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.off.go'] }));
    const ask = await screen.findByRole('alertdialog', { name: fw['ni.ask.title'].replace('{{name}}', C.name) });
    expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull();
    await userEvent.click(within(ask).getByRole('button', { name: fw['ni.ask.go'] }));
    await waitFor(() => expect(allowGo()).toBeInTheDocument());
    expect(h.egress.map((r) => r.description)).toEqual([NO_INTERNET_MARK, NO_INTERNET_MARK, NO_INTERNET_MARK]);
    expect(h.exitWrites).toHaveLength(0);
    // What the choice's words claim (new outgoing TCP, UDP and IPv4 ping blocked; incoming not blocked), pinned to the
    // requests sent: exactly three outbound drops, whole literal wire bodies (no extra field, no destination: every
    // address), and no inbound rule. Replies to incoming connections pass because the host's firewall accepts
    // established and related traffic before these rules (the host's ACL chain), not from the rules alone.
    expect(h.fwWrites.map((r) => `${r.method} ${r.path.replace(/^.*\/firewall\//, '')}`)).toEqual(['POST egress', 'POST egress', 'POST egress']);
    const MARK = 'No internet (Hub switch)';
    expect(NO_INTERNET_MARK).toBe(MARK);
    expect(h.fwWrites.map((r) => r.body)).toStrictEqual([
      { action: 'drop', protocol: 'tcp', description: MARK, destination_port: '1-65535', state: 'enabled' },
      { action: 'drop', protocol: 'udp', description: MARK, destination_port: '1-65535', state: 'enabled' },
      { action: 'drop', protocol: 'icmp4', description: MARK, state: 'enabled' },
    ]);
    expect(NO_INTERNET_RULES.every((r) => r.direction === 'egress')).toBe(true);
  }, 30000);

  it('round trip: the exit chosen survives blocking and allowing internet access again', async () => {
    const h = boot(EXIT);
    mount();
    await waitFor(() => expect(exitNamed()).toHaveTextContent(EXIT.host));
    const d = await drawer();
    await waitFor(() => expect(offChoice(d)).toBeEnabled());
    await userEvent.click(offChoice(d));
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.off.go'] }));
    const ask = await screen.findByRole('alertdialog', { name: fw['ni.ask.title'].replace('{{name}}', C.name) });
    await userEvent.click(within(ask).getByRole('button', { name: fw['ni.ask.go'] }));
    await waitFor(() => expect(allowGo()).toBeInTheDocument());
    // Blocked: the exit is still the one chosen, and the drawer says Block internet access is in force, keeping it.
    expect(exitNamed()).toHaveTextContent(EXIT.host);
    const again = await drawer();
    await waitFor(() => expect(within(again).getByText(`${strings['exit.pick.off']} (${strings['net.exit.now']})`)).toBeInTheDocument());
    expect(offChoice(again)).toBeDisabled();
    expect(again).toHaveTextContent(T('exit.pick.off.on'));
    await userEvent.click(within(again).getByRole('button', { name: /cancel/i }));
    // Allowed again (Internet access's own action, no confirm): the rules go, the same exit applies.
    await waitFor(() => expect(allowGo()).not.toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(allowGo());
    await waitFor(() => expect(h.egress).toHaveLength(0));
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(`^${fw['ni.blockGo']}`) })).toBeInTheDocument());
    expect(exitNamed()).toHaveTextContent(EXIT.host);
    expect(h.exitWrites).toHaveLength(0);
    expect(h.fwWrites.map((r) => r.method)).toEqual(['POST', 'POST', 'POST', 'DELETE', 'DELETE', 'DELETE']);
  }, 40000);

  it('not offered as a choice to pick while Internet access cannot change (the rules are still being read, or partly set)', async () => {
    const h = boot(null);
    h.egress.push({ action: 'drop', protocol: 'tcp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' });
    mount();
    const d = await drawer();
    await within(screen.getByRole('heading', { name: fw['ni.title'] }).closest('section') as HTMLElement).findByText(fw['ni.reason.partial']);
    expect(offChoice(d)).toBeDisabled();
  }, 20000);
});
