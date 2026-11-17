// A billing read the Hub refused itself under an access-key session (TOKEN_SESSION_REFUSED, sent nowhere) drew a bare
// "Couldn't load the offer. [Try again]" (Plans) and "Both … failed to load. Try again in a moment." (Bare metal) on the
// live platform: a retry cannot change it. refusedHere picks those refusals; the two states then
// pass the error (the kit's token-session sentence) and no retry.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { ErrorState } from '@kit';
import { refusedHere } from './logic';

const TOKEN = { kind: 'not_sent', notSent: true, code: 'TOKEN_SESSION_REFUSED' };

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: React.ReactNode) => { t = await drawTest(node, { width: 80, height: 10 }); return (await t.settle()).replace(/ +\n/g, '\n'); };

test('refusedHere: the Hub\'s own unsent refusals only', () => {
  expect(refusedHere(TOKEN)).toBe(true);
  expect(refusedHere({ kind: 'not_sent', notSent: true, code: 'TOKEN_LACKS' })).toBe(true);
  expect(refusedHere({ kind: 'not_sent', notSent: true, code: 'FRAMED_ACTION_REFUSED' })).toBe(false);
  expect(refusedHere({ status: 500, code: 'INTERNAL_SERVER_ERROR' })).toBe(false);
  expect(refusedHere({ status: 0 })).toBe(false);
  expect(refusedHere(null)).toBe(false);
  expect(refusedHere(undefined)).toBe(false);
});

test('Plans: the offer state under a key session names it and offers no retry', async () => {
  const f = await draw(<ErrorState size="sm" title="Couldn't load the offer." error={TOKEN} onRetry={refusedHere(TOKEN) ? undefined : () => {}} />);
  expect(f).toContain("Couldn't load the offer.");
  expect(f.replace(/\s+/g, ' ')).toContain('Signed in with an access token');
  expect(f).not.toContain('Try again');
});

test('Bare metal: the market state under a key session has no "try again" line and no retry', async () => {
  const f = await draw(<ErrorState title="The market could not be loaded" error={TOKEN} />);
  expect(f.replace(/\s+/g, ' ')).toContain('Signed in with an access token');
  expect(f).not.toMatch(/try again/i);
});
