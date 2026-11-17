// Vitest: a session signed in with an access key for all realms. It has no realm menu, and its agent
// calls name the realm they ask for (core/kit.ts agentRealm: only a key pinned to one realm overrides it). Each per-Bot
// call names the Bot row's own realm (botCall), so a Bot of any realm, Global included, can be opened and changed; a new
// Bot is a Global Bot, as in All realms with the account.
import { afterEach, describe, expect, it } from 'vitest';
import { api } from '@core';
import { bootLive, configureLifecycle, initLive } from '@core/lifecycle';
import { AGENT, R1, R2, TARGET, UID, boot, calls, onFetch, type Call, type Reply } from '@core/test/env';
import { removeTestLocks } from '@core/test/locks';
import { resetToken } from '@core/token';
import { botCall, createBotFlow, registerTargets, ROUTES, type NewBotVars } from './data';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const PERMS = { computers: { read: true }, projects: { read: true } };
const vars: NewBotVars = { name: 'Support', computerId: 'c1', model: 'hoody-ai/hoody-free', instructions: '', withLink: false, label: '', yolo: true };
const agentCalls = () => calls.filter((c) => c.url.startsWith(AGENT)).map((c) => `${c.method} ${c.url}`);

/** A token page pinned to `pin` ('all': a key for every realm and none), booted as the live page boots it; `agent`
 *  answers the agent calls. */
async function tokenTab(pin: string, agent: (c: Call) => Reply = () => ({ status: 200, body: {} })) {
  const record = JSON.stringify({ v: 1, token: TOKEN, realm: pin, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
  boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record } });
  resetToken();
  configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  const token = pin === 'all' ? { realm_ids: [], allow_no_realm: true } : { realm_ids: [pin], allow_no_realm: false };
  onFetch((c) =>
    c.url.endsWith('/api/v1/auth/tokens/me') ? { status: 200, body: { data: { token: { id: 'tok1', alias: 'shared-1', ...token, permissions: PERMS, expires_at: null } } } }
    : c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, username: 'owner' } } }
    : c.url.startsWith(AGENT) ? agent(c)
    : { status: 200, body: { data: [] } });
  await bootLive();
  registerTargets([{ id: 'c1', project_id: TARGET.project.id, server_name: TARGET.container.server_name ?? '' }]);
}

afterEach(() => { resetToken(); removeTestLocks(); });

describe('an access key for all realms: per-Bot calls name the row realm', () => {
  it("reading a Bot names its own realm: one realm's Bot and a Global Bot", async () => {
    await tokenTab('all');
    await api(ROUTES.get, botCall(`c1~${R1}~support`));
    await api(ROUTES.get, botCall('c1~global~helper'));
    expect(agentCalls()).toEqual([`GET ${AGENT}/bots/support?realm=${R1}`, `GET ${AGENT}/bots/helper?realm=global`]);
  });

  it('a change to a Bot (delete) names its own realm too', async () => {
    await tokenTab('all');
    await api(ROUTES.remove, { ...botCall(`c1~${R2}~support`), query: { expect_uid: 'u-1' } });
    expect(agentCalls()).toHaveLength(1);
    expect(agentCalls()[0]).toMatch(new RegExp(`^DELETE ${AGENT}/bots/support\\?`));
    expect(agentCalls()[0]).toContain(`realm=${R2}`);
  });

  it('a new Bot is made as a Global Bot', async () => {
    await tokenTab('all', () => ({ status: 200, body: { id: 'support', realm: 'global', uid: 'u-1' } }));
    const r = await createBotFlow(vars);
    expect(agentCalls()).toEqual([`POST ${AGENT}/bots?realm=global`]);
    expect(r).toMatchObject({ state: 'done', botKey: 'c1~global~support' });
  });

  it('a key pinned to one realm still sends its own realm, whatever the row names', async () => {
    await tokenTab(R1);
    await api(ROUTES.get, botCall(`c1~${R2}~support`));
    expect(agentCalls()).toEqual([`GET ${AGENT}/bots/support?realm=${R1}`]);
  });
});
