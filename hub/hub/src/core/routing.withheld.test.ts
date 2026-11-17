// Once the latest accepted computer row withholds server_name,
// no new request goes to the server a target was frozen with; a row naming another server sends new requests there only.
// A failed or partial read changes nothing, a request already out finishes, and the same target works again once a row
// names its server. The evidence is the account's, and the current target follows its own row.
import { beforeEach, describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { computerChoiceRev, noteComputerRows } from './computer';
import { bump, snapshot } from './ctx';
import { stream } from './kit-io';
import { defineRoute } from './routes';
import { routingAllows, routingOf } from './routing';
import { boot, calls, deferred, onFetch, OTHER, R1, settle, TARGET, UID } from './test/env';

const health = defineRoute({ method: 'GET', path: '/health', scope: 'agent', realm: 'none' });
const turn = defineRoute<unknown, { text: string }>({ method: 'POST', path: '/sessions/:id/turns', scope: 'agent', idem: true, body: ['text'] });
const kitRead = defineRoute({ method: 'GET', path: '/x', scope: 'kit', kit: 'egress', index: 1 });
const bots = defineRoute({ method: 'GET', path: '/bots', scope: 'agent' });
const events = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', stream: { id: 2097152, noId: 262144 }, maxBytes: 67108864 });

const X = TARGET.container.server_name!; // 'sv1'
const Y = 'sv2';
const C = TARGET.container.id;
const onX = TARGET;
const onY = { project: TARGET.project, container: { id: C, server_name: Y } };
const row = (server_name: unknown) => ({ id: C, project_id: TARGET.project.id, server_name });
const outcome = (p: Promise<unknown>): Promise<HubError | 'ok'> => p.then(() => 'ok' as const, (e: HubError) => e);
const say = (name: string) => noteComputerRows(UID, [row(name)]);

beforeEach(() => { boot(); });

describe('a row that withholds server_name suspends new requests to the frozen server', () => {
  for (const [label, withheld] of [['null', null], ['missing', undefined], ['empty', ''], ['not a string', 42]] as const) {
    it(`server_name ${label}: an agent call on the old target is refused unsent, nothing goes out`, async () => {
      say(X);
      expect(await outcome(api(health, { target: onX }))).toBe('ok');
      expect(calls.length).toBe(1);
      noteComputerRows(UID, [withheld === undefined ? { id: C } : row(withheld)]);
      const e = await outcome(api(health, { target: onX }));
      expect(e).toMatchObject({ notSent: true, code: 'NO_AGENT_URL' });
      expect(calls.length, 'zero new requests to X').toBe(1);
    });
  }

  it('a change, a kit call and a stream (with its reconnects) are refused too', async () => {
    say(X);
    const turnCall = () => api(turn, { target: onX, params: { id: 's1' }, body: { text: 'hi' }, idem: 'k-1', realm: R1 });
    const open = () => stream(events, { target: onX, params: { id: 's1' }, realm: R1, onEvent: () => {} });
    // Admitted on X first, so the refusals below are the row's, not a malformed call's.
    expect(await outcome(turnCall())).toBe('ok');
    expect(await outcome(api(kitRead, { target: onX }))).toBe('ok');
    const s0 = open();
    expect(s0.refused).toBeUndefined();
    s0.close();
    await settle();
    const before = calls.length;
    noteComputerRows(UID, [row(null)]);
    expect(await outcome(turnCall())).toMatchObject({ notSent: true, code: 'NO_AGENT_URL' });
    expect(await outcome(api(kitRead, { target: onX }))).toMatchObject({ notSent: true, code: 'NO_KIT_URL' });
    const s = open();
    expect(s.refused).toBe('NO_AGENT_URL');
    s.close();
    expect(calls.length).toBe(before);
  });

  it('a request already out across the withholding row finishes with its own answer', async () => {
    say(X);
    const d = deferred<void>();
    onFetch(async () => { await d.p; return { status: 200, body: { ok: true } }; });
    const p = outcome(api(health, { target: onX }));
    await settle(3);
    noteComputerRows(UID, [row(null)]);
    d.res();
    expect(await p).toBe('ok');
    expect(calls.length).toBe(1);
  });

  it('the same target works again once a row names the server again; nothing is resent on its own', async () => {
    say(X);
    noteComputerRows(UID, [row(null)]);
    await outcome(api(health, { target: onX }));
    expect(calls.length).toBe(0);
    say(X);
    await settle();
    expect(calls.length, 'no request was queued and replayed').toBe(0);
    expect(await outcome(api(health, { target: onX }))).toBe('ok');
    expect(calls.length).toBe(1);
  });
});

describe('a second request of one call', () => {
  for (const [label, next] of [['withheld', null], ['moved', Y]] as const) {
    it(`${label} while GET /bots?realm=all is out: its 400 realm_scope_unsupported sends no fallback to X`, async () => {
      say(X);
      const d = deferred<void>();
      onFetch(async () => { await d.p; return { status: 400, body: { code: 'realm_scope_unsupported' } }; });
      const p = outcome(api(bots, { target: onX, realm: 'all' }));
      await settle(3);
      expect(calls.length).toBe(1);
      noteComputerRows(UID, [row(next)]);
      d.res();
      // The first request's own answer stands: sent and answered, never shown as not sent.
      const e = await p;
      expect(e).toMatchObject({ code: 'realm_scope_unsupported' });
      expect((e as HubError).notSent).toBeFalsy();
      await settle();
      expect(calls.length, 'only the original request reached X').toBe(1);
    });
  }
  it('control: with X still named, the fallback goes out', async () => {
    say(X);
    let n = 0;
    onFetch(() => (n++ === 0 ? { status: 400, body: { code: 'realm_scope_unsupported' } } : { status: 200, body: { data: [] } }));
    expect(await outcome(api(bots, { target: onX, realm: 'all' }))).toBe('ok');
    expect(calls.length).toBe(2);
  });
});

describe('what is not a replacement row', () => {
  it('no read (or a failed one, which notes nothing) keeps the frozen server usable', async () => {
    expect(routingOf(C)).toBeNull();
    expect(await outcome(api(health, { target: onX }))).toBe('ok');
    say(X);
    expect(await outcome(api(health, { target: onX }))).toBe('ok');
  });

  it('a list that does not hold the computer keeps the last row', async () => {
    say(X);
    noteComputerRows(UID, [{ id: 'other-computer', server_name: null }]);
    expect(routingAllows(C, X)).toBe(true);
    noteComputerRows(UID, [row(null)]);
    noteComputerRows(UID, [{ id: 'other-computer', server_name: 'sv9' }]);
    expect(routingAllows(C, X), 'still withheld').toBe(false);
  });
});

describe('a row naming another server', () => {
  it('new requests go to the new server only; the frozen old target is refused', async () => {
    say(X);
    say(Y);
    expect(await outcome(api(health, { target: onX }))).toMatchObject({ notSent: true, code: 'NO_AGENT_URL' });
    expect(calls.length).toBe(0);
    expect(await outcome(api(health, { target: onY }))).toBe('ok');
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toContain(`.${Y}.`);
  });
});

describe('scoped to the account', () => {
  it("another account's row never suspends this account's requests", async () => {
    noteComputerRows(OTHER, [row(null)]);
    expect(await outcome(api(health, { target: onX }))).toBe('ok');
  });

  it('an account change (or sign-out) drops the evidence; a realm switch keeps it', () => {
    noteComputerRows(UID, [row(null)]);
    bump('switch');
    expect(routingOf(C), 'kept across a realm switch').toBe('');
    bump('account');
    expect(routingOf(C), 'dropped').toBeNull();
  });
});

describe('the current target follows its own row', () => {
  it('withheld: the target names no server (no address); named again: it does; no choice moves', () => {
    const rev = computerChoiceRev();
    noteComputerRows(UID, [row(null)]);
    expect(snapshot().target).toEqual({ project: TARGET.project, container: { id: C } });
    noteComputerRows(UID, [row(X)]);
    expect(snapshot().target).toEqual(TARGET);
    noteComputerRows(UID, [row(Y)]);
    expect(snapshot().target?.container.server_name).toBe(Y);
    expect(computerChoiceRev(), 'not a person\'s choice').toBe(rev);
  });

  it('a target with no server takes the server once its row names it (the "Send disabled" case)', () => {
    boot({ target: { project: TARGET.project, container: { id: C } } });
    noteComputerRows(UID, [row(X)]);
    expect(snapshot().target).toEqual(TARGET);
  });

  it('a read that does not hold the target, or another account\'s read, leaves it as it is', () => {
    noteComputerRows(UID, [{ id: 'other-computer', server_name: null }]);
    noteComputerRows(OTHER, [row(null)]);
    expect(snapshot().target).toEqual(TARGET);
  });
});
