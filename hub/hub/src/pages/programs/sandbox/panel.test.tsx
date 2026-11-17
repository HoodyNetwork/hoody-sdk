// The Sandbox panel and chip against the fake daemon: every status shape in honest words, the editor's exact
// body, and every way a save can end (saved, saved but not applied, refused, too large, unclear, may have gone
// through), with proofs bound to the program they were sent for and no environment value ever on screen.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, defineMutation, heldChanges, queryClient, type Target } from '@core';
import { reloadChangesForTests, resetChanges } from '@core/changes';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Row as ProgramRow } from '../logic';
import { SANDBOX_LOCK, save } from './data';
import { sandboxRoutes } from './routes';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { SandboxChip } from './SandboxChip';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import { UNCONFINED_LINE, hostSamples, programSamples, statusSamples } from './samples';
import strings from './strings.en.json';

const t = makeT(strings);

function rowOf(o: Partial<ProgramRow> = {}): ProgramRow {
  return { key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'], ...o };
}

function mount(w: SandboxWorld, node: ReactNode) {
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}
const panel = (w: SandboxWorld, row = rowOf()) => mount(w, <SandboxPanel row={row} />);
// The section (an AnatomySection titled Sandbox) and its facts both carry the name: either shown is enough here.
const facts = async () => screen.findByRole('list', { name: t('sb.title') }).catch(async () => (await screen.findAllByLabelText(t('sb.title')))[0]);

async function openEditor(label: 'sb.edit' | 'sb.add' = 'sb.edit') {
  await userEvent.click(await screen.findByRole('button', { name: t(label) }));
  return screen.findByRole('dialog');
}
const saveButton = (d: HTMLElement) => within(d).getByRole('button', { name: t('sb.ed.save') });
async function fillMemory(d: HTMLElement, v: string) {
  const f = within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') });
  await userEvent.clear(f);
  await userEvent.type(f, v);
}

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});
afterEach(() => resetChanges());

