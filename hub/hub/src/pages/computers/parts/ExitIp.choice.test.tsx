// Network > exit: the route ends at the internet, the current exit is one clickable target that
// opens the choice, and "Use another exit" offers what the egress program supports: the computer's own address,
// another computer of yours on another server (its proxy as an https upstream), or your own proxy. The other
// computer's proxy address works like a password: it is sent once and never shown, kept or put in a lock identity.
import { answers, bootFixtureCore, heldChanges, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { egressRoutes } from '../data';
import { routes } from '../routes';
import type { Computer } from '../types';
import { proxyUrl } from './ConnectProxy';
import { EXIT_LOCK, ExitIp, setProved, viaOf } from './ExitIp';
import strings from './ExitIp.strings.en.json';
import page from '../strings.en.json';

/** Use another exit… as a live button: until the exit is read the section head draws it disabled, with its reason. */
async function changeButton(root: HTMLElement = document.body): Promise<HTMLElement> {
  const name = strings['exit.change'];
  await waitFor(() => expect(within(root).getByRole('button', { name })).not.toHaveAttribute('aria-disabled'));
  return within(root).getByRole('button', { name });
}

const P = 'a'.repeat(24);
const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const OTHER = { id: 'd'.repeat(24), name: 'beacon', status: 'running', project_id: 'b'.repeat(24), server_id: 't'.repeat(24), server_name: 'n13', server: { name: 'n13', city: 'Singapore', country: 'SG' } } as Computer;
const SAME = { id: 'e'.repeat(24), name: 'cove', status: 'running', project_id: P, server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const STOPPED = { id: 'f'.repeat(24), name: 'dune', status: 'stopped', project_id: P, server_id: 'u'.repeat(24), server_name: 'n14' } as Computer;
const T = (k: keyof typeof strings, v: Record<string, string> = {}) => Object.entries({ name: C.name, ...v }).reduce((s, [a, b]) => s.replaceAll(`{{${a}}}`, b), strings[k]);
const hostOf = (c: Computer) => new URL(proxyUrl(c)).hostname;
// The documented unindexed form of the same proxy (`…-egress.<server>.<domain>`, the docs' egress kit page).
const bareOf = (c: Computer) => hostOf(c).replace(/-egress-\d+\./, '-egress.');

interface Up { scheme: string; host: string; port: number; auth: boolean }
/** gate: once a change was sent, the upstream read waits for it (a test can look at the hold before a read settles it). */
function boot(seed: Up | null, list: Computer[] = [C, OTHER, SAME, STOPPED], lost = false, applies = true, gate?: Promise<void>) {
  const sent: FixtureRequest[] = [];
  let up = seed;
  const blob = () => (up ? { enabled: true, state: 'active', ...up } : { enabled: false, state: 'direct' });
  const rules: FixtureRule[] = [
    reply(routes.list, () => answers.ok({ data: { computers: list } })),
    reply(egressRoutes.upstream, async () => {
      if (gate && sent.length > 0) await gate;
      return answers.ok({ ...blob(), config_path: '/x' });
    }),
    reply(egressRoutes.set, (r) => {
      sent.push(r);
      const u = new URL(String(r.body));
      if (!applies) return answers.pending5xx();
      // URL drops a default port (https :443): the program reads it as sent.
      up = { scheme: u.protocol.replace(':', ''), host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 0)), auth: !!u.username };
      return lost ? answers.pending5xx() : answers.ok(blob());
    }),
    reply(egressRoutes.clear, (r) => {
      sent.push(r);
      up = null;
      return answers.ok(blob());
    }),
  ];
  bootFixtureCore({ rules });
  return sent;
}
const mount = (canWrite = true) => render(<QueryClientProvider client={queryClient}><ExitIp c={C} canWrite={canWrite} /></QueryClientProvider>);
const flow = async () => screen.findByRole('list', { name: strings['exit.title'] });

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept
  localStorage.clear();
});

describe('the route', () => {
  it('the last stop is the internet (websites and services), never "Website"', async () => {
    boot(null);
    mount();
    const ol = await flow();
    await within(ol).findByText(T('net.exit.own'));
    const last = within(ol).getAllByRole('listitem').at(-1)!;
    expect(last).toHaveTextContent(strings['net.site']);
    expect(last).toHaveTextContent(strings['net.site.sub']);
    expect(ol).not.toHaveTextContent(/\bWebsite\b/);
    expect(within(ol).getByText(T('net.proxy'))).toBeInTheDocument();
  });
});

