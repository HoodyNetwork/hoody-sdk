// Usability at 390/768: states a person could not see or act on.
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, queryClient } from '@core';
import { resetChanges } from '@core/changes';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { statusSamples } from './samples';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import strings from './strings.en.json';

const t = makeT(strings);
const rowOf = (): ProgramRow => ({ key: 'prog:7', id: '7', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null, up: 60, port: 8000, range: null, parts: [], partsUp: 0, stop: null, ends: null, known: true, attention: false, bucket: 0, can: {} as ProgramRow['can'] });
const panel = (w: SandboxWorld) => {
  bootFixtureCore({ rules: sandboxRulesFor(w) });
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <SandboxPanel row={rowOf()} />
    </QueryClientProvider>,
  );
};
async function openEditor(label: 'sb.edit' | 'sb.add' = 'sb.edit') {
  await userEvent.click(await screen.findByRole('button', { name: t(label) }));
  return screen.findByRole('dialog');
}
const st = (w: SandboxWorld) => w.status as Record<string, unknown>;

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});

describe('a save outcome shows where the person looks', () => {
  it('the outcome comes before the saved-policy facts, so it is not below a long policy', async () => {
    const w: SandboxWorld = { status: { '7': statusFor({ process: { max_memory: '32M' } }) }, sent: [] };
    w.edit = (req, id) => {
      st(w)[id] = { ...(statusFor((req.body as { sandbox: never }).sandbox) as object), rev: null, problems: ['sandbox is configured but NOT applied'], firewall: 'degraded' };
      return { status: 400, body: { error: 'program 7 saved but NOT applied: nft failed' } };
    };
    panel(w);
    const d = await openEditor();
    const mem = within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') });
    await userEvent.clear(mem);
    await userEvent.type(mem, '64M');
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
    const note = await screen.findByText(t('sb.out.notAppliedT'));
    const policy = await screen.findByRole('list', { name: t('sb.row.configured') });
    expect(note.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('a policy this Hub cannot edit can still be removed', () => {
  it('Remove stays available and sends the removal; the band says so', async () => {
    const w: SandboxWorld = { status: { '7': { ...statusSamples.limitsOnly, configured: { process: { max_pids: 64 }, network: { future: 1 } } } }, sent: [] };
    panel(w);
    const d = await openEditor();
    expect(await within(d).findByText(t('sb.ed.unsupported', { fields: 'network.future' }).replaceAll('\n', ' '))).toBeInTheDocument();
    const remove = within(d).getByRole('button', { name: t('sb.ed.remove') });
    expect(remove).toBeEnabled();
    expect(within(d).getByRole('button', { name: t('sb.ed.save') })).toBeDisabled();
    await userEvent.click(remove);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
    await waitFor(() => expect(w.sent).toEqual([{ id: '7', body: { sandbox: null } }]));
  });
});

describe('Remove works whatever the form holds', () => {
  const removeSends = async (w: SandboxWorld, d: HTMLElement) => {
    const remove = within(d).getByRole('button', { name: t('sb.ed.remove') });
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
    await waitFor(() => expect(w.sent).toEqual([{ id: '7', body: { sandbox: null } }]));
  };
  it('a policy whose only settings this Hub cannot edit can be removed', async () => {
    const w: SandboxWorld = { status: { '7': { ...statusSamples.limitsOnly, configured: { network: { future: 1 } } } }, sent: [] };
    panel(w);
    const d = await openEditor();
    expect(await within(d).findByText(t('sb.ed.unsupported', { fields: 'network.future' }).replaceAll('\n', ' '))).toBeInTheDocument();
    await removeSends(w, d);
  });
  it('clearing the last setting this Hub can edit, beside one it cannot, still leaves a working Remove', async () => {
    const w: SandboxWorld = { status: { '7': { ...statusSamples.limitsOnly, configured: { process: { max_pids: 64 }, network: { future: 1 } } } }, sent: [] };
    panel(w);
    const d = await openEditor();
    await userEvent.clear(within(d).getByRole('textbox', { name: t('sb.ed.maxPids') }));
    await removeSends(w, d);
  });
});

describe('a refused Save says why next to the button', () => {
  it('"Fix the marked fields first" is in the footer, not at the end of a long form', async () => {
    panel({ status: {}, sent: [] });
    const d = await openEditor('sb.add');
    await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), 'lots');
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
    const why = await within(d).findByText(t('sb.ed.fixFirst'));
    expect(why.closest('[data-drawer-body]')).toBeNull();
  });
});

describe('a field that does not apply says so', () => {
  it('under Connections Any, the greyed outgoing ports field says it applies only when Limited', async () => {
    panel({ status: {}, sent: [] });
    const d = await openEditor('sb.add');
    expect(within(d).getByRole('textbox', { name: t('sb.ed.connectPorts') })).toBeDisabled();
    expect(within(d).getByText(t('sb.ed.connectPorts.off'))).toBeInTheDocument();
    expect(within(d).queryByText(t('sb.ed.connectPorts.d'))).toBeNull();
  });
});

describe('outcome texts name the controls that exist', () => {
  it('the failed re-apply read names the Re-apply button by its label; no text asks to "dismiss"', () => {
    expect(t('sb.out.reapplyReadFailed')).toContain(t('sb.reapply'));
    for (const [k, v] of Object.entries(strings)) if (k.startsWith('sb.out.')) expect(v.toLowerCase(), k).not.toContain('dismiss this');
  });
  it('outcome texts point at no position: the note now sits above the policy', () => {
    for (const [k, v] of Object.entries(strings)) if (k.startsWith('sb.out.')) expect(v.toLowerCase(), k).not.toMatch(/shown (above|below)/);
  });
});
