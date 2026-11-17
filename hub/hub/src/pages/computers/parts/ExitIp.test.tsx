// Network > Exit address on real core (fixture transport): what the egress program reports,
// setting another exit (the login sent once, never kept), going back to the computer's own address, and C9 for
// both changes (one send; a lost answer held until a fresh read proves it or a warned Dismiss; never "failed").
import { answers, bootFixtureCore, heldChanges, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
import { createHash } from 'node:crypto';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { isOff } from '@app/testing';
import { egressRoutes } from '../data';
import type { Computer } from '../types';
import { EXIT_LOCK, ExitIp, clearProved, exitStateOf, formProblem, formReady, looksLocal, proxyLabel, setProved, upstreamLine, validHost, type ExitForm } from './ExitIp';
import strings from './ExitIp.strings.en.json';
import kitStates from '@kit/states/strings.en.json';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

/** Use another exit… as a live button: until the exit is read the section head draws it disabled, with its reason. */
async function changeButton(root: HTMLElement = document.body): Promise<HTMLElement> {
  const name = strings['exit.change'];
  await waitFor(() => expect(within(root).getByRole('button', { name })).not.toHaveAttribute('aria-disabled'));
  return within(root).getByRole('button', { name });
}

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const SECRET = 'Hunter2-Pass/Word?#@:';
const N = (k: keyof typeof strings, v: Record<string, string> = {}) => Object.entries({ name: C.name, ...v }).reduce((s, [a, b]) => s.replaceAll(`{{${a}}}`, b), strings[k]);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** An action's name: its label, with "…" when it opens a dialog. */
const opening = (x: string) => new RegExp(`^${esc(x)}…?$`);
const exitSection = () => screen.queryByRole('heading', { name: strings['exit.title'] })?.closest('section') as HTMLElement | null;
/** "Use its own address" lives in the exit section's ⋯ menu, shown only while an exit is set. */
const clearShown = () => {
  const sec = exitSection();
  return sec !== null && within(sec).queryByRole('button', { name: 'More actions' }) !== null;
};
async function clearItem(): Promise<HTMLElement> {
  const item = () => screen.queryByRole('menuitem', { name: opening(N('exit.clear')) });
  if (!item()) {
    const more = await waitFor(() => within(exitSection() as HTMLElement).getByRole('button', { name: 'More actions' }));
    await userEvent.click(more);
  }
  return screen.findByRole('menuitem', { name: opening(N('exit.clear')) });
}

interface Up { scheme: string; host: string; port: number; auth: boolean; usable: boolean }
interface Opts { seed?: Up | null; pending?: boolean; appliedThenLost?: boolean; readFails?: boolean; oldKit?: boolean; refuseSet?: boolean; unparsed?: boolean; odd?: boolean; gate?: Promise<void> }
function rules(o: Opts, sent: FixtureRequest[]): FixtureRule[] {
  let up: Up | null = o.seed ?? null;
  const blob = () =>
    up
      ? { enabled: true, ...(o.oldKit ? {} : { state: up.usable ? 'active' : 'unavailable' }), scheme: up.scheme, host: up.host, port: up.port, auth: up.auth, config_path: '/hoody/storage/hoody-egress/config/upstream_proxy.txt' }
      : { enabled: false, ...(o.oldKit ? {} : { state: 'direct' }), config_path: '/hoody/storage/hoody-egress/config/upstream_proxy.txt' };
  const after = () => (o.appliedThenLost ? answers.pending5xx() : answers.ok(blob()));
  return [
    reply(egressRoutes.upstream, () => (o.readFails ? answers.refused(500, 'BROKEN') : o.odd ? answers.ok({}) : o.unparsed ? answers.ok({ enabled: true, state: 'unavailable', config_path: '/x' }) : answers.ok(blob()))),
    reply(egressRoutes.set, async (r) => {
      sent.push(r);
      // A held answer: the send is in flight until the test releases it.
      if (o.gate) await o.gate;
      if (o.pending) return answers.pending5xx();
      if (o.refuseSet) return answers.refused(400, 'Invalid upstream URL');
      const u = new URL(String(r.body));
      up = { scheme: u.protocol.replace(':', ''), host: u.hostname, port: Number(u.port), auth: !!u.username, usable: true };
      return after();
    }),
    reply(egressRoutes.clear, (r) => {
      sent.push(r);
      if (o.pending) return answers.pending5xx();
      up = null;
      return after();
    }),
  ];
}
function boot(o: Opts = {}) {
  const sent: FixtureRequest[] = [];
  bootFixtureCore({ rules: rules(o, sent) });
  return sent;
}
const mount = (c: Computer = C, canWrite = true) => render(<QueryClientProvider client={queryClient}><ExitIp c={c} canWrite={canWrite} /></QueryClientProvider>);
const re = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const SOCKS: Up = { scheme: 'socks5h', host: 'proxy.example.com', port: 1080, auth: false, usable: true };
/** Neither the sent URL line nor an unsalted digest of it (hex, base64, base64url) is kept anywhere. */
function expectNothingOf(line: string) {
  const all = kept();
  const d = createHash('sha256').update(line).digest();
  for (const v of [line, encodeURIComponent(line), d.toString('hex'), d.toString('base64'), d.toString('base64url')]) expect(all).not.toContain(v);
}
/** Everything the browser keeps, and the query and mutation caches, as text. A settled change leaves the mutation
 *  cache on core's gcTime-0 timer, so callers wait for it (waitFor) rather than read at the instant it settles. */
function kept(): string {
  // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
  const ls = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
  // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
  const ss = Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`).join('\n');
  const q = JSON.stringify(queryClient.getQueryCache().getAll().map((x) => [x.queryKey, x.state.data]));
  const m = JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables));
  const h = JSON.stringify(heldChanges(EXIT_LOCK, { realm: 'all' }));
  return [ls, ss, q, m, h].join('\n');
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept
  localStorage.clear();
});

describe('exit logic', () => {
  it('reads the program: direct, active, unavailable, an older program without state, and anything else as unknown', () => {
    expect(exitStateOf({ enabled: false, state: 'direct' })).toEqual({ kind: 'direct' });
    expect(exitStateOf({ enabled: false })).toEqual({ kind: 'direct' });
    expect(exitStateOf({ enabled: true, state: 'active', scheme: 'http', host: 'h', port: 8080, auth: true })).toEqual({ kind: 'active', scheme: 'http', host: 'h', port: 8080, login: true });
    expect(exitStateOf({ enabled: true, state: 'unavailable', scheme: 'socks5h', host: 'h', port: 1, auth: false })).toEqual({ kind: 'unavailable', scheme: 'socks5h', host: 'h', port: 1, login: false });
    // A set exit missing its type, host, port or login flag, or with a port out of range, is unreadable, never shown.
    const full = { enabled: true, state: 'active', scheme: 'socks5h', host: 'h', port: 1080, auth: false };
    for (const bad of [{ scheme: undefined }, { scheme: '' }, { host: undefined }, { host: '' }, { port: undefined }, { port: 0 }, { port: 65536 }, { port: 1.5 }, { auth: undefined }, { auth: 'yes' }])
      expect(exitStateOf({ ...full, ...bad })).toEqual({ kind: 'unknown' });
    // An exit the program cannot parse comes with none of the four fields: set, unnamed, refusing traffic.
    expect(exitStateOf({ enabled: true, state: 'unavailable' })).toEqual({ kind: 'unavailable', scheme: '', host: '', port: null, login: false });
    expect(exitStateOf({ enabled: true, state: 'active' })).toEqual({ kind: 'unknown' });
    expect(exitStateOf({ enabled: true, state: 'unavailable', host: 'h' })).toEqual({ kind: 'unknown' });
    expect(exitStateOf({ enabled: true, state: 'unavailable', auth: true })).toEqual({ kind: 'unknown' });
    expect(exitStateOf({ enabled: true, scheme: 'socks5', host: 'h', port: 1, auth: false })).toMatchObject({ kind: 'set' });
    for (const raw of [null, 'x', {}, { enabled: 'yes' }, { enabled: true, state: 'direct' }, { enabled: false, state: 'active' }, { enabled: true, state: 'odd' }]) {
      expect(exitStateOf(raw)).toEqual({ kind: 'unknown' });
    }
  });

  it('shows a proxy without any login, and spots a loopback (local) exit', () => {
    expect(proxyLabel({ scheme: 'socks5h', host: '127.0.0.1', port: 40000 })).toBe('socks5h://127.0.0.1:40000');
    expect(proxyLabel({ scheme: '', host: '', port: null })).toBe('');
    expect(looksLocal('127.0.0.1')).toBe(true);
    expect(looksLocal('127.5.6.7')).toBe(true);
    expect(looksLocal('10.0.0.1')).toBe(false);
    expect(looksLocal('127.0.0.1.example.com')).toBe(false);
  });

  it('accepts a host name or IPv4 only, a port 1..65535, and a password only with a user', () => {
    for (const h of ['proxy.example.com', 'p1', '203.0.113.9', 'a-b.c']) expect(validHost(h)).toBe(true);
    for (const h of ['http://p', 'u@p', 'p:80', 'p/x', '[::1]', '::1', '256.1.1.1', '1.2.3', '-a.com', 'a b', '']) expect(validHost(h)).toBe(false);
    const f = (o: Partial<ExitForm>): ExitForm => ({ scheme: 'socks5h', host: 'p.example', port: '1080', user: '', password: '', ...o });
    expect(formProblem(f({}))).toBeNull();
    expect(formProblem(f({ host: 'x:1' }))).toBe('host');
    expect(formProblem(f({ port: '0' }))).toBe('port');
    expect(formProblem(f({ port: '65536' }))).toBe('port');
    expect(formProblem(f({ port: '1.5' }))).toBe('port');
    expect(formProblem(f({ password: 'x' }))).toBe('needsUser');
    expect(formReady(f({ host: '' }))).toBe(false);
    expect(formReady(f({ port: ' ' }))).toBe(false);
    expect(formReady(f({ port: '65535' }))).toBe(true);
  });

  it('builds one URL line with the login percent-encoded, so no character of it can move the host', () => {
    const f: ExitForm = { scheme: 'http', host: ' Proxy.Example.COM ', port: '08080', user: 'me@home', password: SECRET };
    const line = upstreamLine(f);
    expect(line).toBe(fake('http://me%40home:', encodeURIComponent(SECRET), '@proxy.example.com:8080'));
    const u = new URL(line);
    expect(u.hostname).toBe('proxy.example.com');
    expect(decodeURIComponent(u.password)).toBe(SECRET);
    expect(upstreamLine({ ...f, user: '', password: '' })).toBe('http://proxy.example.com:8080');
    expect(upstreamLine({ ...f, password: '' })).toBe('http://me%40home@proxy.example.com:8080');
  });

  it('a set is proved only by a read of that computer naming what was sent; a clear by its own address', () => {
    const id = { computer: 'c1', scheme: 'socks5h', host: 'h', port: 1, login: false };
    const read = (x: object, computer = 'c1') => [[{ ...x, computer }]];
    expect(setProved(id, read({ kind: 'active', scheme: 'socks5h', host: 'h', port: 1, login: false }))).toBe('applied');
    expect(setProved(id, read({ kind: 'unavailable', scheme: 'socks5h', host: 'h', port: 1, login: false }))).toBe('applied');
    expect(setProved(id, read({ kind: 'active', scheme: 'socks5h', host: 'h', port: 1, login: true }))).toBeUndefined();
    expect(setProved(id, read({ kind: 'active', scheme: 'socks5', host: 'h', port: 1, login: false }))).toBeUndefined();
    expect(setProved(id, read({ kind: 'active', scheme: 'socks5h', host: 'h', port: 2, login: false }))).toBeUndefined();
    expect(setProved(id, read({ kind: 'active', scheme: 'socks5h', host: 'h', port: 1, login: false }, 'c2'))).toBeUndefined();
    // A set with a login is never proved: the old login reads the same as the new one.
    expect(setProved({ ...id, login: true }, read({ kind: 'active', scheme: 'socks5h', host: 'h', port: 1, login: true }))).toBeUndefined();
    expect(setProved({ computer: 'c1', scheme: 'socks5h', host: 'h', port: 1 }, read({ kind: 'active', scheme: 'socks5h', host: 'h', port: 1, login: false }))).toBeUndefined();
    expect(setProved(id, read({ kind: 'direct' }))).toBeUndefined();
    expect(clearProved({ computer: 'c1' }, read({ kind: 'direct' }))).toBe('applied');
    expect(clearProved({ computer: 'c1' }, read({ kind: 'unknown' }))).toBeUndefined();
    expect(clearProved({ computer: 'c1' }, read({ kind: 'direct' }, 'c2'))).toBeUndefined();
    expect(clearProved({}, read({ kind: 'direct' }))).toBeUndefined();
  });
});

describe('Exit address', () => {
  it('says the computer uses its own address, and nothing is changeable while it is stopped or for a reader', async () => {
    boot();
    const v = mount();
    expect(await screen.findByText(N('exit.direct'))).toBeInTheDocument();
    expect(clearShown()).toBe(false);
    v.unmount();
    mount(C, false);
    expect(await screen.findByText(N('exit.direct'))).toBeInTheDocument();
    expect(screen.getByText(strings['exit.noWrite'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: opening(strings['exit.change']) })).toBeNull();
    cleanup();
    mount({ ...C, status: 'stopped' } as Computer);
    expect(screen.getByText(N('exit.stopped'))).toBeInTheDocument();
  });

  it('shows the exit in use, a set login only as "set", a loopback exit as local, and an unusable one as refused, never bypassed', async () => {
    boot({ seed: { scheme: 'socks5h', host: '127.0.0.1', port: 40001, auth: true, usable: false } });
    mount();
    expect(await screen.findByText(N('exit.unavailable', { proxy: 'socks5h://127.0.0.1:40001' }))).toBeInTheDocument();
    expect(N('exit.unavailable', { proxy: 'x' })).toMatch(/502/);
    expect(N('exit.unavailable', { proxy: 'x' })).toMatch(/never sent from atlas's own address/);
    expect(screen.getByText(strings['exit.login'])).toBeInTheDocument();
    expect(screen.getByText(N('exit.local'))).toBeInTheDocument();
  });

  it('an older program (no state) still shows its exit; a failed read says so and offers to read again, never "own address"', async () => {
    boot({ seed: SOCKS, oldKit: true });
    const v = mount();
    expect(await screen.findByText(N('exit.setOld', { proxy: 'socks5h://proxy.example.com:1080' }))).toBeInTheDocument();
    v.unmount();
    queryClient.clear();
    // An exit the program cannot parse: set and refusing, named as such, and it can be cleared.
    boot({ unparsed: true });
    const u = mount();
    expect(await screen.findByText(N('exit.unnamed'))).toBeInTheDocument();
    expect(screen.queryByText(N('exit.readFailed'))).toBeNull();
    expect(isOff(await clearItem())).toBe(false);
    await userEvent.keyboard('{Escape}');
    u.unmount();
    queryClient.clear();
    boot({ readFails: true });
    mount();
    expect(await screen.findByText(N('exit.readFailed'))).toBeInTheDocument();
    expect(screen.queryByText(N('exit.direct'))).toBeNull();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: opening(strings['exit.change']) })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a refused read carries its Details; an answer that says nothing readable has no rejection, so no Details', async () => {
    const details = () => screen.queryAllByRole('button', { name: kitStates['err.details'] });
    boot({ readFails: true });
    const v = mount();
    expect(await screen.findByText(N('exit.readFailed'))).toBeInTheDocument();
    expect(details()).toHaveLength(1);
    await userEvent.click(details()[0]!);
    expect(await screen.findByRole('dialog', { name: kitStates['err.detailsTitle'] })).toHaveTextContent('egress/upstream');
    await userEvent.keyboard('{Escape}');
    v.unmount();
    queryClient.clear();
    boot({ odd: true });
    mount();
    expect(await screen.findByText(N('exit.readFailed'))).toBeInTheDocument();
    expect(details()).toHaveLength(0);
  });

  it('a failed re-read after a good one: the old exit is not acted on (change off, no "Use its own address")', async () => {
    const o: Opts = { seed: SOCKS };
    boot(o);
    mount();
    await clearItem();
    await userEvent.keyboard('{Escape}');
    o.readFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(N('exit.readFailed'))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: opening(strings['exit.change']) })).toHaveAttribute('aria-disabled', 'true'));
    expect(clearShown()).toBe(false);
  });

  it('an open "Use its own address" through a failed re-read: its login warning stays, Confirm is off with why, nothing sent', async () => {
    const o: Opts = { seed: { ...SOCKS, auth: true } };
    const sent = boot(o);
    mount();
    await userEvent.click(await clearItem());
    const dlg = screen.getByRole('alertdialog');
    o.readFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await within(dlg).findByText(strings['exit.reason.unread'])).toBeInTheDocument();
    expect(within(dlg).getByText(N('exit.clear.bodyLogin'))).toBeInTheDocument();
    const go = within(dlg).getByRole('button', { name: strings['exit.clear.go'] });
    expect(go).toBeDisabled();
    await userEvent.click(go);
    expect(sent).toEqual([]);
  });

  it('an open "Use its own address" through a re-read that answers nothing readable: Confirm is off with why, nothing sent', async () => {
    const o: Opts = { seed: SOCKS };
    const sent = boot(o);
    mount();
    await userEvent.click(await clearItem());
    const dlg = screen.getByRole('alertdialog');
    o.odd = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await within(dlg).findByText(strings['exit.reason.unread'])).toBeInTheDocument();
    const go = within(dlg).getByRole('button', { name: strings['exit.clear.go'] });
    expect(go).toBeDisabled();
    await userEvent.click(go);
    expect(sent).toEqual([]);
  });

  it('going back to the own address asks first, says a login cannot be put back, and sends one DELETE', async () => {
    const sent = boot({ seed: { ...SOCKS, auth: true } });
    mount();
    await userEvent.click(await clearItem());
    const dlg = screen.getByRole('alertdialog');
    expect(within(dlg).getByText(N('exit.clear.bodyLogin'))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['exit.clear.go'] }));
    expect(await screen.findByText(N('exit.direct'))).toBeInTheDocument();
    expect(sent.map((r) => r.method)).toEqual(['DELETE']);
    expect(sent[0]!.target?.container.id).toBe(C.id);
  });

  it('a lost clear is held, never failed; Check again proves it from a fresh read; nothing more is sent', async () => {
    const sent = boot({ seed: SOCKS, appliedThenLost: true });
    mount();
    await userEvent.click(await clearItem());
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['exit.clear.go'] }));
    // The answer was lost but the change applied: the page's read after the send proves it, so no hold is left.
    await waitFor(() => expect(screen.getByText(N('exit.direct'))).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(N('exit.held.clear'))).toBeNull());
    expect(screen.queryByText(/failed|did not/i)).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('a clear nothing proves stays held: no second send, the change buttons locked, and only a warned Dismiss frees it', async () => {
    const sent = boot({ seed: SOCKS, pending: true });
    mount();
    await userEvent.click(await clearItem());
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['exit.clear.go'] }));
    expect(await screen.findByText(N('exit.held.clear'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['exit.held.check'] }));
    expect(screen.getByText(N('exit.held.clear'))).toBeInTheDocument();
    expect(await clearItem()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: opening(strings['exit.change']) })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: strings['exit.held.dismiss'] }));
    const dlg = screen.getByRole('alertdialog');
    expect(within(dlg).getByText(N('exit.held.dismissBody'))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['exit.held.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(N('exit.held.clear'))).toBeNull());
    expect(sent).toHaveLength(1);
  });
});

describe('Exit address: setting another exit', () => {
  const fill = async (o: { host?: string; port?: string; user?: string; password?: string } = {}) => {
    await userEvent.click(await changeButton());
    // The form opens in a drawer; its footer (Use this exit, Check again, Close) is the drawer's.
    const g = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    expect(within(g).getByRole('group', { name: strings['exit.form.title'] })).toBeInTheDocument();
    await userEvent.type(within(g).getByLabelText(re(strings['exit.form.host'])), o.host ?? 'proxy.example.com');
    await userEvent.type(within(g).getByLabelText(re(strings['exit.form.port'])), o.port ?? '1080');
    if (o.user) await userEvent.type(within(g).getByLabelText(re(strings['exit.form.user'])), o.user);
    if (o.password) await userEvent.type(within(g).getByLabelText(re(strings['exit.form.password'])), o.password);
    return g;
  };

  it('an open drawer through a failed re-read keeps its draft and the login warning, marks nothing as now, and sends nothing', async () => {
    const o: Opts = { seed: { ...SOCKS, auth: true } };
    const sent = boot(o);
    mount();
    const g = await fill();
    o.readFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await within(g).findByText(strings['exit.reason.unread'])).toBeInTheDocument();
    expect(within(g).getByText(strings['exit.form.replaceLogin'])).toBeInTheDocument();
    expect(within(g).getByLabelText(re(strings['exit.form.host']))).toHaveValue('proxy.example.com');
    const own = within(g).getByRole('radio', { name: new RegExp(esc(N('exit.pick.own'))) });
    expect(own.closest('label')?.textContent ?? '').not.toMatch(/\(now\)/);
    const go = within(g).getByRole('button', { name: strings['exit.form.go'] });
    expect(go).toBeDisabled();
    await userEvent.click(go);
    expect(sent).toEqual([]);
  });

  it('warns first (access rules, refusal not fallback), sends one PUT with the URL line, and keeps no login anywhere', async () => {
    const sent = boot();
    mount();
    const g = await fill({ user: 'me', password: SECRET });
    expect(within(g).getByText(new RegExp(N('exit.form.permissions').slice(0, 40)))).toBeInTheDocument();
    expect(N('exit.form.refuse')).toMatch(/refuses requests \(502\) rather than sending them from its own address/);
    await userEvent.click(within(g).getByRole('button', { name: strings['exit.form.go'] }));
    expect(await screen.findByText(N('exit.active', { proxy: 'socks5h://proxy.example.com:1080' }))).toBeInTheDocument();
    expect(screen.getByText(strings['exit.login'])).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('PUT');
    expect(sent[0]!.body).toBe(`socks5h://me:${encodeURIComponent(SECRET)}@proxy.example.com:1080`);
    await waitFor(() => expect(screen.queryByRole('group', { name: strings['exit.form.title'] })).toBeNull());
    const all = kept();
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(encodeURIComponent(SECRET));
    await waitFor(() => expectNothingOf(`socks5h://me:${encodeURIComponent(SECRET)}@proxy.example.com:1080`));
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('a bad host or port, or a password without a user, is said and cannot be sent', async () => {
    const sent = boot();
    mount();
    const g = await fill({ host: 'http://x', port: '99999' });
    expect(within(g).getByText(strings['exit.form.host.bad'])).toBeInTheDocument();
    expect(within(g).getByRole('button', { name: strings['exit.form.go'] })).toBeDisabled();
    expect(sent).toHaveLength(0);
  });

  it('a refused proxy is said in plain words and the password is gone from the form; a lost set is held, never failed', async () => {
    let sent = boot({ refuseSet: true });
    let v = mount();
    let g = await fill({ user: 'me', password: SECRET });
    await userEvent.click(within(g).getByRole('button', { name: strings['exit.form.go'] }));
    expect(await screen.findByText(N('exit.form.failed'))).toBeInTheDocument();
    expect((within(g).getByLabelText(re(strings['exit.form.password'])) as HTMLInputElement).value).toBe('');
    expect((within(g).getByLabelText(re(strings['exit.form.user'])) as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(kept()).not.toContain(encodeURIComponent(SECRET)));
    expect(sent).toHaveLength(1);
    v.unmount();
    queryClient.clear();
    sent = boot({ pending: true });
    v = mount();
    g = await fill();
    await userEvent.click(within(g).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1));
    expect(screen.queryByText(N('exit.form.failed'))).toBeNull();
    // The footer offers Check again instead of a second send while the outcome is unknown.
    expect(within(g).queryByRole('button', { name: strings['exit.form.go'] })).toBeNull();
    expect(within(g).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    await waitFor(() => expect(kept()).not.toContain(SECRET));
    await waitFor(() => expectNothingOf('socks5h://proxy.example.com:1080'));
    void v;
  });

  it('a lost set without a login is proved by the read; with a login it stays held, says so, and only Dismiss frees it', async () => {
    let sent = boot({ appliedThenLost: true });
    let v = mount();
    let g = await fill();
    await userEvent.click(within(g).getByRole('button', { name: strings['exit.form.go'] }));
    expect(await screen.findByText(N('exit.active', { proxy: 'socks5h://proxy.example.com:1080' }))).toBeInTheDocument();
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(0));
    expect(sent).toHaveLength(1);
    v.unmount();
    queryClient.clear();
    sent = boot({ appliedThenLost: true });
    v = mount();
    g = await fill({ user: 'me', password: SECRET });
    await userEvent.click(within(g).getByRole('button', { name: strings['exit.form.go'] }));
    // The read shows the exit with a login, as the old login would: nothing frees the hold but the person.
    expect(await screen.findByText(strings['exit.login'])).toBeInTheDocument();
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1));
    await userEvent.click(within(g).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1));
    expect(screen.queryByText(N('exit.form.failed'))).toBeNull();
    expect(sent).toHaveLength(1);
    await waitFor(() => expect(kept()).not.toContain(encodeURIComponent(SECRET)));
    await waitFor(() => expectNothingOf(`socks5h://me:${encodeURIComponent(SECRET)}@proxy.example.com:1080`));
    expect((within(g).getByLabelText(re(strings['exit.form.user'])) as HTMLInputElement).value).toBe('');
    // Closed, the hold says a check cannot confirm a login, and offers the warned Dismiss.
    // The footer's Close (the header's × has the same name and comes first).
    await userEvent.click(within(g).getAllByRole('button', { name: /^close$/i }).at(-1)!);
    expect(await screen.findByText(N('exit.held.setLogin', { proxy: 'socks5h://proxy.example.com:1080' }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['exit.held.dismiss'] }));
    const dlg = screen.getByRole('alertdialog');
    expect(within(dlg).getByText(N('exit.held.dismissBody'))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['exit.held.dismissGo'] }));
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(0));
    expect(sent).toHaveLength(1);
    void v;
  });

  it('when the context ends (page hidden), the typed user name and password are gone', async () => {
    boot();
    mount();
    const g = await fill({ user: 'me', password: SECRET });
    act(() => void window.dispatchEvent(new Event('pagehide')));
    await waitFor(() => expect((within(g).getByLabelText(re(strings['exit.form.password'])) as HTMLInputElement).value).toBe(''));
    expect((within(g).getByLabelText(re(strings['exit.form.user'])) as HTMLInputElement).value).toBe('');
  });
});

