// Anthropic in the connect drawer has two ways in where the computer's agent answers for Claude Code: "Use your Claude
// plan" (picked when the step opens: it only shows state) and "Use an API key". The plan way draws Claude Code's own rows (state, setup,
// use) inside the drawer, which stays open; the key way is the key step as before. An agent that does not list Claude
// Code, or a page with no Claude Code state at all, keeps Anthropic as the key alone.
import { render, screen, userEvent, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type providers } from '@core';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import type { Api } from '../api';
import { claudeOf, COMMANDS } from '../logic';
import strings from '../strings.en.json';
import type { ClaudeCode } from '../types';
import { ConnectDrawer } from './Connect';
import { AiProvider, type AiCtx } from './ctx';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const err = (): Settled => ({ ok: false, err: { kind: 'failed', code: 'unexpected', status: 500, retryAfter: null, details: {} } });
const CAT = { byId: { anthropic: { id: 'anthropic', label: 'Anthropic', custom: false }, google: { id: 'google', label: 'Google Gemini', custom: false } } };
const ON = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
/** GET /acp/agents with these facts of the claude row. */
const acp = (over: Record<string, unknown>) =>
  ok({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, install_state: 'ok', logged_in: 'logged_in', enabled: true, startable: true, setup_user: 'ada', install_hint: COMMANDS.install, login_hint: COMMANDS.login, ...over }] } });
const STATES = {
  notInstalled: claudeOf(acp({ installed: false, install_state: 'missing_binary', logged_in: 'unknown', enabled: false, startable: false }), null),
  signedOut: claudeOf(acp({ logged_in: 'logged_out', startable: false }), null),
  signedIn: claudeOf(acp({}), null),
  unavailable: claudeOf(ok({ status: 'ok', report: { agents: [] } }), null),
} satisfies Record<string, ClaudeCode>;

function drawer(claude: ClaudeCode | null | undefined, cat: unknown = CAT) {
  const goto = vi.fn();
  const onClose = vi.fn();
  const api = new Proxy({} as Api, { get: () => () => Promise.resolve(err()) });
  const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const m = { cat, caps: {}, accounts: [], ...ON, realm: 'global', realmIds: [], acpDefaultCap: true, bundle: { snap: null, at: 0, err: null }, loads: { catalogue: 'ok', claude: 'ok' }, ...(claude === undefined ? {} : { claude }) };
  render(
    <AiProvider value={{ m, api, env, reload: () => undefined, connect: () => undefined, goto } as unknown as AiCtx}>
      <ConnectDrawer target={{ providerId: 'anthropic' }} onClose={onClose} />
    </AiProvider>,
  );
  return { goto, onClose };
}
const s = (k: keyof typeof strings) => strings[k];
const ON_ATLAS = strings['claude.on'].replace('{{computer}}', 'atlas');
/** The buttons of the plan section and the drawer's footer, by their kit variant. */
const variantOf = (b: HTMLElement) => b.getAttribute('data-variant');
const planRadio = (d: HTMLElement) => within(d).getByRole('radio', { name: new RegExp(`^${s('connect.plan')}`) });
const keyRadio = (d: HTMLElement) => within(d).getByRole('radio', { name: new RegExp(`^${s('connect.apikey')}`) });

beforeEach(() => boot());
afterEach(() => { vi.restoreAllMocks(); resetAttempts(); });

