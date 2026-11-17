// Vitest: a computer's Bots read that the agent refuses as signed out (restriction_unknown, kit agentSignedOut) offers the
// shared sign-in (place "own", the Schedules way) in the notes strip, for the computer the Hub shows (where a sign-in acts), with or
// without a group row of its own; the failed line with Try again stays, and on another computer, or for any other failure, it is all
// there is. A sign-in reads that computer's Bots again (the page's own read). A sign-in whose answer was lost holds when the
// note is drawn again (core's hold, signInUnsure: core/agent-signin.test.ts pins core's side; C9).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import signInStrings from '@app/agentSignIn.strings.en.json';
import type * as Core from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFailure, type Computer } from './data';
import strings from './strings.en.json';
import { ComputerNotesStrip } from './view';

const w = vi.hoisted(() => ({ calls: [] as string[], result: { kind: 'signedIn' } as { kind: string }, unsure: false, told: new Set<() => void>() }));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const target = () => ({ project: { id: 'p1' }, container: { id: 'c-shown' } });
  return {
    ...real,
    capture: () => ({ ...real.capture(), account: 'acct1', target: target(), gen: 1 }),
    useCore: () => ({ ...real.useCore(), target: target(), account: 'acct1' }),
    signInOffered: () => true,
    agentBaseFor: () => 'https://agent.example/',
    // An unknown answer: core then holds the computer for every place (signInUnsure true, its listeners told).
    signInAgent: async () => {
      w.calls.push('signIn');
      if (w.result.kind === 'unknown') { w.unsure = true; for (const f of [...w.told]) f(); }
      return w.result;
    },
    signInUnsure: () => w.unsure,
    subscribeSignInUnsure: (f: () => void) => { w.told.add(f); return () => { w.told.delete(f); }; },
    checkAgentLogin: async () => { w.calls.push('check'); return 'ready'; },
    watchComputer: () => () => {},
  };
});

const comp = (id: string, over: Partial<Computer> = {}): Computer => ({ id, name: id.slice(2), server: 'n1', flag: 'SG', state: 'running', listState: 'failed', suspended: 0, hasMore: false, ...over });
// `computers` are the strip's own (no group row); `all` adds the computers whose Bots have group rows in the list.
const strip = (computers: Computer[], all: Computer[] = computers) => (
  <ComputerNotesStrip
    computers={computers}
    allComputers={all}
    holds={[]}
    onRetry={() => w.calls.push('retry')}
    rereadBots={async (id) => { w.calls.push(`reread:${id}`); return true; }}
    onResume={() => undefined}
    resuming={false}
    starting={false}
    onCheckStart={() => undefined}
    onDismissStart={() => undefined}
  />
);

beforeEach(() => { w.calls = []; w.result = { kind: 'signedIn' }; w.unsure = false; w.told.clear(); });

describe('readFailure', () => {
  it('restriction_unknown with nothing read is signed out; any other failure is failed only; a read with data is neither', () => {
    expect(readFailure({ isError: true, data: undefined, error: { status: 503, code: 'restriction_unknown' } })).toEqual({ failed: true, agentOut: true });
    expect(readFailure({ isError: true, data: undefined, error: { status: 503, code: 'unavailable' } })).toEqual({ failed: true, agentOut: false });
    expect(readFailure({ isError: true, data: { items: [] }, error: { code: 'restriction_unknown' } })).toEqual({ failed: false, agentOut: false });
    expect(readFailure(undefined)).toEqual({ failed: false, agentOut: false });
  });
});

describe('a signed-out Bots read in the notes strip', () => {
  it('on the computer the Hub shows: the sign-in box above its failed line; a sign-in reads that computer\'s Bots again', async () => {
    render(strip([comp('c-shown', { agentOut: true })]));
    expect(screen.getByText((text) => text.includes(strings['notice.failedShort']))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: signInStrings['signin.press'] }));
    await waitFor(() => expect(w.calls).toEqual(['signIn', 'reread:c-shown']));
  });

  it('with more than one computer, the shown one in a group row of its own: the box still shows in the strip and rereads that computer', async () => {
    const shown = comp('c-shown', { agentOut: true });
    const other = comp('c-other', { listState: 'ok' });
    render(strip([], [other, shown]));
    expect(screen.queryByText((text) => text.includes(strings['notice.failedShort']))).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: signInStrings['signin.press'] }));
    await waitFor(() => expect(w.calls).toEqual(['signIn', 'reread:c-shown']));
  });

  it('on another computer: the plain failed line with Try again, and no sign-in box', async () => {
    render(strip([comp('c-other', { agentOut: true })]));
    expect(screen.getByText((text) => text.includes(strings['notice.failedShort']))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: signInStrings['signin.press'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['action.tryAgain'] }));
    expect(w.calls).toEqual(['retry']);
  });

  it('any other failure on the shown computer keeps the failed line and offers no sign-in', () => {
    render(strip([comp('c-shown')]));
    expect(screen.getByText((text) => text.includes(strings['notice.failedShort']))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: signInStrings['signin.press'] })).toBeNull();
  });
});

describe('a sign-in whose answer was lost (C9)', () => {
  it('holds when the note is drawn again (the read again clears the refusal while it runs): never a second sign-in', async () => {
    w.result = { kind: 'unknown' };
    const { rerender } = render(strip([comp('c-shown', { agentOut: true })]));
    await userEvent.click(screen.getByRole('button', { name: signInStrings['signin.press'] }));
    expect(await screen.findByText(signInStrings['signin.unknown.own'])).toBeInTheDocument();
    // While the read runs the computer's Bots are not refused (no agentOut): the note goes.
    rerender(strip([comp('c-shown')]));
    expect(screen.queryByText(signInStrings['signin.unknown.own'])).toBeNull();
    // Refused again: the note is drawn again, held.
    rerender(strip([comp('c-shown', { agentOut: true })]));
    expect(await screen.findByText(signInStrings['signin.unknown.own'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: signInStrings['signin.press'] })).toBeNull();
    expect(w.calls.filter((c) => c === 'signIn')).toHaveLength(1);
  });
});
