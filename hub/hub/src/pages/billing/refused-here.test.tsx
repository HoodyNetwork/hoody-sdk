// A billing read the Hub refused itself under an access-key session (TOKEN_SESSION_REFUSED, sent nowhere) drew a bare
// "Couldn't load the offer. [Try again]" (Plans) and "Both … failed to load. Try again in a moment." (Bare metal) on the
// live data: a retry cannot change it. refusedHere picks those refusals; the two states then
// pass the error (the kit's token-session sentence) and no retry. Web twin of the terminal refused-here.term.test.tsx.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorState } from '@kit';
import { refusedHere } from './logic';

const TOKEN = { kind: 'not_sent', notSent: true, code: 'TOKEN_SESSION_REFUSED' };

afterEach(cleanup);

describe('refusedHere', () => {
  it('the Hub\'s own unsent refusals only', () => {
    expect(refusedHere(TOKEN)).toBe(true);
    expect(refusedHere({ kind: 'not_sent', notSent: true, code: 'TOKEN_LACKS' })).toBe(true);
    expect(refusedHere({ kind: 'not_sent', notSent: true, code: 'FRAMED_ACTION_REFUSED' })).toBe(false);
    expect(refusedHere({ status: 500, code: 'INTERNAL_SERVER_ERROR' })).toBe(false);
    expect(refusedHere({ status: 0 })).toBe(false);
    expect(refusedHere(null)).toBe(false);
    expect(refusedHere(undefined)).toBe(false);
  });
  it('Plans: the offer state under a key session names it and offers no retry', () => {
    render(<ErrorState size="sm" title="Couldn't load the offer." error={TOKEN} onRetry={refusedHere(TOKEN) ? undefined : () => {}} />);
    expect(document.body.textContent).toContain('Signed in with an access token');
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
  it('Bare metal: the market state under a key session has no "try again" line and no retry', () => {
    render(<ErrorState title="The market could not be loaded" error={TOKEN} />);
    expect(document.body.textContent).toContain('Signed in with an access token');
    expect(document.body.textContent).not.toMatch(/try again/i);
  });
});
