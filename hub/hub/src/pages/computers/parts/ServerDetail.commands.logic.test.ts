// The server control commands' reading of the API: which are harmless readings, which are warned, what a form can ask
// for, what a run sends, and the identity a held run keeps (names only, no automatic proof).
import { describe, expect, it } from 'vitest';
import { commandsOf, fieldsOf, identityOf, paramsOf, refusalOf, requestBody, resultOf, spanParts, waitParts } from './ServerDetail.commands.logic';

const ID = (n: number) => String(n).repeat(24).slice(0, 24);
const cmd = (o: Record<string, unknown> = {}) => ({ id: ID(1), name: 'Uptime', slug: 'check-uptime', description: 'Get uptime', risk_level: 'low', requires_confirmation: false, parameter_schema: null, ...o });
const list = (commands: unknown[], info: Record<string, unknown> = { id: ID(9), name: 'node-7', is_ready: true, rental_status: 'active' }) => ({ data: { commands, server_info: info } });

describe('commandsOf', () => {
  it('a low-risk command that asks for no confirmation is a harmless reading; every other one is warned', () => {
    const l = commandsOf(
      list([cmd(), cmd({ id: ID(2), slug: 'kexec-reboot', name: 'Reboot', risk_level: 'critical', requires_confirmation: true }), cmd({ id: ID(3), slug: 'x', risk_level: 'low', requires_confirmation: true }), cmd({ id: ID(4), slug: 'y', risk_level: undefined, requires_confirmation: undefined })]),
    );
    expect(l?.commands.map((c) => [c.slug, c.readOnly])).toEqual([
      ['check-uptime', true],
      ['kexec-reboot', false],
      ['x', false],
      ['y', false],
    ]);
    expect(l).toMatchObject({ ready: true, active: true });
  });
  it('says nothing about readiness the API did not say', () => {
    expect(commandsOf({ data: { commands: [] } })).toEqual({ ready: null, active: null, commands: [] });
    expect(commandsOf(list([], { is_ready: false, rental_status: 'hold' }))).toMatchObject({ ready: false, active: false });
  });
  it('an answer that is not a list, and rows without a real id or slug, are not commands', () => {
    expect(commandsOf({ data: {} })).toBeNull();
    expect(commandsOf(null)).toBeNull();
    expect(commandsOf(list([{ slug: 'a' }, cmd({ id: 'nope' }), cmd({ slug: '' }), 5, cmd()]))?.commands).toHaveLength(1);
  });
  it('leaves out a command whose parameters the form cannot ask for', () => {
    const l = commandsOf(list([cmd({ parameter_schema: { type: 'object', properties: { a: { type: 'array' } } } }), cmd({ id: ID(2), slug: 'ok', parameter_schema: { type: 'object', properties: { svc: { type: 'string' } }, required: ['svc'] } })]));
    expect(l?.commands.map((c) => c.slug)).toEqual(['ok']);
  });
});

describe('fieldsOf and paramsOf', () => {
  it('no schema asks for nothing; text, number, switch and choice fields are asked for', () => {
    expect(fieldsOf(null)).toEqual([]);
    expect(fieldsOf({ type: 'object' })).toEqual([]);
    const f = fieldsOf({ type: 'object', properties: { s: { type: 'string' }, n: { type: 'integer' }, b: { type: 'boolean' }, c: { enum: ['a', 'b'] } }, required: ['s'] });
    expect(f?.map((x) => [x.name, x.kind, x.required])).toEqual([['s', 'text', true], ['n', 'number', false], ['b', 'boolean', false], ['c', 'choice', false]]);
  });
  it('a schema that requires what it does not describe, or describes an unknown type, is refused', () => {
    expect(fieldsOf({ type: 'object', required: ['x'] })).toBeNull();
    expect(fieldsOf({ type: 'object', properties: { x: { type: 'object' } } })).toBeNull();
    expect(fieldsOf('text')).toBeNull();
  });
  it('sends what was typed, trimmed and typed; a required field left empty or a number that is not one is missing', () => {
    const f = fieldsOf({ type: 'object', properties: { s: { type: 'string' }, n: { type: 'number' }, b: { type: 'boolean' }, c: { enum: ['a', 'b'] } }, required: ['s', 'n'] }) ?? [];
    expect(paramsOf(f, { s: ' hi ', n: '3', b: true, c: 'a' })).toEqual({ params: { s: 'hi', n: 3, b: true, c: 'a' }, missing: [] });
    expect(paramsOf(f, { s: '', n: 'x', c: 'zzz' })).toEqual({ params: { b: false }, missing: ['s', 'n', 'c'] });
  });
  it('an integer field does not accept a fraction, a number field does', () => {
    const f = fieldsOf({ type: 'object', properties: { i: { type: 'integer' }, n: { type: 'number' } } }) ?? [];
    expect(paramsOf(f, { i: '2', n: '1.5' })).toEqual({ params: { i: 2, n: 1.5 }, missing: [] });
    expect(paramsOf(f, { i: '1.5' }).missing).toEqual(['i']);
  });
});

