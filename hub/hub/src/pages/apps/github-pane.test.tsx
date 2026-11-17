// Vitest: From GitHub in the launcher's Find pane (GitHubPane over run.ts). The address is parsed strictly and the
// warning names the repository and the computer before anything is sent; Start makes one run; its steps and gate
// show in place; the result offers Put on Board (the Board's own add link) and Open in a new tab; a lost answer is
// "May have started" with Check; an agent that doesn't answer points to Programs and a new computer; the run is held
// in core's real held changes, so after a reload it is unknown with Check and Dismiss and a new run is refused. The
// agent IO is scripted (github/testing.ts) in place of @ask/io's liveIO.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Kit from '@kit';
import type * as AskIO from '@ask/io';
import type { Target } from '@core';
import type { ReactNode } from 'react';
import type { PageManifest } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { useState } from 'react';
import type { scripted as Scripted } from './github/testing';
import type * as LibraryModule from './github/library';

const PID = 'a'.repeat(24);
const CID = 'b'.repeat(24);
const S = vi.hoisted(() => ({
  io: null as ReturnType<typeof Scripted> | null,
  made: [] as unknown[],
  account: 'acct' as string | null,
  // Ask switched off for the pane's imports of @kit (ASK_ENABLED is on in the build now; a fixture override cannot
  // turn it off, so the switch the pane would read is mocked).
  askOff: false,
  router: null as { state: { location: { pathname: string; href: string } } } | null,
  // The library chunk fails to load (the library's failed state).
  libFail: false,
  // No computer at all: the shell has none current and the pane is given none.
  none: false,
}));
vi.mock('./github/library', async (orig) => {
  const real = await orig<typeof LibraryModule>();
  return { ...real, loadLibrary: () => (S.libFail ? Promise.reject(new Error('chunk')) : real.loadLibrary()) };
});

vi.mock('@ask/io', async (orig) => {
  const orig_ = await orig<typeof AskIO>();
  return {
  ...orig_,
  liveIO: (target: unknown) => {
    S.made.push(target);
    // What the real liveIO does: the io is stamped with the computer it sends to.
    return orig_.withFixtureDest(S.io!.io, (target as { container: { id: string } }).container.id);
  },
  };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const t = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
  return { ...real, useCurrentComputer: () => (S.none ? null : t), useCore: () => ({ ...real.useCore(), account: S.account, realm: 'all' }) };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, askOn: () => !S.askOff && real.askOn(), useShellData: () => ({ ...real.useShellData(), computers: [{ id: 'b'.repeat(24), name: 'devbox' }] }) };
});

const { heldAttempts, resetAttempts } = await import('@core/attempts');
const { agentBaseFor, fixtureWorld } = await import('@core');
const { promptFor } = await import('./github');
const { newChangeStoreTabForTests } = await import('@core/change-store');
const { admitOn, heldHandle } = await import('./github/held');
const { SENDING_STALE_MS } = await import('@core/change-store');
const { askOn } = await import('@kit');
const { harness } = await import('./launch/harness');
const { useApps } = await import('./launch/useApps');
const { GitHubPane, NOT_READY_POLL_MS } = await import('./github/GitHubPane');
const { fixtureStore } = await import('@app/fixtures');
const { scripted } = await import('./github/testing');
const { boardAddPath } = await import('../board/links');
const { default: strings } = await import('./strings.en.json');

const target = { project: { id: PID }, container: { id: CID, server_name: 'n1' } } as unknown as Target;
const fill = (key: string, vars: Record<string, string | number> = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), (strings as Record<string, string>)[key] ?? '');
let View: () => ReactNode = () => null;
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <>{View()}</> }) };
/** The pane's host: a reload unmounts the pane and mounts a new one (the router and core stay up). */
let mounted: ((k: number | null) => void) | null = null;
function Host() {
  const [k, setK] = useState<number | null>(0);
  mounted = setK;
  return k === null ? null : <Pane key={k} />;
}
function Pane() {
  const on = S.none ? null : target;
  const a = useApps({ target: on, nav: { select: () => undefined } });
  return <GitHubPane a={a} target={on} />;
}
async function open(over: Parameters<typeof scripted>[0] = {}, state?: string) {
  // The session answers for this computer (the scripted default names another, 'c1').
  S.io = scripted({ create: [{ ok: { session_id: 's1', started: { realm_selector: 'global', computer_id: CID, owner_fingerprint: 'fp' } } }], ...over });
  View = () => <Host />;
  S.router = (await renderPage(page, { path: '/apps', ...(state ? { state } : {}) })).router;
  return S.io;
}
/** A reload: the pane and this tab's memory of its holds and beats are gone (the tab keeps its id, as a reload
 *  does); what core stored is not. A new pane mounts over a new IO (renderPage would boot core afresh on cleared
 *  storage, so the host remounts the pane instead). */
async function reload(over: Parameters<typeof scripted>[0] = {}, o: { otherTab?: boolean; keepOut?: boolean } = {}) {
  act(() => mounted?.(null));
  // The old page is gone: a request of it that was still out is lost (its transport and send lock die with it).
  // (keepOut: the create is still out, its stamp live, as for a page that went away just now.)
  if (!o.keepOut) await act(async () => { for (const h of S.io?.held.splice(0) ?? []) h.rej({ status: 0 }); });
  resetAttempts();
  // Another tab of the same browser instead: its own tab id, while the first tab's send stamp is still live.
  if (o.otherTab) newChangeStoreTabForTests();
  S.io = scripted({ create: [{ ok: { session_id: 's1', started: { realm_selector: 'global', computer_id: CID, owner_fingerprint: 'fp' } } }], ...over });
  await act(async () => mounted?.(1));
  return S.io;
}
const mine = () => heldAttempts().filter((h) => h.by === 'apps.github');
const user = () => userEvent.setup();
async function type(text: string) {
  const u = user();
  await u.type(screen.getByRole('textbox', { name: fill('gh.address') }), text);
  return u;
}
/** An address typed, then Enter: Ready opens on it with focus on Start. */
async function ready(text: string) {
  const u = await type(text);
  await u.keyboard('{Enter}');
  await screen.findByRole('button', { name: fill('gh.start') });
  return u;
}

beforeEach(() => {
  S.made.length = 0;
  S.account = fixtureWorld.account.id;
  S.askOff = false;
  S.libFail = false;
  S.none = false;
  // renderPage boots core on cleared storage; this tab's memory of holds goes too.
  resetAttempts();
});

