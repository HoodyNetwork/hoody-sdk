// A person clicked "Open a terminal to sign in" and nothing appeared: the typed setup terminal shows
// inline at once, with a plain "Open in a new tab" link beside it; while the step waits the page reads Claude Code again on
// its own (one read every 5 s, never two at once, at most 10 min) and settles to the new state; one button at a time, the
// rest text actions; "Do it myself" keeps the command to copy.
import { act, render, screen } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type providers, type Target } from '@core';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import { useInlineProgramUrls } from '../../board/links';
import type { Api } from '../api';
import { claudeOf, COMMANDS } from '../logic';
import strings from '../strings.en.json';
import { ClaudeSection, POLL_MAX, POLL_MS } from './Claude';
import { AiProvider, type AiCtx } from './ctx';

// The copy drawers are tested in models/claude; here only the setup card.
vi.mock('../models/claude/Transfer', () => ({
  ClaudeCopies: ({ children }: { children: unknown }) => children,
  ClaudeTransfer: () => null,
}));

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
/** GET /acp/agents with Claude Code installed, in this sign-in state. */
const acpBody = (logged: 'logged_in' | 'logged_out') =>
  ok({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, install_state: 'ok', logged_in: logged, enabled: true, startable: true, setup_user: 'ada', install_hint: COMMANDS.install, login_hint: COMMANDS.login }] } });

let acp: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let api: Api;
/** The terminal number the setup made (typeSetup picks one in the run band). */
let made = 0;

function ctxFor(target: Target): AiCtx {
  const m = {
    computer: { id: target.container.id, name: target.container.id === 'c1' ? 'atlas' : 'borealis' }, target, realm: 'global', realmIds: [],
    claude: claudeOf(acpBody('logged_out'), null), acpDefaultCap: true, loads: { claude: 'ok' },
  };
  return { m, api, env: {}, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
}
const mount = (target: Target = A) => render(<AiProvider value={ctxFor(target)}><ClaudeSection /></AiProvider>);
const s = (k: keyof typeof strings) => strings[k];
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  // Core booted: a Claude Code change is held by core (claudeHold.ts) before it is sent.
  boot();
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
  reload = vi.fn();
  acp = vi.fn(() => Promise.resolve(acpBody('logged_out')));
  api = {
    termCaps: vi.fn(() => Promise.resolve(ok())),
    termCreate: vi.fn((n: number) => { made = n; return Promise.resolve(ok({ status: 'ok', terminal_id: String(n), incarnation: 'inc-1' })); }),
    termWait: vi.fn(() => Promise.resolve(ok())),
    termWrite: vi.fn(() => Promise.resolve(ok())),
    termDelete: vi.fn(() => Promise.resolve(ok())),
    acp,
  } as unknown as Api;
  made = 0;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); resetAttempts(); });

const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
async function signIn() {
  const u = user();
  mount();
  await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
  await flush();
  return u;
}