// The exit: the setting as a diagram; the form in a drawer, same bytes.
describe('Exit address: the diagram', () => {
  const flow = () => screen.getByRole('list', { name: strings['exit.title'] });
  const exitBox = () => within(flow()).getAllByRole('listitem').find((li) => li.textContent?.includes(strings['net.exit.current'])) as HTMLElement;

  it('own address, an exit in use (with its login and local tags), and an older program (set, not reported), never 502', async () => {
    boot();
    let v = mount();
    await waitFor(() => expect(exitBox()).toHaveTextContent(`${N('net.exit.own')} (${strings['net.exit.now']})`));
    expect(within(flow()).getByText(strings['net.app'])).toBeInTheDocument();
    expect(within(flow()).getByText(N('net.proxy'))).toBeInTheDocument();
    expect(within(flow()).getByText(strings['net.site'])).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('502');
    v.unmount();
    queryClient.clear();
    boot({ seed: { scheme: 'socks5h', host: '127.0.0.1', port: 40001, auth: true, usable: true } });
    v = mount();
    await waitFor(() => expect(exitBox()).toHaveTextContent('socks5h://127.0.0.1:40001'));
    expect(exitBox()).toHaveTextContent([strings['net.exit.now'], strings['net.exit.login'], strings['net.exit.local']].join(' · '));
    expect(screen.getByText(N('exit.local'))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('502');
    v.unmount();
    queryClient.clear();
    boot({ seed: SOCKS, oldKit: true });
    mount();
    await waitFor(() => expect(exitBox()).toHaveTextContent(`socks5h://proxy.example.com:1080 ${strings['net.exit.set']}`));
    expect(screen.getByText(N('net.exit.notReported'))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('502');
  });

  it('an exit that cannot be used, or that the program cannot read, is drawn refused (502), never bypassed', async () => {
    boot({ seed: { ...SOCKS, usable: false } });
    const v = mount();
    await waitFor(() => expect(exitBox()).toHaveTextContent(`socks5h://proxy.example.com:1080 ${strings['net.exit.cant']}`));
    expect(within(flow()).getByText(strings['net.broken'])).toBeInTheDocument();
    expect(screen.getByText(N('net.refused'))).toBeInTheDocument();
    expect(N('net.refused')).toMatch(/never sent from atlas's own address/);
    v.unmount();
    queryClient.clear();
    boot({ unparsed: true });
    mount();
    await waitFor(() => expect(exitBox()).toHaveTextContent(N('net.exit.unread')));
    expect(within(flow()).getByText(strings['net.broken'])).toBeInTheDocument();
    expect(screen.getByText(N('net.refused.unnamed'))).toBeInTheDocument();
  });

  it('stopped is faded with no change offered; an unreadable setting shows "?" and no exit claim', async () => {
    boot();
    const v = mount({ ...C, status: 'stopped' } as Computer);
    expect(within(flow()).getByText(N('net.proxy.stopped'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: opening(strings['exit.change']) })).toBeNull();
    expect(screen.queryByText(strings['net.exit.current'])).toBeNull();
    v.unmount();
    boot({ readFails: true });
    mount();
    expect(await screen.findByText(N('exit.readFailed'))).toBeInTheDocument();
    const boxes = within(flow()).getAllByRole('listitem').map((li) => li.textContent);
    // The exit box: its caption, then the unknown mark.
    expect(boxes).toContain(`${strings['net.exit.label']}?`);
    expect(screen.queryByText(strings['net.exit.current'])).toBeNull();
    expect(document.body.textContent).not.toContain(N('net.exit.own'));
  });

  it('a reader sees the diagram and the docs, with no button and no drawer', async () => {
    boot({ seed: SOCKS });
    mount(C, false);
    await waitFor(() => expect(exitBox()).toHaveTextContent('socks5h://proxy.example.com:1080'));
    expect(screen.getByText(strings['exit.noWrite'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: opening(strings['exit.change']) })).toBeNull();
    expect(clearShown()).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: strings['exit.docs'] })).toHaveAttribute('href', 'https://docs.hoody.com/kit/egress/#upstream-proxies');
  });

  it('no route to the website is drawn while stopped or while the exit is unknown', async () => {
    const arrows = () => flow().querySelectorAll(':scope > li[aria-hidden]').length;
    boot();
    let v = mount();
    await waitFor(() => expect(exitBox()).toHaveTextContent(N('net.exit.own')));
    expect(arrows()).toBe(3);
    v.unmount();
    v = mount({ ...C, status: 'stopped' } as Computer);
    expect(arrows()).toBe(2);
    v.unmount();
    queryClient.clear();
    boot({ readFails: true });
    mount();
    expect(await screen.findByText(N('exit.readFailed'))).toBeInTheDocument();
    expect(arrows()).toBe(2);
  });
});