describe('the address and the warning', () => {
  it('a valid address shows the warning with the repo and the computer, and nothing is sent before Start', async () => {
    const io = await open();
    await ready('https://github.com/octo/demo');
    expect(screen.getByText(fill('gh.warning', { repo: 'octo/demo', computer: 'devbox' }))).toBeTruthy();
    expect(S.made).toHaveLength(0);
    expect(io.calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: fill('gh.start') }).hasAttribute('disabled') || screen.getByRole('button', { name: fill('gh.start') }).getAttribute('aria-disabled') === 'true').toBe(false);
  });

  it('another host or a bad address is refused in words, with no Start and no warning', async () => {
    await open();
    const u = await type('https://gitlab.com/octo/demo');
    await u.tab();
    expect(screen.getByText(fill('gh.addressBad'))).toBeTruthy();
    expect(screen.queryByText(/This runs code from/)).toBeNull();
    expect(screen.queryByRole('button', { name: fill('gh.start') })).toBeNull();
  });

  it('without a signed-in account Start stays off', async () => {
    S.account = null;
    await open();
    await ready('github.com/octo/demo');
    const start = screen.getByRole('button', { name: fill('gh.start') });
    expect(start.hasAttribute('disabled') || start.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});

describe('a run', () => {
  it('works with the Ask panel off (ASK_ENABLED false): the pane needs only @ask/io, never the dock', async () => {
    S.askOff = true;
    expect(askOn()).toBe(false);
    const io = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(1));
    expect(io.of('create')).toHaveLength(1);
    // A gate only the Agent can decide points at the computer's own Agent address, never the (off) Ask dock.
    await waitFor(() => expect(io.open()).toBe(true));
    act(() => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false, lease_required: true }, { gate: { id: 'gate-5', generation: 1, type: 'confirm', lease_required: true } }));
    expect(await screen.findByText(fill('gh.inAgent', { computer: 'devbox' }))).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(fill('gh.openAgent')) }).getAttribute('href')).toBe(agentBaseFor(target.project, target.container));
    expect(agentBaseFor(target.project, target.container)).toMatch(new RegExp(`^https://${PID}-${CID}-`));
  });

  it('Start makes one run on this computer; steps and the gate show in place; Allow once answers the gate shown', async () => {
    const io = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(1));
    expect(S.made).toEqual([target]);
    expect(io.of('create')).toHaveLength(1);
    act(() => {
      io.frame('tool_call', { tool_id: 'c1', name: 'bash', summary: 'git clone https://github.com/octo/demo.git' });
      io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'sudo apt-get install -y libvips' }, detail: '', risk: '', offer_session_allow: false }, { gate: { id: 'gate-5', generation: 1, type: 'confirm' } });
    });
    expect(await screen.findByText('git clone https://github.com/octo/demo.git')).toBeTruthy();
    expect(screen.getByText('sudo apt-get install -y libvips')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: fill('gh.allowOnce') }));
    await waitFor(() => expect(io.of('confirm')).toHaveLength(1));
    expect(io.of('confirm')[0]!.args[1]).toMatchObject({ gate_id: 'gate-5', generation: 1, approved: true, remember: false });
  });

  it('a web result offers Put on Board (the Board\'s add link for that port) and Open in a new tab', async () => {
    const io = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.open()).toBe(true));
    act(() => {
      io.frame('stream_chunk', { text: 'Started.\nRESULT {"kind":"web","port":3000}' });
      io.frame('agent_done', { outcome: 'completed' });
    });
    expect(await screen.findByText(fill('gh.result.web', { repo: 'octo/demo', port: 3000 }))).toBeTruthy();
    const put = screen.getByRole('link', { name: fill('gh.putOnBoard') });
    expect(put.getAttribute('href')).toContain(boardAddPath(target, { kind: 'port', port: 3000, path: '/' }).replace(/^\//, ''));
    const tab = screen.getByRole('link', { name: new RegExp(fill('gh.openTab')) });
    expect(tab.getAttribute('href')).toMatch(/^https:\/\//);
    expect(screen.getByRole('button', { name: fill('gh.again') })).toBeTruthy();
  });

  it('a lost turn answer is "May have started" with Check (never failed); Check asks again under the same key', async () => {
    const io = await open({ turn: [{ err: { status: 0 } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    expect(await screen.findByText(fill('gh.unknown.turn'))).toBeTruthy();
    expect(screen.queryByText(/failed/i)).toBeNull();
    await u.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(2));
    expect(io.of('turn')[1]!.args).toEqual(io.of('turn')[0]!.args);
    expect(io.of('create')).toHaveLength(1);
  });

  it('Stop sends one stop; the end says earlier steps may have run', async () => {
    const io = await open({ receipt: [{ ok: { turn_id: 't1', state: 'cancelled', effects_may_have_occurred: true } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.open()).toBe(true));
    await u.click(screen.getByRole('button', { name: fill('gh.stop') }));
    await waitFor(() => expect(io.of('stop')).toHaveLength(1));
    act(() => io.frame('agent_done', { outcome: 'cancelled' }));
    expect(await screen.findByText(fill('gh.end.cancelled', { computer: 'devbox' }))).toBeTruthy();
  });

  it('an agent that doesn\'t answer points to Programs and a new computer', async () => {
    await open({ health: [{ err: { status: 0 } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    // On Ready: the check's sentence in the caution's place, and that nothing was sent.
    expect(await screen.findByText(fill('gh.blockNotSent', { reason: fill('gh.block.unreachable', { computer: 'devbox' }) }))).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('gh.newComputer') })).toBeTruthy();
    await u.click(screen.getByRole('button', { name: fill('gh.openPrograms') }));
    await waitFor(() => expect(S.router?.state.location.pathname).toBe('/programs'));
  });

  it('an agent that is not signed in offers the Agent: open it in a new tab, or put it on the Board', async () => {
    await open({ authStatus: [{ ok: { account_id: '', auth_active: false, owner_fingerprint: '', restriction: 'none' } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    expect(await screen.findByText(new RegExp(fill('gh.block.signIn', { computer: 'devbox' }).slice(0, 30)))).toBeTruthy();
    const link = await screen.findByRole('link', { name: new RegExp(fill('gh.openAgent')) });
    expect(link.getAttribute('href')).toBe(agentBaseFor(target.project, target.container));
    expect(screen.getByRole('button', { name: 'Put Agent on Board' })).toBeEnabled();
    expect(S.io!.of('create')).toHaveLength(0);
  });

  it('New computer opens the Computers page\'s create form', async () => {
    await open({ health: [{ err: { status: 0 } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await u.click(await screen.findByRole('button', { name: fill('gh.newComputer') }));
    await waitFor(() => expect(S.router?.state.location.href).toContain('new=1'));
  });
});


describe('C9 across a reload (core\'s held change)', () => {
  it('(a) a reload while the create is unanswered shows unknown with Check and Dismiss; Check finds the session under the saved key, no second create', async () => {
    const first = await open({ create: ['hold'] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(first.of('create')).toHaveLength(1));
    expect(mine()).toHaveLength(1);
    const key = first.of('create')[0]!.args[1];
    expect(mine()[0]!.key).toBe(key);
    const io = await reload();
    expect(await screen.findByText(fill('gh.unknown.create'))).toBeTruthy();
    expect(screen.getByRole('button', { name: /dismiss|stop tracking/i })).toBeTruthy();
    // Nothing goes out on its own.
    expect(io.calls).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(1));
    expect(io.of('create')).toHaveLength(1);
    expect(io.of('create')[0]!.args[1]).toBe(key);
    expect(JSON.stringify(io.of('create')[0]!.args[0])).toBe(JSON.stringify(first.of('create')[0]!.args[0]));
  });

  it('a create answered without the binding evidence shows unknown with Check, and never says the answer did not arrive', async () => {
    await open({ create: [{ ok: { session_id: 's1' } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    expect(await screen.findByText(fill('gh.unknown.create'))).toBeTruthy();
    expect(screen.getByText(fill('gh.unknownBody'))).toBeTruthy();
    expect(screen.getByRole('button', { name: /check/i })).toBeTruthy();
    // An answer came back (without what proves where the session runs): the card must not claim none arrived.
    expect(screen.queryByText(/didn't arrive|did not arrive/i)).toBeNull();
  });

  it('(b) a reload mid-turn shows unknown; Check reads the turn and shows its result', async () => {
    const first = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(first.open()).toBe(true));
    await waitFor(() => expect((mine()[0]?.meta as { step?: string } | undefined)?.step).toBe('running'));
    const io = await reload({ receipt: [{ ok: { turn_id: 't1', state: 'completed' } }], transcript: [{ ok: { messages: [{ role: 'assistant', blocks: [{ kind: 'text', text: 'RESULT {"kind":"web","port":3000}' }] }] } }] });
    expect(await screen.findByText(fill('gh.unknown.running', { computer: 'devbox' }))).toBeTruthy();
    expect(io.calls).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(fill('gh.result.web', { repo: 'octo/demo', port: 3000 }))).toBeTruthy();
    expect(io.of('receipt')[0]!.args.slice(0, 2)).toEqual(['s1', 't1']);
    expect(io.of('turn')).toHaveLength(0);
    expect(io.of('create')).toHaveLength(0);
    await waitFor(() => expect(mine()).toHaveLength(0));
  });

  it('(c) pressing Start again while a hold is open is refused: nothing is created', async () => {
    await open({ create: ['hold'] });
    const u1 = await ready('github.com/octo/demo');
    await u1.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(mine()).toHaveLength(1));
    const io = await reload();
    expect(await screen.findByText(fill('gh.unknown.create'))).toBeTruthy();
    const u = await ready('github.com/octo/other');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    expect(await screen.findByText(fill('gh.blockNotSent', { reason: fill('gh.block.held', { computer: 'devbox' }) }))).toBeTruthy();
    expect(io.of('create')).toHaveLength(0);
    expect(mine()).toHaveLength(1);
  });

  it('right after a reload the warned Dismiss is refused with why and when (the create may still be sending); Check stays; once the stamp is stale it frees the hold', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    try {
      await open({ create: ['hold'] });
      const u1 = await ready('github.com/octo/demo');
      await u1.click(screen.getByRole('button', { name: fill('gh.start') }));
      await waitFor(() => expect(mine()).toHaveLength(1));
      const io = await reload({}, { keepOut: true });
      expect(await screen.findByText(fill('gh.unknown.create'))).toBeTruthy();
      const u = user();
      // The kit asks first (its dialog), then the Dismiss goes to core.
      const dismiss = async () => {
        await u.click(screen.getByRole('button', { name: /dismiss|stop tracking/i }));
        await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /stop tracking/i }));
      };
      await dismiss();
      expect(await screen.findByText(fill('gh.dismissWait'))).toBeTruthy();
      expect(mine()).toHaveLength(1);
      expect(screen.getByRole('button', { name: /check/i })).toBeTruthy();
      vi.setSystemTime(Date.now() + SENDING_STALE_MS + 1000);
      await dismiss();
      await waitFor(() => expect(mine()).toHaveLength(0));
      expect(io.of('create')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a card rebuilt after a reload adopts the step another tab saved since: Check repeats the stored turn, not the old create', async () => {
    await open({ create: ['hold'] });
    const u1 = await ready('github.com/octo/demo');
    await u1.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(mine()).toHaveLength(1));
    const io = await reload();
    expect(await screen.findByText(fill('gh.unknown.create'))).toBeTruthy();
    // Another tab's runtime moves the stored run on (the create answered there, the turn saved, its answer lost).
    const h = mine()[0]!;
    const other = heldHandle(h.id, h.metaVersion)!;
    const meta = { ...(h.meta as object), step: 'turn', sid: 's1', k2: 'k2-other' };
    await act(async () => { expect(await other.save(meta as never, false)).toBe(true); });
    await waitFor(() => expect(screen.getByText(fill('gh.unknown.turn'))).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(1));
    expect(io.of('turn')[0]!.args[2]).toBe('k2-other');
    expect(io.of('create')).toHaveLength(0);
  });

  it('another tab whose request of the run is still out: the card shows, but Check and Dismiss wait', async () => {
    const first = await open({ create: ['hold'] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(first.of('create')).toHaveLength(1));
    const io = await reload({}, { otherTab: true, keepOut: true });
    expect(await screen.findByText(fill('gh.unknown.create'))).toBeTruthy();
    expect(mine()[0]!.inFlight).toBe('elsewhere');
    expect(screen.queryByRole('button', { name: /check/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /dismiss|stop tracking/i })).toBeNull();
    expect(io.calls).toHaveLength(0);
  });

  it('Dismiss frees only the hold as shown: a version saved since (another tab) is not dismissed', async () => {
    await open();
    const meta = { v: 1, repo: { owner: 'octo', name: 'demo' }, computer: CID, realm: 'global', owner: 'fp', model: 'hoody-ai/hoody-free', step: 'create' } as const;
    const a = await admitOn(target)({ ...meta }, 'global');
    if (!('hold' in a)) throw new Error('not admitted');
    a.hold.lease()();
    expect(await a.hold.save({ ...meta, step: 'turn', sid: 's1', k2: 'k2' }, false)).toBe(true);
    expect(await a.hold.dismiss({ metaVersion: 0 })).toBe('refused');
    expect(mine()).toHaveLength(1);
    expect(await a.hold.dismiss({ metaVersion: 1 })).toBe('freed');
    await waitFor(() => expect(mine()).toHaveLength(0));
  });
});

describe('gates the card cannot decide, and batches', () => {
  async function running() {
    const io = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.open()).toBe(true));
    return { io, u };
  }

  it('a batch of questions shows every question and sends one map of every answer', async () => {
    const { io, u } = await running();
    act(() => io.frame('user_question', { question_id: 7, questions: [{ id: 'stack', question: 'Which stack?', options: ['node', 'go'] }, { id: 'port', question: 'Which port?', options: [] }] }, { gate: { id: 'gate-7', generation: 1, type: 'question' } }));
    // Each question is said once: its answer's label, not a line above it too.
    expect(await screen.findByRole('radiogroup', { name: 'Which stack?' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Which port?' })).toBeTruthy();
    expect(screen.queryByText('Which stack?', { selector: 'p' })).toBeNull();
    expect(screen.queryByText('Which port?', { selector: 'p' })).toBeNull();
    await u.click(screen.getByRole('radio', { name: 'go' }));
    await u.type(screen.getByRole('textbox', { name: 'Which port?' }), '8080');
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-7', answers: { stack: 'go', port: '8080' } });
  });

  it('an approval that needs an approver lease is answered in the Agent: no Allow once or Deny here', async () => {
    const { io } = await running();
    act(() => io.frame('confirm_request', { gate_id: 5, tool_name: 'bash', params: { command: 'npm ci' }, detail: '', risk: '', offer_session_allow: false, lease_required: true }, { gate: { id: 'gate-5', generation: 1, type: 'confirm', lease_required: true } }));
    expect(await screen.findByText(fill('gh.inAgent', { computer: 'devbox' }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('gh.allowOnce') })).toBeNull();
    expect(screen.queryByRole('button', { name: fill('gh.deny') })).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(fill('gh.openAgent')) }).getAttribute('href')).toMatch(/^https:\/\//);
    expect(io.of('confirm')).toHaveLength(0);
    // Beside the Agent's new-tab open: Put the Agent on this Hub's Board (its Add link: BoardAddButton's tests).
    expect(screen.getByRole('button', { name: 'Put Agent on Board' })).toBeEnabled();
  });
});

describe('the page\'s own run', () => {
  it('6 adopts the record another tab stored since (the turn accepted there): Check reads that turn, never repeats it', async () => {
    const io = await open({ turn: [{ err: { status: 0 } }], transcript: [{ ok: { messages: [{ role: 'assistant', blocks: [{ kind: 'text', text: 'RESULT {"kind":"web","port":3000}' }] }] } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    expect(await screen.findByText(fill('gh.unknown.turn'))).toBeTruthy();
    const h = mine()[0]!;
    const other = heldHandle(h.id, h.metaVersion)!;
    await act(async () => { expect(await other.save({ ...(h.meta as object), step: 'running', turnId: 't1' } as never, false)).toBe(true); });
    expect(await screen.findByText(fill('gh.unknown.running', { computer: 'devbox' }))).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(fill('gh.result.web', { repo: 'octo/demo', port: 3000 }))).toBeTruthy();
    expect(io.of('turn')).toHaveLength(1);
    expect(io.of('receipt')[0]!.args.slice(0, 2)).toEqual(['s1', 't1']);
  });
});

const { default: libraryJson } = await import('./github/library.json');
/** A program as the library file has it, every field. */
type FullProgram = { id: string; name: string; owner: string; repo: string; tagline: string; why: string; kind: 'web' | 'api' | 'terminal'; port: number | null; license: string; stack: string };
const fullOf = (p: { id: string }) => (libraryJson as unknown as { programs: FullProgram[] }).programs.find((x) => x.id === p.id)!;
describe('the library under the one box', () => {
  const lib = libraryJson as unknown as { programs: Array<{ id: string; name: string; owner: string; repo: string; popular: boolean; category: string; kind: string; tagline: string }>; categories: Array<{ id: string; label: string; blurb: string }> };
  const popular = lib.programs.filter((p) => p.popular);
  const grid = (name: string) => screen.findByRole('grid', { name });
  const cards = (g: HTMLElement) => within(g).getAllByRole('row');

  it('the box searches the library or takes an address; its hint counts the programs; nothing on the first screen starts anything', async () => {
    const io = await open();
    const field = screen.getByRole('textbox', { name: fill('gh.address') });
    await screen.findByText(fill('gh.addressHint', { count: lib.programs.length }));
    // The field shows what it takes: a library word or an address.
    expect(field.getAttribute('placeholder')).toBe(fill('gh.addressExample'));
    // The library's Start here is the default view: the well-known programs, one grid, no Start button yet.
    const g = await grid(fill('gh.lib.startHere'));
    expect(cards(g)).toHaveLength(popular.length);
    expect(screen.queryByRole('button', { name: fill('gh.start') })).toBeNull();
    expect(screen.queryByText(/gh\.|Suggestions/)).toBeNull();
    expect(io.calls).toHaveLength(0);
  });

  it('a card press opens Ready: what it is (facts, the licence as reported, Hoody doesn\'t make it), the computer, the three steps, approvals, the caution and Start; Library returns to the same view with the card marked and focused', async () => {
    const io = await open();
    const p = fullOf(popular[0]!);
    const g = await grid(fill('gh.lib.startHere'));
    await user().click(within(g).getByRole('row', { name: new RegExp(`^${p.name},`) }));
    const h = await screen.findByRole('heading', { name: p.name });
    await waitFor(() => expect(document.activeElement).toBe(h));
    // The box is gone: Ready replaces it, with Start on the same screen.
    expect(screen.queryByRole('textbox', { name: fill('gh.address') })).toBeNull();
    expect(screen.getByText(p.tagline)).toBeTruthy();
    expect(screen.getByText(p.why)).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(`https://github\\.com/${p.owner}/${p.repo}`) })).toBeTruthy();
    expect(screen.getByText(p.port !== null && p.kind !== 'terminal' ? fill(`gh.ready.opens.${p.kind}Port`, { port: p.port }) : p.kind === 'terminal' ? fill('gh.ready.opens.terminal') : fill(`gh.ready.opens.${p.kind}`))).toBeTruthy();
    expect(screen.getByText(p.license === 'custom' ? fill('gh.ready.licenceOwn') : fill('gh.ready.licenceAs', { licence: p.license }))).toBeTruthy();
    expect(screen.getByText(fill('gh.inLibrary'))).toBeTruthy();
    expect(screen.getByText('devbox')).toBeTruthy();
    const steps = screen.getByRole('group', { name: fill('gh.stepsHow') });
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([`01${fill('gh.step.clone')}`, `02${fill('gh.step.install')}`, `03${fill('gh.step.start')}`]);
    // No approvals choice on Ready (every approval is decided at its gate).
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText(fill('gh.ready.caution', { repo: `${p.owner}/${p.repo}`, computer: 'devbox' }))).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('gh.start') })).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/open.source/i);
    // Nothing is sent before Start.
    expect(S.made).toHaveLength(0);
    expect(io.calls).toHaveLength(0);
    await user().click(screen.getByRole('button', { name: fill('gh.toLibrary') }));
    const field = screen.getByRole('textbox', { name: fill('gh.address') }) as HTMLInputElement;
    expect(field.value).toBe('');
    const back = await grid(fill('gh.lib.startHere'));
    // The words, never the frame alone: in the card's mono line (and in the row's description for a screen reader).
    expect(within(back).getAllByText(fill('gh.lib.here')).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement?.closest('[role="row"]')?.textContent).toContain(p.name));
  });

  it('a pasted address is one card in place of the library ("?", not in the library); Enter opens Ready with focus on Start, Escape goes back to the card', async () => {
    const io = await open();
    await grid(fill('gh.lib.startHere'));
    const u = await type('https://github.com/octo/demo');
    expect(screen.getByText(fill('gh.isAddress'))).toBeTruthy();
    const g = await grid(fill('gh.addressCard'));
    expect(cards(g)).toHaveLength(1);
    expect(within(g).getByText(fill('gh.notInLibrary'))).toBeTruthy();
    expect(within(g).getByText('?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('gh.start') })).toBeNull();
    await u.keyboard('{Enter}');
    const start = await screen.findByRole('button', { name: fill('gh.start') });
    await waitFor(() => expect(document.activeElement).toBe(start));
    // The stronger caution for a repository the library doesn't hold, and the repository link: nothing else is claimed.
    expect(screen.getByText(fill('gh.warning', { repo: 'octo/demo', computer: 'devbox' }))).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'octo/demo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /https:\/\/github\.com\/octo\/demo/ })).toBeTruthy();
    expect(screen.queryByText(fill('gh.inLibrary'))).toBeNull();
    expect(io.calls).toHaveLength(0);
    await u.keyboard('{Escape}');
    const back = await grid(fill('gh.addressCard'));
    expect((screen.getByRole('textbox', { name: fill('gh.address') }) as HTMLInputElement).value).toBe('https://github.com/octo/demo');
    await waitFor(() => expect(document.activeElement?.closest('[role="row"]')).toBe(cards(back)[0]));
  });

  it('a library program pasted by its address is its own card; a press opens its Ready with the heading focused', async () => {
    await open();
    const p = popular[0]!;
    const u = await type(`github.com/${p.owner}/${p.repo}`);
    const g = await grid(fill('gh.addressCard'));
    await u.click(within(g).getByRole('row', { name: new RegExp(`^${p.name},`) }));
    const h = await screen.findByRole('heading', { name: p.name });
    await waitFor(() => expect(document.activeElement).toBe(h));
    expect(screen.getByText(fill('gh.inLibrary'))).toBeTruthy();
  });

  it('words search the library: the rail counts the results per category, a category with none cannot be chosen, no match is the kit state', async () => {
    await open();
    await grid(fill('gh.lib.startHere'));
    await type('uptime');
    const g = await grid(fill('gh.lib.results'));
    expect(cards(g).length).toBeGreaterThan(0);
    const rail = screen.getByRole('group', { name: fill('gh.lib.rail') });
    const all = within(rail).getByRole('button', { name: new RegExp(`^${fill('gh.lib.allResults')} \\(${cards(g).length}\\)$`) });
    expect(all.getAttribute('aria-current')).toBe('true');
    expect(within(rail).getAllByRole('button').some((b) => b.hasAttribute('disabled'))).toBe(true);
    // The mono line of a result starts with its category.
    const first = lib.programs.find((x) => x.name === cards(g)[0]!.textContent?.split(',')[0]) ?? null;
    if (first) expect(cards(g)[0]!.textContent).toContain(lib.categories.find((c) => c.id === first.category)!.label);
    // Drawn, the one-line meta leads with the repository: on a narrow card the category is the part left out.
    if (first) {
      const row = cards(g)[0]!;
      const card = row.hasAttribute('aria-describedby') ? row : row.querySelector('[aria-describedby]')!;
      const metaLine = (card.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)).find((el) => el && el.children.length > 1)!;
      expect(metaLine.children[0]!.textContent).toBe(`${first.owner}/${first.repo}`);
      expect(metaLine.lastElementChild!.textContent).toBe(lib.categories.find((c) => c.id === first.category)!.label);
    }
    await type('zzqqxx');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Clear/ })).toBeTruthy());
    // The kit's no-match state, under the filters (they stay in sight): with no filter set, its Clear clears the search.
    expect(screen.getByRole('radio', { name: new RegExp(`^${fill('gh.lib.kind.terminal')}`) })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: /^Clear/ }));
    expect((screen.getByRole('textbox', { name: fill('gh.address') }) as HTMLInputElement).value).toBe('');
    expect(await grid(fill('gh.lib.startHere'))).toBeTruthy();
  });

  it('a filter that leaves no match keeps the filters in sight, and Clear drops the filter first, keeping the words', async () => {
    await open();
    await grid(fill('gh.lib.startHere'));
    // A search whose results are all of one kind, then another kind: nothing matches.
    const kinds = ['web', 'api', 'terminal'] as const;
    const words = 'uptime';
    await type(words);
    const g = await grid(fill('gh.lib.results'));
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const shown = new Set(lib.programs.filter((x) => within(g).queryByRole('row', { name: new RegExp(`^${esc(x.name)},`) })).map((x) => x.kind));
    const missing = kinds.find((k) => !shown.has(k));
    if (!missing) return;
    const radio = screen.queryByRole('radio', { name: new RegExp(`^${fill(`gh.lib.kind.${missing}`)}`) });
    if (!radio) return;
    await user().click(radio);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Clear/ })).toBeTruthy());
    expect(screen.getByRole('radio', { name: new RegExp(`^${fill(`gh.lib.kind.${missing}`)}`) })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: /^Clear/ }));
    expect((screen.getByRole('textbox', { name: fill('gh.address') }) as HTMLInputElement).value).toBe(words);
    await waitFor(() => expect(cards(screen.getByRole('grid', { name: fill('gh.lib.results') })).length).toBeGreaterThan(0));
  });

  it('Library focuses the marked card once; after an edit, a grid drawn again never takes focus from the box', async () => {
    await open();
    const p = popular[0]!;
    const g = await grid(fill('gh.lib.startHere'));
    await user().click(within(g).getByRole('row', { name: new RegExp(`^${p.name},`) }));
    await user().click(screen.getByRole('button', { name: fill('gh.toLibrary') }));
    await waitFor(() => expect(document.activeElement?.closest('[role="row"]')?.textContent).toContain(p.name));
    const field = screen.getByRole('textbox', { name: fill('gh.address') });
    await user().click(field);
    await user().keyboard('zzqqxx');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Clear/ })).toBeTruthy());
    await user().clear(field);
    await grid(fill('gh.lib.startHere'));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(field);
  });

  it('a category shows its blurb and count, its well-known programs first; Kind narrows it', async () => {
    await open();
    await grid(fill('gh.lib.startHere'));
    const c = lib.categories[0]!;
    const inCat = lib.programs.filter((p) => p.category === c.id);
    const rail = screen.getByRole('group', { name: fill('gh.lib.rail') });
    await user().click(within(rail).getByRole('button', { name: fill('gh.lib.railItem', { label: c.label, count: inCat.length }) }));
    const g = await grid(c.label);
    expect(screen.getByText(fill(inCat.length === 1 ? 'gh.lib.blurb_one' : 'gh.lib.blurb_other', { blurb: c.blurb, count: inCat.length }))).toBeTruthy();
    const at = (name: string) => cards(g).findIndex((r) => within(r).queryByText(name, { exact: true }));
    const featured = inCat.filter((p) => p.popular).map((p) => at(p.name));
    const rest = inCat.filter((p) => !p.popular).map((p) => at(p.name)).filter((i) => i >= 0);
    expect(featured.every((i) => i >= 0)).toBe(true);
    if (featured.length && rest.length) expect(Math.max(...featured)).toBeLessThan(Math.min(...rest));
    const terminal = inCat.filter((p) => p.kind === 'terminal').length;
    if (terminal) {
      await user().click(screen.getByRole('radio', { name: new RegExp(`^${fill('gh.lib.kind.terminal')}`) }));
      await waitFor(() => expect(cards(g)).toHaveLength(terminal));
    }
  });

  it('never calls a program open source', async () => {
    await open();
    await grid(fill('gh.lib.startHere'));
    expect(document.body.textContent ?? '').not.toMatch(/open.source/i);
  });

  it('a library that fails to load is the kit failed state with Try again; a pasted address still works', async () => {
    S.libFail = true;
    await open();
    expect(await screen.findByText(fill('gh.lib.failedBody'))).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy();
    expect(screen.getByText(fill('gh.addressHintPlain'))).toBeTruthy();
    await ready('https://github.com/octo/demo');
    expect(screen.getByRole('button', { name: fill('gh.start') })).toBeTruthy();
  });

  it('Ready by a key from the host (gh=): an id opens its program, an address its repository, a key that names nothing goes back to the Library in place; Library and the box hand the key to the host', async () => {
    const p = popular[0]!;
    const calls: Array<[string | undefined, { replace?: boolean } | undefined]> = [];
    let key: string | undefined = p.id;
    let setKey: (k: string | undefined) => void = () => undefined;
    View = () => <Keyed />;
    function Keyed() {
      const [k, setK] = useState<string | undefined>(key);
      setKey = setK;
      const a = useApps({ target, nav: { select: () => undefined } });
      return <GitHubPane a={a} target={target} ready={k} onReady={(next, o) => { calls.push([next, o]); key = next; setK(next); }} />;
    }
    S.io = scripted({});
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByRole('heading', { name: p.name })).toBeTruthy();
    await user().click(screen.getByRole('button', { name: fill('gh.toLibrary') }));
    expect(calls.at(-1)).toEqual([undefined, undefined]);
    await grid(fill('gh.lib.startHere'));
    await act(async () => setKey('octo/demo/tree/v2'));
    expect(await screen.findByRole('heading', { name: 'octo/demo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /https:\/\/github\.com\/octo\/demo\/tree\/v2/ })).toBeTruthy();
    await act(async () => setKey('no-such-program'));
    await waitFor(() => expect(calls.at(-1)).toEqual([undefined, { replace: true }]));
    await grid(fill('gh.lib.startHere'));
    // A pick hands the program's id; an address in the box hands its address (or its program's id).
    await user().click(within(await grid(fill('gh.lib.startHere'))).getByRole('row', { name: new RegExp(`^${p.name},`) }));
    expect(calls.at(-1)).toEqual([p.id, undefined]);
    await user().click(await screen.findByRole('button', { name: fill('gh.toLibrary') }));
    const u = await type('github.com/octo/demo');
    await u.keyboard('{Enter}');
    expect(calls.at(-1)).toEqual(['octo/demo', undefined]);
  });

  it('Ready offers no approvals choice and keeps none on this browser; Start sends the default approval and nothing else about approvals', async () => {
    const io = await open();
    const p = fullOf(popular[0]!);
    // An "allow" kept on this browser is never read.
    // eslint-disable-next-line no-restricted-properties -- seeds a value an older build may have kept, to prove it is never read
    act(() => void window.localStorage.setItem('hub.v3.pane.github.approvals', JSON.stringify('allow')));
    await user().click(within(await grid(fill('gh.lib.startHere'))).getByRole('row', { name: new RegExp(`^${p.name},`) }));
    await screen.findByRole('heading', { name: p.name });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/Allow for this install/)).toBeNull();
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    expect(Object.keys(strings).filter((k) => k.startsWith('gh.approvals'))).toEqual([]);
    await user().click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(1));
    const keys = (v: unknown): string[] => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => [k, ...keys(x)]) : []);
    const body = io.of('create')[0]!.args[0] as { approval?: unknown };
    expect(body.approval).toEqual({ mode: 'default' });
    expect(keys(body).filter((k) => /allow|yolo|auto|trust|rule/i.test(k))).toEqual([]);
    expect(io.of('turn')[0]!.args[1]).toBe(promptFor({ owner: p.owner, name: p.repo }));
    // No call but the create and the turn: no yolo, no approval rules, no policy write.
    expect([...new Set(io.calls.map((c) => c.m))].filter((op) => /yolo|approval|rule|policy/i.test(op))).toEqual([]);
  });
});