describe('the Claude Code setup terminal', () => {
  it('shows the terminal inline at once, addressed as a Board tile, with Open in a new tab to the plain address; the sign-in button gives way', async () => {
    await signIn();
    expect(made).toBeGreaterThanOrEqual(8001);
    // The Board's own builder: the frame gets its defaults (Hub palette, no terminal toolbar), the new tab the share address.
    let urls: { url: string; shareUrl: string } | null = null;
    function Probe() { urls = useInlineProgramUrls('terminal', made, A); return null; }
    render(<Probe />);
    expect(urls).not.toBeNull();
    const { url: src, shareUrl } = urls!;
    expect(src).not.toBe(shareUrl);
    expect(src).toMatch(/hide-toolbar/);
    expect(shareUrl).not.toMatch(/hide-toolbar|theme/);
    const frame = screen.getByTitle(strings['claude.termTitle'].replace('{{name}}', 'atlas'));
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toBe(src);
    // The Board's frame: a link Claude prints opens a new tab (popups allowed, and out of the sandbox).
    expect(frame.getAttribute('sandbox')).toMatch(/\ballow-popups\b/);
    expect(frame.getAttribute('sandbox')).toMatch(/\ballow-popups-to-escape-sandbox\b/);
    expect(screen.getByRole('link', { name: new RegExp(s('claude.termTab')) }).getAttribute('href')).toBe(shareUrl);
    expect(screen.getByText(s('claude.typedLogin'))).toBeTruthy();
    // The command is entered (Enter included), once.
    expect(api.termWrite).toHaveBeenCalledTimes(1);
    // The terminal's height is the kit separator's under it.
    expect(screen.getByRole('separator', { name: s('claude.termResize') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: s('claude.signIn') })).toBeNull();
    expect(screen.getByRole('button', { name: s('claude.check') })).toBeTruthy();
  });

  it('reads Claude Code every 5 s while it waits and settles once it reads signed in: one reload, the panel goes, no more reads', async () => {
    await signIn();
    acp.mockImplementationOnce(() => Promise.resolve(acpBody('logged_out'))).mockImplementationOnce(() => Promise.resolve(acpBody('logged_in')));
    await wait(POLL_MS - 1000);
    expect(acp).toHaveBeenCalledTimes(0);
    await wait(1000);
    expect(acp).toHaveBeenCalledTimes(1);
    expect(acp).toHaveBeenLastCalledWith('global');
    expect(reload).not.toHaveBeenCalled();
    await wait(POLL_MS);
    expect(acp).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByTitle(/Claude Code setup terminal/)).toBeNull();
    await wait(POLL_MS * 5);
    expect(acp).toHaveBeenCalledTimes(2);
  });

  it('never reads twice at once: the next read waits for the last answer, then 5 s', async () => {
    await signIn();
    let answer: (v: Settled) => void = () => undefined;
    acp.mockImplementationOnce(() => new Promise<Settled>((r) => { answer = r; }));
    await wait(POLL_MS);
    expect(acp).toHaveBeenCalledTimes(1);
    await wait(POLL_MS * 6);
    expect(acp).toHaveBeenCalledTimes(1);
    await act(async () => { answer(acpBody('logged_out')); await vi.advanceTimersByTimeAsync(0); });
    await wait(POLL_MS - 1000);
    expect(acp).toHaveBeenCalledTimes(1);
    await wait(1000);
    expect(acp).toHaveBeenCalledTimes(2);
  });

  it('a failed read is only "not yet"; the watch stops after 10 minutes of reads, Check again stays', async () => {
    await signIn();
    acp.mockImplementation(() => Promise.resolve({ ok: false, err: { kind: 'failed', code: '', status: 500, retryAfter: null, details: {} } }));
    await wait(POLL_MS * (POLL_MAX + 10));
    expect(POLL_MS * POLL_MAX).toBe(600_000);
    expect(acp).toHaveBeenCalledTimes(POLL_MAX);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: s('claude.check') })).toBeTruthy();
  });

  it('stops when the section leaves, and when another computer is shown (the setup starts over there)', async () => {
    const view = mount();
    const u = user();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    view.rerender(<AiProvider value={ctxFor(B)}><ClaudeSection /></AiProvider>);
    await flush();
    expect(screen.queryByTitle(/Claude Code setup terminal/)).toBeNull();
    await wait(POLL_MS * 3);
    expect(acp).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    view.unmount();
    await wait(POLL_MS * 3);
    expect(acp).not.toHaveBeenCalled();
  });

  it('a realm switch on the same computer closes the setup terminal this section made (it is not the new realm\'s)', async () => {
    const view = mount();
    const u = user();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    expect(made).toBeGreaterThan(0);
    const other = ctxFor(A);
    (other.m as unknown as { realm: string }).realm = '0123456789abcdef01234567';
    view.rerender(<AiProvider value={other}><ClaudeSection /></AiProvider>);
    await flush();
    expect(screen.queryByTitle(/Claude Code setup terminal/)).toBeNull();
    expect(api.termDelete).toHaveBeenCalledTimes(1);
    expect(api.termDelete).toHaveBeenCalledWith({ n: made, inc: 'inc-1' });
    view.unmount();
    await flush();
    expect(api.termDelete).toHaveBeenCalledTimes(1);
  });

  it('Do it myself is a text action that shows the command to copy, before and while the terminal waits', async () => {
    const u = user();
    mount();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([s('claude.signIn'), s('claude.myself')]);
    await u.click(screen.getByRole('button', { name: s('claude.myself') }));
    expect(screen.getByText(COMMANDS.login)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    expect(screen.getByText(COMMANDS.login)).toBeTruthy();
    expect(screen.getByRole('button', { name: s('claude.myself') })).toBeTruthy();
  });
});

