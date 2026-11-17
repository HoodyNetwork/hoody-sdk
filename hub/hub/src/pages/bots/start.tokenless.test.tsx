// Vitest: a lifecycle hold that carries no send token (a record from before tokens, or one core could not name) is still a
// hold: its computer's Start stays off and the strip lists it, read-only. Check again still reads (it needs no token);
// the warned Dismiss, which frees exactly one send by its token, is not offered.
import { render, renderHook, screen } from '@testing-library/react';
import { CoreQueryProvider, bootFixtureCore, type HeldChange } from '@core';
import type * as Core from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStartComputer, type Computer } from './data';
import { ComputerNotesStrip } from './view';
import strings from './strings.en.json';

const C1 = 'aaaaaaaaaaaaaaaaaaaaaac1';
const tokenless = vi.hoisted(() => ({ held: [] as unknown[] }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, heldChanges: (kind: string) => (kind === 'computer.lifecycle' ? (tokenless.held as HeldChange[]) : core.heldChanges(kind)) };
});

const computer: Computer = { id: C1, name: 'atlas', server: 'n1', flag: 'SG', state: 'stopped', listState: 'ok', suspended: 0, hasMore: false };
const held = (over: Partial<HeldChange>): HeldChange =>
  ({ key: null, identity: { computer: C1, op: 'start' }, target: null, realm: null, at: 1, by: undefined, from: null, persisted: true, hold: undefined, seq: 1, ...over }) as HeldChange;

describe('a lifecycle hold without a send token', () => {
  beforeEach(() => {
    bootFixtureCore({ rules: [] });
  });
  afterEach(() => {
    tokenless.held = [];
  });

  it('still holds its computer and is listed, with no token to dismiss by', () => {
    tokenless.held = [held({})];
    const hook = renderHook(() => useStartComputer(), { wrapper: CoreQueryProvider });
    expect(hook.result.current.heldComputer(C1)).toBe(true);
    expect(hook.result.current.holds).toMatchObject([{ computerId: C1, op: 'start', hold: null }]);
  });

  it('a hold with a token is unchanged', () => {
    tokenless.held = [held({ hold: 'h1' })];
    const hook = renderHook(() => useStartComputer(), { wrapper: CoreQueryProvider });
    expect(hook.result.current.holds).toMatchObject([{ computerId: C1, hold: 'h1' }]);
  });

  it('the strip words it and offers no Dismiss, whoever sent it', () => {
    render(
      <ComputerNotesStrip
        computers={[]}
        allComputers={[computer]}
        holds={[{ computerId: C1, op: 'start', ours: true, hold: null, from: null }]}
        onRetry={() => undefined}
        onResume={() => undefined}
        resuming={false}
        starting={false}
        onCheckStart={() => undefined}
        onDismissStart={() => undefined}
      />,
    );
    expect(screen.getByText(strings['start.heldTitle'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(?:close|stop tracking…|hide this note)$/i })).toBeNull();
  });
});