describe('requestBody and resultOf', () => {
  it('a harmless reading waits for its output; anything else is accepted and left to run', () => {
    expect(requestBody({ id: ID(1), readOnly: true }, {})).toEqual({ command_id: ID(1), parameters: {}, wait: true });
    expect(requestBody({ id: ID(2), readOnly: false }, {})).toEqual({ command_id: ID(2), parameters: {}, wait: false });
  });
  it('reads the status, output and exit code of a waited run, and an accepted one by what was asked', () => {
    expect(resultOf({ data: { status: 'completed', output: '{"uptime_seconds": 5}', exit_code: 0 } }, true)).toEqual({ accepted: false, status: 'completed', output: '{"uptime_seconds": 5}', exitCode: 0 });
    expect(resultOf({ data: { status: 'pending', command_log_id: 'x' } }, false)).toEqual({ accepted: true, status: 'pending', output: '', exitCode: null });
    expect(resultOf({}, true)).toBeNull();
  });
});

describe('identityOf', () => {
  it('keeps the names that say which run is held and never the parameters', () => {
    const vars = { serverId: ID(1), rentalId: ID(2), serverName: 'node-7', commandId: ID(3), commandName: 'Reboot', slug: 'kexec-reboot', readOnly: false, params: { secret: 'x' } };
    const id = identityOf(vars);
    expect(id).toEqual({ serverId: ID(1), rentalId: ID(2), serverName: 'node-7', commandName: 'Reboot', slug: 'kexec-reboot', readOnly: false });
    expect(JSON.stringify(id)).not.toContain('secret');
  });
});

describe('refusalOf', () => {
  it('a 429 and the API\'s rate-limit codes are "too often", the cooldown and not-ready codes are their own, anything else is plain', () => {
    expect(refusalOf('Too Many Requests', 429)).toBe('limit');
    expect(refusalOf(undefined, 429)).toBe('limit');
    expect(refusalOf('SERVER_COMMAND_RATE_LIMITED', 409)).toBe('limit');
    expect(refusalOf('SERVER_COMMAND_COOLDOWN', 409)).toBe('cooldown');
    expect(refusalOf('SERVER_COMMAND_COOLDOWN', 429)).toBe('cooldown');
    expect(refusalOf('SERVER_NOT_READY', 409)).toBe('notReady');
    expect(refusalOf('Forbidden', 403)).toBe('generic');
    expect(refusalOf(undefined, undefined)).toBe('generic');
  });
});

describe('spanParts', () => {
  it('splits a stated span exactly, largest unit first, leaving out zero parts; anything but a whole number above zero is null', () => {
    expect(spanParts(600)).toEqual([{ unit: 'minutes', count: 10 }]);
    expect(spanParts(61)).toEqual([{ unit: 'minutes', count: 1 }, { unit: 'seconds', count: 1 }]);
    expect(spanParts(3661)).toEqual([{ unit: 'hours', count: 1 }, { unit: 'minutes', count: 1 }, { unit: 'seconds', count: 1 }]);
    expect(spanParts(90_000)).toEqual([{ unit: 'hours', count: 25 }]);
    expect(spanParts(59)).toEqual([{ unit: 'seconds', count: 59 }]);
    for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '60', null, undefined]) expect(spanParts(bad)).toBeNull();
  });
});

describe('waitParts', () => {
  it('rounds a named wait up to the unit it fills, so "try again in" is never early', () => {
    expect(waitParts(0)).toEqual({ unit: 'seconds', count: 1 });
    expect(waitParts(1)).toEqual({ unit: 'seconds', count: 1 });
    expect(waitParts(59.2)).toEqual({ unit: 'minutes', count: 1 });
    expect(waitParts(60)).toEqual({ unit: 'minutes', count: 1 });
    expect(waitParts(90)).toEqual({ unit: 'minutes', count: 2 });
    expect(waitParts(3599)).toEqual({ unit: 'minutes', count: 60 });
    expect(waitParts(3600)).toEqual({ unit: 'hours', count: 1 });
    expect(waitParts(5400)).toEqual({ unit: 'hours', count: 2 });
    expect(waitParts(86_400)).toEqual({ unit: 'hours', count: 24 });
  });
  it('a wait that is not a number, is negative or is over a day is not shown', () => {
    for (const v of [undefined, null, '90', NaN, Infinity, -1, 86_401]) expect(waitParts(v)).toBeNull();
  });
});

describe('cooldown of a command', () => {
  it('is the API\'s spacing between runs when it is a positive number, otherwise none', () => {
    const l = commandsOf(list([cmd({ cooldown_seconds: 300 }), cmd({ id: ID(2), slug: 'a', cooldown_seconds: 0 }), cmd({ id: ID(3), slug: 'b', cooldown_seconds: '5' }), cmd({ id: ID(4), slug: 'c' })]));
    expect(l?.commands.map((c) => c.cooldownS)).toEqual([300, null, null, null]);
  });
});

describe('commandsOf rate fields', () => {
  it('keeps a whole daily limit above zero and nothing else', () => {
    const l = commandsOf(list([cmd({ rate_limit_per_day: 1 }), cmd({ id: ID(2), slug: 'b', rate_limit_per_day: null }), cmd({ id: ID(3), slug: 'c', rate_limit_per_day: 0 }), cmd({ id: ID(4), slug: 'd', rate_limit_per_day: 2.5 }), cmd({ id: ID(5), slug: 'e', rate_limit_per_day: '3' }), cmd({ id: ID(6), slug: 'f' })]));
    expect(l?.commands.map((c) => c.perDay)).toEqual([1, null, null, null, null, null]);
  });
});
