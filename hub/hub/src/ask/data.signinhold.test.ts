// The Ask dock reads the agent's status through its own route (liveIO authStatus). A sign-in that ended unknown holds its
// computer in core (agent-signin.ts) until a status read ends the hold; the dock's read counts as Check again's does, so a
// ready answer there ends the hold for every place, and a signed-out answer read at once keeps it.
import { capture, signInAgent, signInUnsure } from '@core';
import { resetAgentSignIn } from '@core/agent-signin';
import { resetBootToken } from '@core/boot-token';
import { AGENT, boot, calls, onFetch, TARGET, UID, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveIO } from './data';

type G = { HubBootToken?: unknown };
const KEY = 'hdy_' + 'k'.repeat(40);
const READY = { auth_active: true, account_id: UID, owner_fingerprint: 'fp1', restriction: 'none' };
const OUT = { auth_active: false };
const isBoot = (c: Call) => c.url.startsWith(`${AGENT}/hoody/auth/bootstrap`);
const isStatus = (c: Call) => c.url.startsWith(`${AGENT}/hoody/auth/status`);
let status: unknown = OUT;

beforeEach(async () => {
  boot();
  resetAgentSignIn(5);
  (globalThis as G).HubBootToken = { ensure: async () => ({ token: KEY, state: 'ok' }) };
  status = OUT;
  onFetch((c): Reply => {
    if (isBoot(c)) return { status: 0, network: true };
    if (isStatus(c)) return { status: 200, body: status };
    return { status: 200, body: { data: {} } };
  });
  // The bootstrap's answer is lost and every proof read says signed out: unknown, and core holds the computer.
  expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
  expect(signInUnsure(capture(), TARGET)).toBe(true);
});
afterEach(() => { delete (globalThis as G).HubBootToken; resetBootToken(); resetAgentSignIn(); });

describe("the Ask dock's own status read counts for core's sign-in hold", () => {
  it('ready: the hold ends for every place, and nothing more is sent', async () => {
    status = READY;
    expect(await liveIO(TARGET).authStatus()).toEqual(READY);
    expect(signInUnsure(capture(), TARGET)).toBe(false);
    expect(calls.filter(isBoot)).toHaveLength(1);
  });

  it('signed out, read at once: the hold stays (the sign-in may still land)', async () => {
    expect(await liveIO(TARGET).authStatus()).toEqual(OUT);
    expect(signInUnsure(capture(), TARGET)).toBe(true);
  });
});