describe('the current exit opens the choice', () => {
  it('the exit in the diagram is words, not a button; the head action opens the choice, by click or Enter', async () => {
    boot(null);
    mount();
    const ol = await flow();
    await within(ol).findByText(T('net.exit.own'));
    expect(within(ol).queryByRole('button')).toBeNull();
    const change = await changeButton();
    await userEvent.click(change);
    expect(await screen.findByRole('dialog', { name: strings['exit.form.title'] })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    (await changeButton()).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: strings['exit.form.title'] })).toBeInTheDocument();
  });

  it('without access to change it, the exit is plain text, not a button', async () => {
    boot(null);
    mount(false);
    const ol = await flow();
    await within(ol).findByText(T('net.exit.own'));
    expect(within(ol).queryByRole('button')).toBeNull();
  });
});

describe('Use another exit', () => {
  it('says what each choice gives and why, and offers only running computers on another server', async () => {
    boot(SOCKS);
    mount();
    await userEvent.click(await changeButton());
    const d = await screen.findByRole('dialog', { name: strings['exit.form.title'] });
    expect(within(d).getByText(T('exit.form.why'))).toBeInTheDocument();
    for (const k of ['exit.pick.own', 'exit.pick.computer', 'exit.pick.proxy'] as const) expect(within(d).getByRole('radio', { name: new RegExp(T(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(T('exit.pick.computer')) }));
    const pick = within(d).getByRole('button', { name: new RegExp(strings['exit.computer.label']) });
    await userEvent.click(pick);
    // The kit's computer picker (item 8): a list of computer rows, each with its state.
    const box = await screen.findByRole('dialog', { name: strings['exit.computer.label'] });
    const row = within(box).getByRole('radio', { name: /beacon/ });
    // Its state, its place (city · server, from the computer's server) and its country's flag.
    expect(row).toHaveTextContent(/Running/);
    expect(row).toHaveTextContent('Singapore · n13');
    expect(row).toHaveTextContent('\u{1F1F8}\u{1F1EC}');
    expect(within(box).queryByRole('radio', { name: /cove|dune|atlas/ })).toBeNull();
  });

  it('another computer: one PUT of its proxy as an https upstream; shown by name; its address never shown or kept', async () => {
    const sent = boot(null);
    mount();
    await userEvent.click(await changeButton());
    const d = await screen.findByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(T('exit.pick.computer')) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['exit.computer.label']) }));
    await userEvent.click(await screen.findByRole('radio', { name: /beacon/ }));
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const line = `https://${hostOf(OTHER)}:443`;
    expect(sent.map((r) => String(r.body))).toEqual([line]);
    const ol = await flow();
    expect(await within(ol).findByText(T('net.exit.through', { what: T('net.exit.via', { other: 'beacon' }) }))).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(hostOf(OTHER));
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
    // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps
    const kept = [JSON.stringify(Object.entries(localStorage)), JSON.stringify(heldChanges(EXIT_LOCK, { realm: 'all' })), JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state.variables))].join('\n');
    expect(kept).not.toContain(hostOf(OTHER));
  });

  it('an exit set to another computer reads back by name; one not in the list never shows its address', async () => {
    boot({ scheme: 'https', host: hostOf(OTHER), port: 443, auth: false }, [C]);
    mount();
    const ol = await flow();
    expect(await within(ol).findByText(strings['net.exit.through'].replace('{{what}}', strings['net.exit.viaUnknown']))).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(hostOf(OTHER));
    expect(viaOf(hostOf(OTHER))).toBe(`${OTHER.project_id}-${OTHER.id}`);
    expect(bareOf(OTHER)).not.toBe(hostOf(OTHER));
    expect(viaOf(bareOf(OTHER))).toBe(`${OTHER.project_id}-${OTHER.id}`);
    expect(viaOf('proxy.example.com')).toBeNull();
  });

  it('the unindexed form reads back by name too, never as its address', async () => {
    boot({ scheme: 'https', host: bareOf(OTHER), port: 443, auth: false }, [C]);
    mount();
    const ol = await flow();
    expect(await within(ol).findByText(strings['net.exit.through'].replace('{{what}}', strings['net.exit.viaUnknown']))).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(bareOf(OTHER));
  });

  it('its own address from the choice sends one DELETE', async () => {
    const sent = boot(SOCKS);
    mount();
    await userEvent.click(await changeButton());
    const d = await screen.findByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(T('exit.pick.own')) }));
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.clear.go'] }));
    await waitFor(() => expect(sent.map((r) => r.method)).toEqual(['DELETE']));
  });

  it('the exit section links the VPN guide; the FAQ keeps the safe way (SSH key first, WireGuard with wg-quick, not the app)', async () => {
    boot(null);
    mount();
    await flow();
    expect(screen.getByRole('link', { name: strings['exit.vpn.docs'] })).toHaveAttribute('href', 'https://docs.hoody.com/foundation/networking/vpn/');
    const faq = page['faq.proxyAndExit.a'];
    for (const w of [/all its traffic/, /not just the proxy's/, /exits still work/, /Mullvad/, /SSH key first/, /WireGuard/, /wg-quick/, /not its app/, /web terminal/]) expect(faq).toMatch(w);
  });
});