describe('status shapes', () => {
  it('no policy: None, Nothing, no inbound rules, and the running program not reported', async () => {
    panel({ status: {}, host: hostSamples.ok });
    await facts();
    expect(screen.getByText(t('sb.configured.none'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.effective.none'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.live.none'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.process.unconfirmed'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('sb.add') })).toBeInTheDocument();
  });

  it('policy set: the block in words, the revision, the live rules, and never "sandboxed"', async () => {
    panel({ status: { '7': statusSamples.set }, host: hostSamples.ok });
    // The policy id is a value to copy (the kit id chip: its label, the id, Copy full reference), not a sentence.
    const id = await screen.findByText('3f9c1a2b7e4d');
    const chip = id.parentElement as HTMLElement;
    expect(within(chip).getByText(t('sb.effective.revLabel'))).toBeInTheDocument();
    expect(within(chip).getByRole('button', { name: 'Copy full reference' })).toBeInTheDocument();
    expect(screen.getByText(t('sb.w.ro', { paths: '/hoody/storage/apps/web/data' }))).toBeInTheDocument();
    expect(screen.getByText(t('sb.w.inbound', { list: '203.0.113.0/24' }))).toBeInTheDocument();
    expect(screen.getByText(t('sb.live.ok', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('sb.process.unconfirmed'))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bsandboxed\b(?! one)/i);
  });

  it('a block that restricts nothing says so', async () => {
    panel({ status: { '7': statusSamples.inactive } });
    expect(await screen.findByText(t('sb.configured.inactive'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.effective.none'))).toBeInTheDocument();
  });

  it('draining with no block: the old rules stay', async () => {
    panel({ status: { '7': statusSamples.drainingCleared } });
    expect(await screen.findByText(t('sb.live.draining'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.configured.none'))).toBeInTheDocument();
  });

  it('a cleared block that may still run UNCONFINED leads with it, in the daemon\'s words', async () => {
    panel({ status: { '7': statusSamples.unconfinedCleared } });
    expect(await screen.findByText(t('sb.unconfined'))).toBeInTheDocument();
    expect(screen.getByText(UNCONFINED_LINE)).toBeInTheDocument();
    expect(screen.getByText(t('sb.live.degraded'))).toBeInTheDocument();
  });

  it.each(['tableMismatch', 'stateUnreadable', 'retirementPending', 'brokenInvariant'] as const)('degraded (%s): every problem verbatim', async (k) => {
    panel({ status: { '7': statusSamples[k] } });
    for (const p of statusSamples[k].problems) expect(await screen.findByText(p)).toBeInTheDocument();
    expect(screen.getByText(t('sb.live.degraded'))).toBeInTheDocument();
  });

  it('a policy that no longer validates: nothing used at next start, the reason shown', async () => {
    panel({ status: { '7': statusSamples.invalid } });
    expect(await screen.findByText(t('sb.effective.notValid'))).toBeInTheDocument();
    expect(screen.getByText(statusSamples.invalid.problems[0])).toBeInTheDocument();
  });

  it('a host without a needed part says which, only for an enabled program', async () => {
    panel({ status: { '7': statusSamples.set }, host: hostSamples.noNft });
    expect(await screen.findByText(t('sb.missing', { parts: t('sb.part.nft') }))).toBeInTheDocument();
  });

  it('a turned-off program says the policy applies when turned on', async () => {
    panel({ status: { '7': statusSamples.limitsOnly }, host: hostSamples.noBwrap }, rowOf({ enabled: false }));
    expect(await screen.findByText(t('sb.disabled'))).toBeInTheDocument();
    expect(screen.queryByText(t('sb.missing', { parts: t('sb.part.bwrap') }))).toBeNull();
  });

  it('a turned-off system program with a policy says both: view only, and the policy applies when turned on', async () => {
    panel({ status: { '7': statusSamples.limitsOnly } }, rowOf({ scope: 'system', enabled: false }));
    // One sentence says both: view only, and the policy applies when it is turned on.
    expect(await screen.findByText(t('sb.systemOff'))).toBeInTheDocument();
    expect(screen.queryByText(t('sb.system'))).toBeNull();
  });

  it('a malformed answer is never read as no policy', async () => {
    panel({ status: { '7': statusSamples.malformed } });
    expect(await screen.findByText(t('sb.malformed'))).toBeInTheDocument();
    expect(screen.queryByText(t('sb.configured.none'))).toBeNull();
  });

  it('system programs are view only; temporary programs show nothing', async () => {
    panel({ status: { '7': statusSamples.set } }, rowOf({ scope: 'system' }));
    expect(await screen.findByText(t('sb.system'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('sb.edit') })).toBeNull();
    const { container } = mount({}, <SandboxPanel row={rowOf({ scope: 'temporary', key: 'temp:q', id: 'q' })} />);
    expect(container.textContent).toBe('');
  });
});

describe('chip', () => {
  it.each([
    ['none', 'sb.chip.none'],
    ['set', 'sb.chip.set'],
    ['drainingCleared', 'sb.chip.draining'],
    ['unconfinedCleared', 'sb.chip.problem'],
    ['inactive', 'sb.chip.inactive'],
    ['malformed', 'sb.chip.checking'],
  ] as const)('%s', async (k, key) => {
    mount({ status: { '7': statusSamples[k] }, host: hostSamples.ok }, <SandboxChip row={rowOf()} />);
    expect(await screen.findByText(t(key))).toBeInTheDocument();
  });
  it('Can\'t start when the host lacks a part', async () => {
    mount({ status: { '7': statusSamples.restricted }, host: hostSamples.oldLandlock }, <SandboxChip row={rowOf()} />);
    expect(await screen.findByText(t('sb.chip.cantStart'))).toBeInTheDocument();
  });
});

describe('editor', () => {
  it('sends the whole canonical block, then shows what the computer reports', async () => {
    const w: SandboxWorld = { status: {}, host: hostSamples.ok, sent: [] };
    panel(w);
    const d = await openEditor('sb.add');
    await fillMemory(d, '512M');
    await userEvent.click(saveButton(d));
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeInTheDocument();
    expect(w.sent).toEqual([{ id: '7', body: { sandbox: { process: { max_memory: '512M' } } } }]);
    expect(JSON.stringify(w.sent)).toBe('[{"id":"7","body":{"sandbox":{"process":{"max_memory":"512M"}}}}]');
    expect(await screen.findByText(t('sb.w.memory', { v: '512M' }))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('never-shown');
  });

  it('the save answer (the whole program, environment included) never leaves save()', async () => {
    let target: Target | null = null;
    const w: SandboxWorld = { status: {}, sent: [], onStatus: (req) => (target ??= req.target) };
    panel(w);
    await screen.findByRole('button', { name: t('sb.add') });
    if (!target) throw new Error('no computer on the status read');
    const out = await save({ id: '7', block: { process: { max_pids: 8 } }, beforeFp: 'x', target });
    expect(out).toEqual({ kind: 'saved' });
    expect(JSON.stringify(out)).not.toContain('never-shown');
  });

  it('a preset fills the form; No network is refused for a program with ports', async () => {
    panel({ status: {}, host: hostSamples.ok });
    const d = await openEditor('sb.add');
    expect(await within(d).findByText(t('sb.ed.preset.noNetwork.hasPorts'))).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: t('sb.ed.applyPreset', { preset: t('sb.ed.preset.noNetwork') }) })).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.applyPreset', { preset: t('sb.ed.preset.limits') }) }));
    expect(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') })).toHaveValue('512M');
  });

  it('names a program setting the daemon refuses, never its value', async () => {
    panel({ status: {}, program: { '7': programSamples.badEnv } });
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    expect(await within(d).findByText(t('sb.err.env.value', { name: 'API_TOKEN' }))).toBeInTheDocument();
    expect(within(d).getByText(t('sb.err.env.loader', { name: 'LD_PRELOAD' }))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('FAKE');
    expect(document.body.textContent).not.toContain('/x.so');
  });

  it('Remove asks, then sends null', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.limitsOnly }, sent: [] };
    panel(w);
    const d = await openEditor();
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.remove') }));
    await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
    await waitFor(() => expect(w.sent).toEqual([{ id: '7', body: { sandbox: null } }]));
  });

  it('a stored field this Hub cannot carry turns editing off (a whole-block save would drop it)', async () => {
    panel({ status: { '7': { ...statusSamples.limitsOnly, configured: { process: { max_pids: 64 }, network: { future: 1 } } } } });
    const d = await openEditor();
    expect(await within(d).findByText(t('sb.ed.unsupported', { fields: 'network.future' }).replaceAll('\n', ' '))).toBeInTheDocument();
    await fillMemory(d, '64M');
    expect(saveButton(d)).toBeDisabled();
  });

  it('a pre-save refusal stays in the drawer with the daemon\'s words, even one quoting "NOT applied"', async () => {
    const text = 'sandbox.filesystem.writable "/srv/NOT applied": No such file or directory (os error 2)';
    panel({ status: {}, edit: () => ({ status: 400, body: { error: text } }) });
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await within(d).findByText(t('sb.out.refused', { text }))).toBeInTheDocument();
  });

  it('an unknown program is a refusal', async () => {
    panel({ status: {}, edit: () => ({ status: 400, body: { error: 'program 7 not found' } }) });
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await within(d).findByText(t('sb.out.refused', { text: 'program 7 not found' }))).toBeInTheDocument();
  });

  it('too large', async () => {
    panel({ status: {}, edit: () => ({ status: 413, body: { error: 'PAYLOAD_TOO_LARGE' } }) });
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await within(d).findByText(t('sb.out.tooLarge'))).toBeInTheDocument();
  });

  it.each([
    'program 7 saved but NOT applied, so it was not (re)started: bwrap missing',
    'program 7 persisted but its configuration was NOT applied (reload failed); firewall rules kept — fix and re-apply',
    'program 7 saved but NOT applied: nft failed',
    'program 7 was updated but its configuration was NOT removed (see daemon log); retry',
  ])('a post-save 400 is saved but not applied, with Re-apply: %s', async (text) => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = (req, id) => {
      const block = (req.body as { sandbox: never }).sandbox;
      (w.status as Record<string, unknown>)[id] = statusFor(block);
      return { status: 400, body: { error: text } };
    };
    panel(w);
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await screen.findByText(t('sb.out.notApplied', { text }))).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Re-apply sends the stored block once per press.
    await userEvent.click(await screen.findByRole('button', { name: t('sb.reapply') }));
    await waitFor(() => expect(w.sent).toHaveLength(2));
    expect(w.sent?.[1]).toEqual({ id: '7', body: { sandbox: { process: { max_memory: '64M' } } } });
  });

  it('a 400 naming another program is not this one\'s post-save failure', async () => {
    const text = 'program 77 saved but NOT applied: nft failed';
    panel({ status: {}, edit: () => ({ status: 400, body: { error: text } }) });
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await within(d).findByText(t('sb.out.refused', { text }))).toBeInTheDocument();
  });

  it('a 400 with no readable text (an over-cap body) is unclear: Save blocked, a status read proves it', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = (req, id) => {
      (w.status as Record<string, unknown>)[id] = statusFor((req.body as { sandbox: never }).sandbox);
      return { status: 400, body: { error: 'x'.repeat(70000) } };
    };
    panel(w);
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('sb.add') })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeInTheDocument();
  });

  it('an unclear save keeps blocking after the panel remounts (another program opened, then this one)', async () => {
    const w: SandboxWorld = { status: {}, sent: [], edit: () => ({ status: 400, body: { error: 'x'.repeat(70000) } }) };
    const first = panel(w);
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    first.unmount();
    panel(w);
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: t('sb.add') })).toHaveAttribute('aria-disabled', 'true');
    expect(w.sent).toHaveLength(1);
  });

  it('a save that may have gone through is held; another stored block never proves it', async () => {
    const w: SandboxWorld = { status: {}, sent: [], edit: () => answersPending() };
    panel(w);
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
    // Another program's status holds exactly the sent block: it proves nothing for program 7.
    (w.status as Record<string, unknown>)['8'] = statusFor({ process: { max_memory: '64M' } });
    (w.status as Record<string, unknown>)['7'] = statusFor({ process: { max_memory: '128M' } });
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.stillUnknown'))).toBeInTheDocument();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
    // Program 7 now holds the sent block: proved, and the hold is freed.
    (w.status as Record<string, unknown>)['7'] = statusFor({ process: { max_memory: '64M' } });
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeInTheDocument();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0);
  });

  it('program settings the daemon refuses only matter for a policy that restricts something', async () => {
    panel({ status: {}, program: { '7': programSamples.root } });
    const d = await openEditor('sb.add');
    await within(d).findByRole('textbox', { name: t('sb.ed.maxMemory') });
    await waitFor(() => expect(within(d).queryByText(t('sb.ed.loading'))).toBeNull());
    expect(within(d).queryByText(t('sb.err.root'))).toBeNull();
    await fillMemory(d, '64M');
    expect(await within(d).findByText(t('sb.err.root'))).toBeInTheDocument();
  });

  it('a held save shows again after a reload, with Check again', async () => {
    const w: SandboxWorld = { status: {}, sent: [], edit: () => answersPending() };
    const first = panel(w);
    const d = await openEditor('sb.add');
    await fillMemory(d, '64M');
    await userEvent.click(saveButton(d));
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    first.unmount();
    reloadChangesForTests();
    panel(w);
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: t('sb.add') })).toHaveAttribute('aria-disabled', 'true');
  });

  it('another page\'s held sandbox save is shown read-only and blocks this one', async () => {
    let target: Target | null = null;
    const w: SandboxWorld = { status: {}, sent: [], edit: () => answersPending(), onStatus: (req) => (target ??= req.target) };
    panel(w);
    await screen.findByRole('button', { name: t('sb.add') });
    if (!target) throw new Error('no computer on the status read');
    const other = defineMutation<{ id: string; target: Target }>(sandboxRoutes.edit, {
      input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: { sandbox: null } }),
      lock: SANDBOX_LOCK,
      lockKey: (v) => ({ id: v.id }),
      identity: (v) => ({ id: v.id, sentFp: 'x', beforeFp: 'y' }),
      page: 'computers',
    });
    await other.run({ id: '7', target });
    expect(await screen.findByText(t('sb.out.elsewhere'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    expect(screen.getByRole('button', { name: t('sb.add') })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a held removal is proved only by a status with no block', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.limitsOnly }, sent: [], edit: () => answersPending() };
    panel(w);
    const d = await openEditor();
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.remove') }));
    await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.stillUnknown'))).toBeInTheDocument();
    (w.status as Record<string, unknown>)['7'] = statusSamples.none;
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.savedRunning', { name: 'web' }))).toBeInTheDocument();
  });
});

function answersPending() {
  return { status: 502, body: { error: 'BAD_GATEWAY' } };
}


// The editor's top text says what the panel limits and when a save applies.
describe('editor top text', () => {
  it('names what the sandbox limits and when saved limits apply', async () => {
    panel({ status: {}, host: hostSamples.ok, sent: [] });
    const d = await openEditor('sb.add');
    expect(within(d).getByText('Limits its files, network and resources from its next start.')).toBeInTheDocument();
  });
});
