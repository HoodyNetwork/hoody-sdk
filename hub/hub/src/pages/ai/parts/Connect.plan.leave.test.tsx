// Leaving "Use your Claude plan" while its setup press is still opening a terminal: picking "Use an API key" ends that
// attempt. The command is not written, the terminal the press made is closed, and a later press starts a fresh one.
import { act, render, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type providers } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import type { Api, TermOwned } from '../api';
import { claudeOf, COMMANDS } from '../logic';
import strings from '../strings.en.json';
import { ConnectDrawer } from './Connect';
import { AiProvider, type AiCtx } from './ctx';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const err = (): Settled => ({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } });
const CAT = { byId: { anthropic: { id: 'anthropic', label: 'Anthropic', custom: false } } };
const ON = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const SIGNED_OUT = claudeOf(
  ok({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, install_state: 'ok', logged_in: 'logged_out', enabled: true, startable: false, setup_user: 'ada', install_hint: COMMANDS.install, login_hint: COMMANDS.login }] } }),
  null,
);
const s = (k: keyof typeof strings) => strings[k];

/** The drawer on Anthropic over a terminal API whose named call answers only when `release` is called. */
function drawer(hold: 'termCreate' | 'termWait' | 'termWrite', bound = false) {
  let release = (): void => undefined;
  const held = new Promise<void>((r) => { release = r; });
  const made: number[] = [];
  const answer = async (name: string, body: unknown = {}): Promise<Settled> => {
    if (name === hold) await held;
    return ok(body);
  };
  const term = {
    termCaps: vi.fn(() => answer('termCaps')),
    termCreate: vi.fn((n: number) => { made.push(n); return answer('termCreate', { status: 'ok', terminal_id: String(n), pid: 1, incarnation: `inc-${made.length}` }); }),
    termWait: vi.fn((_o: TermOwned) => answer('termWait')),
    termWrite: vi.fn((_o: TermOwned, _input: string) => answer('termWrite')),
    termDelete: vi.fn((_o: TermOwned) => answer('termDelete')),
  };
  // One computer only: no termOn (the flow then uses the terminal calls above); every other call is refused.
  // `bound`: an api over several computers, as the real one: termOn(computer) answers the calls that stay on it.
  const five = { ...term };
  const termOn = vi.fn((_on?: unknown) => five);
  if (bound) Object.assign(term, { termOn });
  const api = new Proxy(term as unknown as Api, { get: (t, k) => (k in t ? (t as unknown as Record<PropertyKey, unknown>)[k] : k === 'termOn' ? undefined : () => Promise.resolve(err())) });
  const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const m = { cat: CAT, caps: {}, accounts: [], ...ON, realm: 'global', realmIds: [], acpDefaultCap: true, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok', claude: 'ok' }, claude: SIGNED_OUT };
  render(
    <AiProvider value={{ m, api, env, reload: () => undefined, connect: () => undefined, goto: vi.fn() } as unknown as AiCtx}>
      <ConnectDrawer target={{ providerId: 'anthropic' }} onClose={vi.fn()} />
    </AiProvider>,
  );
  return { term, termOn, made, release: () => act(async () => { release(); await Promise.resolve(); }) };
}
const keyRadio = (d: HTMLElement) => within(d).getByRole('radio', { name: new RegExp(`^${s('connect.apikey')}`) });
const planRadio = (d: HTMLElement) => within(d).getByRole('radio', { name: new RegExp(`^${s('connect.plan')}`) });

beforeEach(() => boot());
afterEach(() => { vi.restoreAllMocks(); resetAttempts(); });

describe('Anthropic in the connect drawer: the plan way left while its terminal opens', () => {
  it('"Use an API key" picked while the terminal is readied: the terminal is closed and the sign-in command is never written', async () => {
    const { term, made, release } = drawer('termWait');
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termWait).toHaveBeenCalledTimes(1));
    await userEvent.click(keyRadio(d));
    expect(within(d).queryByRole('button', { name: s('claude.signIn') })).toBeNull();
    await release();
    await waitFor(() => expect(term.termDelete).toHaveBeenCalledTimes(1));
    expect(term.termDelete).toHaveBeenCalledWith({ n: made[0], inc: 'inc-1' });
    expect(term.termWrite).not.toHaveBeenCalled();
  });

  it('picked while the terminal is being made: the same, once the terminal exists', async () => {
    const { term, made, release } = drawer('termCreate');
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termCreate).toHaveBeenCalledTimes(1));
    await userEvent.click(keyRadio(d));
    await release();
    await waitFor(() => expect(term.termDelete).toHaveBeenCalledTimes(1));
    expect(term.termDelete).toHaveBeenCalledWith({ n: made[0], inc: 'inc-1' });
    expect(term.termWait).not.toHaveBeenCalled();
    expect(term.termWrite).not.toHaveBeenCalled();
  });

  it('picked while the command is on its way: the terminal is closed, once', async () => {
    const { term, made, release } = drawer('termWrite');
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termWrite).toHaveBeenCalledTimes(1));
    await userEvent.click(keyRadio(d));
    await release();
    await waitFor(() => expect(term.termDelete).toHaveBeenCalledTimes(1));
    expect(term.termDelete).toHaveBeenCalledWith({ n: made[0], inc: 'inc-1' });
    expect(term.termWrite).toHaveBeenCalledTimes(1);
  });

  it('another computer shown while the terminal is readied, before this section has drawn it: nothing is written, the terminal is closed', async () => {
    const { term, made, release } = drawer('termWait');
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termWait).toHaveBeenCalledTimes(1));
    // Core shows another computer; the section is not drawn again (its own model still names the first one).
    setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } });
    await release();
    await waitFor(() => expect(term.termDelete).toHaveBeenCalledTimes(1));
    expect(term.termDelete).toHaveBeenCalledWith({ n: made[0], inc: 'inc-1' });
    expect(term.termWrite).not.toHaveBeenCalled();
  });

  it('a press while core already shows another computer than the one this section draws: nothing is sent at all', async () => {
    const { term, termOn } = drawer('termWait', true);
    const d = await screen.findByRole('dialog');
    // The section still draws atlas (c1); core has moved on.
    setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } });
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await act(async () => { await Promise.resolve(); });
    for (const call of Object.values(term)) expect(call).not.toHaveBeenCalled();
    expect(within(d).getByRole('button', { name: s('claude.signIn') })).toBeEnabled();
    // Core shows the drawn computer again: the press goes out, bound to the computer the section draws.
    setTarget(ON.target);
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termWait).toHaveBeenCalledTimes(1));
    expect(termOn).toHaveBeenCalledTimes(1);
    expect(termOn).toHaveBeenCalledWith(ON.target);
  });

  it('back on the plan way after leaving: a new press opens its own terminal and writes the command once', async () => {
    const { term, made, release } = drawer('termWait');
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termWait).toHaveBeenCalledTimes(1));
    await userEvent.click(keyRadio(d));
    await release();
    await waitFor(() => expect(term.termDelete).toHaveBeenCalledTimes(1));
    await userEvent.click(planRadio(d));
    await userEvent.click(within(d).getByRole('button', { name: s('claude.signIn') }));
    await waitFor(() => expect(term.termWrite).toHaveBeenCalledTimes(1));
    expect(made).toHaveLength(2);
    expect(term.termWrite).toHaveBeenCalledWith({ n: made[1], inc: 'inc-2' }, COMMANDS.login);
    expect(term.termDelete).toHaveBeenCalledTimes(1);
  });
});
