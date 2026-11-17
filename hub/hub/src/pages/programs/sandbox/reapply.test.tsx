// Re-apply reads the stored block fresh and sends exactly the failed save's own block,
// only while that block is still stored; a status never proves a re-apply applied (nothing in it reports the
// installed definition); the live blocking state is checked again after the fresh read; a status missing a
// documented field is malformed; a confirmation opened before the sandbox hold is held too; network words name
// their scope; `.` components are normalized for comparisons; interpolation tokens in daemon text are hidden; a
// failed removal says removal.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, heldChanges, queryClient, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { makeT } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type { Row as ProgramRow } from '../logic';
import page from '../page';
import { opsStore } from '../parts/ops';
import { daemonText, SANDBOX_LOCK } from './data';
import { sandboxRulesFor, statusFor, type SandboxWorld } from './fixtures';
import { check, fromBlock } from './form';
import { readStatus } from './model';
import { getNote, putNote } from './notes';
import { SandboxPanel, resetSandboxNotesForTests } from './SandboxPanel';
import { statusSamples } from './samples';
import strings from './strings.en.json';
import { blockLines } from './words';

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
async function addMemory(v = '64M') {
  await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
  const d = await screen.findByRole('dialog');
  await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), v);
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
  return d;
}
const notApplied = (w: SandboxWorld) => (req: { body: unknown }, id: string) => {
  st(w)[id] = { ...(statusFor((req.body as { sandbox: never }).sandbox) as object), rev: null, problems: ['sandbox is configured but NOT applied'], firewall: 'degraded' };
  return { status: 400, body: { error: 'program 7 saved but NOT applied: nft failed' } };
};

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});
afterEach(() => resetSandboxNotesForTests());

describe('Re-apply', () => {
  it('reads the stored block first: another policy stored since sends nothing and says so', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = notApplied(w);
    panel(w);
    await addMemory();
    await screen.findByText(t('sb.out.notAppliedT'));
    const again = await screen.findByRole('button', { name: t('sb.reapply') });
    st(w)['7'] = statusFor({ network: { mode: 'none' } });
    await userEvent.click(again);
    expect(await screen.findByText(t('sb.out.reapplyChanged'))).toBeInTheDocument();
    expect(w.sent).toHaveLength(1);
  });

  it('sends the stored block exactly as the fresh read returned it, never a copy kept here', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = notApplied(w);
    panel(w);
    await addMemory();
    await screen.findByText(t('sb.out.notAppliedT'));
    // The same stored block (same fingerprint: the daemon treats an explicit null as absent), different bytes.
    const stored = { process: { max_memory: '64M' }, network: null };
    st(w)['7'] = { ...(st(w)['7'] as object), configured: stored };
    w.edit = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await userEvent.click(await screen.findByRole('button', { name: t('sb.reapply') }));
    await waitFor(() => expect(w.sent).toHaveLength(2));
    expect(w.sent?.[1]?.body).toStrictEqual({ sandbox: stored });
  });
});

describe('Re-apply rechecks the live blocking state after its fresh read', () => {
  it('a restart that starts waiting during the read: nothing is sent again', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = notApplied(w);
    panel(w);
    await addMemory();
    await screen.findByText(t('sb.out.notAppliedT'));
    const again = await screen.findByRole('button', { name: t('sb.reapply') });
    w.onStatus = () => {
      const { part, target } = partOf();
      opsStore.set(`${part}|prog:7`, { act: 'restart', target, port: null, status: 'working', press: { kind: 'prog', id: '7', action: 'restart', port: null, target } } as never);
    };
    await userEvent.click(again);
    await waitFor(() => expect(opsStore.snapshot().size).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(w.sent).toHaveLength(1);
    opsStore.clear(`${partOf().part}|prog:7`);
  });
});

/** A removal whose answer never came: a held change of this program (sentFp = no block). */
async function pendingRemoval(w: SandboxWorld) {
  w.edit = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
  panel(w);
  await userEvent.click(await screen.findByRole('button', { name: t('sb.edit') }));
  const d = await screen.findByRole('dialog');
  await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.remove') }));
  await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
  await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1));
}

