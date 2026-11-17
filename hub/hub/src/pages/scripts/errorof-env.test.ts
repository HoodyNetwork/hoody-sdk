// Vitest: hoody-exec's refusals of an env update reach the page as their code. The route is secret
// (the value rides `set`), so its rejection is rebuilt from the route's listed codes: INVALID_ENV_KEY, INVALID_ENV_VALUE and
// ENV_LIMIT are listed, and still nothing else of the answer comes through (no message, no details: details.key is the
// typed name).
import { api, type HubError } from '@core';
import { boot, onFetch, R1, TARGET } from '@core/test/env';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

const outcome = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: HubError) => e);
const args = { index: 1, target: TARGET, body: { scriptPath: 'default/1/notes.ts', scope: 'script', set: { 'MY KEY': 'v' }, ifRevision: null, opId: 'c'.repeat(32) } };

describe('scripts env update: the kit\'s refusals of what was typed', () => {
  for (const [status, code] of [[400, 'INVALID_ENV_KEY'], [400, 'INVALID_ENV_VALUE'], [422, 'ENV_LIMIT']] as const) {
    it(`${status} with details.code ${code} is a definite refusal carrying the code, without details or message`, async () => {
      boot({ realm: R1 });
      onFetch(() => ({ status, body: { error: 'A key name must be letters, digits and _', code: `ERROR_${status}`, details: { code, key: 'MY KEY' } } }));
      const e = (await outcome(api(routes.envUpdate, args))) as HubError;
      expect(e).toMatchObject({ code, status });
      expect(e.kind).not.toBe('pending');
      expect((e as { pending?: boolean }).pending).not.toBe(true);
      expect((e as unknown as { details?: unknown }).details).toBeUndefined();
      expect((e as unknown as { data?: unknown }).data).toBeUndefined();
      expect(JSON.stringify(e)).not.toContain('MY KEY');
    });
  }
  it('a code the route does not list is still dropped', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 400, body: { code: 'ERROR_400', details: { code: 'INVALID_ENV_SCOPE' } } }));
    expect(await outcome(api(routes.envUpdate, args))).toMatchObject({ code: null, status: 400 });
  });
});
