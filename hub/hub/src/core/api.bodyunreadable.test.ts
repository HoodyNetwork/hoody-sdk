// A sent change whose answer body cannot be read is pending, never definite and never done: the status line arrived but
// what the server said did not (a body cut off, or not the JSON the API sends). A 409 whose code was lost may be a
// still-running answer; a 2xx whose body was lost may carry what the caller needs to tell what happened.
// A body the API sends empty on purpose (204, or an empty 2xx) stays done.
import { beforeEach, describe, expect, it } from 'vitest';
import { api, outcomeOf, type HubError } from './api';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1 } from './test/env';

const startContainer = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const outcome = (p: Promise<unknown>) => p.then(() => 'done', (e: HubError) => e);

beforeEach(() => boot({ realm: R1 }));

describe('a change whose answer body cannot be read', () => {
  for (const [what, status, text] of [
    ['a 409 whose body is not JSON', 409, '<html>gateway</html>'],
    ['a 409 whose body was cut off', 409, '{"error":"KVM_CHANGE_TIM'],
    ['a 200 whose body was cut off', 200, '{"data":{"id":'],
    ['a 200 whose body is not JSON', 200, 'ok'],
  ] as const) {
    it(`${what} is pending`, async () => {
      onFetch(() => ({ status, text }));
      const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
      expect(e, 'not done').not.toBe('done');
      expect(outcomeOf(e)).toBe('pending');
      expect(calls.length, 'sent once, never again').toBe(1);
    });
  }
});

describe('controls', () => {
  it('a 204 is done', async () => {
    onFetch(() => ({ status: 204 }));
    expect(await outcome(api(startContainer, { params: { id: 'c1' } }))).toBe('done');
  });
  it('an empty 200 is done', async () => {
    onFetch(() => ({ status: 200, text: '' }));
    expect(await outcome(api(startContainer, { params: { id: 'c1' } }))).toBe('done');
  });
  it('a 409 with its JSON body stays definite', async () => {
    onFetch(() => ({ status: 409, body: { error: 'CONFLICT', message: 'x' } }));
    const e = await outcome(api(startContainer, { params: { id: 'c1' } }));
    expect(outcomeOf(e)).not.toBe('pending');
  });
});
