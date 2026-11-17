// This tab's sandbox save still out counts only in the account it was sent in: an account switch
// while it is out shows none of it, switching back shows it again, and its answer ends it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { bootFixtureCore, queryClient, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { waitFor } from '@testing-library/react';
import { sandboxRulesFor, type SandboxWorld } from './fixtures';

const shown = vi.hoisted(() => ({ account: 'acct-a' as string | null }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return { ...real, capture: (t?: Target | null) => ({ ...real.capture(t), account: shown.account }) };
});
const { sandboxSending, save } = await import('./data');

afterEach(() => {
  shown.account = 'acct-a';
  resetChanges();
});

describe('a save still out counts in its own account only', () => {
  it('hidden after an account switch, shown again on return, gone once answered', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    let answer!: (a: { status: number; body: unknown }) => void;
    w.edit = () => new Promise((r) => (answer = r));
    bootFixtureCore({ rules: sandboxRulesFor(w) });
    queryClient.clear();
    const target = snapshot().target as Target;
    const out = save({ id: '7', block: { process: { max_memory: '64M' } }, beforeFp: 'x', target });
    await waitFor(() => expect(w.sent).toHaveLength(1));
    expect(sandboxSending('7', target)).toBe(true);
    expect(sandboxSending('8', target)).toBe(false);
    shown.account = 'acct-b';
    expect(sandboxSending('7', target)).toBe(false);
    shown.account = 'acct-a';
    expect(sandboxSending('7', target)).toBe(true);
    answer({ status: 200, body: { id: 7 } });
    await out;
    expect(sandboxSending('7', target)).toBe(false);
  });
});
