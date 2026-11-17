// Vitest: every agent call names its computer, and the New Bot flow (Bot, link, first key) sends each
// step once: an unknown step is never sent again, and a link that was not made says so.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROVES, ROUTES, botCall, computerTarget, createBotFlow, guardrailsFlow, readsOf, registerTargets, stopDelegateCall, type NewBotVars } from './data';

const vars: NewBotVars = { name: 'Support', computerId: 'c-atlas', model: 'hoody-ai/hoody-free', instructions: '', withLink: true, label: 'support', yolo: true };
const bot = { id: 'support', realm: 'global', uid: 'u-1' };
const link = { data: { id: 'l-1', label: 'support', url: 'https://x.example/', status: 'active', keys: [] } };
const key = { data: { key: { id: 'k-1', name: 'default' }, secret: 'sk-secret-1', curl: '' } };
let sent: string[];
let targets: Array<FixtureRequest['target']>;

function boot(o: { link?: Parameters<typeof reply>[1]; key?: Parameters<typeof reply>[1] } = {}) {
  sent = [];
  targets = [];
  const rec = (name: string, answer: Parameters<typeof reply>[1]) =>
    reply(ROUTES[name as 'create'], (req) => {
      sent.push(name);
      targets.push(req.target);
      return typeof answer === 'function' ? answer(req) : answer;
    });
  bootFixtureCore({
    rules: [rec('create', answers.ok(bot)), rec('urlCreate', o.link ?? answers.ok(link)), rec('keyCreate', o.key ?? answers.ok(key))],
  });
}

describe('calls name their computer', () => {
  beforeEach(() => registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]));

  it('a Bot call carries the address of its own computer', () => {
    expect(botCall('c-atlas~global~chief').target).toEqual({ project: { id: 'p-1' }, container: { id: 'c-atlas', server_name: 'atlas-srv' } });
  });

  it('an unknown computer gets no server, so the call has no address and cannot reach another computer', () => {
    const t = botCall('c-ghost~global~chief').target;
    expect(t.container.id).toBe('c-ghost');
    expect(t.container.server_name).toBeUndefined();
    expect(computerTarget('').container.server_name).toBeUndefined();
  });

  it('a Bot of a computer with no known address is refused and nothing is sent', async () => {
    boot();
    await expect(createBotFlow({ ...vars, computerId: 'c-ghost' })).rejects.toBeDefined();
    expect(sent).toEqual([]);
  });

  it('creating a Bot is sent to the chosen computer', async () => {
    boot();
    await createBotFlow({ ...vars, withLink: false });
    expect(targets[0]?.container.id).toBe('c-atlas');
  });
});

describe('the New Bot flow', () => {
  beforeEach(() => registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]));

  it('makes the Bot, the link, then the key, once each, and hands back the secret', async () => {
    boot();
    const r = await createBotFlow(vars);
    expect(sent).toEqual(['create', 'urlCreate', 'keyCreate']);
    expect(r).toMatchObject({ state: 'done', botKey: 'c-atlas~global~support', secret: 'sk-secret-1' });
  });

  it('without a link it stops after the Bot', async () => {
    boot();
    expect((await createBotFlow({ ...vars, withLink: false })).state).toBe('done');
    expect(sent).toEqual(['create']);
  });

  it('a link whose answer was lost is unknown: nothing more is sent, the key is not tried', async () => {
    boot({ link: answers.lost() });
    const r = await createBotFlow(vars);
    expect(r.state).toBe('linkmaybe');
    expect(r.botKey).toBe('c-atlas~global~support');
    expect(sent).toEqual(['create', 'urlCreate']);
  });

  it('a refused link says it was not made and sends no key', async () => {
    boot({ link: answers.refused(422, 'bad_label') });
    const r = await createBotFlow(vars);
    expect(r.state).toBe('nolink');
    expect(sent).toEqual(['create', 'urlCreate']);
  });

  it('a key whose answer was lost is unknown and is not sent again', async () => {
    boot({ key: answers.lost() });
    const r = await createBotFlow(vars);
    expect(r.state).toBe('keyunknown');
    expect(r.link?.id).toBe('l-1');
    expect(r.secret).toBeNull();
    expect(sent).toEqual(['create', 'urlCreate', 'keyCreate']);
  });

  it('a refused key keeps the link and says no key was made', async () => {
    boot({ key: answers.refused(422, 'bad_name') });
    expect((await createBotFlow(vars)).state).toBe('nokey');
  });

  it('a 409 other than the name refusal (a held server) made no key: "no key", never "a key of this name exists"', async () => {
    boot({ key: answers.refused(409, 'SUBSERVER_DORMANT') });
    const r = await createBotFlow(vars);
    expect(r.state).toBe('nokey');
    expect(r.link?.id).toBe('l-1');
  });

  it('the name refusal is "a key of this name exists"', async () => {
    boot({ key: answers.refused(409, 'BOT_KEY_NAME_TAKEN') });
    expect((await createBotFlow(vars)).state).toBe('exists');
  });
});