describe('Anthropic in the connect drawer: two ways in', () => {
  it('opens on the Claude plan with the API key beside it: the question is the step\u2019s heading over two choice cards, Anthropic\u2019s terms link is one line under them', async () => {
    drawer(STATES.signedOut);
    const d = await screen.findByRole('dialog');
    const question = s('connect.planHow').replace('{{computer}}', 'atlas');
    const heading = within(d).getByRole('heading', { name: question });
    const group = within(d).getByRole('radiogroup', { name: question });
    expect(planRadio(d)).toBeChecked();
    expect(keyRadio(d)).not.toBeChecked();
    expect(within(d).getByText(s('connect.planNote').replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    const terms = within(d).getByRole('link', { name: new RegExp(s('connect.planTerms')) });
    expect(terms.getAttribute('href')).toBe('https://code.claude.com/docs/en/legal-and-compliance');
    // The ways are the kit's choice cards (side by side: a horizontal group), not a list of bare radios.
    expect(group.getAttribute('aria-orientation')).toBe('horizontal');
    // Order: heading, the choices, the terms link, then the chosen way's own section, headed with the computer's name.
    const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const section = within(d).getByRole('heading', { name: ON_ATLAS });
    expect(after(heading, group)).toBe(true);
    expect(after(group, terms)).toBe(true);
    expect(after(terms, section)).toBe(true);
    // No second label repeats the heading inside the section: the first row is the state in words.
    expect(within(d).queryByText(s('claude.status'))).toBeNull();
    expect(after(section, within(d).getByText(s('cc.signed_out')))).toBe(true);
    // The plan step only shows state: nothing is sent to a terminal by opening it, and no key field is drawn.
    expect(within(d).queryByLabelText(/Anthropic API key/)).toBeNull();
  });

  it('the plan way, Claude Code not installed: the state and "Open a terminal to install" show in the drawer, which stays open', async () => {
    const { goto, onClose } = drawer(STATES.notInstalled);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(s('cc.not_installed'))).toBeInTheDocument();
    // One primary action, the step the state asks for; "Do it myself" is a quiet text action beside it.
    expect(variantOf(within(d).getByRole('button', { name: s('claude.install') }))).toBe('primary');
    expect(variantOf(within(d).getByRole('button', { name: s('claude.myself') }))).not.toBe('primary');
    expect(within(d).getAllByRole('button').filter((b) => variantOf(b) === 'primary')).toHaveLength(1);
    expect(planRadio(d)).toBeChecked();
    expect(onClose).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });

  it('the plan way, not signed in: the state and "Open a terminal to sign in"', async () => {
    drawer(STATES.signedOut);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(s('cc.signed_out'))).toBeInTheDocument();
    expect(variantOf(within(d).getByRole('button', { name: s('claude.signIn') }))).toBe('primary');
    expect(within(d).getAllByRole('button').filter((b) => variantOf(b) === 'primary')).toHaveLength(1);
    expect(within(d).queryByRole('button', { name: s('claude.useIt') })).toBeNull();
    // The footer holds Back and Close, as the other connect steps' footers hold theirs.
    const foot = d.querySelector('footer') as HTMLElement;
    expect(within(foot).getAllByRole('button').map((b) => b.textContent)).toEqual([s('connect.back'), s('connect.planClose')]);
  });

  it('the plan way, signed in: the state and "Use Claude Code" for new chats; the copies to other computers stay in the section', async () => {
    drawer(STATES.signedIn);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(s('cc.signed_in'))).toBeInTheDocument();
    expect(variantOf(within(d).getByRole('button', { name: s('claude.useIt') }))).toBe('primary');
    expect(within(d).getAllByRole('button').filter((b) => variantOf(b) === 'primary')).toHaveLength(1);
    expect(within(d).queryByRole('button', { name: s('claude.signIn') })).toBeNull();
    expect(within(d).queryByText(/Copy Claude Code/)).toBeNull();
  });

  it('the key way is the key step; switching to the plan drops the key field, and back again', async () => {
    drawer(STATES.signedOut);
    const d = await screen.findByRole('dialog');
    await userEvent.click(keyRadio(d));
    expect(((await within(d).findByLabelText(/Anthropic API key/)) as HTMLInputElement).type).toBe('password');
    expect(within(d).queryByRole('heading', { name: ON_ATLAS })).toBeNull();
    await userEvent.click(planRadio(d));
    expect(within(d).queryByLabelText(/Anthropic API key/)).toBeNull();
    expect(within(d).getByRole('heading', { name: ON_ATLAS })).toBeInTheDocument();
    await userEvent.click(keyRadio(d));
    expect(await within(d).findByLabelText(/Anthropic API key/)).toBeInTheDocument();
  });

  it.each([
    ['an agent that does not list Claude Code', STATES.unavailable],
    ['no realm, so no Claude Code state', null],
    ['a page model without Claude Code state', undefined],
  ] as const)('%s: Anthropic is the key step alone, with no choice and no terms link', async (_n, claude) => {
    drawer(claude);
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByLabelText(/Anthropic API key/)).toBeInTheDocument();
    expect(within(d).queryByRole('radiogroup')).toBeNull();
    expect(within(d).queryByRole('link', { name: new RegExp(s('connect.planTerms')) })).toBeNull();
  });
});
