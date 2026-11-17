// A program that needs a look (core's attention states: could not start, keeps restarting, ended with an error,
// can't tell) says what went wrong in one line under the inspector's actions, pointing at the header ⋯ menu's own Logs
// (no Logs button of its own), and, for a state the computer did not report, offers Refresh (the list's own refresh). Nothing for any other state, and nothing
// while an action's own note is showing (it speaks for the program then).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, queryClient, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { render, screen, userEvent, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow, StateKey } from './logic';
import { Detail } from './parts/Detail';
import { opsStore, type Op } from './parts/ops';
import { sandboxRulesFor } from './sandbox/fixtures';
import { resetSandboxNotesForTests } from './sandbox/notes';
import strings from './strings.en.json';
import type * as Nav from '@kit/nav';

// Detail is rendered here without the page router (its Ports table is a kit DataTable, whose URL hooks need one):
// without a router the table's URL state is empty and its links go nowhere; with one (renderPage) every hook is real.
vi.mock('@kit/nav', async (orig) => {
  const real = await orig<typeof Nav>();
  const { useRouter } = await import('@tanstack/react-router');
  const useRouted = () => useRouter({ warn: false }) != null;
  return {
    ...real,
    useSearch: () => (useRouted() ? real.useSearch() : {}),
    useSearchParam: (name: string) => (useRouted() ? real.useSearchParam(name) : ([undefined, () => undefined] as ReturnType<typeof real.useSearchParam>)),
    useGo: () => (useRouted() ? real.useGo() : () => undefined),
  };
});

const t = makeT(strings);
const can = { start: true, stop: false, restart: false, boot: false, portStart: false };
const rowOf = (over: Partial<ProgramRow> = {}): ProgramRow => ({
  key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'fatal', exitCode: null, enabled: true, lazy: false, boot: true, policy: null,
  up: null, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: true, bucket: 0, can, ...over,
});

function detail(row: ProgramRow, o: { logs?: boolean; refresh?: boolean; op?: (target: Target) => Op } = {}) {
  bootFixtureCore({ rules: sandboxRulesFor({ status: {}, sent: [] }) });
  queryClient.clear();
  const op = o.op?.(snapshot().target as Target);
  const onLogs = vi.fn();
  const onRefresh = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <Detail
        row={row}
        op={op}
        confirm={null}
        onAct={() => {}}
        onConfirm={() => {}}
        onCancelConfirm={() => {}}
        onCheck={() => {}}
        onDismiss={async () => false}
        {...(o.logs === false ? {} : { onLogs })}
        {...(o.refresh === false ? {} : { onRefresh })}
      />
    </QueryClientProvider>,
  );
  return { onLogs, onRefresh };
}
const note = (text: string) => screen.getByText(text, { exact: false }).closest('[role="alert"]') as HTMLElement | null;
const anyNote = () =>
  [t('problem.start', { name: 'web' }), t('problem.restarting', { name: 'web' }), t('problem.endedPlain', { name: 'web' }), t('problem.unknown', { name: 'web' })].some(
    (x) => screen.queryByText(x, { exact: false }) !== null,
  ) || screen.queryByText(/ended with code/) !== null;

/** The Logs entries of the header's ⋯ menu (More actions), opened here; the band adds none. */
async function logsItems(): Promise<HTMLElement[]> {
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return within(await screen.findByRole('menu')).getAllByRole('menuitem', { name: t('action.logsName', { name: 'web' }) });
}

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
  opsStore.reset();
});

describe('the needs-a-look note', () => {
  it.each<[StateKey, number | null, string]>([
    ['failed', null, t('problem.start', { name: 'web' })],
    ['fatal', null, t('problem.start', { name: 'web' })],
    ['restarting', null, t('problem.restarting', { name: 'web' })],
    ['ended', 2, t('problem.ended', { name: 'web', n: 2 })],
    ['ended', null, t('problem.endedPlain', { name: 'web' })],
  ])('%s (exit %s) says what went wrong, danger, points at the one Logs, no Refresh', async (state, exitCode, text) => {
    const d = detail(rowOf({ state, exitCode }));
    const band = note(text);
    expect(band).not.toBeNull();
    expect(band).toHaveTextContent(t('problem.why'));
    expect((band as HTMLElement).className).toMatch(/danger/);
    expect(within(band as HTMLElement).queryByRole('button')).toBeNull();
    expect(screen.queryAllByRole('button', { name: t('action.logsName', { name: 'web' }) })).toEqual([]);
    const logs = await logsItems();
    expect(logs).toHaveLength(1);
    await userEvent.click(logs[0] as HTMLElement);
    expect(d.onLogs).toHaveBeenCalledTimes(1);
    expect(d.onLogs.mock.calls[0]?.[1]).toBeNull();
    expect(d.onLogs.mock.calls[0]?.[0]).toMatchObject({ key: 'prog:7' });
  });

  it("can't tell: says so, warn, with Refresh (the list's) as its only button", async () => {
    const d = detail(rowOf({ state: 'unknown', known: false }));
    const band = note(t('problem.unknown', { name: 'web' })) as HTMLElement;
    expect(band).not.toBeNull();
    expect(band).not.toHaveTextContent(t('problem.why'));
    expect(band.className).toMatch(/warn/);
    expect(band.className).not.toMatch(/danger/);
    expect(within(band).getAllByRole('button')).toHaveLength(1);
    await userEvent.click(within(band).getByRole('button', { name: t('problem.refresh') }));
    expect(d.onRefresh).toHaveBeenCalledTimes(1);
    expect(await logsItems()).toHaveLength(1);
  });

  it("can't tell without the list's refresh: no Refresh, still no failure claim", () => {
    detail(rowOf({ state: 'unknown', known: false }), { refresh: false });
    const band = note(t('problem.unknown', { name: 'web' })) as HTMLElement;
    expect(within(band).queryByRole('button')).toBeNull();
    expect(band).not.toHaveTextContent(t('problem.why'));
  });

  it('without a Logs page there is no Logs entry and no pointer to the log', () => {
    detail(rowOf({ state: 'ended', exitCode: 2 }), { logs: false });
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    const band = note(t('problem.ended', { name: 'web', n: 2 })) as HTMLElement;
    expect(band).not.toHaveTextContent(t('problem.why'));
    expect(within(band).queryByRole('button')).toBeNull();
  });

  it.each<StateKey>(['running', 'starting', 'stopping', 'stopped', 'idle', 'finished', 'off'])('%s has no note', (state) => {
    detail(rowOf({ state, attention: false }));
    expect(anyNote()).toBe(false);
  });

  it("an action's own note speaks instead", () => {
    const op = (target: Target): Op => ({ act: 'start', target, port: null, status: 'refused', code: 'START_FAILED', press: { kind: 'prog', id: '7', action: 'start', port: null, range: false, target } as unknown as Op['press'] });
    detail(rowOf({ state: 'fatal' }), { op });
    expect(anyNote()).toBe(false);
  });
});
