// The saved policy is a list, one item per rule, so wrapped rules never run into each other
// and a screen reader announces how many rules there are.
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, queryClient } from '@core';
import { resetChanges } from '@core/changes';
import { render, screen, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import strings from './strings.en.json';
import { blockLines } from './words';

const t = makeT(strings);
const rowOf = (): ProgramRow => ({ key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'] });

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});

describe('the saved policy reads as separate rules', () => {
  it('is a list named Saved policy with one item per rule, in order', async () => {
    const block = { filesystem: { read_only_root: true, writable: ['/hoody/storage/apps/web/data'] }, network: { mode: 'restricted', bind_ports: [8000] }, process: { max_memory: '256M' } };
    const w: SandboxWorld = { status: { '7': statusFor(block as never) }, sent: [] };
    bootFixtureCore({ rules: sandboxRulesFor(w) });
    queryClient.clear();
    render(
      <QueryClientProvider client={queryClient}>
        <SandboxPanel row={rowOf()} />
      </QueryClientProvider>,
    );
    const list = await screen.findByRole('list', { name: t('sb.row.configured') });
    const want = blockLines(t, block as never);
    expect(want.length).toBeGreaterThan(2);
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(want);
  });
});
