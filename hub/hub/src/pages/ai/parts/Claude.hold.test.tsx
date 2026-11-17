// A Claude Code change whose answer was lost is core's hold (claudeHold.ts), never the section's own state. The section
// drawn again (Settings left and back), another computer or realm and back, still shows "may have gone through" with
// Check again and every change button off, and a press sends nothing; Check again only reads back what was sent.
import { heldAttempts, type providers, type Target } from '@core';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import kit from '@kit/strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { CLAUDE_HOLD_BY, claudeLock, sendClaude } from '../claudeHold';
import { claudeOf, COMMANDS } from '../logic';
import strings from '../strings.en.json';
import { ClaudeSection } from './Claude';
import { AiProvider, type AiCtx } from './ctx';

// The copy drawers are tested on their own; here only the section's change buttons.
vi.mock('../models/claude/Transfer', () => ({
  ClaudeCopies: ({ children }: { children: unknown }) => children,
  ClaudeTransfer: () => null,
}));

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
const R2 = '0123456789abcdef01234567';
const AT = { project: 'p1', computer: 'c1', realm: 'global' };
const LOCK = () => claudeLock(AT)!;
/** GET /acp/agents: Claude Code installed and signed in (the row offers Use it while Hoody's own agent is the default). */
const acpBody = () =>
  ok({ status: 'ok', report: { agents: [{ name: 'claude', installed: true, install_state: 'ok', logged_in: 'logged_in', enabled: true, startable: true, setup_user: 'ada', install_hint: COMMANDS.install, login_hint: COMMANDS.login }] } });

/** What the agent stores as the default for new chats: Hoody's own ('') until the change lands. */
let stored: '' | 'claude';
let put: ReturnType<typeof vi.fn>;
/** GET /acp/default: the send's own read-back, then each Check again. */
let readDefault: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let api: Api;

function ctxFor(target: Target, realm = 'global'): AiCtx {
  const m = {
    computer: { id: target.container.id, name: target.container.id === 'c1' ? 'atlas' : 'borealis' }, target, realm, realmIds: [],
    claude: claudeOf(acpBody(), null), acpDefaultCap: true, loads: { claude: 'ok' },
  };
  return { m, api, env: {}, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
}
const draw = (target: Target = A, realm?: string) => <AiProvider value={ctxFor(target, realm)}><ClaudeSection /></AiProvider>;
const useIt = () => screen.getByRole('button', { name: strings['claude.useIt'] });
const banner = () => screen.findByText(strings['err.notConfirmed']);

beforeEach(() => {
  boot();
  stored = '';
  reload = vi.fn();
  put = vi.fn(() => Promise.resolve(lost));
  readDefault = vi.fn(() => Promise.resolve(ok({ delegated_agent: stored })));
  const over = { acp: () => Promise.resolve(acpBody()), acpDefaultPut: put, acpDefault: readDefault } as Partial<Api>;
  api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
});
afterEach(() => { resetAttempts(); });

describe('Claude Code: an unknown change is held by core', () => {
  it('kept when the section is drawn again: Use it off, a press sends nothing; Check again only reads, then lets it go', async () => {
    const view = render(draw());
    await userEvent.click(useIt());
    await banner();
    expect(put).toHaveBeenCalledTimes(1);
    expect(heldAttempts(LOCK())).toHaveLength(1);

    // Settings left and back: the section is drawn anew.
    view.unmount();
    render(draw());
    await banner();
    expect(useIt()).toBeDisabled();
    await userEvent.click(useIt());
    expect(put).toHaveBeenCalledTimes(1);

    // Check again: not there yet, so it stays held; then it is: let go, the page reads again, still one send.
    const check = () => within(screen.getByRole('alert')).getByRole('button', { name: kit['outcome.pending.check'] });
    expect(readDefault).toHaveBeenCalledTimes(1);
    await userEvent.click(check());
    await waitFor(() => expect(readDefault).toHaveBeenCalledTimes(2));
    expect(heldAttempts(LOCK())).toHaveLength(1);
    // Check again says what it found: not there yet.
    expect(await within(screen.getByRole('alert')).findByText(strings['def.stillNot'])).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    stored = 'claude';
    await userEvent.click(check());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(heldAttempts(LOCK())).toHaveLength(0);
    expect(screen.queryByText(strings['err.notConfirmed'])).toBeNull();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('another computer or realm shows its own state; back here the change is still held', async () => {
    const view = render(draw());
    await userEvent.click(useIt());
    await banner();
    view.rerender(draw(B));
    await waitFor(() => expect(screen.queryByText(strings['err.notConfirmed'])).toBeNull());
    expect(useIt()).toBeEnabled();
    view.rerender(draw(A, R2));
    await waitFor(() => expect(screen.queryByText(strings['err.notConfirmed'])).toBeNull());
    expect(useIt()).toBeEnabled();
    view.rerender(draw(A));
    await banner();
    expect(useIt()).toBeDisabled();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('Stop tracking, after the kit question, lets the hold go: only then can Use it send again', async () => {
    render(draw());
    await userEvent.click(useIt());
    await banner();
    await userEvent.click(await screen.findByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    await waitFor(() => expect(useIt()).toBeEnabled());
    await userEvent.click(useIt());
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
  });

  it('a second change while one is held is refused with nothing sent', async () => {
    expect((await sendClaude(api, AT, { kind: 'backend', v: 'claude' })).state).toBe('not_confirmed');
    expect(await sendClaude(api, AT, { kind: 'enabled', v: true })).toEqual({ state: 'held' });
    expect(put).toHaveBeenCalledTimes(1);
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('its lock: one per project, computer and realm', () => {
    expect(LOCK()).toBe(`${CLAUDE_HOLD_BY}:p1/c1/global/claude`);
    expect(claudeLock({ ...AT, realm: R2 })).not.toBe(LOCK());
    expect(claudeLock({ ...AT, project: 'p2' })).not.toBe(LOCK());
    expect(claudeLock({ ...AT, computer: 'a b' })).toBeNull();
  });

  it('a change answered at once holds nothing', async () => {
    put.mockImplementation(() => { stored = 'claude'; return Promise.resolve(ok()); });
    render(draw());
    await userEvent.click(useIt());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(heldAttempts(LOCK())).toHaveLength(0);
    expect(screen.queryByText(strings['err.notConfirmed'])).toBeNull();
  });
});