describe('a note about another send is never taken for the held one', () => {
  it('Check: a removal saved but not applied says removal, though the note names another block', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.set }, sent: [] };
    await pendingRemoval(w);
    const at = `${partOf().part}|prog:7`;
    putNote(at, { outcome: { kind: 'pending', hold: undefined }, sentFp: 'another-send', sentBlock: { process: { max_memory: '64M' } }, beforeFp: 'b' });
    st(w)['7'] = { ...(statusFor(null) as object), problems: ['sandbox is configured but NOT applied'], firewall: 'degraded' };
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.removeNotAppliedT'))).toBeInTheDocument();
  });

  it('Dismiss of the held change keeps an unclear note about another send (it still blocks)', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.set }, sent: [] };
    await pendingRemoval(w);
    const at = `${partOf().part}|prog:7`;
    putNote(at, { outcome: { kind: 'unclear' }, sentFp: 'another-send', sentBlock: null, beforeFp: 'b' });
    await userEvent.click(screen.getAllByRole('button', { name: /stop tracking/i })[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.out.dismissOk') }));
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(0));
    expect(getNote(at)?.sentFp).toBe('another-send');
    expect(screen.getByRole('button', { name: t('sb.edit') })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('held saves and their Check', () => {
  it('Check of a held save with no note here (another tab, a reload): a policy saved but not applied is not called a removal', async () => {
    const w: SandboxWorld = { status: {}, sent: [], edit: () => ({ status: 502, body: { error: 'BAD_GATEWAY' } }) };
    panel(w);
    await addMemory();
    await waitFor(() => expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1));
    resetSandboxNotesForTests();
    st(w)['7'] = { ...(statusFor({ process: { max_memory: '64M' } }) as object), rev: null, problems: ['sandbox is configured but NOT applied'], firewall: 'degraded' };
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.notAppliedT'))).toBeInTheDocument();
    expect(screen.queryByText(t('sb.out.removeNotAppliedT'))).toBeNull();
  });

  it('a reference name with parentheses inside is hidden whole', () => {
    const out = daemonText({ data: { error: 'uses %(ENV_A(B)TAIL)s and %(ENV_C(D)s, no value' } } as never);
    expect(out).not.toContain('TAIL');
    expect(out).not.toContain('ENV_C');
    expect(out).not.toContain('(D');
  });

  it('a Re-apply whose fresh read fails says it was not sent, and keeps Re-apply', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = notApplied(w);
    panel(w);
    await addMemory();
    await screen.findByText(t('sb.out.notAppliedT'));
    w.failStatus = true;
    await userEvent.click(await screen.findByRole('button', { name: t('sb.reapply') }));
    expect(await screen.findByText(t('sb.out.reapplyReadFailed'))).toBeInTheDocument();
    expect(w.sent).toHaveLength(1);
    expect(screen.getByRole('button', { name: t('sb.reapply') })).toBeInTheDocument();
  });
});

describe('a re-apply is never proved by the status', () => {
  it('Check again on a held re-apply: the block is stored and clean, still not confirmed, with words that say why', async () => {
    const w: SandboxWorld = { status: {}, sent: [] };
    w.edit = notApplied(w);
    panel(w);
    await addMemory();
    await screen.findByText(t('sb.out.notAppliedT'));
    w.edit = () => ({ status: 502, body: { error: 'BAD_GATEWAY' } });
    await userEvent.click(await screen.findByRole('button', { name: t('sb.reapply') }));
    expect(await screen.findByText(t('sb.out.unknown'))).toBeInTheDocument();
    st(w)['7'] = statusFor({ process: { max_memory: '64M' } });
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(await screen.findByText(t('sb.out.storedUnconfirmed'))).toBeInTheDocument();
    expect(screen.queryByText(t('sb.out.reapplied'))).toBeNull();
    expect(heldChanges(SANDBOX_LOCK)).toHaveLength(1);
  });
});

