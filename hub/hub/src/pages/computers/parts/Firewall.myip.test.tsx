// Network > Firewall, "Add my IP": the rule form's address field and the "Block an address" preset
// are the kit IpAllowlistField, reading GET /ip through the page's myIp query only when pressed. The button only fills
// the field: the rule is sent by the form's own button, once.
import { answers, bootFixtureCore, myIpRoute, queryClient, reply, type FixtureAnswer, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import ipStrings from '@kit/forms/IpAllowlistField.strings.en.json';
import type * as Kit from '@kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firewallRoutes } from '../firewall.data';
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

// The kit field, wrapped: when `onRead` is set, it runs right after the field hands a landed read to the page, before
// React renders that update (a press arriving in that window).
const hook = vi.hoisted(() => ({ onRead: null as null | (() => void) }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  const Field = (p: Kit.IpAllowlistFieldProps) => kit.IpAllowlistField({ ...p, onChange: (up) => { p.onChange(up); if (up('') !== '') hook.onRead?.(); } });
  return { ...kit, IpAllowlistField: Field };
});

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const MY_IP = { data: { ip: '203.0.113.7', ip_info: { city: 'Singapore', country: 'SG' } } };

function boot(myIp: () => FixtureAnswer | Promise<FixtureAnswer> = () => answers.ok({ statusCode: 200, ...MY_IP })) {
  const sent: FixtureRequest[] = [];
  const ingress: Record<string, string>[] = [];
  let ipReads = 0;
  bootFixtureCore({
    rules: [
      reply(firewallRoutes.rules, () => answers.ok({ statusCode: 200, data: { ingress, egress: [], rule_count: ingress.length, max_rules: 500 } })),
      reply(firewallRoutes.addIn, (r) => {
        sent.push(r);
        ingress.push({ state: 'enabled', ...(r.body as Record<string, string>) });
        return answers.ok({ statusCode: 201, data: {} });
      }),
      reply(myIpRoute, () => {
        ipReads++;
        return myIp();
      }),
    ],
  });
  return { sent, reads: () => ipReads };
}
const mount = () => render(<QueryClientProvider client={queryClient}><Firewall c={C} canWrite /></QueryClientProvider>);

afterEach(() => {
  hook.onRead = null;
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept (core's held changes)
  localStorage.clear();
});

async function openAdd() {
  await userEvent.click(await screen.findByRole('button', { name: strings['fw.add'] }));
  return screen.getByRole('dialog', { name: strings['fw.form.addTitle'] });
}
const addresses = (g: HTMLElement) => within(g).getByLabelText(new RegExp(strings['fw.form.addresses.in'])) as HTMLInputElement;

describe('Network > Firewall: Add my IP', () => {
  it('fills From addresses with the address read on press, and the rule sends it once', async () => {
    const h = boot();
    mount();
    const g = await openAdd();
    expect(h.reads()).toBe(0);
    await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.ports'])), '8080');
    await userEvent.click(within(g).getByRole('button', { name: ipStrings['ipf.add'] }));
    expect(await within(g).findByText(ipStrings['ipf.added'])).toBeInTheDocument();
    expect(addresses(g).value).toBe('203.0.113.7');
    expect(h.reads()).toBe(1);
    expect(h.sent).toHaveLength(0);
    await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.description'])), 'me');
    expect(within(g).getByText(/This rule: Block TCP port 8080 from 203\.0\.113\.7/)).toBeInTheDocument();
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect((h.sent[0]?.body as Record<string, string>).source).toBe('203.0.113.7');
  });

  it('a failed read says so and fills nothing', async () => {
    boot(() => answers.refused(503, 'UNAVAILABLE'));
    mount();
    const g = await openAdd();
    await userEvent.click(within(g).getByRole('button', { name: ipStrings['ipf.add'] }));
    expect(await within(g).findByText(ipStrings['ipf.failed'])).toBeInTheDocument();
    expect(addresses(g).value).toBe('');
  });

  it('a failed read over an earlier answer says so and fills nothing', async () => {
    let n = 0;
    boot(() => (++n === 1 ? answers.ok({ statusCode: 200, ...MY_IP }) : answers.refused(503, 'UNAVAILABLE')));
    mount();
    const g = await openAdd();
    await userEvent.click(within(g).getByRole('button', { name: ipStrings['ipf.add'] }));
    await within(g).findByText(ipStrings['ipf.added']);
    await userEvent.clear(addresses(g));
    await userEvent.click(within(g).getByRole('button', { name: ipStrings['ipf.add'] }));
    expect(await within(g).findByText(ipStrings['ipf.failed'])).toBeInTheDocument();
    expect(addresses(g).value).toBe('');
  });

  // Add rule on a block of the Hub's own ports opens the typed confirmation, which sends the form as it was then: a
  // read that lands while it is open, or after it was cancelled, fills nothing, so what is sent is what was shown.
  for (const close of ['confirm', 'cancel'] as const) {
    it(`a read that lands across the typed confirmation fills nothing (${close})`, async () => {
      let release: () => void = () => {};
      const h = boot(() => new Promise<FixtureAnswer>((r) => { release = () => r(answers.ok({ statusCode: 200, ...MY_IP })); }));
      mount();
      const g = await openAdd();
      await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.ports'])), '44');
      await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.description'])), 'me');
      await userEvent.click(within(g).getByRole('button', { name: ipStrings['ipf.add'] }));
      await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
      const d = await screen.findByRole('alertdialog');
      if (close === 'cancel') {
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      }
      release();
      await waitFor(() => expect(h.reads()).toBe(1));
      await new Promise((r) => setTimeout(r, 50));
      expect(within(g).queryByText(ipStrings['ipf.added'])).toBeNull();
      expect(addresses(g).value).toBe('');
      if (close === 'confirm') {
        await userEvent.type(within(d).getByRole('textbox'), C.name);
        await userEvent.click(within(d).getByRole('button', { name: strings['fw.cut.go'] }));
        await waitFor(() => expect(h.sent).toHaveLength(1));
        expect((h.sent[0]?.body as Record<string, string>).source).toBeUndefined();
      }
    });
  }

  // The read's update is queued but not yet rendered when Add rule is pressed: the confirmation was made from the form
  // as shown before it, so once the address shows it is withdrawn, and the rule is sent only as shown.
  it('a read whose update lands just after Add rule withdraws the typed confirmation', async () => {
    let release: () => void = () => {};
    const h = boot(() => new Promise<FixtureAnswer>((r) => { release = () => r(answers.ok({ statusCode: 200, ...MY_IP })); }));
    mount();
    const g = await openAdd();
    await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.ports'])), '44');
    await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.description'])), 'me');
    await userEvent.click(within(g).getByRole('button', { name: ipStrings['ipf.add'] }));
    const go = within(g).getByRole('button', { name: strings['fw.form.go'] });
    // Add rule is pressed in the same turn the read lands, before React renders the filled address.
    hook.onRead = () => { hook.onRead = null; fireEvent.click(go); };
    await act(async () => { release(); });
    expect(h.reads()).toBe(1);
    await waitFor(() => expect(addresses(g).value).toBe('203.0.113.7'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(h.sent).toHaveLength(0);
    // Pressed again, the confirmation holds the address shown, and the rule sends it.
    await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
    const d = await screen.findByRole('alertdialog');
    await userEvent.type(within(d).getByRole('textbox'), C.name);
    await userEvent.click(within(d).getByRole('button', { name: strings['fw.cut.go'] }));
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect((h.sent[0]?.body as Record<string, string>).source).toBe('203.0.113.7');
  });

  it('the Block an address preset takes my address into its list', async () => {
    boot();
    mount();
    // Presets are a group in the Firewall section's ⋯ (More actions), offered once the rules are read.
    await screen.findByRole('button', { name: new RegExp(`^${strings['fw.add']}`) });
    const sec = (await screen.findByRole('heading', { name: strings['fw.title'] })).closest('section') as HTMLElement;
    await userEvent.click(within(sec).getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: `${strings['fw.preset.addresses']}…` }));
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: ipStrings['ipf.add'] }));
    expect(await within(d).findByText(ipStrings['ipf.added'])).toBeInTheDocument();
    expect(addresses(d).value).toBe('203.0.113.7');
    // The preset's rules (every TCP and UDP port) now name the address.
    expect(within(d).getAllByText(/from 203\.0\.113\.7/).length).toBeGreaterThan(0);
  });
});
