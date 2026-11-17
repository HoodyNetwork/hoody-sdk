// A sandbox saved on a running program applies when the program next starts (the panel's own claim): the Done note
// says so, decided when the save settles (whether a later start picked it up is not something the page can tell, so
// nothing flips it afterwards), and offers Restart now while a restart is possible. Restart now always asks first,
// then sends the program's own whole Restart (the page's press path, so held sends refuse); it is off while the
// program's actions wait, and its question closes when a restart is no longer possible. A program stopped at the
// save gets the plain note; a system program has no sandbox editing, so never this note. The live firewall reads
// "1 rule", not "1 rules".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply, type FixtureRule, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import page from '../page';
import { Detail } from '../parts/Detail';
import { opsStore, type Op } from '../parts/ops';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { sandboxRoutes as routes } from './routes';
import { resetSandboxNotesForTests } from './notes';
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
const can = { start: true, stop: true, restart: true, boot: false, portStart: false };
const rowOf = (over: Partial<ProgramRow> = {}): ProgramRow => ({
  key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null,
  up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can, ...over,
});

function detailWith(w: SandboxWorld, row: ProgramRow = rowOf(), first: FixtureRule[] = []) {
  bootFixtureCore({ rules: [...first, ...sandboxRulesFor(w)] });
  queryClient.clear();
  const onAct = vi.fn();
  const view = (op: Op | undefined, r: ProgramRow) => (
    <QueryClientProvider client={queryClient}>
      <Detail row={r} op={op} confirm={null} onAct={onAct} onConfirm={() => {}} onCancelConfirm={() => {}} onCheck={() => {}} onDismiss={async () => false} />
    </QueryClientProvider>
  );
  const r = render(view(undefined, row));
  return { onAct, withOp: (op: Op | undefined, next: ProgramRow = row) => r.rerender(view(op, next)) };
}
const detail = (w: SandboxWorld, row?: ProgramRow) => detailWith(w, row).onAct;
async function addMemory(value = '64M') {
  await userEvent.click(await screen.findByRole('button', { name: /^(Add|Edit) sandbox$/ }));
  const d = await screen.findByRole('dialog');
  const field = within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') });
  await userEvent.clear(field);
  await userEvent.type(field, value);
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
}
const restartNow = () => screen.queryByRole('button', { name: t('sb.restartNow') });
/** Restart now, then the question's answer. */
async function restartConfirmed(name = 'web') {
  await userEvent.click(await screen.findByRole('button', { name: t('sb.restartNow') }));
  const d = await screen.findByRole('alertdialog', { name: t('sb.restartAskT', { name }) });
  await userEvent.click(within(d).getByRole('button', { name: t('sb.restartAskGo') }));
}
/** The ops-store key of prog:7 on the current computer (the panel's own `at`). */
const opAt = () => {
  const c = snapshot();
  const tg = c.target as Target;
  return `${c.account ?? '-'}|${c.realm}|${tg.project.id}/${tg.container.id}|prog:7`;
};
const restartPress = (op: Partial<Op> = {}): Op => ({
  act: 'restart', target: snapshot().target as Target, port: null, status: 'working',
  press: { kind: 'prog', id: '7', action: 'restart', port: null, range: false, target: snapshot().target as Target } as unknown as Op['press'], ...op,
});

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
  opsStore.reset();
});