describe('the live blocking state is checked again after the fresh read', () => {
  it('a restart that starts waiting during the read: the save is not sent', async () => {
    let arm = false;
    const w: SandboxWorld = { status: {}, sent: [] };
    w.onStatus = () => {
      if (!arm) return;
      const { part, target } = partOf();
      opsStore.set(`${part}|prog:7`, { act: 'restart', target, port: null, status: 'working', press: { kind: 'prog', id: '7', action: 'restart', port: null, target } } as never);
    };
    panel(w);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.add') }));
    const d = await screen.findByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox', { name: t('sb.ed.maxMemory') }), '64M');
    arm = true;
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.save') }));
    expect(await within(d).findByText(t('sb.out.notSent'))).toBeInTheDocument();
    expect(w.sent).toHaveLength(0);
    const { part } = partOf();
    opsStore.clear(`${part}|prog:7`);
  });
});

describe('a confirmation opened before the sandbox hold', () => {
  it('confirming sends nothing while a sandbox save of that program is unclear', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A100' });
    const btn = (await screen.findAllByRole('button', { name: /^Restart hoody-agent$/ }))[0] as HTMLElement;
    await userEvent.click(btn);
    const go = await screen.findByRole('button', { name: 'Restart it' });
    const { part } = partOf();
    putNote(`${part}|prog:100`, { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
    await userEvent.click(go);
    await new Promise((r) => setTimeout(r, 50));
    for (const [k] of opsStore.snapshot()) expect(k.endsWith('|prog:100')).toBe(false);
  });
});

describe('honest words and reads', () => {
  it('a status missing a documented field is malformed', () => {
    const base = statusSamples.none as Record<string, unknown>;
    for (const k of ['rev', 'effective', 'live', 'firewall', 'problems']) {
      const { [k]: _drop, ...rest } = base;
      expect(readStatus(rest), k).toBeNull();
    }
    expect(readStatus({ ...base, live: { table_present: 'yes', chain: null, rules: [] } })).toBeNull();
    expect(readStatus(base)).not.toBeNull();
  });

  it('inbound and rate lines name IPv4 TCP to its listening ports; in full mode other ports are said to be unfiltered', () => {
    const full = blockLines(t, { network: { ingress_rate_limit: '50/s' } });
    expect(full).toContain(t('sb.w.rate', { rate: '50/s' }));
    expect(t('sb.w.rate', { rate: '50/s' })).toMatch(/IPv4 TCP/);
    expect(t('sb.w.inbound', { list: 'x' })).toMatch(/listening ports/);
    expect(full).toContain(t('sb.w.otherPorts'));
    expect(blockLines(t, { network: { mode: 'restricted', ingress_rate_limit: '50/s' } })).not.toContain(t('sb.w.otherPorts'));
  });

  it('`.` components are normalized for comparisons', () => {
    const f = fromBlock({ process: { max_pids: 8 } }).form;
    const facts = { root: false, terminal: false, directory: '/run/./user/1000/app', env: [], displayLiteral: true } as never;
    expect(check(f, facts).some((p) => p.code === 'runUser')).toBe(true);
    expect(check({ ...f, hidden: '/./etc' }, null).some((p) => p.field === 'hidden')).toBe(true);
  });

  it('interpolation tokens in the daemon text are hidden', () => {
    const raw = 'program 7 persisted but its configuration was NOT applied (its environment uses %(ENV_TOKEN)s, which has no value); fix and re-apply';
    const out = daemonText({ data: { error: raw } } as never);
    expect(out).not.toContain('ENV_TOKEN');
    expect(out).toContain('%(…)s');
  });

  it('a removal that was saved but not applied says removal', async () => {
    const w: SandboxWorld = { status: { '7': statusSamples.set }, sent: [] };
    w.edit = (_r, id) => {
      st(w)[id] = statusFor(null);
      return { status: 400, body: { error: 'program 7 was updated but its configuration was NOT removed (see daemon log); retry' } };
    };
    panel(w);
    await userEvent.click(await screen.findByRole('button', { name: t('sb.edit') }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: t('sb.ed.remove') }));
    await userEvent.click(await screen.findByRole('button', { name: t('sb.ed.removeGo') }));
    expect(await screen.findByText(t('sb.out.removeNotAppliedT'))).toBeInTheDocument();
  });
});
