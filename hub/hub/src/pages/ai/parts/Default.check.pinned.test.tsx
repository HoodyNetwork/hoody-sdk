// Settings → Default model: the page's api sends to the computer shown at each call, so the row's Check again hands
// checkHeld the computer the section was drawn for. A press that lands after a switch then reads nothing from the computer
// shown next (holdsPinned.test.ts proves checkHeld keeps to it); here, that the row hands it over.
import { render, screen, userEvent, waitFor } from '@app/testing';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget, type Target } from '@core/ctx';
import { boot } from '@core/test/env';
import type * as Nav from '@kit/nav';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { defaults, rows } from '../logic';
import { checkHeld, modelLock, sendHeld } from '../modelHold';
import type { Settled } from '../types';
import { AiProvider, type AiCtx } from './ctx';
import { DefaultSection } from './Default';

// No router here: the page's search param is empty and navigation is a no-op.
vi.mock('@kit/nav', async (orig) => ({ ...(await orig<typeof Nav>()), useSearchParam: () => [undefined, () => undefined], useGo: () => () => undefined }));
// The real checkHeld, watched: the test reads what the row hands it.
vi.mock('../modelHold', async (orig) => {
  const real = await orig<{ checkHeld: (...a: unknown[]) => unknown }>();
  return { ...real, checkHeld: vi.fn(real.checkHeld) };
});

const A: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const AT = { project: 'p1', computer: 'c1', realm: 'global' };
const FREE = 'hoody-ai/hoody-free';
const GPT = 'openai/gpt-5';
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const LOCK = () => modelLock(AT, 'general')!;

/** The model the agents list shows for the helper's agent: the old one until the change lands. */
let listed = FREE;
let patches = 0;
const agentsBody = () => ({ agents: [{ name: 'general', model: listed, is_configured_default: true }, { name: 'bot', model: '' }] });
const api = new Proxy({} as Api, {
  get: (_t, k) => {
    if (k === 'agentModel') return () => {
      patches += 1;
      return Promise.resolve(lost);
    };
    if (k === 'agents') return () => Promise.resolve(ok(agentsBody()));
    return () => Promise.resolve(lost);
  },
});

/** The section on computer c1 in Global, its catalogue closed (nothing read). */
function draw() {
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: A, realm: 'global', realmIds: ['global'], caps: {},
    cat: { byId: {}, byPrefix: {}, models: [] }, models: [], named: [], defaults: defaults(rows(agentsBody(), 'agents')), bots: [], accounts: [],
    bundle: { snap: null, at: 0, err: null, refreshFailed: false }, readerFor: () => { throw new Error('no catalogue read here'); },
    loads: { catalogue: 'ok', defaults: 'ok', accounts: 'ok', claude: 'ok', checker: 'ok', bots: 'ok' },
  };
  const env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };
  const ctx = { m, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  return render(<AiProvider value={ctx}><DefaultSection /></AiProvider>);
}

beforeEach(() => {
  boot();
  setTarget(A);
  listed = FREE;
  patches = 0;
  vi.mocked(checkHeld).mockClear();
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('Default model: Check again keeps to the computer the row was drawn for', () => {
  it('the row hands checkHeld the computer its render showed, and a read there that shows the model lets the hold go', async () => {
    // A change of the helper's model whose answer was lost: held by core, its request answered.
    expect((await sendHeld(api, AT, 'general', GPT, false, { defaultAgent: 'general' }, { followsShown: true })).state).toBe('not_confirmed');
    expect(heldAttempts(LOCK())).toHaveLength(1);
    draw();
    listed = GPT;
    const [press] = await screen.findAllByRole('button', { name: kit['outcome.pending.check'] });
    await waitFor(() => expect(press).not.toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(press!);
    await waitFor(() => expect(heldAttempts(LOCK())).toEqual([]));
    expect(vi.mocked(checkHeld)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkHeld).mock.calls[0]![4]).toEqual({ on: 'p1\nc1' });
    expect(patches).toBe(1);
  });
});