describe('a sandbox saved on a running program', () => {
  it('says the new limits apply from its next restart; Restart now asks, then is its Restart', async () => {
    const onAct = detail({ status: {}, sent: [] });
    await addMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    expect(screen.queryByText(t('sb.out.saved'))).toBeNull();
    await userEvent.click(restartNow() as HTMLElement);
    const d = await screen.findByRole('alertdialog', { name: t('sb.restartAskT', { name: 'web' }) });
    expect(onAct).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole('button', { name: t('sb.restartAskGo') }));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onAct.mock.calls[0]?.slice(1)).toEqual(['restart', { port: null, range: false }]);
  });

  it('Cancel on the question restarts nothing', async () => {
    const onAct = detail({ status: {}, sent: [] });
    await addMemory();
    await userEvent.click(await screen.findByRole('button', { name: t('sb.restartNow') }));
    const d = await screen.findByRole('alertdialog', { name: t('sb.restartAskT', { name: 'web' }) });
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onAct).not.toHaveBeenCalled();
  });

  it('a range program restarts all its parts', async () => {
    const onAct = detail({ status: {}, sent: [] }, rowOf({ port: null, range: { start: 8001, end: 8003 } as ProgramRow['range'] }));
    await addMemory();
    await restartConfirmed();
    expect(onAct.mock.calls[0]?.slice(1)).toEqual(['restart', { port: null, range: true }]);
  });

  it('an earlier failed restart still in view leaves a new save its note and Restart now', async () => {
    const d = detailWith({ status: {}, sent: [] });
    const failed = restartPress({ status: 'failed', code: 'START_FAILED' });
    opsStore.set(opAt(), failed);
    d.withOp(failed);
    await addMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    expect(restartNow()).toBeEnabled();
  });

  it('a save made while stopped keeps the plain note when the program then starts', async () => {
    const stopped = rowOf({ state: 'stopped', up: null });
    const d = detailWith({ status: {}, sent: [] }, stopped);
    await addMemory();
    expect(await screen.findByText(t('sb.out.saved'))).toBeVisible();
    d.withOp(undefined, rowOf());
    expect(screen.getByText(t('sb.out.saved'))).toBeVisible();
    expect(screen.queryByText(t('sb.out.savedRunning', { name: 'web' }))).toBeNull();
    expect(restartNow()).toBeNull();
  });

  it('a program that stops after the save keeps the note but offers no Restart now', async () => {
    const d = detailWith({ status: {}, sent: [] });
    await addMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    d.withOp(undefined, rowOf({ state: 'stopped', up: null, can: { ...can, restart: false } }));
    expect(screen.getByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    expect(restartNow()).toBeNull();
  });

  it('a stopped program gets the plain note and no Restart now', async () => {
    detail({ status: {}, sent: [] }, rowOf({ state: 'stopped', up: null }));
    await addMemory();
    expect(await screen.findByText(t('sb.out.saved'))).toBeVisible();
    expect(restartNow()).toBeNull();
  });

  it('a program that cannot restart gets no Restart now', async () => {
    detail({ status: {}, sent: [] }, rowOf({ can: { ...can, restart: false } }));
    await addMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    expect(restartNow()).toBeNull();
  });

  it('Restart now is off while a start, stop or restart of it is out, like its Restart', async () => {
    const d = detailWith({ status: {}, sent: [] });
    await addMemory();
    expect(await screen.findByRole('button', { name: t('sb.restartNow') })).toBeEnabled();
    const press = { kind: 'prog', id: '7', action: 'stop', port: null, range: false, target: snapshot().target as Target } as unknown as Op['press'];
    d.withOp({ act: 'stop', target: snapshot().target as Target, port: null, status: 'working', press });
    expect(screen.getByRole('button', { name: t('sb.restartNow') })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: t('sb.restartNow') }));
    expect(d.onAct).not.toHaveBeenCalled();
  });
});

describe('the note is decided when the save settles', () => {
  it("a state the computer did not report counts as running (the note offers no claim it is in use)", async () => {
    detailWith({ status: {}, sent: [] }, rowOf({ state: 'unknown', known: false, up: null, can: { ...can, restart: false } }));
    await addMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    expect(restartNow()).toBeNull();
  });

  it('a program started while the save was out gets the running note', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const w: SandboxWorld = {
      status: {},
      sent: [],
      edit: async (_req, id) => {
        await gate;
        (w.status as Record<string, unknown>)[id] = statusFor({ process: { max_memory: '64M' } });
        return answers.ok({ success: true, program: { id: 7, name: 'web' } });
      },
    };
    const d = detailWith(w, rowOf({ state: 'stopped', up: null }));
    await addMemory();
    await waitFor(() => expect(w.sent).toHaveLength(1));
    d.withOp(undefined, rowOf());
    release();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    expect(restartNow()).toBeEnabled();
  });

  it('a held save that a Check proves while the program started meanwhile gets the running note', async () => {
    let hold = false;
    let release = () => {};
    const w: SandboxWorld = { status: {}, sent: [], edit: () => ({ status: 502, body: { error: 'BAD_GATEWAY' } }) };
    // The Check's own status read waits (the first, the editor's read before the save, does not).
    const slowStatus = reply(
      routes.status,
      () =>
        new Promise((r) => {
          release = () => r(answers.ok((w.status as Record<string, unknown>)['7'] as object));
        }),
      { when: () => hold },
    );
    const d = detailWith(w, rowOf({ state: 'stopped', up: null }), [slowStatus]);
    await addMemory();
    expect(await screen.findByText(t('sb.out.unknown'))).toBeVisible();
    (w.status as Record<string, unknown>)['7'] = statusFor({ process: { max_memory: '64M' } });
    hold = true;
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    d.withOp(undefined, rowOf());
    release();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
  });
});