describe('Allow for this session at the gate', () => {
  async function running() {
    const io = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.open()).toBe(true));
    return { io, u };
  }
  const gateOf = (tool: string, params: Record<string, unknown>, offer: boolean) => ({ gate_id: 5, tool_name: tool, params, detail: '', risk: '', offer_session_allow: offer });

  it('a gate that offers it shows Allow once, Allow for this session and Deny; the person\'s press sends session_scope with remember off, never auto', async () => {
    const { io, u } = await running();
    act(() => io.frame('confirm_request', gateOf('bash', { command: 'npm ci' }, true), { gate: { id: 'gate-5', generation: 1, type: 'confirm' } }));
    const session = await screen.findByRole('button', { name: fill('gh.allowSession') });
    expect(screen.getByRole('button', { name: fill('gh.allowOnce') })).toBeTruthy();
    expect(screen.getByRole('button', { name: fill('gh.deny') })).toBeTruthy();
    // Nothing is sent until the person presses it.
    expect(io.of('confirm')).toHaveLength(0);
    await u.click(session);
    await waitFor(() => expect(io.of('confirm')).toHaveLength(1));
    const body = io.of('confirm')[0]!.args[1] as Record<string, unknown>;
    expect(body).toMatchObject({ gate_id: 'gate-5', generation: 1, approved: true, remember: false, session_scope: true });
    expect(Object.keys(body).filter((k) => /auto|persist|trust/i.test(k))).toEqual([]);
  });

  it('when the agent applies the session allow to this call only (a locked policy), the pane says the next one will ask', async () => {
    const io = await open({ confirm: [{ ok: { status: 'ok', session_scope_applied: false, note: 'approval policy is locked' } }] });
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.open()).toBe(true));
    act(() => io.frame('confirm_request', gateOf('bash', { command: 'npm ci' }, true), { gate: { id: 'gate-5', generation: 1, type: 'confirm' } }));
    expect(screen.queryByText(fill('gh.onceOnly'))).toBeNull();
    await u.click(await screen.findByRole('button', { name: fill('gh.allowSession') }));
    expect(await screen.findByText(fill('gh.onceOnly'))).toBeTruthy();
  });

  it('a gate that does not offer it shows no third button; Allow once and Deny send no session_scope', async () => {
    const { io, u } = await running();
    act(() => io.frame('confirm_request', gateOf('bash', { command: 'npm ci' }, false), { gate: { id: 'gate-5', generation: 1, type: 'confirm' } }));
    await screen.findByRole('button', { name: fill('gh.allowOnce') });
    expect(screen.queryByRole('button', { name: fill('gh.allowSession') })).toBeNull();
    await u.click(screen.getByRole('button', { name: fill('gh.deny') }));
    await waitFor(() => expect(io.of('confirm')).toHaveLength(1));
    const body = io.of('confirm')[0]!.args[1] as Record<string, unknown>;
    expect(body).toMatchObject({ approved: false, remember: false });
    expect('session_scope' in body).toBe(false);
  });

  it('the program add gate stays one call: no Allow for this session, and Allow once sends no session_scope', async () => {
    const { io, u } = await running();
    act(() => io.frame('confirm_request', gateOf('hoody_daemon_programs', { action: 'add', id: 'demo' }, false), { gate: { id: 'gate-5', generation: 1, type: 'confirm' } }));
    await u.click(await screen.findByRole('button', { name: fill('gh.allowOnce') }));
    expect(screen.queryByRole('button', { name: fill('gh.allowSession') })).toBeNull();
    await waitFor(() => expect(io.of('confirm')).toHaveLength(1));
    const body = io.of('confirm')[0]!.args[1] as Record<string, unknown>;
    expect(body).toMatchObject({ gate_id: 'gate-5', approved: true, remember: false });
    expect('session_scope' in body).toBe(false);
  });
});