describe('Exit address: the form in its drawer', () => {
  it('today\'s form sends the same bytes: one PUT, the same URL line, to the same computer', async () => {
    const sent = boot();
    mount();
    await userEvent.click(await changeButton());
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    const typed: ExitForm = { scheme: 'socks5h', host: ' Proxy.Example.COM ', port: '08443', user: 'me@x', password: 'p:w/@' };
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.host'])), typed.host);
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.port'])), typed.port);
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.user'])), typed.user);
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.password'])), typed.password);
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.method).toBe('PUT');
    expect(sent[0]!.target?.container.id).toBe(C.id);
    // The bytes the inline form sent before the redesign, written out, and the helper it used.
    expect(sent[0]!.body).toBe('socks5h://me%40x:p%3Aw%2F%40@proxy.example.com:8443');
    expect(sent[0]!.body).toBe(upstreamLine(typed));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull());
    expect(sent).toHaveLength(1);
    // The diagram shows the new exit; a done set leaves no sentence on the tab (only a refused one does).
    expect(screen.queryByText(strings['exit.form.done'])).toBeNull();
  });

  it('closing the drawer asks first when something is typed, and the login is gone when it opens again', async () => {
    const sent = boot();
    mount();
    await userEvent.click(await changeButton());
    let d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.user'])), 'me');
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.password'])), SECRET);
    await userEvent.click(within(d).getAllByRole('button', { name: /^close$/i })[0]!);
    await userEvent.click(await within(d).findByRole('button', { name: /^discard$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: opening(strings['exit.change']) }));
    d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    expect((within(d).getByLabelText(re(strings['exit.form.user'])) as HTMLInputElement).value).toBe('');
    expect((within(d).getByLabelText(re(strings['exit.form.password'])) as HTMLInputElement).value).toBe('');
    expect(kept()).not.toContain(SECRET);
    expect(sent).toHaveLength(0);
  });

  // The drawer can be closed by the page, not the person: the login goes with it.
  const typeLogin = async () => {
    await userEvent.click(await changeButton());
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.host'])), 'proxy.example.com');
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.user'])), 'me');
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.password'])), SECRET);
  };
  const tree = (c: Computer, canWrite = true) => <QueryClientProvider client={queryClient}><ExitIp c={c} canWrite={canWrite} /></QueryClientProvider>;
  const expectEmptyWhenReopened = async () => {
    await userEvent.click(await changeButton());
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    expect((within(d).getByLabelText(re(strings['exit.form.host'])) as HTMLInputElement).value).toBe('');
    expect((within(d).getByLabelText(re(strings['exit.form.user'])) as HTMLInputElement).value).toBe('');
    expect((within(d).getByLabelText(re(strings['exit.form.password'])) as HTMLInputElement).value).toBe('');
  };

  it('the same computer going running, stopped, running closes the drawer; the login is gone and nothing is sent', async () => {
    const sent = boot();
    const v = mount();
    await typeLogin();
    v.rerender(tree({ ...C, status: 'stopped' } as Computer));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull());
    v.rerender(tree(C));
    await screen.findByRole('button', { name: opening(strings['exit.change']) });
    // It stays closed when the computer is back: nobody asked for it.
    expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull();
    await expectEmptyWhenReopened();
    expect(kept()).not.toContain(SECRET);
    expect(sent).toHaveLength(0);
  });

  it('losing the right to change it closes the drawer the same way; a held set stays held through it', async () => {
    const sent = boot();
    const v = mount();
    await typeLogin();
    v.rerender(tree(C, false));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull());
    v.rerender(tree(C, true));
    await expectEmptyWhenReopened();
    expect(sent).toHaveLength(0);
    v.unmount();
    queryClient.clear();
    // A set whose answer was lost: held. The page closing the drawer keeps the hold; nothing is sent again.
    const sent2 = boot({ pending: true });
    const w = mount();
    await userEvent.click(await changeButton());
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.host'])), 'proxy.example.com');
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.port'])), '1080');
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    await waitFor(() => expect(sent2).toHaveLength(1));
    w.rerender(tree({ ...C, status: 'stopped' } as Computer));
    w.rerender(tree(C));
    expect(await screen.findByText(/may already be set to leave through .*Check again before changing it\./)).toBeInTheDocument();
    expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1);
    expect(sent2).toHaveLength(1);
  });

  // What the page closes without the person.
  it('the "own address" question closes when the computer stops and does not come back; nothing is sent', async () => {
    const sent = boot({ seed: SOCKS });
    const v = mount();
    await userEvent.click(await clearItem());
    expect(await screen.findByRole('alertdialog', { name: N('exit.clear.title') })).toBeInTheDocument();
    v.rerender(tree({ ...C, status: 'stopped' } as Computer));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: N('exit.clear.title') })).toBeNull());
    v.rerender(tree(C));
    await clearItem();
    expect(screen.queryByRole('alertdialog', { name: N('exit.clear.title') })).toBeNull();
    // Losing the right to change it, or the address, while the question is open closes it the same way.
    await userEvent.click(await clearItem());
    expect(await screen.findByRole('alertdialog', { name: N('exit.clear.title') })).toBeInTheDocument();
    v.rerender(tree(C, false));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: N('exit.clear.title') })).toBeNull());
    v.rerender(tree(C, true));
    await userEvent.click(await clearItem());
    expect(await screen.findByRole('alertdialog', { name: N('exit.clear.title') })).toBeInTheDocument();
    v.rerender(tree({ ...C, server_name: '' } as Computer));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: N('exit.clear.title') })).toBeNull());
    v.rerender(tree(C));
    expect(screen.queryByRole('alertdialog', { name: N('exit.clear.title') })).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('a refused set stays said on the tab when the page closes the drawer; Change starts clean', async () => {
    const sent = boot({ refuseSet: true });
    const v = mount();
    await userEvent.click(await changeButton());
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.host'])), 'proxy.example.com');
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.port'])), '1080');
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
    expect(await within(d).findByText(N('exit.form.failed'))).toBeInTheDocument();
    v.rerender(tree({ ...C, status: 'stopped' } as Computer));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull());
    // Said while the computer is stopped too, and with no address.
    expect(await screen.findByText(N('exit.form.failed'))).toBeInTheDocument();
    v.rerender(tree({ ...C, server_name: '' } as Computer));
    expect(await screen.findByText(N('exit.form.failed'))).toBeInTheDocument();
    v.rerender(tree(C));
    // Said once, on the tab, never as "may or may not": the program answered no.
    expect(await screen.findByText(N('exit.form.failed'))).toBeInTheDocument();
    expect(screen.queryByText(/may or may not have been set/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: opening(strings['exit.change']) }));
    expect(screen.queryByText(N('exit.form.failed'))).toBeNull();
    expect(sent).toHaveLength(1);
  });

  // What the page closes while a login is typed or a send is in the air.
  const dialogGone = () => waitFor(() => expect(screen.queryByRole('dialog', { name: strings['exit.form.title'] })).toBeNull());
  const typeAndSend = async () => {
    await typeLogin();
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    await userEvent.type(within(d).getByLabelText(re(strings['exit.form.port'])), '1080');
    await userEvent.click(within(d).getByRole('button', { name: strings['exit.form.go'] }));
  };
  const SET_LINE = 'socks5h://proxy.example.com:1080';

  it('losing its address closes the drawer the same way; the login is gone and nothing is sent', async () => {
    const sent = boot();
    const v = mount();
    await typeLogin();
    v.rerender(tree({ ...C, server_name: '' } as Computer));
    await dialogGone();
    v.rerender(tree(C));
    await expectEmptyWhenReopened();
    expect(kept()).not.toContain(SECRET);
    expect(sent).toHaveLength(0);
  });

  it('a refetched computer (a new object, nothing about change rights) keeps the open drawer and what was typed', async () => {
    const sent = boot();
    const v = mount();
    await typeLogin();
    v.rerender(tree({ ...C, name: 'atlas-2' } as Computer));
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    const d = screen.getByRole('dialog', { name: strings['exit.form.title'] });
    expect((within(d).getByLabelText(re(strings['exit.form.host'])) as HTMLInputElement).value).toBe('proxy.example.com');
    expect((within(d).getByLabelText(re(strings['exit.form.user'])) as HTMLInputElement).value).toBe('me');
    expect((within(d).getByLabelText(re(strings['exit.form.password'])) as HTMLInputElement).value).toBe(SECRET);
    expect(sent).toHaveLength(0);
  });

  it('a set still in the air when the page closes the drawer says nothing and sends nothing more; the answer, when it comes, is the server\'s', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sent = boot({ gate });
    const v = mount();
    // A failed assert must not leave the reply parked for the next test.
    try {
      await typeAndSend();
      await waitFor(() => expect(sent).toHaveLength(1));
      const unclaimed = () => {
        expect(screen.queryByText(N('exit.form.failed'))).toBeNull();
        expect(screen.queryByText(/may or may not have been set/)).toBeNull();
        expect(screen.queryByText(strings['exit.form.done'])).toBeNull();
      };
      unclaimed();
      v.rerender(tree({ ...C, status: 'stopped' } as Computer));
      await dialogGone();
      v.rerender(tree(C));
      expect(await screen.findByRole('button', { name: opening(strings['exit.change']) })).toHaveAttribute('aria-disabled', 'true');
      unclaimed();
      expect(sent).toHaveLength(1);
      release();
      // The program took it: the read after the answer shows the exit and its login, and no hold is left.
      expect(await screen.findByText(strings['exit.login'])).toBeInTheDocument();
      await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(0));
      expect(sent).toHaveLength(1);
      await waitFor(() => expect(kept()).not.toContain(SECRET));
    } finally {
      release();
    }
  });

  it('a held set that carries a login stays held through losing and regaining the right; no login is kept', async () => {
    const sent = boot({ pending: true });
    const v = mount();
    await typeAndSend();
    await waitFor(() => expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1));
    v.rerender(tree(C, false));
    v.rerender(tree(C, true));
    await dialogGone();
    expect(await screen.findByText(N('exit.held.setLogin', { proxy: SET_LINE }))).toBeInTheDocument();
    expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1);
    expect(sent).toHaveLength(1);
    await waitFor(() => expect(kept()).not.toContain(SECRET));
  });

  it('a held clear stays held through losing and regaining the right', async () => {
    const sent = boot({ seed: SOCKS, pending: true });
    const v = mount();
    await userEvent.click(await clearItem());
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['exit.clear.go'] }));
    expect(await screen.findByText(N('exit.held.clear'))).toBeInTheDocument();
    v.rerender(tree(C, false));
    v.rerender(tree(C, true));
    expect(await screen.findByText(N('exit.held.clear'))).toBeInTheDocument();
    expect(heldChanges(EXIT_LOCK, { realm: 'all' })).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });
});