describe('one accent per region', () => {
  it('the section offers its setup step as a secondary button: the page header holds the one primary', () => {
    mount();
    const b = screen.getByRole('button', { name: s('claude.signIn') });
    expect(b.getAttribute('data-variant')).toBe('secondary');
    expect(document.querySelector('[data-variant="primary"]')).toBeNull();
  });
});

describe('a change that may have gone through is never sent again (C9)', () => {
  it('Use it with a lost answer: the row is pending, Use it is disabled and a press sends nothing more', async () => {
    const put = vi.fn(() => Promise.resolve(ok()));
    // The read back never shows the change: the answer is unknown, the section holds it pending.
    const read = vi.fn(() => Promise.resolve(ok({ delegated_agent: '' })));
    api = { ...api, acpDefaultPut: put, acpDefault: read } as unknown as Api;
    const c = ctxFor(A);
    (c.m as unknown as { claude: unknown }).claude = claudeOf(acpBody('logged_in'), null);
    render(<AiProvider value={c}><ClaudeSection /></AiProvider>);
    const u = user();
    await u.click(screen.getByRole('button', { name: s('claude.useIt') }));
    await flush();
    // The held change shows once the send is done (its write, then a read-back that did not show it).
    await screen.findByText(s('err.notConfirmed'));
    expect(put).toHaveBeenCalledTimes(1);
    const again = screen.getByRole('button', { name: s('claude.useIt') });
    expect(again).toBeDisabled();
    await u.click(again);
    await flush();
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('a setup press never clears a pending backend change', () => {
  it('Undo with a lost answer, then Sign in: the change stays pending, Undo stays disabled, nothing is sent again', async () => {
    const put = vi.fn(() => Promise.resolve(ok()));
    // The read back still shows Claude Code chosen: Undo's answer is unknown, the section holds it pending.
    const read = vi.fn(() => Promise.resolve(ok({ delegated_agent: 'claude' })));
    api = { ...api, acpDefaultPut: put, acpDefault: read } as unknown as Api;
    const c = ctxFor(A);
    // Chosen but signed out: the row offers Undo, the state row offers Sign in (the setup step).
    (c.m as unknown as { claude: unknown }).claude = claudeOf(acpBody('logged_out'), ok({ delegated_agent: 'claude' }));
    render(<AiProvider value={c}><ClaudeSection /></AiProvider>);
    const u = user();
    await u.click(screen.getByRole('button', { name: s('claude.undo') }));
    await flush();
    // The held change shows once the send is done (its write, then a read-back that did not show it).
    await screen.findByText(s('err.notConfirmed'));
    expect(put).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: s('claude.undo') })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    expect(api.termWrite).toHaveBeenCalledTimes(1);
    // The setup press left the backend change alone: still pending, Undo still locked, no second PUT.
    expect(screen.getByRole('button', { name: s('claude.undo') })).toBeDisabled();
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('the setup note leaves once a fresh read shows its step done', () => {
  it('the terminal did not open, the person signed in by hand: the next read drops "The terminal did not open…"', async () => {
    api = { ...api, termCreate: vi.fn(() => Promise.resolve({ ok: false, err: { kind: 'failed', code: '', status: 500, retryAfter: null, details: {} } })) } as unknown as Api;
    const u = user();
    const view = mount();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    expect(screen.getByText(s('claude.terminalFailed'))).toBeInTheDocument();
    // Signed in by hand; Check again (or Use it) read Claude Code afresh: no sign-in step is due any more.
    const fresh = ctxFor(A);
    (fresh.m as unknown as { claude: unknown }).claude = claudeOf(acpBody('logged_in'), null);
    view.rerender(<AiProvider value={fresh}><ClaudeSection /></AiProvider>);
    await flush();
    expect(screen.queryByText(s('claude.terminalFailed'))).toBeNull();
  });

  it('a read that still asks for the same step keeps the note', async () => {
    api = { ...api, termCreate: vi.fn(() => Promise.resolve({ ok: false, err: { kind: 'failed', code: '', status: 500, retryAfter: null, details: {} } })) } as unknown as Api;
    const u = user();
    const view = mount();
    await u.click(screen.getByRole('button', { name: s('claude.signIn') }));
    await flush();
    view.rerender(<AiProvider value={ctxFor(A)}><ClaudeSection /></AiProvider>);
    await flush();
    expect(screen.getByText(s('claude.terminalFailed'))).toBeInTheDocument();
  });
});
