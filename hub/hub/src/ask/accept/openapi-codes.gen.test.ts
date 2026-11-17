// hub/scripts/openapi-codes-gen.ts and src/ask/accept/agent-codes.json. The scan is pure and tested on a small spec; the committed
// file must equal a fresh run on the pinned agent openapi, the file HOODY_AGENT_OPENAPI names (the agent's
// own openapi.json from the agent's generated output). Without it the drift check is skipped, by name.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODES_FILE, JOURNALED_OPS, codesOf, render, scanCodes, sha256 } from '../../../scripts/openapi-codes-gen';

const op = (operationId: string, extra: Record<string, unknown> = {}) => ({ operationId, summary: 'Does a thing', ...extra });
const spec = (extra: Record<string, unknown> = {}) => ({
  paths: {
    '/api/v1/agent/sessions': { post: op('createSession', { description: 'Refused with computer_conflict or realm_blocked; see also session_id.', responses: { 409: { description: 'computer_gone' } } }) },
    '/api/v1/agent/sessions/{id}/turns': { post: op('createSessionTurn', { description: 'session_busy' }) },
    '/api/v1/agent/sessions/{id}/commands': { post: op('postSessionCommand') },
    '/api/v1/agent/sessions/{id}/confirm': { post: op('confirmGate', { description: 'forbidden and not_found' }) },
    '/api/v1/agent/sessions/{id}/answer': { post: op('answerQuestion') },
    ...extra,
  },
});

describe('openapi-codes-gen: the scan', () => {
  it('lists the snake_case tokens of the operation, sorted and once, and never a word without an underscore', () => {
    const f = scanCodes(spec(), 'a'.repeat(64));
    expect(f.ops.create).toEqual({ operationId: 'createSession', codes: ['computer_conflict', 'computer_gone', 'realm_blocked', 'session_id'] });
    expect(f.ops.confirm!.codes).toEqual(['not_found']);
    expect(Object.keys(f.ops)).toEqual(Object.keys(JOURNALED_OPS));
    expect(codesOf({ a: 'x_y x_y Z_y 9_a ab' })).toEqual(['x_y']);
  });
  it('names itself and the input in _about, and two runs give identical bytes', () => {
    const a = render(scanCodes(spec(), sha256('input')));
    expect(a).toBe(render(scanCodes(spec(), sha256('input'))));
    expect(JSON.parse(a)._about).toContain('hub/scripts/openapi-codes-gen.ts');
    expect(JSON.parse(a)._about).toContain(sha256('input'));
  });
  it('fails closed on a missing operation or one operationId on two paths', () => {
    const { paths } = spec();
    const { ['/api/v1/agent/sessions/{id}/answer']: _gone, ...rest } = paths;
    expect(() => scanCodes({ paths: rest }, 'x')).toThrow(/answerQuestion.*missing/);
    expect(() => scanCodes(spec({ '/dup': { post: op('answerQuestion') } }), 'x')).toThrow(/several paths/);
    expect(() => scanCodes({}, 'x')).toThrow(/no paths/);
  });
});

const pinned = process.env.HOODY_AGENT_OPENAPI ?? '';
describe('src/ask/accept/agent-codes.json is current', () => {
  it.skipIf(!pinned || !existsSync(pinned))('equals a fresh run on the pinned agent openapi', () => {
    const bytes = readFileSync(pinned);
    const fresh = render(scanCodes(JSON.parse(bytes.toString('utf8')), sha256(bytes)));
    expect(readFileSync(CODES_FILE, 'utf8') === fresh, 'agent-codes.json is stale: run bun hub/scripts/openapi-codes-gen.ts <agent openapi.json>').toBe(true);
  });
  it('has the five journaled routes', () => {
    const f = JSON.parse(readFileSync(CODES_FILE, 'utf8')) as { ops: Record<string, { operationId: string }> };
    expect(Object.fromEntries(Object.entries(f.ops).map(([k, v]) => [k, v.operationId]))).toEqual(JOURNALED_OPS);
  });
});
