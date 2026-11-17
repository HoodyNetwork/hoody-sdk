// Resume in a new chat in the run detail (money may be spent): two chained sends, each sent once. Offered only after the run's own chat
// refused the Resume for its state (busy, gone, asks before every tool, could not be kept open), and only for a run of
// the computer shown with a folder. The create leaves first; the Resume follows only once the create's own answer proved
// the new chat, holds that chat open and resumes into it through the run's one action store. A lost create answer stays
// "may have been made" and sends nothing more; a lost Resume stays unsure and is never sent again.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a router harness for the kit's links and action bars, not page code (as Runs.test.tsx)
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import type { Ctx } from '@core';
import { boot, R1 } from '@core/test/env';
import type { Run } from './runs';
import type { ActionApi, ActionSettled } from './runActions';
import type { NewChatBody, NewChatIo } from './newChat';
import { resetActionStores, RunDetail } from './Runs';
import { resetResumeHolds } from './runsData';
import strings from './Runs.strings.en.json';

const words = (k: keyof typeof strings, v: Record<string, string | number> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); };
const inRouter = (el: ReactElement) => render(<RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => el }), history: createMemoryHistory({ initialEntries: ['/'] }) }) as never} />);
const BUSY: ActionSettled = { ok: false, err: { kind: 'failed', code: 'session_busy', status: 409 } };
const LOST_RESUME: ActionSettled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };

const failed: Run = {
  id: 'run-1', workflow: 'deploy', sid: 's-1', realm: 'global', state: 'failed', step: null, startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_100_000, cost: 0.5, error: 'exit 1', lastStep: 'build', resumedFrom: null, cwd: '/home/u/app', folder: '/home/u/app', binding: 'c1',
};

function fake(o: { resume?: ActionSettled[]; lists?: Run[][] } = {}) {
  const sent = { resumes: [] as Array<[string, string]> };
  const make = (): ActionApi => ({
    cancel: async () => ({ ok: true, body: {} }),
    resume: async (id, sid, ctx: Ctx | null) => { if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }; sent.resumes.push([id, sid]); return o.resume?.shift() ?? { ok: true, body: { status: 'ok', run_id: 'run-2' } }; },
    list: async (ctx) => { if (!ctx) return null; return o.lists ? (o.lists.length > 1 ? o.lists.shift()! : o.lists[0] ?? []) : [failed]; },
    get: async () => null,
  });
  return { sent, make };
}
const VERSION = {
  session_protocol_version: 3,
  capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true })),
};
function chatIo(answers: Array<unknown | Error> = []) {
  const sent = { creates: [] as NewChatBody[] };
  const io: NewChatIo = {
    status: async (c) => ({ account_id: c.account, auth_active: true, owner_fingerprint: 'fp-1', restriction: 'none' }),
    version: async () => VERSION,
    create: async (_c, _realm, body) => {
      sent.creates.push(body);
      const a = answers.shift() ?? { session_id: 's-new', started: { realm_selector: 'global', computer_id: 'c1', owner_fingerprint: 'fp-1' } };
      if (a instanceof Error) throw a;
      return a;
    },
  };
  return { io, sent };
}
function leaseFake() {
  const tracked: Array<{ ref: LeaseRef; closed: boolean }> = [];
  const mgr = {
    track(ref: LeaseRef): LeaseHandle { const t = { ref, closed: false }; tracked.push(t); return { set() {}, close() { t.closed = true; } }; },
    ensure: async () => {},
    state: () => ({ phase: 'held' }),
  } as unknown as LeaseManager;
  return { mgr, tracked };
}
function show(r: Run, f: ReturnType<typeof fake>, c: ReturnType<typeof chatIo>, l = leaseFake()) {
  return inRouter(<RunDetail run={r} runs={[r]} makeApi={f.make} manager={l.mgr} newChatIo={c.io} adopt={() => {}} chatHref={(sid, realm) => `/chat/${realm}/${sid}`} />);
}
const button = (name: string) => screen.queryByRole('button', { name });
const confirm = (name: string, go = name) => {
  fireEvent.click(button(name)!);
  const dialog = screen.getByRole('alertdialog');
  fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === go)!);
};
/** The Resume in the run's own chat, refused because that chat is busy. */
async function refusedInOwnChat(f: ReturnType<typeof fake>) {
  await settle();
  confirm(words('act.resume'));
  await settle();
  expect(f.sent.resumes).toEqual([['run-1', 's-1']]);
}

