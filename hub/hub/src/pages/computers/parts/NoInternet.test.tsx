// "No internet" on real core (fixture transport): Internet access is three marked
// outbound Block rules created and removed as one group, its state read from the rules (all = on, none = off, else
// partial with Finish / Remove), each rule sent once (C9: a lost answer is held, nothing resent), a fresh read before
// any send, and the rules table shows the group as one note, never as three loose rows.
import { answers, bootFixtureCore, queryClient, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { isOff } from '@app/testing';
import { firewallRoutes, useAddRule } from '../firewall.data';
import type { Computer } from '../types';
import { Firewall } from './Firewall';
import strings from './Firewall.strings.en.json';
import { NO_INTERNET_MARK } from './NoInternet.logic';

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
type Dir = 'ingress' | 'egress';
const FIELDS = ['action', 'state', 'description', 'source', 'destination', 'protocol', 'source_port', 'destination_port', 'icmp_type', 'icmp_code'];
const TCP: Wire = { action: 'drop', protocol: 'tcp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' };
const UDP: Wire = { action: 'drop', protocol: 'udp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' };
const PING: Wire = { action: 'drop', protocol: 'icmp4', description: NO_INTERNET_MARK, state: 'enabled' };
const MAIL: Wire = { action: 'drop', protocol: 'tcp', description: 'No outbound mail', destination_port: '25', state: 'enabled' };

interface Host { ingress: Wire[]; egress: Wire[]; sent: FixtureRequest[]; failReads: boolean }
function boot(o: { egress?: Wire[]; addAnswer?: (n: number) => FixtureAnswer | null; onRead?: (h: Host, n: number) => void; readDelay?: (n: number) => number } = {}): Host {
  const h: Host = { ingress: [], egress: [...(o.egress ?? [])], sent: [], failReads: false };
  let adds = 0;
  let reads = 0;
  const matches = (r: Wire, crit: Wire) => FIELDS.every((k) => crit[k] === undefined || r[k] === crit[k]);
  const add = (dir: Dir) => (r: FixtureRequest) => {
    h.sent.push(r);
    adds++;
    const forced = o.addAnswer?.(adds);
    if (forced) return forced;
    const body = { state: 'enabled', ...(r.body as Wire) };
    if (!h[dir].some((x) => JSON.stringify(Object.entries(x).sort()) === JSON.stringify(Object.entries(body).sort()))) h[dir].push(body);
    return answers.ok({ statusCode: 201, data: { ingress: h.ingress, egress: h.egress } });
  };
  const remove = (dir: Dir) => (r: FixtureRequest) => {
    h.sent.push(r);
    const i = h[dir].findIndex((x) => matches(x, r.body as Wire));
    if (i < 0) return answers.refused(404, 'RULE_NOT_FOUND');
    h[dir].splice(i, 1);
    return answers.ok({ statusCode: 200, data: { direction: dir, removed_count: 1 } });
  };
  const rules: FixtureRule[] = [
    reply(firewallRoutes.rules, () => {
      o.onRead?.(h, ++reads);
      const delayMs = o.readDelay?.(reads) ?? 0;
      return h.failReads ? answers.refused(503, 'FIREWALL_HOST_UNAVAILABLE') : { ...answers.ok({ statusCode: 200, data: { ingress: h.ingress, egress: h.egress, rule_count: h.ingress.length + h.egress.length, max_rules: 500 } }), ...(delayMs ? { delayMs } : {}) };
    }),
    reply(firewallRoutes.addIn, add('ingress')),
    reply(firewallRoutes.addOut, add('egress')),
    reply(firewallRoutes.removeIn, remove('ingress')),
    reply(firewallRoutes.removeOut, remove('egress')),
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
const mount = () => render(<QueryClientProvider client={queryClient}><Firewall c={C} canWrite /><AddProbe /></QueryClientProvider>);
const writes = (h: Host) => h.sent.map((r) => `${r.method} ${r.path.replace(/^.*\/firewall\//, '')} ${(r.body as Wire).protocol}`);
// Internet access is one head action: Block internet access when allowed (it asks first), Allow internet access when
// blocked (no confirm). The action is off, with its reason, while the state is partial, unknown or a change is waiting.
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const opening = (x: string) => new RegExp(`^${esc(x)}…?$`);
const headNow = (): HTMLElement => {
  const b = screen.queryByRole('button', { name: opening(strings['ni.blockGo']) }) ?? screen.queryByRole('button', { name: opening(strings['ni.allowGo']) });
  if (!b) throw new Error('no Internet access action');
  return b;
};
/** Blocked: the action offers to allow again. */
const isBlocked = () => waitFor(() => expect(headNow()).toHaveAccessibleName(opening(strings['ni.allowGo'])));
/** Not blocked (allowed or partly), read: the action offers to block. */
const isAllowed = () => waitFor(() => {
  const x = headNow();
  expect(x).toHaveAccessibleName(opening(strings['ni.blockGo']));
  expect(x).not.toHaveAccessibleDescription(strings['ni.reason.reading']);
});
const isHeld = () => waitFor(() => expect(isOff(headNow())).toBe(true));
const isFree = () => waitFor(() => expect(isOff(headNow())).toBe(false));
const flip = async () => {
  await isFree();
  await userEvent.click(headNow());
};
const confirm = async () => {
  const d = await screen.findByRole('alertdialog', { name: strings['ni.ask.title'].replace('{{name}}', 'atlas') });
  await userEvent.click(within(d).getByRole('button', { name: strings['ni.ask.go'] }));
};

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept (core's held changes)
  localStorage.clear();
});

describe('Internet access: one choice, three marked outbound blocks', () => {
  it('allowed: the action blocks, and the words say exactly what blocking stops (and what it leaves open)', async () => {
    boot({ egress: [MAIL] });
    mount();
    expect(await screen.findByText(strings['ni.now.off'].replaceAll('{{name}}', 'atlas'))).toBeInTheDocument();
    await isAllowed();
    // What blocking stops sits behind the section's info tip.
    expect(screen.getByRole('button', { name: `About ${strings['ni.title']}` })).toBeInTheDocument();
    // What it blocks, and what the host lets through anyway (open connections, inbound, DNS/DHCP with the host).
    for (const words of [/new outbound/, /TCP and UDP on every port/, /IPv4 and IPv6/, /IPv4 ping/, /connections already open/, /inbound traffic/, /DNS/, /DHCP/]) expect(strings['ni.what']).toMatch(words);
    expect(strings['ni.now.on']).toMatch(/reachable through their URLs/);
  });

  it('turning on asks first, naming what stops, then adds the three rules once each', async () => {
    const h = boot({ egress: [MAIL] });
    mount();
    await flip();
    const d = await screen.findByRole('alertdialog');
    for (const word of ['AI agent', 'package installs', 'updates', 'exit proxy', 'URLs']) expect(d).toHaveTextContent(word);
    expect(h.sent).toHaveLength(0);
    await confirm();
    await waitFor(() => expect(writes(h)).toEqual(['POST egress tcp', 'POST egress udp', 'POST egress icmp4']));
    expect(h.sent.map((r) => r.body)).toEqual([TCP, UDP, PING].map((r) => r));
    await isBlocked();
  });

  it('cancel sends nothing', async () => {
    const h = boot();
    mount();
    await flip();
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    expect(h.sent).toHaveLength(0);
    await isAllowed();
  });

  it('on: the table shows the group as one note, never the three rules with their own actions', async () => {
    boot({ egress: [MAIL, TCP, UDP, PING] });
    mount();
    await isBlocked();
    const table = await screen.findByRole('table', { name: strings['fw.title'] });
    // The mail rule is the one row; the group is the Outbound note.
    await waitFor(() => expect(within(table).getAllByText('No outbound mail')).toHaveLength(1));
    expect((table.closest('section') ?? table).textContent).toContain(`${strings['ni.group'].replace('{{count}}', '3')} (${strings['ni.setBy']})`);
    expect(screen.queryAllByText(NO_INTERNET_MARK)).toHaveLength(0);
  });

  it('turning off removes the three marked rules (and no other rule)', async () => {
    const h = boot({ egress: [MAIL, TCP, UDP, PING] });
    mount();
    await flip();
    await waitFor(() => expect(writes(h)).toEqual(['DELETE egress tcp', 'DELETE egress udp', 'DELETE egress icmp4']));
    await isAllowed();
    expect(h.egress).toEqual([MAIL]);
    // Off never promises the internet: the mail block (and any other rule) still applies.
    expect(await screen.findByText(strings['ni.done.off'])).toBeInTheDocument();
    expect(strings['ni.done.off']).toMatch(/Other firewall rules still apply/);
  });

  it('partial: says so; Finish adds only the missing rules, after asking', async () => {
    const h = boot({ egress: [TCP] });
    mount();
    expect(await screen.findByText(strings['ni.partial'].replace('{{name}}', 'atlas').replace('{{have}}', '1').replace('{{total}}', '3'))).toBeInTheDocument();
    await isHeld();
    await userEvent.click(screen.getByRole('button', { name: strings['ni.finish'] }));
    await confirm();
    await waitFor(() => expect(writes(h)).toEqual(['POST egress udp', 'POST egress icmp4']));
  });

  it('partial: Remove takes the marked rules away', async () => {
    const h = boot({ egress: [MAIL, UDP] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.remove'] }));
    await waitFor(() => expect(writes(h)).toEqual(['DELETE egress udp']));
    expect(h.egress).toEqual([MAIL]);
  });

  it('a marked rule turned off by hand is not "on": Finish removes it, then adds the rule again', async () => {
    const h = boot({ egress: [TCP, UDP, { ...PING, state: 'disabled' }] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.finish'] }));
    await confirm();
    await waitFor(() => expect(writes(h)).toEqual(['DELETE egress icmp4', 'POST egress icmp4']));
    await isBlocked();
  });

  it('C9: a lost answer stops the group there; nothing after it is sent and nothing is resent', async () => {
    const h = boot({ addAnswer: (n) => (n === 2 ? answers.pending5xx() : null) });
    mount();
    await flip();
    await confirm();
    await waitFor(() => expect(screen.getByText(new RegExp(strings['ni.stoppedUnknown'].slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument());
    expect(writes(h)).toEqual(['POST egress tcp', 'POST egress udp']);
    await isHeld();
    expect(writes(h)).toHaveLength(2);
  });

  it('a refusal stops the group and says so with the refusal', async () => {
    const h = boot({ addAnswer: (n) => (n === 1 ? answers.refused(400, 'INVALID_RULE_DEFINITION') : null) });
    mount();
    await flip();
    await confirm();
    await waitFor(() => expect(writes(h)).toEqual(['POST egress tcp']));
    await isAllowed();
  });

  it('reads the rules again right before sending: rules added elsewhere meanwhile are not added twice', async () => {
    const h = boot({ onRead: (x, n) => { if (n === 2) x.egress.push(TCP, UDP); } });
    mount();
    await flip();
    await confirm();
    await waitFor(() => expect(writes(h)).toEqual(['POST egress icmp4']));
  });

  it('reads again before EVERY rule: a rule another writer added after the first send is not sent again', async () => {
    let pushed = false;
    const h = boot({ onRead: (x) => { if (!pushed && x.egress.some((r) => r.protocol === 'tcp')) { pushed = true; x.egress.push({ ...UDP }); } } });
    mount();
    await flip();
    await confirm();
    await waitFor(() => expect(screen.getByText(strings['ni.done.on'].replace('{{name}}', 'atlas'))).toBeInTheDocument());
    expect(writes(h)).toEqual(['POST egress tcp', 'POST egress icmp4']);
  });

  it('another firewall change starting during the read before the first rule: nothing is sent, it says to wait', async () => {
    let other: Promise<unknown> | undefined;
    const h = boot({
      addAnswer: (n) => (n === 1 ? answers.slow({ statusCode: 201, data: {} }, 3000) : null),
      // The read before the first rule is slow; the other change starts while it is on its way.
      readDelay: (n) => (n === 2 ? 800 : 0),
      onRead: (_x, n) => { if (n === 2) other = probeAdd?.mutateAsync({ computer: C.id, rule: { direction: 'ingress', action: 'drop', protocol: 'tcp', description: 'other', destination_port: '9000', state: 'enabled' } }); },
    });
    mount();
    await flip();
    await confirm();
    expect(await screen.findByText(strings['fw.wait'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    expect(writes(h)).toEqual(['POST ingress tcp']);
    // Let the other change land before the next test (core's in-flight sends outlive a test).
    await act(async () => { await other?.catch(() => undefined); });
  });

  it('marked strays that overlap: removed one by one, each the rule the host picks first, then on', async () => {
    const s1 = { ...TCP, destination_port: '80' };
    const s2 = { ...TCP, destination_port: '80', destination: '203.0.113.5' };
    const h = boot({ egress: [TCP, UDP, PING, s1, s2] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.finish'] }));
    await confirm();
    await waitFor(() => expect(screen.getByText(strings['ni.done.on'].replace('{{name}}', 'atlas'))).toBeInTheDocument());
    expect(h.sent.map((r) => r.body)).toEqual([s1, s2]);
    expect(h.egress).toEqual([TCP, UDP, PING]);
  });

  it('all three rules plus an identical copy read partly set, never on', async () => {
    boot({ egress: [TCP, UDP, PING, { ...TCP }] });
    mount();
    expect(await screen.findByText(strings['ni.partial'].replace('{{name}}', 'atlas').replace('{{have}}', '3').replace('{{total}}', '3'))).toBeInTheDocument();
    await isAllowed();
  });

  it('Finish with a marked stray the host would match against one of the three first: that one goes, the stray goes, it comes back; mail kept', async () => {
    const wide: Wire = { action: 'drop', protocol: 'tcp', description: NO_INTERNET_MARK, state: 'enabled' };
    const h = boot({ egress: [MAIL, TCP, UDP, PING, wide] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.finish'] }));
    await confirm();
    await waitFor(() => expect(screen.getByText(strings['ni.done.on'].replace('{{name}}', 'atlas'))).toBeInTheDocument());
    expect(h.sent.map((r) => r.method)).toEqual(['DELETE', 'DELETE', 'POST']);
    expect(h.sent.slice(0, 2).map((r) => r.body)).toEqual([TCP, wide]);
    expect(h.egress.map((r) => r.protocol + (r.destination_port ?? ''))).toEqual(['tcp25', 'udp1-65535', 'icmp4', 'tcp1-65535']);
    expect(screen.queryByText(strings['ni.blockedErr'])).toBeNull();
  });

  const strays = (n: number): Wire[] => Array.from({ length: n }, (_, i) => ({ ...TCP, destination_port: String(i + 1) }));
  it('twelve changes that finish the work end as done, never as "kept changing"', async () => {
    const h = boot({ egress: [MAIL, ...strays(12)] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.remove'] }));
    expect(await screen.findByText(strings['ni.done.off'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(h.sent).toHaveLength(12);
    expect(h.egress).toEqual([MAIL]);
  }, 20000);

  it('thirteen to do: stops after twelve and says the limit was reached, with a way on (never "kept changing")', async () => {
    const h = boot({ egress: [MAIL, ...strays(13)] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.remove'] }));
    expect(await screen.findByText(strings['ni.limit'].replace('{{count}}', '12'), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(h.sent).toHaveLength(12);
    expect(h.egress).toHaveLength(2);
    // The way on names the two buttons the band shows, by their labels.
    expect(strings['ni.limit']).toContain(`Press ${strings['ni.finish']} or ${strings['ni.remove']} `);
    expect(screen.getByRole('button', { name: strings['ni.finish'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['ni.remove'] })).toBeInTheDocument();
  }, 20000);

  it('Finish stopped at the limit with the group gone: the way on is the head action, not buttons that are no longer there', async () => {
    const h = boot({ egress: [MAIL, ...strays(12)] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.finish'] }));
    await confirm();
    expect(await screen.findByText(strings['ni.limitOff'].replace('{{count}}', '12'), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(h.sent).toHaveLength(12);
    expect(h.egress).toEqual([MAIL]);
    expect(screen.queryByRole('button', { name: strings['ni.finish'] })).toBeNull();
    // The way on names the head action by its label, and that button is there.
    expect(strings['ni.limitOff']).toContain(`Press ${strings['ni.blockGo']} again`);
    expect(screen.getByRole('button', { name: new RegExp(`^${strings['ni.blockGo']}`) })).toBeInTheDocument();
  }, 20000);

  it('a marked rule that cannot be named on its own (another rule matches it first): nothing is sent, and it says so', async () => {
    const h = boot({ egress: [UDP, { ...UDP }] });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: strings['ni.remove'] }));
    expect(await screen.findByText(strings['ni.blockedErr'])).toBeInTheDocument();
    expect(h.sent).toHaveLength(0);
  });

  it('a failed read: not sure, the action waits, Check again re-reads', async () => {
    const h = boot();
    h.failReads = true;
    mount();
    expect(await screen.findByText(strings['ni.unknown'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    await isHeld();
    h.failReads = false;
    await userEvent.click(screen.getByRole('button', { name: strings['ni.check'] }));
    await isFree();
    expect(h.sent).toHaveLength(0);
  });
});

describe("Internet access: this page's own Block / Allow run says what it is doing", () => {
  const named = (key: keyof typeof strings) => strings[key].replaceAll('{{name}}', 'atlas');
  /** Every text the page showed from now on. */
  const record = () => {
    const seen: string[] = [];
    const watch = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => { watch.disconnect(); return seen.join('\n'); };
  };
  it('Block: mid-run it says "Blocking…", never "partly blocked" and never "another firewall change"', async () => {
    // The reads between the rules are slow: the page is mid-run, one or two of the three rules in place, for a while.
    const h = boot({ egress: [MAIL], readDelay: (n) => (n >= 3 ? 300 : 0) });
    mount();
    await flip();
    const stop = record();
    await confirm();
    await waitFor(() => expect(screen.getByText(named('ni.done.on'))).toBeInTheDocument(), { timeout: 6000 });
    const shown = stop();
    expect(writes(h)).toEqual(['POST egress tcp', 'POST egress udp', 'POST egress icmp4']);
    expect(shown).toContain(named('ni.working.on'));
    expect(shown).not.toMatch(/partly blocked/);
    expect(shown).not.toContain(named('ni.reason.wait'));
    expect(shown).not.toMatch(/nothing was sent/);
    expect(screen.queryByText(named('ni.working.on'))).toBeNull();
  });
  it('Allow: mid-run it says "Allowing…", never "partly blocked"', async () => {
    const h = boot({ egress: [MAIL, TCP, UDP, PING], readDelay: (n) => (n >= 3 ? 300 : 0) });
    mount();
    await isBlocked();
    const stop = record();
    await flip();
    await waitFor(() => expect(h.egress).toEqual([MAIL]), { timeout: 6000 });
    await isAllowed();
    const shown = stop();
    expect(shown).toContain(named('ni.working.off'));
    expect(shown).not.toMatch(/partly blocked/);
    expect(shown).not.toContain(named('ni.reason.wait'));
  });
});