describe('the other Bot calls', () => {
  const seen: Array<{ name: string; req: FixtureRequest }> = [];
  beforeEach(() => {
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }, { id: 'c-cinder', project_id: 'p-1', server_name: 'cinder-srv' }]);
    seen.length = 0;
    const rec = (name: string, answer: Parameters<typeof reply>[1]) =>
      reply(ROUTES[name as 'create'], (req) => {
        seen.push({ name, req });
        return typeof answer === 'function' ? answer(req) : answer;
      });
    bootFixtureCore({
      rules: [rec('patch', answers.ok({ revision: 8 })), rec('guardrails', answers.ok({ revision: 9 })), rec('stopDelegate', answers.ok({})), rec('urlCreate', answers.ok(link)), rec('create', answers.ok(bot)), rec('keyCreate', answers.ok(key))],
    });
  });

  it('Stop task goes to the Bot\'s own computer', async () => {
    await stopDelegateCall({ botKey: 'c-cinder~global~chief', sessionId: 's-1', close: false }, 'k-1');
    expect(seen[0]?.req.target?.container.id).toBe('c-cinder');
  });

  it('the rules are saved with the revision the first save answered with', async () => {
    const r = await guardrailsFlow({ botKey: 'c-atlas~global~chief', uid: 'u-1', revision: 7, patch: { guardrail_check: 'strict' }, rules: ['no deploys'] });
    expect(r.rules).toBe('saved');
    expect(seen.map((s) => s.name)).toEqual(['patch', 'guardrails']);
    expect(seen[0]?.req.query.expect_revision).toBe('7');
    expect(seen[1]?.req.query.expect_revision).toBe('8');
    // The form's fence follows the revision the rules answered with (our own last write).
    expect(r.revision).toBe(9);
  });

  it('a rules answer without a revision leaves the fence where it was', async () => {
    bootFixtureCore({ rules: [reply(ROUTES.patch, answers.ok({ revision: 8 })), reply(ROUTES.guardrails, answers.ok({}))] });
    const r = await guardrailsFlow({ botKey: 'c-atlas~global~chief', uid: 'u-1', revision: 7, patch: {}, rules: [] });
    expect(r).toEqual({ rules: 'saved' });
  });

  it('a refused rules save is reported as not saved, after the mode was', async () => {
    seen.length = 0;
    bootFixtureCore({ rules: [reply(ROUTES.patch, answers.ok({ revision: 8 })), reply(ROUTES.guardrails, answers.refused(400, 'bad_request'))] });
    const r = await guardrailsFlow({ botKey: 'c-atlas~global~chief', uid: 'u-1', revision: 7, patch: {}, rules: [] });
    expect(r.rules).toBe('failed');
    // The retry of a half-saved section is based on the revision the PATCH answered.
    expect(r.revision).toBe(8);
  });

  // forms-required: the one refusal of the rules write that names its field (the Bot's card would be too long) is told apart,
  // so the form can say "too long" instead of "save again" (the same rules are refused again).
  it('rules the agent refuses as too long (400 bad_request, field guardrails) are reported as too long, after the mode was', async () => {
    seen.length = 0;
    bootFixtureCore({ rules: [reply(ROUTES.patch, answers.ok({ revision: 8 })), reply(ROUTES.guardrails, { status: 400, body: { code: 'bad_request', details: { field: 'guardrails' } } } as ReturnType<typeof answers.refused>)] });
    const r = await guardrailsFlow({ botKey: 'c-atlas~global~chief', uid: 'u-1', revision: 7, patch: {}, rules: ['x'] });
    expect(r.rules).toBe('too_long');
    expect(r.revision).toBe(8);
  });

  // The rules write's refusal of the fence keeps its code: a write since the PATCH is 'stale', another Bot under the id is 'gone'.
  it.each([
    ['revision_mismatch', 'stale'],
    ['bot_changed', 'gone'],
  ] as const)('a rules save refused 412 %s after the mode saved reads as %s', async (refused, as) => {
    bootFixtureCore({ rules: [reply(ROUTES.patch, answers.ok({ revision: 8 })), reply(ROUTES.guardrails, answers.refused(412, refused))] });
    const r = await guardrailsFlow({ botKey: 'c-atlas~global~chief', uid: 'u-1', revision: 7, patch: {}, rules: [] });
    expect(r).toEqual({ rules: as, revision: 8 });
  });

  it('a new Bot is created with Auto-approve as chosen: On by default, Off when the person turned it off', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    bootFixtureCore({ rules: [reply(ROUTES.create, (req) => { bodies.push(req.body as Record<string, unknown>); return answers.ok(bot); })] });
    await createBotFlow({ ...vars, withLink: false });
    await createBotFlow({ ...vars, withLink: false, yolo: false });
    expect(bodies.map((b) => b.yolo)).toEqual([true, false]);
  });

  it('a link without a label sends none, so the platform picks one', async () => {
    await createBotFlow({ ...vars, label: '' });
    const made = seen.find((s) => s.name === 'urlCreate');
    expect((made?.req.body as Record<string, unknown>).label).toBeUndefined();
  });
});