describe('a lost answer for another computer', () => {
  it('held under that computer\'s name, its address in no hold or storage; a read naming it proves it', async () => {
    // Lost but applied: the read after it proves it and the hold goes. That read waits until the test has looked at
    // the hold, which otherwise may already be gone when the test first looks (a race under load).
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const sent = boot(null, undefined, true, true, gate);
    mount();
    await userEvent.click(await changeButton());
    const d = await screen.findByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(T('exit.pick.computer')) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['exit.computer.label']) }));
    await userEvent.click(await screen.findByRole('radio', { name: /beacon/ }));
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const held = await waitFor(() => {
      const h = heldChanges(EXIT_LOCK, { realm: 'all' });
      expect(h).toHaveLength(1);
      return h;
    });
    // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps
    const kept = JSON.stringify(held) + JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage));
    expect(kept).not.toContain(hostOf(OTHER));
    expect(kept).not.toContain(OTHER.server_name);
    release();
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(0));
  });

  it('the proof matches the computer, not any https exit', () => {
    const id = { computer: C.id, act: 'set', scheme: 'https', port: 443, login: false, via: `${OTHER.project_id}-${OTHER.id}` };
    const read = (host: string) => [[{ kind: 'active', scheme: 'https', host, port: 443, login: false, computer: C.id }]];
    expect(setProved(id, read(hostOf(OTHER)))).toBe('applied');
    expect(setProved(id, read(hostOf(SAME)))).toBeUndefined();
    expect(setProved(id, read('proxy.example.com'))).toBeUndefined();
    // The same ids under another domain are not that computer.
    expect(setProved(id, read(`${OTHER.project_id}-${OTHER.id}-egress-1.unrelated.example.test`))).toBeUndefined();
  });

  it.each([['indexed', hostOf], ['unindexed', bareOf]] as const)('(%s): another computer\'s proxy typed as your own proxy is held without its address and leaves the form', async (_form, as) => {
    const typed = as(OTHER);
    // Lost and not applied, so no read settles it while the test looks.
    const sent = boot(null, undefined, true, false);
    mount();
    await userEvent.click(await changeButton());
    const d = await screen.findByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['exit.form.scheme']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['exit.form.scheme.https'] }));
    await userEvent.type(within(d).getByLabelText(new RegExp(strings['exit.form.host'])), typed);
    await userEvent.type(within(d).getByLabelText(new RegExp(strings['exit.form.port'])), '443');
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(sent.map((r) => String(r.body))).toEqual([`https://${typed}:443`]));
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1));
    // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps
    const kept = JSON.stringify(heldChanges(EXIT_LOCK, { realm: 'all' })) + JSON.stringify(Object.entries(localStorage));
    expect(kept).not.toContain(typed);
    // The drawer stays open on the lost answer: no field, label or text still holds the host.
    expect(screen.getByRole('dialog', { name: strings['exit.form.title'] })).toBeInTheDocument();
    for (const el of document.querySelectorAll('input, textarea')) expect((el as HTMLInputElement).value).not.toContain(typed);
    expect(document.body.innerHTML).not.toContain(typed);
  });

  it('while a change is unknown the choice is locked and the footer keeps saying so', async () => {
    boot(SOCKS, undefined, true, false);
    mount();
    await userEvent.click(await changeButton());
    const d = await screen.findByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(T('exit.pick.computer')) }));
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['exit.computer.label']) }));
    await userEvent.click(await screen.findByRole('radio', { name: /beacon/ }));
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1));
    const own = within(d).getByRole('radio', { name: new RegExp(T('exit.pick.own')) });
    await waitFor(() => expect(own).toBeDisabled());
    await userEvent.click(own);
    expect(within(d).getByRole('radio', { name: new RegExp(T('exit.pick.computer')) })).toBeChecked();
    expect(d.textContent).not.toContain(T('exit.clear.body'));
    expect(within(d).getByRole('button', { name: strings['exit.held.check'] })).toBeInTheDocument();
  });
});

const SOCKS: Up = { scheme: 'socks5h', host: 'proxy.example.com', port: 1080, auth: false };
