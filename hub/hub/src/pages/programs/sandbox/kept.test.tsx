// The edit route is not secret (its 400 text is the daemon's own words, shown), so its answers carry the program,
// environment included. This proves no environment value is ever kept by the page or by core, on every way a save
// ends: not in the browser's storage (the change store included), the query or mutation caches, a held change,
// the console, the page, or what save() returns. Why it holds (cited): core's defineMutation hands `data` only to
// the caller (core/query.ts once()), guarded() reads only outcome and idem (core/changes.ts), the hold records
// fingerprints only (data.ts identity), core logs nothing, and the daemon's 400 texts for this body name keys,
// never values (the daemon's env refusals judge the request's own environment, which this
// body never carries; its refusal of an environment value names the key).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, heldChanges, queryClient } from '@core';
import { reloadChangesForTests, resetChanges } from '@core/changes';
import { render, screen, userEvent, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { SANDBOX_LOCK, save } from './data';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { allNotesForTests } from './notes';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import { hostSamples } from './samples';
import strings from './strings.en.json';

const t = makeT(strings);
const MARK = 'env-value-7f3a9c';
const program = { id: 7, name: 'web', command: 'run', environment: { API_TOKEN: MARK, OTHER: `x-${MARK}-y` } };

function rowOf(): ProgramRow {
  return { key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'] };
}
const panel = (w: SandboxWorld) => {
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  return render(<QueryClientProvider client={queryClient}><SandboxPanel row={rowOf()} /></QueryClientProvider>);
};

/** Everything the browser and core keep, as text. */
function kept(): string {
  // eslint-disable-next-line no-restricted-globals -- the proof reads the browser storage to show no value is kept there
  const ls = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
  // eslint-disable-next-line no-restricted-globals -- the proof reads the browser storage to show no value is kept there
  const ss = Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`).join('\n');
  const q = JSON.stringify(queryClient.getQueryCache().getAll().map((x) => [x.queryKey, x.state.data, String(x.state.error ?? '')]));
  const m = JSON.stringify(queryClient.getMutationCache().getAll().map((x) => [x.state.variables, x.state.data, String(x.state.error ?? '')]));
  const h = JSON.stringify(heldChanges(SANDBOX_LOCK));
  const n = JSON.stringify(allNotesForTests());
  return [ls, ss, q, m, h, n].join('\n');
}

const spies: Array<{ mock: { calls: unknown[][] }; mockRestore: () => void }> = [];
beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
  for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, k));
});
afterEach(() => {
  resetChanges();
  // eslint-disable-next-line no-restricted-globals -- the proof reads the browser storage to show no value is kept there
  localStorage.clear();
  for (const s of spies.splice(0)) s.mockRestore();
});
function expectNowhere() {
  expect(kept()).not.toContain(MARK);
  expect(document.body.textContent).not.toContain(MARK);
  for (const s of spies) expect(JSON.stringify(s.mock.calls.map((c: unknown[]) => c.map(String)))).not.toContain(MARK);
}

async function saveMemory() {
  await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
  const d = await screen.findByRole('dialog');
  const f = within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') });
  await userEvent.type(f, '64M');
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
  return d;
}

describe('no environment value is kept anywhere', () => {
  it('a saved edit (2xx with the whole program)', async () => {
    const w: SandboxWorld = { status: {}, host: hostSamples.ok, sent: [] };
    w.edit = (req, id) => {
      (w.status as Record<string, unknown>)[id] = statusFor((req.body as { sandbox: never }).sandbox);
      return { status: 200, body: { success: true, program } };
    };
    panel(w);
    await saveMemory();
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeInTheDocument();
    expectNowhere();
  });

  it('saved but not applied (400 whose body also carries the program)', async () => {
    const text = 'program 7 saved but NOT applied, so it was not (re)started: bwrap missing';
    panel({ status: {}, sent: [], edit: () => ({ status: 400, body: { error: text, program } }) });
    await saveMemory();
    expect(await screen.findByText(t('sb.out.notApplied', { text }))).toBeInTheDocument();
    expectNowhere();
  });

  it('a refusal naming an environment key, the body carrying the program', async () => {
    const text = 'sandbox: environment value for "API_TOKEN" may not contain \'%\', a quote of either kind, \'\\\' or a control character';
    panel({ status: {}, sent: [], edit: () => ({ status: 400, body: { error: text, program } }) });
    const d = await saveMemory();
    expect(await within(d).findByText(t('sb.out.refused', { text }))).toBeInTheDocument();
    expectNowhere();
  });

  it('a save that may have gone through (5xx carrying the program), held across a reload', async () => {
    const w: SandboxWorld = { status: {}, sent: [], edit: () => ({ status: 502, body: { error: 'BAD_GATEWAY', program } }) };
    const first = panel(w);
    await saveMemory();
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
    expectNowhere();
    first.unmount();
    reloadChangesForTests();
    panel(w);
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expectNowhere();
  });

  it('what save() returns for a 400 carrying the program holds no value (the note keeps only that)', async () => {
    const texts = [
      'program 7 saved but NOT applied, so it was not (re)started: bwrap missing',
      'sandbox: environment value for "API_TOKEN" may not contain \'%\', a quote of either kind, \'\\\' or a control character',
    ];
    for (const text of texts) {
      const w: SandboxWorld = { status: {}, sent: [], edit: () => ({ status: 400, body: { error: text, program } }) };
      panel(w);
      const tg = (await import('@core/ctx')).snapshot().target;
      if (!tg) throw new Error('no target');
      const out = await save({ id: '7', block: { process: { max_memory: '64M' } }, beforeFp: 'x', target: tg });
      expect(['savedNotApplied', 'refused']).toContain(out.kind);
      expect(JSON.stringify(out)).not.toContain(MARK);
      expect(Object.keys(out).sort()).toEqual(out.kind === 'refused' ? ['kind', 'text', 'tooLarge'] : ['kind', 'text']);
      expectNowhere();
    }
  });

  it('an over-cap 400 that also carries the program (unclear)', async () => {
    panel({ status: {}, sent: [], edit: () => ({ status: 400, body: { error: 'x'.repeat(70000), program } }) });
    await saveMemory();
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expectNowhere();
  });
});