describe('closing the note', () => {
  it("closes when its own Restart now comes back done", async () => {
    const d = detailWith({ status: {}, sent: [] });
    d.onAct.mockResolvedValue('done');
    await addMemory();
    await restartConfirmed();
    await waitFor(() => expect(screen.queryByText(t('sb.out.savedRunning', { name: 'web' }))).toBeNull());
  });

  it.each(['pending', 'not_sent', 'failed', undefined])('stays when its Restart now comes back %s', async (outcome) => {
    const d = detailWith({ status: {}, sent: [] });
    d.onAct.mockResolvedValue(outcome);
    await addMemory();
    await restartConfirmed();
    await waitFor(() => expect(d.onAct).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.getByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
  });

  it('a newer note that came while the restart was out is left alone', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    const d = detailWith(w);
    let finish: (o: string) => void = () => {};
    d.onAct.mockReturnValue(new Promise<string>((r) => (finish = r)));
    await addMemory();
    await restartConfirmed();
    await addMemory('128M');
    await waitFor(() => expect(w.sent).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(t('sb.actionsWait'))).toBeNull());
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    finish('done');
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
  });

  it('has a plain close for anyone who restarted it elsewhere', async () => {
    detailWith({ status: {}, sent: [] });
    await addMemory();
    const text = await screen.findByText(t('sb.out.savedRunning', { name: 'web' }));
    const banner = text.closest('[data-outcome]') as HTMLElement;
    await userEvent.click(within(banner).getByRole('button', { name: /hide/i }));
    expect(screen.queryByText(t('sb.out.savedRunning', { name: 'web' }))).toBeNull();
    expect(restartNow()).toBeNull();
  });
});

describe('on the page', () => {
  it("Restart now on your own program asks, restarts it through the page's press, and the note closes when it is done", async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    await addMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeVisible();
    await restartConfirmed();
    await waitFor(() => expect(screen.queryByText(t('sb.out.savedRunning', { name: 'web' }))).toBeNull(), { timeout: 8000 });
  });
});

describe('the question while the program changes', () => {
  it('closes, sending nothing, when a restart is no longer possible (the list read it stopped)', async () => {
    const d = detailWith({ status: {}, sent: [] });
    await addMemory();
    await userEvent.click(await screen.findByRole('button', { name: t('sb.restartNow') }));
    await screen.findByRole('alertdialog', { name: t('sb.restartAskT', { name: 'web' }) });
    d.withOp(undefined, rowOf({ state: 'stopped', up: null, can: { ...can, restart: false } }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(d.onAct).not.toHaveBeenCalled();
  });

  it('closes when the program can no longer restart though still running, and stays closed when it can again', async () => {
    const d = detailWith({ status: {}, sent: [] });
    await addMemory();
    await userEvent.click(await screen.findByRole('button', { name: t('sb.restartNow') }));
    await screen.findByRole('alertdialog', { name: t('sb.restartAskT', { name: 'web' }) });
    d.withOp(undefined, rowOf({ can: { ...can, restart: false } }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    d.withOp(undefined, rowOf());
    expect(await screen.findByRole('button', { name: t('sb.restartNow') })).toBeEnabled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(d.onAct).not.toHaveBeenCalled();
  });

  it('answered after the actions started waiting, sends nothing', async () => {
    const d = detailWith({ status: {}, sent: [] });
    await addMemory();
    await userEvent.click(await screen.findByRole('button', { name: t('sb.restartNow') }));
    const q = await screen.findByRole('alertdialog', { name: t('sb.restartAskT', { name: 'web' }) });
    d.withOp(restartPress({ act: 'stop', press: { kind: 'prog', id: '7', action: 'stop', port: null, range: false, target: snapshot().target as Target } as unknown as Op['press'] }));
    await userEvent.click(within(q).getByRole('button', { name: t('sb.restartAskGo') }));
    expect(d.onAct).not.toHaveBeenCalled();
  });
});

describe('the live firewall count', () => {
  it('reads 1 rule and 2 rules', () => {
    expect(t('sb.live.ok', { count: 1 })).toBe('In place (1 rule)');
    expect(t('sb.live.ok', { count: 2 })).toBe('In place (2 rules)');
    void statusFor;
  });
});