beforeEach(() => { boot({ realm: R1 }); resetActionStores(); resetResumeHolds(); });
afterEach(cleanup);

describe('Resume in a new chat', () => {
  it('is not offered before the run\'s own chat refused it', async () => {
    show(failed, fake(), chatIo());
    await settle();
    expect(button(words('act.newChat'))).toBeNull();
  });
  it('after its own chat refused: makes the chat once, holds it, then resumes into it once; resumed in the new chat', async () => {
    const f = fake({ resume: [BUSY], lists: [[failed], [failed], [failed, { ...failed, id: 'run-2', sid: 's-new', state: 'running', step: 'build', finishedAt: null, resumedFrom: 'run-1' }]] });
    const c = chatIo();
    const l = leaseFake();
    show(failed, f, c, l);
    await refusedInOwnChat(f);
    confirm(words('act.newChat'), words('newChat.confirm'));
    await settle();
    expect(c.sent.creates.map((b) => [b.realm, b.computer, b.cwd])).toEqual([['global', 'c1', '/home/u/app']]);
    expect(l.tracked.map((x) => x.ref.sid)).toEqual(['s-1', 's-new']);
    expect(f.sent.resumes).toEqual([['run-1', 's-1'], ['run-1', 's-new']]);
    expect(screen.getByText(words('out.newChat.done'))).toBeTruthy();
    expect(screen.getByRole('link', { name: words('newChat.open') }).getAttribute('href')).toBe('/chat/global/s-new');
    expect(button(words('act.newChat'))).toBeNull();
  });
  it('a lost create answer: says a chat may have been made, resumes nothing, and offers nothing until Stop tracking', async () => {
    const f = fake({ resume: [BUSY] });
    const c = chatIo([Object.assign(new Error('lost'), { kind: 'pending', pending: true, status: 0 })]);
    show(failed, f, c);
    await refusedInOwnChat(f);
    confirm(words('act.newChat'), words('newChat.confirm'));
    await settle();
    expect(screen.getByText(words('out.newChat.unsure'))).toBeTruthy();
    expect(f.sent.resumes).toHaveLength(1);
    expect(button(words('act.newChat'))).toBeNull();
    expect(button(words('act.resume'))).toBeNull();
    // Stop tracking asks first: nothing is forgotten until the question is confirmed.
    fireEvent.click(screen.getByRole('button', { name: words('forget') }));
    await settle();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(button(words('act.newChat'))).toBeNull();
    fireEvent.click(Array.from(screen.getByRole('alertdialog').querySelectorAll('button')).find((b) => b.textContent === words('forgetGo'))!);
    await settle();
    expect(button(words('act.newChat'))).toBeTruthy();
    expect(c.sent.creates).toHaveLength(1);
    expect(f.sent.resumes).toHaveLength(1);
  });
  it('a refused create: says nothing was made and resumes nothing', async () => {
    const f = fake({ resume: [BUSY] });
    const c = chatIo([Object.assign(new Error('no'), { kind: 'failed', status: 400, code: 'bad_request', notApplied: true })]);
    show(failed, f, c);
    await refusedInOwnChat(f);
    confirm(words('act.newChat'), words('newChat.confirm'));
    await settle();
    expect(screen.getByText(words('out.newChat.refused'))).toBeTruthy();
    expect(f.sent.resumes).toHaveLength(1);
  });
  it('a lost Resume into the new chat: unsure, and neither the chat nor the Resume is sent again', async () => {
    const f = fake({ resume: [BUSY, LOST_RESUME] });
    const c = chatIo();
    show(failed, f, c);
    await refusedInOwnChat(f);
    confirm(words('act.newChat'), words('newChat.confirm'));
    await settle();
    expect(screen.getByText(words('out.resume.unsure'))).toBeTruthy();
    expect(button(words('act.newChat'))).toBeNull();
    expect(button(words('act.resume'))).toBeNull();
    expect(c.sent.creates).toHaveLength(1);
    expect(f.sent.resumes).toEqual([['run-1', 's-1'], ['run-1', 's-new']]);
  });
  it('a run of another computer, or one with no folder, is not offered a new chat', async () => {
    for (const r of [{ ...failed, binding: 'c2' }, { ...failed, binding: undefined }, { ...failed, folder: undefined }]) {
      const f = fake({ resume: [BUSY] });
      show(r, f, chatIo());
      await refusedInOwnChat(f);
      expect(button(words('act.newChat'))).toBeNull();
      cleanup();
      resetActionStores();
    }
  });
});
