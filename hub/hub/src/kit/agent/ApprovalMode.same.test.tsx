// The composer's approval-mode chip and Details → Session's approvals show ONE state: both are drawn from the same useApproval
// read, and Allow everything / Auto-approve is switched by the host from either place. After every transition (on from the
// chip, off from Details, on from Details, off from the chip's own button, a mode change, and a send after which the agent
// holds something else) both say the same thing, and it is what the agent holds.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { AllowEverythingConfirm, ApprovalMode, useApprovalModeNote } from './ApprovalMode';
import { ApprovalSection } from './ApprovalSection';
import { forgetApprovalAttempts, takeApprovalAttempt, useApproval } from './useApproval';
import modeStrings from './ApprovalMode.strings.en.json';
import apStrings from './ApprovalSection.strings.en.json';

type Settled = { ok: true; body: unknown } | { ok: false; err: { kind: 'failed'; code: string; status: number; retryAfter: null; details: Record<string, never> } };
const W = vi.hoisted(() => ({ row: {} as Record<string, unknown>, sent: [] as string[], hostSent: [] as boolean[] }));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const ok = (): Promise<Settled> => Promise.resolve({ ok: true, body: { status: 'ok' } });
  const fake = (): CoreMod.agent.ApprovalApi => ({
    approval: () => Promise.resolve({ ok: true, body: { ...W.row } }),
    setMode: (_id, m) => { W.sent.push(`mode=${m}`); W.row.mode = m; W.row.revision = (W.row.revision as number) + 1; return ok(); },
    // The page never switches auto-approve through the plain route: the host's switch does (hostSwitch below).
    setYolo: (_id, on) => { W.sent.push(`yolo=${String(on)}`); W.row.yolo = on; return ok(); },
  });
  return { ...real, agent: { ...real.agent, approvalApi: () => fake() } };
});

const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'srv' } } as unknown as Target;
/** The host's switch as the active source makes it: the conversation's shared attempt, the agent's answer, then the attempt ends. */
const hostSwitch = (want: boolean): boolean => {
  const h = takeApprovalAttempt(TARGET, 'global', 's1', { field: 'yolo', value: want });
  if (!h) return false;
  W.hostSent.push(want);
  void Promise.resolve().then(() => { W.row.yolo = want; h.settle(); });
  return true;
};

function Page() {
  const ap = useApproval(TARGET, 's1', 'global');
  const [askFor, setAskFor] = useState<string | null>(null);
  const note = useApprovalModeNote(ap);
  // Details draws the same read; its Auto-approve goes through the host's switch (as SessionTab's apSave does).
  const details = { ...ap, save: (c: CoreMod.agent.ApprovalChange) => { if (c.field === 'yolo') hostSwitch(c.value); else ap.save(c); } };
  return (
    <>
      <ApprovalMode data={ap} busy={false} setYolo={hostSwitch} setAskFor={setAskFor} onSent={note.sent} />
      <AllowEverythingConfirm data={ap} setYolo={hostSwitch} computer="atlas" askFor={askFor} setAskFor={setAskFor} onSent={note.sent} />
      <ApprovalSection data={details} computer="atlas" busy={false} waiting={false} />
      <button type="button" data-testid="after-send" hidden onClick={ap.retry} />
    </>
  );
}
const chip = () => screen.getByRole('button', { name: /^Approvals: / });
const sw = () => screen.queryByRole('switch', { name: apStrings['ap.yolo'] }) as HTMLInputElement | null;
const strict = () => screen.getByRole('radio', { name: new RegExp(`^${apStrings['ap.strict']}`) }) as HTMLInputElement;
/** Both surfaces, as one line: the chip's state and what Details shows. */
const both = () => `${chip().getAttribute('data-approval-mode')}|${strict().checked ? 'strict' : sw()?.checked ? 'auto-on' : 'auto-off'}`;
const SAME: Record<string, string> = { default: 'default|auto-off', everything: 'everything|auto-on', always: 'always|strict' };
const shows = (state: keyof typeof SAME) => waitFor(() => expect(both()).toBe(SAME[state]));

beforeEach(() => {
  W.row = { mode: 'default', locked: false, revision: 3, yolo: false };
  W.sent = [];
  W.hostSent = [];
  forgetApprovalAttempts();
});

describe('the chip and Details show one state', () => {
  it('after every transition, from either place, and after a send', async () => {
    render(<Page />);
    await shows('default');

    // On, from the chip: its confirm, then the host's switch.
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^Allow everything/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: modeStrings['am.confirmGo'] }));
    await shows('everything');
    expect(W.row.yolo).toBe(true);

    // Off, from Details.
    fireEvent.click(sw()!);
    await shows('default');
    expect(W.row.yolo).toBe(false);

    // On, from Details (its own confirm).
    fireEvent.click(sw()!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: apStrings['ap.yoloConfirmGo'] }));
    await shows('everything');

    // Off, from the chip's menu: Ask when needed.
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^Ask when needed/ }));
    await shows('default');

    // Every switch of auto-approve went through the host, never the plain route.
    expect(W.hostSent).toEqual([true, false, true, false]);
    expect(W.sent.filter((x) => x.startsWith('yolo='))).toEqual([]);

    // The mode, from the chip.
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^Ask every time/ }));
    await shows('always');
    expect(W.sent).toEqual(['mode=always']);
    // And back, from Details.
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${apStrings['ap.default']}`) }));
    await shows('default');

    // A send: the page reads the approvals again, and the agent now holds something else (switched on elsewhere).
    W.row.yolo = true;
    await act(async () => { fireEvent.click(screen.getByTestId('after-send')); });
    await shows('everything');
    // ...and off again elsewhere (the agent restarted): both follow at the next read.
    W.row.yolo = false;
    await act(async () => { fireEvent.click(screen.getByTestId('after-send')); });
    await shows('default');
  });
});
