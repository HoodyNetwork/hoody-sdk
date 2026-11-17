// The Ports table's per-port buttons of a range program's inspector (parts/Detail.tsx) stay mounted, and keep focus, when Detail is
// rendered again with a new row object, a row whose uptime moved, or new onAct / onLogs functions (a refetch does all
// of these). The cell functions are built once, apart from the columns, so a refresh never
// remounts a port's Stop / Restart buttons or drops a keyboard user's focus. In this table
// a running port's Restart is its row's inline button (Stop is in the row's ⋯ menu).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, queryClient } from '@core';
import { resetChanges } from '@core/changes';
import { render, screen } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from './logic';
import { Detail } from './parts/Detail';
import { opsStore } from './parts/ops';
import { sandboxRulesFor } from './sandbox/fixtures';
import { resetSandboxNotesForTests } from './sandbox/notes';

vi.mock('@kit/nav', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useSearchParam: () => [undefined, () => undefined], useSearch: () => ({}) }));

const can = { start: false, stop: true, restart: true, boot: false, portStart: false };
const part = (port: number, up: number) => ({ port, state: 'running' as const, up, can: { start: false, stop: true, restart: true } });
const rowOf = (up: number): ProgramRow => ({
  key: 'prog:2', id: '2', scope: 'yours', name: 'api', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null,
  up, port: 8000, range: { start: 8000, end: 8001 }, parts: [part(8000, up), part(8001, up)], partsUp: 2, stop: null, ends: null, known: true, attention: false, bucket: 0, can,
});
const onAct0 = () => {};
const onLogs0 = vi.fn();
type P = Parameters<typeof Detail>[0];
const base = (row: ProgramRow, over: Partial<P> = {}): P => ({
  row, op: undefined, confirm: null, onAct: onAct0, onConfirm: () => {}, onCancelConfirm: () => {}, onCheck: () => {}, onDismiss: async () => false, onLogs: onLogs0, onRefresh: () => {}, ...over,
});
const tree = (p: P) => (
  <QueryClientProvider client={queryClient}>
    <Detail {...p} />
  </QueryClientProvider>
);
const stop = () => screen.getAllByRole('button', { name: /^Restart port 8000/ })[0] as HTMLElement;

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
  opsStore.reset();
  bootFixtureCore({ rules: sandboxRulesFor({ status: {}, sent: [] }) });
  queryClient.clear();
});

describe('the Ports row buttons survive a re-render of the inspector', () => {
  it('same props object (control)', () => {
    const p = base(rowOf(5));
    const { rerender } = render(tree(p));
    const el = stop();
    rerender(tree({ ...p }));
    expect(el.isConnected, 'control').toBe(true);
  });
  it('a NEW row object with identical content', () => {
    const { rerender } = render(tree(base(rowOf(5))));
    const el = stop();
    rerender(tree(base(rowOf(5))));
    expect(el.isConnected, 'new equal row').toBe(true);
  });
  it('a row whose uptime moved (a real refetch)', () => {
    const { rerender } = render(tree(base(rowOf(5))));
    const el = stop();
    el.focus();
    rerender(tree(base(rowOf(7))));
    expect(el.isConnected, 'row up 5 -> 7').toBe(true);
    expect(document.activeElement, 'focus stays on Restart of port 8000').toBe(el);
  });
  it('a NEW onAct function only', () => {
    const r = rowOf(5);
    const { rerender } = render(tree(base(r)));
    const el = stop();
    el.focus();
    rerender(tree(base(r, { onAct: () => {} })));
    expect(el.isConnected, 'new onAct').toBe(true);
    expect(document.activeElement).toBe(el);
  });
  it('a NEW onLogs function only', () => {
    const r = rowOf(5);
    const { rerender } = render(tree(base(r)));
    const el = stop();
    rerender(tree(base(r, { onLogs: () => {} })));
    expect(el.isConnected, 'new onLogs').toBe(true);
  });
});
