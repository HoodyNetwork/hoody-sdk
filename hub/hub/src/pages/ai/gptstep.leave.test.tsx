// The AI page's ChatGPT step, left while its job runs, reads its cancel's
// answer, as the kit's ChatGptSetup does. Neither the cancel nor the job's end known: the C9 unknown toast, whose Check
// again only reads the job's end. A sign-in that won the race re-reads the page, so it shows connected without a reload.
// Nothing once the scope the step ran in (account, realm, computer) ended.
import type * as Kit from '@kit';
import type { providers } from '@core';
import { setTarget, snapshot } from '@core/ctx';
import { boot } from '@core/test/env';
import { act, render, screen } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { AiProvider, type AiCtx } from './parts/ctx';
import { GptStep } from './parts/GptStep';
import strings from './strings.en.json';

type Shown = { title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } };
const toasts = vi.hoisted(() => ({ shown: [] as Array<{ id: string; c: Shown }>, closed: [] as string[] }));
vi.mock('@kit', async (orig) => ({
  ...(await orig<typeof Kit>()),
  showToast: (c: Shown) => {
    const id = `t${toasts.shown.length + 1}`;
    toasts.shown.push({ id, c });
    return id;
  },
  closeToast: (id: string) => void toasts.closed.push(id),
}));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.shown.length = 0;
  toasts.closed.length = 0;
});

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const bad = (): Settled => ({ ok: false, err: { kind: 'failed', code: 'internal', status: 500, retryAfter: null, details: {} } });
const tick = () => act(async () => new Promise((r) => setTimeout(r, 5)));
const S = strings as Record<string, string>;

/** One job j1. `cancel`: the cancel's answer (the job ends cancelled only on a `cancelled` answer); `job`: the job's state
 *  as polls read it, changed by the test; `held`: the cancel waits for `release`. */
function agent(cancel: Settled | 'held') {
  const st = { job: 'pending' as string | 'bad', polls: 0, starts: 0, cancels: 0 };
  let release: (a: Settled) => void = () => undefined;
  const api = {
    auth: () => Promise.resolve(ok({ auth: { oauth_stored: st.job === 'complete' } })),
    oauthStart: () => {
      st.starts++;
      return Promise.resolve(ok({ job_id: 'j1', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' }));
    },
    oauthPoll: () => {
      st.polls++;
      return Promise.resolve(st.job === 'bad' ? bad() : ok({ state: st.job, user_code: 'ABCD-1234' }));
    },
    oauthCancel: () => {
      st.cancels++;
      if (cancel === 'held') return new Promise<Settled>((r) => (release = r));
      if (cancel.ok && (cancel.body as { state?: string }).state === 'cancelled') st.job = 'cancelled';
      return Promise.resolve(cancel);
    },
  } as unknown as Api;
  return { api, st, release: (a: Settled) => act(async () => release(a)) };
}

const env: providers.Env = {
  sleep: (ms) => (ms === 0 ? Promise.resolve() : new Promise<void>(() => undefined)),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k-1',
  digest: () => Promise.resolve(null),
  alive: () => true,
};

async function step(api: Api) {
  const ctx = { m: {}, api, env, reload: vi.fn(), connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
  const view = render(
    <AiProvider value={ctx}>
      <GptStep onSigned={vi.fn()} onBack={vi.fn()} />
    </AiProvider>,
  );
  expect(await screen.findByText(strings['gpt.steps'])).toBeInTheDocument();
  return { view, reload: ctx.reload as ReturnType<typeof vi.fn> };
}

const lost = (): Settled => ({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } });
const other = (first: ReturnType<typeof snapshot>['target']) => ({ project: { id: 'p9' }, container: first?.container ?? { id: 'c9' } }) as Parameters<typeof setTarget>[0];

describe('AI: leaving the ChatGPT step reads its cancel', () => {
  it('a lost cancel whose job is still open leaves the unknown toast; Check again only reads the job', async () => {
    const a = agent(lost());
    const s = await step(a.api);
    const polls = a.st.polls;
    s.view.unmount();
    await tick();
    expect(toasts.shown.map(({ c }) => [c.title, c.tone, c.action?.label])).toEqual([[S['gpt.leftTitle']?.replace('{{provider}}', 'ChatGPT'), 'unknown', S['gpt.leftCheck']]]);
    expect(toasts.shown[0]!.c.body).toBe(S['gpt.leftBody']);
    expect(a.st.polls).toBe(polls + 1);
    const check = toasts.shown[0]!.c.action!.onAction;
    expect(await check()).toBeUndefined();
    a.st.job = 'bad';
    expect(await check()).toBe(false);
    a.st.job = 'complete';
    expect(await check()).toBe(true);
    // A sign-in proved there re-reads the page.
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(a.st.starts).toBe(1);
    expect(a.st.cancels).toBe(1);
  });

  it('a lost cancel whose job read says the sign-in finished re-reads the page and shows no toast', async () => {
    const a = agent(lost());
    const s = await step(a.api);
    a.st.job = 'complete';
    s.view.unmount();
    await tick();
    expect(toasts.shown).toEqual([]);
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('a cancel that answers complete re-reads the page; one that answers cancelled says nothing', async () => {
    const a = agent(ok({ state: 'complete' }));
    const s = await step(a.api);
    s.view.unmount();
    await tick();
    expect(toasts.shown).toEqual([]);
    expect(s.reload).toHaveBeenCalledTimes(1);

    const b = agent(ok({ state: 'cancelled' }));
    const t = await step(b.api);
    t.view.unmount();
    await tick();
    expect(toasts.shown).toEqual([]);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it('another computer before the answer shows nothing and reads nothing; one after it closes the toast', async () => {
    const first = snapshot().target;
    const a = agent('held');
    const s = await step(a.api);
    const polls = a.st.polls;
    s.view.unmount();
    act(() => setTarget(other(first)));
    await a.release(lost());
    await tick();
    expect(toasts.shown).toEqual([]);
    expect(a.st.polls).toBe(polls);
    expect(s.reload).not.toHaveBeenCalled();
    act(() => setTarget(first));

    const b = agent(lost());
    const t = await step(b.api);
    t.view.unmount();
    await tick();
    expect(toasts.shown.length).toBe(1);
    act(() => setTarget(other(first)));
    await tick();
    expect(toasts.closed).toEqual([toasts.shown[0]!.id]);
    act(() => setTarget(first));
  });
});
