// Rename and automatic titles: when a rename's answer is lost, Check again proves it only by the chat showing the sent title as a
// person's title. A title the agent made itself (name_auto) proves nothing: not a clear (it may predate a clear that has not
// arrived yet), and not a rename to the same words. When no read can prove it, the warned Stop tracking ends that one record,
// sends nothing, and Rename is offered again.
import { boot } from '@core/test/env';
import type { Capability, CapFacts, ConversationSource, ConvSnapshot } from '@kit';
import type { Settled } from '@core/providers/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: () => 'k' }));
import strings from './ConvMenu.strings.en.json';
import { ConvMenu } from './ConvMenu';
import { createRenameAttempts, type RenameAttempt, type RenameAttempts } from './renameAttempts';
import type { agent } from '@core';

const FACTS: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'unknown', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' },
};
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Mine', gates: [],
  blocks: [
    { k: 'user', key: 'u1', text: 'Plan the backup job.', at: 1 },
    { k: 'reply', key: 'r1', text: 'Here is a plan.', streaming: false, final: true, cost: null, at: 2 },
  ],
  meta: { computer: 'atlas', realm: 'Personal', status: 'idle' },
};
const REF = { computer: 'atlas.1234', realm: 'global', sid: 's-1' };
const ID1 = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
const source = (): ConversationSource => ({
  kind: 'session', ref: REF, snapshot: () => SNAP, subscribe: () => () => {}, watch: () => {},
  can: () => ({ ok: true }) as Capability,
});

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const lostAnswer: Settled<unknown> = { ok: false, err: { kind: 'pending', code: 'network', status: 0, retryAfter: null, details: {} } };
interface Fake { rename: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> }
const lost = (session: Record<string, unknown>): Fake & agent.SessionApi => ({
  rename: vi.fn(() => Promise.resolve(lostAnswer)),
  read: vi.fn(() => Promise.resolve(ok({ session }))),
}) as Fake & agent.SessionApi;

let att: RenameAttempts;
beforeEach(() => { boot(); att = createRenameAttempts(); });
afterEach(() => cleanup());

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const renameAndLose = async (a: Fake & agent.SessionApi, onRenamed: (...x: unknown[]) => void, value: string) => {
  render(<ConvMenu attempts={att} source={source()} target={null} api={a} onRenamed={onRenamed} />);
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(strings['menu.rename']) }));
  const d = await screen.findByRole('alertdialog');
  fireEvent.change(within(d).getByRole('textbox'), { target: { value } });
  await userEvent.click(within(d).getByRole('button', { name: strings['rename.go'] }));
  await flush();
  expect(a.rename).toHaveBeenCalledTimes(1);
  expect(a.rename.mock.calls[0]?.[1]).toBe(value);
  await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
  await flush();
};
const stillUnknown = (a: Fake, onRenamed: ReturnType<typeof vi.fn>) => {
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(onRenamed).not.toHaveBeenCalled();
  expect(a.rename).toHaveBeenCalledTimes(1);
};

describe('a rename whose answer was lost, and the agent\'s automatic titles', () => {
  it('a cleared title: a title the agent made proves nothing (the clear may not have arrived)', async () => {
    const a = lost({ id: 's-1', name: 'Plan the backup job', name_auto: true }), onRenamed = vi.fn();
    await renameAndLose(a, onRenamed, '');
    stillUnknown(a, onRenamed);
  });
  it('a cleared title: an unnamed chat proves it', async () => {
    const a = lost({ id: 's-1' }), onRenamed = vi.fn();
    await renameAndLose(a, onRenamed, '');
    expect(onRenamed).toHaveBeenCalledWith(null, ID1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('a new name: the same words as a title the agent made prove nothing', async () => {
    const a = lost({ id: 's-1', name: 'Backup plan', name_auto: true }), onRenamed = vi.fn();
    await renameAndLose(a, onRenamed, 'Backup plan');
    stillUnknown(a, onRenamed);
  });
  it('a new name: the same words as a person\'s title prove it', async () => {
    const a = lost({ id: 's-1', name: 'Backup plan' }), onRenamed = vi.fn();
    await renameAndLose(a, onRenamed, 'Backup plan');
    expect(onRenamed).toHaveBeenCalledWith('Backup plan', ID1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('a read that cannot be (name_auto true with no title) proves nothing', async () => {
    const a = lost({ id: 's-1', name: '', name_auto: true }), onRenamed = vi.fn();
    await renameAndLose(a, onRenamed, '');
    stillUnknown(a, onRenamed);
  });

  it('a lost clear that every read shows with a new automatic title: Stop tracking, warned, ends it; Rename is offered again', async () => {
    const a = lost({ id: 's-1', name: 'Plan the backup job', name_auto: true }), onRenamed = vi.fn();
    await renameAndLose(a, onRenamed, '');
    stillUnknown(a, onRenamed);
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByRole('textbox')).toBeDisabled();
    const stop = within(d).getByRole('button', { name: strings['rename.dismiss'] });
    // The warning is the outcome's line and the button's description.
    expect(stop).toHaveAccessibleDescription(strings['rename.dismissWarn']);
    await userEvent.click(stop);
    // Neither done nor failed: nothing was sent, nothing heard, the dialog stays open with the field free again.
    expect(a.rename).toHaveBeenCalledTimes(1);
    expect(onRenamed).not.toHaveBeenCalled();
    expect(within(d).queryByRole('button', { name: strings['rename.dismiss'] })).toBeNull();
    expect(within(d).queryByRole('button', { name: /check again/i })).toBeNull();
    expect(within(d).getByRole('textbox')).toBeEnabled();
    // Rename is offered again: a press sends a new request (the person's own, never a resend of the old record).
    await userEvent.click(within(d).getByRole('button', { name: strings['rename.go'] }));
    await flush();
    expect(a.rename).toHaveBeenCalledTimes(2);
  });
});

describe('Stop tracking a rename record (drop)', () => {
  const rec = (name: string): RenameAttempt => ({ key: 'k', chat: ID1, sid: 's-1', realm: 'global', calls: lost({ id: 's-1' }), name, phase: 'sending' });
  it('ends only the unknown record it was handed: never one still sending, a settled one, or a later rename of the chat', () => {
    const first = rec('');
    att.set(first);
    expect(att.drop(first)).toBe(false);
    expect(att.get('k')).toBe(first);
    att.lost(first);
    expect(att.drop(first)).toBe(true);
    expect(first.phase).toBe('dropped');
    expect(att.get('k')).toBeUndefined();
    const later = rec('Backup plan');
    att.set(later);
    att.lost(later);
    expect(att.drop(first)).toBe(false);
    expect(att.get('k')).toBe(later);
    att.end(later, 'done');
    expect(att.drop(later)).toBe(false);
  });
});