describe('a change is released only by reads of its own computer', () => {
  const key = (name: string, target: [string, string] | null): readonly unknown[] => ['hub', 'acct', 'global', 1, 'src', 'bots', name, null, target];

  it('a read of another computer does not count; the same computer, and a platform read, do', () => {
    const reads = readsOf(['view', 'computerBots'], 'c-atlas');
    expect(reads(key('computerBots', ['p-1', 'c-cinder']))).toBe(false);
    expect(reads(key('computerBots', ['p-1', 'c-atlas']))).toBe(true);
    expect(reads(key('view', ['p-1', 'c-atlas']))).toBe(true);
    expect(reads(key('view', null))).toBe(true);
    expect(reads(key('models', null))).toBe(false);
  });

  it('without a computer every computer counts', () => {
    expect(readsOf(['computerBots'])(key('computerBots', ['p-1', 'c-cinder']))).toBe(true);
  });
});

describe('what a fresh read proves about a gate decision', () => {
  const id = { gate: 'g1', generation: 2, botKey: 'c-atlas~r~chief' };
  const view = (gate: { id: string; generation: number } | null) => [[{ 'c-atlas~r~chief': { gate } }]];
  it('proves it applied once the Bot no longer shows that gate', () => {
    expect(PROVES.decideGate?.(id, view(null))).toBe('applied');
    expect(PROVES.decideGate?.(id, view({ id: 'g2', generation: 1 }))).toBe('applied');
  });
  it('proves nothing while the same gate still shows, or with no view read', () => {
    expect(PROVES.decideGate?.(id, view({ id: 'g1', generation: 2 }))).toBeUndefined();
    expect(PROVES.decideGate?.(id, [[]])).toBeUndefined();
  });
});
