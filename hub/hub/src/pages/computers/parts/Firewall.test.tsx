// Network > Firewall on real core (fixture transport): the read. The rules as one table by direction, blocks
// before allows, the empty state from the API's own rule (unmatched traffic is allowed), and the
// loading, refused (403), busy (503) and failed states.
import { answers, bootFixtureCore, queryClient, reply, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { firewallRoutes } from '../firewall.data';
import type { Computer } from '../types';
import { Firewall, readProblem, shownOrder } from './Firewall';
import fwStrings from './Firewall.strings.en.json';
import type { FwRule } from './Firewall.logic';

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
  const table = await screen.findByRole('table', { name: fwStrings['fw.title'] });
  return waitFor(() => {
    const row = within(table).getAllByRole('row').find((r) => squash(r.textContent ?? '').includes(squash(sentence)));
    if (!row) throw new Error(`no rule row: ${sentence}`);
    return row;
  });
}

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
type Wire = Record<string, unknown>;
function boot(o: { ingress?: Wire[]; egress?: Wire[]; refuse?: [number, string]; garbled?: boolean; slow?: boolean } = {}) {
  const rules: FixtureRule[] = [
    reply(firewallRoutes.rules, () =>
      o.refuse ? answers.refused(o.refuse[0], o.refuse[1])
        : o.garbled ? answers.ok({ statusCode: 200, data: { ingress: [] } })
        : o.slow ? answers.slow({ statusCode: 200, data: { ingress: [], egress: [] } }, 60_000)
        : answers.ok({ statusCode: 200, message: 'ok', data: { ingress: o.ingress ?? [], egress: o.egress ?? [], rule_count: (o.ingress?.length ?? 0) + (o.egress?.length ?? 0), max_rules: 500, byte_count: 10, max_bytes: 262144 } }),
    ),
  ];
  bootFixtureCore({ rules });
}
const mount = () => render(<QueryClientProvider client={queryClient}><Firewall c={C} canWrite /></QueryClientProvider>);

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('Network > Firewall: reading the rules', () => {
  it('lists inbound and outbound rules in words, blocks first, with descriptions and an Off tag', async () => {
    boot({
      ingress: [
        { action: 'allow', protocol: 'tcp', description: 'Web', destination_port: '443', source: '0.0.0.0/0', state: 'enabled' },
        { action: 'drop', protocol: 'tcp', description: 'No SSH', destination_port: '22', source: '0.0.0.0/0', state: 'disabled' },
      ],
      egress: [{ action: 'drop', protocol: 'tcp', description: 'Mail', destination_port: '25', destination: '0.0.0.0/0', state: 'enabled' }],
    });
    mount();
    // One table grouped Inbound then Outbound; in each, blocks before allows (as the host applies them).
    const table = await screen.findByRole('table', { name: fwStrings['fw.title'] });
    const all = within(table).getAllByRole('row').map((r) => squash(r.textContent ?? ''));
    const at = (x: string) => all.findIndex((r) => r.includes(squash(x)));
    expect(at('Inbound')).toBeGreaterThanOrEqual(0);
    expect(at('Inbound')).toBeLessThan(at('Block TCP port 22 from anywhere'));
    expect(at('Block TCP port 22 from anywhere')).toBeLessThan(at('Allow TCP port 443 from anywhere'));
    expect(at('Allow TCP port 443 from anywhere')).toBeLessThan(at('Outbound'));
    expect(at('Outbound')).toBeLessThan(at('Block TCP port 25 to anywhere'));
    const ssh = await ruleRow('Block TCP port 22 from anywhere');
    expect(ssh).toHaveTextContent('No SSH');
    expect(ssh).toHaveTextContent('Off');
    expect(await ruleRow('Allow TCP port 443 from anywhere')).not.toHaveTextContent('Off');
    expect(screen.getByText(/Anything not blocked is allowed/)).toBeInTheDocument();
  });
  it('no rules: says this firewall is not blocking traffic (the API rule), and one empty direction says so for that direction', async () => {
    boot();
    mount();
    expect(await screen.findByText('No firewall rules')).toBeInTheDocument();
    expect(screen.getByText('This firewall has no rules and is not blocking traffic into or out of atlas.')).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    boot({ egress: [{ action: 'drop', protocol: 'udp', description: 'dns', destination_port: '53', state: 'enabled' }] });
    mount();
    expect(await screen.findByText('No inbound rules: this firewall is not blocking traffic into atlas.')).toBeInTheDocument();
  });
  it('a direction holding an unreadable rule never says all traffic is allowed', async () => {
    boot({ ingress: [{ action: 'boom', protocol: 'tcp', description: 'x' }] });
    mount();
    // With no rule as a row, each direction's line names its direction.
    expect(await screen.findByText('Inbound: 1 rule here could not be shown, so this list may not be complete.')).toBeInTheDocument();
    expect(screen.queryByText(/No inbound rules/)).toBeNull();
    expect(screen.queryByText('No firewall rules')).toBeNull();
    expect(screen.getByText('Outbound: No outbound rules: this firewall allows all outbound traffic.')).toBeInTheDocument();
  });
  it('a 403: says this sign-in cannot see the firewall, no retry loop', async () => {
    boot({ refuse: [403, 'INSUFFICIENT_PERMISSIONS'] });
    mount();
    expect(await screen.findByText(/cannot see atlas's firewall/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('a 503: busy, try again in a few seconds, with Try again', async () => {
    boot({ refuse: [503, 'FIREWALL_HOST_UNAVAILABLE'] });
    mount();
    // The kit's failed state (as Backups): Try again, no rules shown, never "no rules".
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('No firewall rules')).toBeNull();
  });
  it('an answer without both lists is a failed read, never "no rules"', async () => {
    boot({ garbled: true });
    mount();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('No firewall rules')).toBeNull();
  });
  it('beside the title, says the firewall is applied outside the computer, that authorized keys (the agent\'s too) manage it, and that a firewall inside still adds defense', async () => {
    boot();
    mount();
    const head = await screen.findByRole('heading', { name: fwStrings['fw.title'] });
    const sec = head.closest('section') as HTMLElement;
    await userEvent.click(within(sec).getByRole('button', { name: `About ${fwStrings['fw.title']}` }));
    const line = await screen.findByText(/^Hoody applies this firewall outside the computer/);
    expect(line.textContent).toContain("programs and root inside can't change it");
    expect(line.textContent).toContain("authorized keys can, the agent's too");
    expect(line.textContent).toContain('A firewall inside still adds defense');
    expect(line.textContent).not.toMatch(/all traffic/i);
  });

  it('the empty and reset words speak for this firewall only, never "all traffic"', () => {
    for (const k of ['fw.empty.body', 'fw.inbound.none', 'fw.reset.c2', 'fw.reset.done'] as const) {
      expect(fwStrings[k], k).toMatch(/This firewall|this firewall/);
      expect(fwStrings[k], k).not.toMatch(/all traffic/i);
    }
  });

  it('while reading: a skeleton, no claim either way', () => {
    boot({ slow: true });
    mount();
    expect(screen.queryByText('No firewall rules')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Network > Firewall: helpers', () => {
  it('readProblem', () => {
    expect(readProblem({ status: 403 })).toBe('denied');
    expect(readProblem({ status: 503 })).toBe('busy');
    expect(readProblem({ status: 429 })).toBe('busy');
    expect(readProblem({ status: 500 })).toBe('other');
    expect(readProblem(undefined)).toBe('other');
  });
  it('shownOrder keeps blocks and refusals before allows', () => {
    const r = (action: FwRule['action'], d: string): FwRule => ({ direction: 'ingress', action, protocol: 'tcp', description: d, destination_port: '1', state: 'enabled' });
    expect(shownOrder([r('allow', 'a'), r('reject', 'b'), r('drop', 'c')]).map((x) => x.description)).toEqual(['b', 'c', 'a']);
  });
});
