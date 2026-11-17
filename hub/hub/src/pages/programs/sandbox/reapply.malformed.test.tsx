// A Re-apply whose fresh read is a malformed 2xx keeps Re-apply (the failed
// save's note is still valid; the next press reads fresh again); a Check never carries a block another send left
// in this tab's note, so a later Check of a held save of that block offers no Re-apply built from it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, heldChanges, queryClient, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { fingerprint } from './block';
import { SANDBOX_LOCK, save } from './data';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { putNote } from './notes';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import strings from './strings.en.json';

const t = makeT(strings);
const rowOf = (): ProgramRow => ({ key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'] });
const panel = (w: SandboxWorld) => {
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  return render(<QueryClientProvider client={queryClient}><SandboxPanel row={rowOf()} /></QueryClientProvider>);
};
const st = (w: SandboxWorld) => w.status as Record<string, unknown>;
const partOf = () => {
  const c = snapshot();
  const tg = c.target as Target;
  return { part: `${c.account ?? '-'}|${c.realm}|${tg.project.id}/${tg.container.id}`, target: tg };
};
async function addMemory(v: string) {
  await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
  const d = await screen.findByRole('dialog');
  await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), v);
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
}
/** Stored but not applied: what the daemon's status shows after a post-save failure. */
const storedNotApplied = (block: unknown) => ({ ...(statusFor(block as never) as object), rev: null, problems: ['sandbox is configured but NOT applied'], firewall: 'degraded' });
const pending = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});
afterEach(() => resetSandboxNotesForTests());

describe('Re-apply after a malformed fresh read', () => {
  it('says not sent, keeps the failed save and its Re-apply, sends nothing', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = (req, id) => {
      st(w)[id] = storedNotApplied((req.body as { sandbox: unknown }).sandbox);
      return { status: 400, body: { error: 'program 7 saved but NOT applied: nft failed' } };
    };
    panel(w);
    await addMemory('64M');
    await screen.findByText(t('sb.out.notAppliedT'));
    st(w)['7'] = { success: true, configured: null };
    await userEvent.click(await screen.findByRole('button', { name: t('sb.reapply') }));
    expect(await screen.findByText(t('sb.out.reapplyReadFailed'))).toBeInTheDocument();
    expect(screen.getByText(t('sb.out.notAppliedT'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('sb.reapply') })).toBeInTheDocument();
    expect(w.sent).toHaveLength(1);
  });
});

describe('Re-apply is offered only while the readable status shows the failed save\'s block', () => {
  it('a refreshed status showing another stored policy hides Re-apply', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = (req, id) => {
      st(w)[id] = storedNotApplied((req.body as { sandbox: unknown }).sandbox);
      return { status: 400, body: { error: 'program 7 saved but NOT applied: nft failed' } };
    };
    panel(w);
    await addMemory('64M');
    await screen.findByRole('button', { name: t('sb.reapply') });
    st(w)['7'] = statusFor({ network: { mode: 'none' } });
    await queryClient.invalidateQueries();
    await waitFor(() => expect(screen.queryByRole('button', { name: t('sb.reapply') })).toBeNull());
  });
});

describe('two Checks of other sends never borrow this tab\'s block', () => {
  it('held A checked, then held B checked: no Re-apply built from a block this tab kept for B', async () => {
    const A = { process: { max_memory: '32M' } };
    const B = { process: { max_memory: '64M' } };
    const w: SandboxWorld = { status: {}, sent: [], edit: pending };
    panel(w);
    // A held save of A (this tab sent it, then forgot it: as after a reload), and a note about B.
    await addMemory('32M');
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1));
    const at = `${partOf().part}|prog:7`;
    putNote(at, { outcome: { kind: 'pending', hold: undefined }, sentFp: fingerprint(B), sentBlock: B, beforeFp: 'b' });
    st(w)['7'] = storedNotApplied(A);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    await screen.findByText(t('sb.out.notAppliedT'));
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0));
    // Another sender's held save of B (same sender identity, nothing written to this tab's notes).
    void save({ id: '7', block: B, beforeFp: fingerprint(A), target: partOf().target });
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1));
    st(w)['7'] = storedNotApplied(B);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0));
    await screen.findByText(t('sb.out.notAppliedT'));
    expect(screen.queryByRole('button', { name: t('sb.reapply') })).toBeNull();
  });
});