// Not ready, known before Start from what the shell knows (the computer's status),
// or only after Start (the run's checks): both are drawn on Ready, with nothing sent; no computer at all is the kit's
// ComputerRequired, inline in Ready's install box.
describe('not ready', () => {
  const grid = (name: string) => screen.findByRole('grid', { name });
  const popularFirst = () => fullOf((libraryJson as unknown as { programs: Array<{ id: string; popular: boolean }> }).programs.find((p) => p.popular)!);
  async function readyOf(p: FullProgram) {
    await user().click(within(await grid(fill('gh.lib.startHere'))).getByRole('row', { name: new RegExp(`^${p.name},`) }));
    await screen.findByRole('heading', { name: p.name });
  }

  it('a stopped computer: a warning above the library with Open Computers, the library stays browsable; on Ready Start is off with the same reason and nothing is sent', async () => {
    const io = await open({}, 'stopped');
    const note = await screen.findByText(fill('gh.notReady.stopped', { computer: 'devbox' }));
    expect(note).toBeTruthy();
    // A computer is started from Computers: Programs only lists a stopped computer's programs, it can't start it.
    expect(screen.getByRole('button', { name: fill('gh.openComputers') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('gh.openPrograms') })).toBeNull();
    // Browsing stays open.
    const p = popularFirst();
    await readyOf(p);
    const startBtn = screen.getByRole('button', { name: fill('gh.start') });
    expect(startBtn).toBeDisabled();
    expect(screen.getByText(fill('gh.notReady.stopped', { computer: 'devbox' }))).toBeTruthy();
    // The reason stands in place of the caution.
    expect(screen.queryByText(fill('gh.ready.caution', { repo: `${p.owner}/${p.repo}`, computer: 'devbox' }))).toBeNull();
    await user().click(startBtn);
    expect(io.calls).toHaveLength(0);
    expect(S.made).toHaveLength(0);
  });

  it('a stopped computer: Open Computers opens the Computers page, where it can be started', async () => {
    await open({}, 'stopped');
    await screen.findByText(fill('gh.notReady.stopped', { computer: 'devbox' }));
    await user().click(screen.getByRole('button', { name: fill('gh.openComputers') }));
    await waitFor(() => expect(S.router?.state.location.pathname).toBe('/computers'));
  });

  it('a running computer shows no notice and Start is on', async () => {
    await open();
    await grid(fill('gh.lib.startHere'));
    expect(screen.queryByText(fill('gh.notReady.stopped', { computer: 'devbox' }))).toBeNull();
    await readyOf(popularFirst());
    expect(screen.getByRole('button', { name: fill('gh.start') })).toBeEnabled();
  });

  it('known only after Start: the check\'s refusal is drawn on Ready in place of the caution, says nothing was sent, and Start runs the checks again', async () => {
    const starting = { ok: { data: { id: 'c1', status: 'starting', realm_ids: [] } } };
    const io = await open({ computer: [starting, starting] });
    const p = popularFirst();
    await readyOf(p);
    await user().click(screen.getByRole('button', { name: fill('gh.start') }));
    // The check's sentence, and that nothing was sent.
    expect(await screen.findByText(fill('gh.blockNotSent', { reason: fill('gh.block.starting', { computer: 'devbox' }) }))).toBeTruthy();
    // Still Ready: the program and Start, no run card.
    expect(screen.getByRole('heading', { name: p.name })).toBeTruthy();
    expect(screen.queryByText(fill('gh.ready.caution', { repo: `${p.owner}/${p.repo}`, computer: 'devbox' }))).toBeNull();
    expect(io.of('create')).toHaveLength(0);
    expect(io.of('turn')).toHaveLength(0);
    await user().click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.of('computer')).toHaveLength(2));
    expect(io.of('create')).toHaveLength(0);
  });

  it('a turn refused after the session was created is the run card (Try again keeps the session), never "Nothing was sent" on Ready', async () => {
    const io = await open({ turn: [{ err: { status: 409, code: 'turn_in_flight' } }] });
    const p = popularFirst();
    await readyOf(p);
    await user().click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(1));
    expect(await screen.findByText(fill('gh.notSent'))).toBeTruthy();
    expect(screen.queryByText(fill('gh.blockNotSent', { reason: fill('gh.block.busy', { computer: 'devbox' }) }))).toBeNull();
    expect(screen.queryByRole('button', { name: fill('gh.start') })).toBeNull();
    await user().click(screen.getByRole('button', { name: fill('gh.tryAgain') }));
    await waitFor(() => expect(io.of('turn')).toHaveLength(2));
    expect(io.of('create')).toHaveLength(1);
  });

  it('a not-ready status is read again while it holds Start off; once the computer runs, Start is on', async () => {
    const io = await open({}, 'stopped');
    await readyOf(popularFirst());
    expect(screen.getByRole('button', { name: fill('gh.start') })).toBeDisabled();
    // The status is read again while it says not ready; the computer runs now.
    act(() => fixtureStore.set({ state: null, latency: 'instant' }));
    await waitFor(() => expect(screen.getByRole('button', { name: fill('gh.start') })).toBeEnabled(), { timeout: NOT_READY_POLL_MS + 4000 });
    expect(io.calls).toHaveLength(0);
  }, NOT_READY_POLL_MS + 10000);

  it('no computer at all: the library is browsable; Ready\'s install box is the kit ComputerRequired (no page h1), with no Start', async () => {
    S.none = true;
    const io = await open();
    const p = popularFirst();
    await readyOf(p);
    expect(screen.getByText(fill('gh.noComputer'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: fill('gh.start') })).toBeNull();
    expect(document.querySelectorAll('[data-hub-title]').length).toBeLessThanOrEqual(1);
    expect(io.calls).toHaveLength(0);
  });
});

