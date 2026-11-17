// Vitest: which realm a new Bot is made in. With All realms selected the create cannot name `all` (no
// Bot lives there, core refuses it unsent): it makes a Global Bot (realm=global), which any computer can hold, one in no
// realm too. With one realm selected the Bot is made in that realm, as before.
import { AGENT, R1, TARGET, boot, calls, onFetch } from '@core/test/env';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBotFlow, newBotRealm, registerTargets, type NewBotVars } from './data';

const vars: NewBotVars = { name: 'Support', computerId: 'c1', model: 'hoody-ai/hoody-free', instructions: '', withLink: false, label: '', yolo: true };
const made = (realm: string) => ({ status: 200, body: { id: 'support', realm, uid: 'u-1' } });

describe('New Bot: the realm it is made in', () => {
  beforeEach(() => registerTargets([{ id: 'c1', project_id: TARGET.project.id, server_name: TARGET.container.server_name ?? '' }]));

  it('with All realms selected the create is sent once, as a Global Bot', async () => {
    boot({ realm: 'all' });
    onFetch(() => made('global'));
    const r = await createBotFlow(vars);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${AGENT}/bots?realm=global`]);
    expect(r).toMatchObject({ state: 'done', botKey: 'c1~global~support' });
  });

  it('with one realm selected the Bot is made in that realm', async () => {
    boot({ realm: R1 });
    onFetch(() => made(R1));
    const r = await createBotFlow(vars);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${AGENT}/bots?realm=${R1}`]);
    expect(r.botKey).toBe(`c1~${R1}~support`);
  });

  it("with All realms and a link, the Global Bot's link and key go to the base host (a Global Bot URL is base only)", async () => {
    boot({ realm: 'all' });
    onFetch((c) =>
      c.url.startsWith(AGENT) ? made('global')
      : c.url.endsWith('/bot-urls') ? { status: 201, body: { data: { id: 'l-1', label: 'support', url: 'https://x.example/', status: 'active', keys: [] } } }
      : { status: 201, body: { data: { key: { id: 'k-1', name: 'default' }, secret: 'sk-secret-1', curl: '' } } });
    const r = await createBotFlow({ ...vars, withLink: true, label: 'support' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${AGENT}/bots?realm=global`, 'POST /api/v1/bot-urls', 'POST /api/v1/bot-urls/l-1/keys']);
    expect(calls[1]?.body).toMatchObject({ computer_id: 'c1', bot: { realm: 'global', id: 'support', uid: 'u-1' } });
    expect(r).toMatchObject({ state: 'done', secret: 'sk-secret-1' });
  });

  it('the rule: All realms names Global; one realm is left to the call (the captured realm)', () => {
    expect(newBotRealm('all')).toBe('global');
    expect(newBotRealm(R1)).toBeUndefined();
  });
});
