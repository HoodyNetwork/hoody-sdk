// A Claude Code change held by core (claudeHold.ts) is read back only by the section's banner: Check again, then Stop
// tracking. The section draws only its own words when the agent no longer lists Claude Code, or when Claude Code's state
// could not be read, and the banner must stay under them there too, or the hold has no reader on the page.
import { heldAttempts, type providers, type Target } from '@core';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import kit from '@kit/strings.en.json';
import kitStates from '@kit/states/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { claudeLock, sendClaude } from '../claudeHold';
import { claudeOf } from '../logic';
import strings from '../strings.en.json';
import { ClaudeSection } from './Claude';
import { AiProvider, type AiCtx } from './ctx';

// The copy drawers are tested on their own; here only the section's banner.
vi.mock('../models/claude/Transfer', () => ({
  ClaudeCopies: ({ children }: { children: unknown }) => children,
  ClaudeTransfer: () => null,
}));

type Settled = providers.Settled<unknown>;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const AT = { project: 'p1', computer: 'c1', realm: 'global' };
const LOCK = () => claudeLock(AT)!;
/** GET /acp/agents with no Claude Code row: the agent no longer lists it. */
const unlisted = ok({ status: 'ok', report: { agents: [] } });

/** What the agent stores as the default for new chats: Hoody's own ('') until the change lands. */
let stored: '' | 'claude';
let put: ReturnType<typeof vi.fn>;
let readDefault: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let api: Api;

/** The section on computer c1 in Global, with Claude Code read as `acp` (`loads`: how that read went). */
function draw(acp: Settled, loads: 'ok' | 'error') {
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: A, realm: 'global', realmIds: [],
    claude: claudeOf(acp, null), acpDefaultCap: true, loads: { claude: loads },
  };
  const ctx = { m, api, env: {}, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  return <AiProvider value={ctx}><ClaudeSection /></AiProvider>;
}
const banner = () => screen.findByText(strings['err.notConfirmed']);
const check = () => within(screen.getByRole('alert')).getByRole('button', { name: kit['outcome.pending.check'] });

/** Use it, sent and its answer lost: held by core, its request answered. */
async function heldChange(): Promise<void> {
  expect((await sendClaude(api, AT, { kind: 'backend', v: 'claude' })).state).toBe('not_confirmed');
  expect(heldAttempts(LOCK())).toHaveLength(1);
}

beforeEach(() => {
  boot();
  stored = '';
  reload = vi.fn();
  put = vi.fn(() => Promise.resolve(lost));
  readDefault = vi.fn(() => Promise.resolve(ok({ delegated_agent: stored })));
  const over = { acpDefaultPut: put, acpDefault: readDefault } as Partial<Api>;
  api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
});
afterEach(() => { resetAttempts(); });

describe('Claude Code: a held change where the section draws only its own words', () => {
  it('the agent no longer lists Claude Code: the banner stays, and its Check again reads back and lets the hold go', async () => {
    await heldChange();
    render(draw(unlisted, 'ok'));
    expect(screen.getByText(strings['cc.unavailable'])).toBeInTheDocument();
    await banner();
    expect(readDefault).toHaveBeenCalledTimes(1);
    stored = 'claude';
    await userEvent.click(check());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(readDefault).toHaveBeenCalledTimes(2);
    expect(heldAttempts(LOCK())).toHaveLength(0);
    expect(screen.queryByText(strings['err.notConfirmed'])).toBeNull();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("Claude Code's state could not be read: the banner stays under the error, and Stop tracking lets the hold go", async () => {
    await heldChange();
    render(draw(lost, 'error'));
    expect(screen.getByText(strings['claude.loadFailed'])).toBeInTheDocument();
    await banner();
    await userEvent.click(await screen.findByRole('button', { name: kitStates['err.stopTracking'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: kitStates['outcome.pending.dismissConfirm'] }));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('with nothing held, those states draw no banner (control)', () => {
    render(draw(unlisted, 'ok'));
    expect(screen.getByText(strings['cc.unavailable'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.notConfirmed'])).toBeNull();
  });
});