// Key scrubbing (money paths are at stake): the pane shows a waiting gate's question, its options and
// labels, an approval's command and tool, and the steps' names and summaries, each with a key hidden as the kit card
// hides it, before any cut (a key starting 11 characters before a bound would leave a piece too short to know) and
// before cleaning (a control glued to a key is taken out, where no key can start). The answer sent is the option as
// the agent wrote it.
describe('no key shows in the pane', () => {
  const KEY = 'sk-live0123456789abcdefghij';
  const FRAG = /sk-li|live0|0123456/;
  const near = (bound: number, lead: string) => {
    const n = bound - 11 - lead.length;
    return lead + (n % 2 ? ' ' : '') + 'a '.repeat(Math.floor(n / 2));
  };
  const pane = () => document.body.textContent ?? '';
  async function running() {
    const io = await open();
    const u = await ready('github.com/octo/demo');
    await u.click(screen.getByRole('button', { name: fill('gh.start') }));
    await waitFor(() => expect(io.open()).toBe(true));
    return { io, u };
  }

  it('a question, its options and the field label hide a key; the picked option is sent as written', async () => {
    const { io, u } = await running();
    const q = `${near(4000, 'Use token')}${KEY} now?`;
    act(() => io.frame('user_question', { question_id: 7, questions: [{ id: 'tok', question: `pick note\u0007${KEY}`, options: [`use ${KEY}`, 'none'] }, { id: 'why', question: q, options: [] }] }, { gate: { id: 'gate-7', generation: 1, type: 'question' } }));
    await screen.findByRole('radiogroup', { name: 'pick note[hidden]' });
    expect(pane()).not.toMatch(FRAG);
    expect(pane()).toContain(`${near(4000, 'Use token')}[hidden]`);
    const radio = screen.getByRole('radio', { name: 'use [hidden]' });
    expect(screen.getByRole('radiogroup', { name: 'pick note[hidden]' })).toBeTruthy();
    const answer = screen.getByRole('textbox', { name: (n) => n.startsWith('Use token') && !FRAG.test(n) });
    for (const el of document.querySelectorAll('[aria-label], [title], label')) expect(`${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.textContent ?? ''}`).not.toMatch(FRAG);
    await u.click(radio);
    await u.type(answer, 'x');
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-7', answers: { tok: `use ${KEY}`, why: 'x' } });
  });

  it('an open string before one key does not show a C1-CSI-glued key after it, nor does ESC space', async () => {
    const { io } = await running();
    const Q = 'Q'.repeat(20);
    act(() => io.frame('user_question', { question_id: 16, question: `run \u001b]x ${KEY} and sk\u009b1m-${Q} and\na \u001b \u001b] sk\u009b1m-${Q} b`, options: [] }, { gate: { id: 'gate-16', generation: 1, type: 'question' } }));
    await screen.findByText(/^run/, { selector: 'p' });
    expect(pane()).not.toMatch(/sk-Q/);
    expect(pane()).not.toMatch(FRAG);
  });

  it('a single question glued to a key by ESC or CSI says [hidden], not a cut marker', async () => {
    const { io } = await running();
    act(() => io.frame('user_question', { question_id: 8, question: `paste note\u001b${KEY} or note\u009b${KEY} end`, options: [] }, { gate: { id: 'gate-8', generation: 1, type: 'question' } }));
    await screen.findByText('paste note[hidden] or note[hidden] end', { selector: 'p' });
    expect(pane()).not.toMatch(FRAG);
    expect(pane().split('[hidden]').join(''), 'no tail of the marker').not.toContain('idden]');
  });

  it('an approval names its tool and command with the key hidden; a step summary hides it too, title included', async () => {
    const { io } = await running();
    act(() => {
      io.frame('tool_call', { tool_id: 'c1', name: `bash ${KEY}`, summary: `${near(300, 'curl -H')}${KEY} https://e.example` });
      io.frame('confirm_request', { gate_id: 5, tool_name: `tool ${KEY}`, params: { command: `${near(4000, 'curl')}${KEY} x` }, detail: '', risk: '', offer_session_allow: false }, { gate: { id: 'gate-5', generation: 1, type: 'confirm' } });
    });
    // The command reads as code (kit CodeBlock, one span per line).
    await screen.findByText(`${near(4000, 'curl')}[hidden] x`, { selector: 'pre span' });
    expect(pane()).not.toMatch(FRAG);
    expect(pane()).toContain(`${near(300, 'curl -H')}[hidden]`);
    for (const el of document.querySelectorAll('[title]')) expect(el.getAttribute('title')).not.toMatch(FRAG);
    expect(screen.getByRole('heading', { name: fill('gh.gate.confirm', { tool: 'tool [hidden]' }) })).toBeTruthy();
  });

  // Matching shown labels get their place; a picked option is sent exactly as written (spaces kept), a typed
  // answer trimmed; and each bounded path hides a key that crosses its own bound.
  const KEY2 = 'sk-live9876543210zyxwvutsrqp';
  it('two options that both show [hidden] are told apart by their place, and the one picked is sent as written', async () => {
    const { io, u } = await running();
    act(() => io.frame('user_question', { question_id: 9, question: 'Which key?', options: [`use ${KEY}`, `use ${KEY2}`, 'none'] }, { gate: { id: 'gate-9', generation: 1, type: 'question' } }));
    await screen.findByRole('radio', { name: 'use [hidden] (2)' });
    expect(screen.getByRole('radio', { name: 'use [hidden] (1)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'none (3)' }), 'once two labels match, every option is numbered').toBeTruthy();
    await u.click(screen.getByRole('radio', { name: 'use [hidden] (2)' }));
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-9', answer: `use ${KEY2}` });
  });

  it('an option written as a numbered label cannot match a numbered collision: every option is numbered, each picks its own value', async () => {
    const { io, u } = await running();
    act(() => io.frame('user_question', { question_id: 13, question: 'Which?', options: [`use ${KEY}`, `use ${KEY2}`, 'use [hidden] (1)'] }, { gate: { id: 'gate-13', generation: 1, type: 'question' } }));
    await screen.findByRole('radio', { name: 'use [hidden] (1)' });
    const names = screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent ?? r.getAttribute('aria-label') ?? '');
    expect(new Set(names).size).toBe(names.length);
    expect(screen.getByRole('radio', { name: 'use [hidden] (1) (3)' })).toBeTruthy();
    await u.click(screen.getByRole('radio', { name: 'use [hidden] (1)' }));
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-13', answer: `use ${KEY}` });
  });

  // Labels that differ only in what never shows still look the same, so they are numbered too.
  it.each([
    ['a trailing space', [`use ${KEY}`, `use ${KEY2} `]],
    ['a doubled space', [`use ${KEY}`, `use  ${KEY2}`]],
    ['a zero-width space', [`use ${KEY}`, `use\u200b ${KEY2}`]],
    ['a word joiner', [`use ${KEY}`, `use ${KEY2}\u2060`]],
  ])('two options apart only by %s are numbered, and each picks its own value', async (_name, options) => {
    const { io, u } = await running();
    act(() => io.frame('user_question', { question_id: 14, question: 'Which key?', options: [...options, 'none'] }, { gate: { id: 'gate-14', generation: 1, type: 'question' } }));
    await screen.findByRole('radio', { name: /\(2\)$/ });
    expect(screen.getByRole('radio', { name: /\(1\)$/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'none (3)' })).toBeTruthy();
    await u.click(screen.getByRole('radio', { name: /\(2\)$/ }));
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-14', answer: options[1] });
  });

  it('two options alike up to their 300 bound show the cut and are numbered', async () => {
    const { io } = await running();
    const long = 'step '.repeat(70);
    act(() => io.frame('user_question', { question_id: 15, question: 'Which?', options: [`${long}one`, `${long}two`] }, { gate: { id: 'gate-15', generation: 1, type: 'question' } }));
    expect(await screen.findByRole('radio', { name: /… \(1\)$/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /… \(2\)$/ })).toBeTruthy();
  });

  it('a single question: an option with spaces is sent with them', async () => {
    const { io, u } = await running();
    act(() => io.frame('user_question', { question_id: 10, question: 'Where?', options: [' production ', 'dev'] }, { gate: { id: 'gate-10', generation: 1, type: 'question' } }));
    const prod = await screen.findByRole('radio', { name: /production/ });
    await u.click(prod);
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ answer: ' production ' });
  });

  it('in a batch, an option with spaces is sent with them and a typed answer is trimmed', async () => {
    const { io, u } = await running();
    act(() => io.frame('user_question', { question_id: 11, questions: [{ id: 'env', question: 'Env?', options: [' production ', 'dev'] }, { id: 'port', question: 'Port?', options: [] }] }, { gate: { id: 'gate-11', generation: 1, type: 'question' } }));
    await u.click(await screen.findByRole('radio', { name: /production/ }));
    await u.type(screen.getByRole('textbox', { name: 'Port?' }), '  8080 ');
    await u.click(screen.getByRole('button', { name: fill('gh.send') }));
    await waitFor(() => expect(io.of('answer')).toHaveLength(1));
    expect(io.of('answer')[0]!.args[1]).toMatchObject({ gate_id: 'gate-11', answers: { env: ' production ', port: '8080' } });
  });

  it('an option and the field labels hide a key crossing their 300 bound', async () => {
    const { io } = await running();
    const opt = near(300, 'opt a');
    const q1 = near(300, 'q one');
    const q2 = near(300, 'q two');
    act(() => io.frame('user_question', { question_id: 12, questions: [{ id: 'a', question: `${q1}${KEY} x`, options: [`${opt}${KEY} x`, 'b'] }, { id: 'c', question: `${q2}${KEY} x`, options: [] }] }, { gate: { id: 'gate-12', generation: 1, type: 'question' } }));
    expect(await screen.findByRole('radio', { name: (n) => n.includes(`${opt}[hidden]`) })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: (n) => n.includes(`${q1}[hidden]`) })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: (n) => n.includes(`${q2}[hidden]`) })).toBeTruthy();
    expect(pane()).not.toMatch(FRAG);
  });

  it('a tool name and a step name hide a key crossing their 80 bound; a detail with no command hides it at 4000', async () => {
    const { io } = await running();
    const tool = near(80, 'tool a');
    const step = near(80, 'step a');
    const det = near(4000, 'detail a');
    act(() => {
      io.frame('tool_call', { tool_id: 'c2', name: `${step}${KEY} x`, summary: 'ok' });
      io.frame('confirm_request', { gate_id: 6, tool_name: `${tool}${KEY} x`, params: {}, detail: `${det}${KEY} x`, risk: '', offer_session_allow: false }, { gate: { id: 'gate-6', generation: 1, type: 'confirm' } });
    });
    await screen.findByText(`${det}[hidden] x`, { selector: 'p' });
    expect(screen.getByRole('heading', { name: (n) => n.includes(`${tool}[hidden]`) })).toBeTruthy();
    expect(pane()).toContain(`${step}[hidden]`);
    expect(pane()).not.toMatch(FRAG);
  });
});
