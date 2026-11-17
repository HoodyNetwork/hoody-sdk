// Vitest: a Board kept loaded on another page sits in a
// hidden React Activity, so its effects stop and run again when it shows. What a tile holds must survive that: the
// agent frame is not signed in again (1), a loaded frame does not read "loading" or a false "slow", a new src that
// loaded while hidden included (2), a Start, a Connect over SSH or its Check again that settles while hidden lands on
// return, only for the attempt the form still holds (3). The shell's hold says hidden while the Activity is.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageNavHoldContext, type PageNavHold } from '@kit/nav';
import { boardFixtureRoute, bootFixtureCore, computerLifecycleRoute, fixtureWorld, reply, answers, type FixtureAnswer } from '@core';
import type { BoardComputer } from '../computers';
import { SESSIONS_PATH } from '../termSessions';
import { Frame, SLOW_MS, type FrameState } from './Frame';
import { useBoardPower } from './lifecycle';
import { SignedFrame } from './SignedFrame';
import { resetSshAttempts, SshForm } from './SshForm';

const ask = vi.hoisted(() => ({ fn: null as null | (() => Promise<string>), calls: 0 }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  return {
    ...core,
    agentBootToken: (...a: unknown[]) => {
      if (!ask.fn) return (core.agentBootToken as (...x: unknown[]) => Promise<string>)(...a);
      ask.calls += 1;
      return ask.fn();
    },
  };
});

// The sticky notices, as shown and closed (with their Check again), for the notice hand-offs below.
const T = vi.hoisted(() => ({ shown: [] as Array<{ id: string; check?: () => unknown }>, closed: [] as string[] }));
vi.mock('@kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return {
    ...m,
    showToast: (c: { action?: { onAction: () => unknown } }) => { const id = `t${T.shown.length + 1}`; T.shown.push({ id, ...(c.action ? { check: c.action.onAction } : {}) }); return id; },
    closeToast: (id: string) => { T.closed.push(id); },
  };
});
const openToasts = () => T.shown.filter((x) => !T.closed.includes(x.id));

const SRC = 'https://p-c-agent-1.n12.fixture.invalid/?parent_keys=true';
const frame = () => document.querySelector('iframe');
// One hold, as the shell's: hidden() reads the page's state when it is read (pageHost reads refs).
const page = { shown: true };
const hold: PageNavHold = { location: null, owns: () => page.shown, hidden: () => !page.shown };
const Shown = ({ on, children }: { on: boolean; children: ReactNode }) => {
  page.shown = on;
  return <PageNavHoldContext value={hold}><Activity mode={on ? 'visible' : 'hidden'}>{children}</Activity></PageNavHoldContext>;
};

afterEach(() => { cleanup(); ask.fn = null; ask.calls = 0; page.shown = true; T.shown.length = 0; T.closed.length = 0; vi.useRealTimers(); });

describe('kept Board: the agent frame is not signed in again on return (precondition 1)', () => {
  it('hidden and shown again, the frame keeps its first token and core is asked once', async () => {
    let n = 0;
    ask.fn = () => Promise.resolve(`tok-${++n}`);
    const props = { src: SRC, title: 'agent-1 on atlas', inTabOrder: true, onState: () => {}, register: () => {}, name: 'agent-1', agent: true };
    const v = render(<Shown on><SignedFrame {...props} /></Shown>);
    await waitFor(() => expect(frame()?.getAttribute('src')).toContain('hdy_token=tok-1'));
    const el = frame();
    v.rerender(<Shown on={false}><SignedFrame {...props} /></Shown>);
    v.rerender(<Shown on><SignedFrame {...props} /></Shown>);
    await act(async () => { await Promise.resolve(); });
    expect(ask.calls).toBe(1);
    expect(frame()).toBe(el);
    expect(frame()?.getAttribute('src')).toContain('hdy_token=tok-1');
  });

  it('a new address still signs in again (the effect is not skipped for another src)', async () => {
    let n = 0;
    ask.fn = () => Promise.resolve(`tok-${++n}`);
    const props = { title: 'agent-1 on atlas', inTabOrder: true, onState: () => {}, register: () => {}, name: 'agent-1', agent: true };
    const v = render(<Shown on><SignedFrame {...props} src={SRC} /></Shown>);
    await waitFor(() => expect(frame()?.getAttribute('src')).toContain('hdy_token=tok-1'));
    v.rerender(<Shown on><SignedFrame {...props} src={SRC + '&theme=dark'} /></Shown>);
    await waitFor(() => expect(frame()?.getAttribute('src')).toContain('hdy_token=tok-2'));
    expect(ask.calls).toBe(2);
  });
});

describe('kept Board: a loaded frame stays loaded on return (precondition 2)', () => {
  const props = (onState: (s: FrameState) => void) => ({ src: SRC, title: 'terminal-1 on atlas', inTabOrder: true, onState, register: () => {} });

  it('loaded, hidden and shown again: "loaded", never "loading" or a false "slow"', () => {
    vi.useFakeTimers();
    const states: FrameState[] = [];
    const v = render(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { frame()!.dispatchEvent(new Event('load')); });
    expect(states.at(-1)).toBe('loaded');
    v.rerender(<Shown on={false}><Frame {...props((s) => states.push(s))} /></Shown>);
    const at = states.length;
    v.rerender(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { vi.advanceTimersByTime(SLOW_MS + 1000); });
    expect(states.slice(at)).not.toContain('loading');
    expect(states.slice(at)).not.toContain('slow');
    expect(states.at(-1)).toBe('loaded');
  });

  it('hidden before it loaded, loading behind another page: "loaded" on return', () => {
    vi.useFakeTimers();
    const states: FrameState[] = [];
    const v = render(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    expect(states.at(-1)).toBe('loading');
    v.rerender(<Shown on={false}><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { frame()!.dispatchEvent(new Event('load')); });
    v.rerender(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { vi.advanceTimersByTime(SLOW_MS + 1000); });
    expect(states.at(-1)).toBe('loaded');
  });

  it('a new src set while hidden that loads behind another page: "loaded" on return, and no false "slow"', async () => {
    vi.useFakeTimers();
    const states: FrameState[] = [];
    const v = render(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { frame()!.dispatchEvent(new Event('load')); });
    v.rerender(<Shown on={false}><Frame {...props((s) => states.push(s))} /></Shown>);
    v.rerender(<Shown on={false}><Frame {...props((s) => states.push(s))} src={SRC + '&x=1'} /></Shown>);
    await act(async () => { await Promise.resolve(); });
    expect(frame()!.getAttribute('src')).toBe(SRC + '&x=1');
    act(() => { frame()!.dispatchEvent(new Event('load')); });
    const at = states.length;
    v.rerender(<Shown on><Frame {...props((s) => states.push(s))} src={SRC + '&x=1'} /></Shown>);
    act(() => { vi.advanceTimersByTime(SLOW_MS + 1000); });
    expect(states.slice(at)).not.toContain('loading');
    expect(states.at(-1)).toBe('loaded');
  });

  it('a new src set while hidden that has not loaded yet: "loading" on return, then "slow"', async () => {
    vi.useFakeTimers();
    const states: FrameState[] = [];
    const v = render(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { frame()!.dispatchEvent(new Event('load')); });
    v.rerender(<Shown on={false}><Frame {...props((s) => states.push(s))} src={SRC + '&x=1'} /></Shown>);
    await act(async () => { await Promise.resolve(); });
    v.rerender(<Shown on><Frame {...props((s) => states.push(s))} src={SRC + '&x=1'} /></Shown>);
    expect(states.at(-1)).toBe('loading');
    act(() => { vi.advanceTimersByTime(SLOW_MS + 1000); });
    expect(states.at(-1)).toBe('slow');
  });

  it('a new src reads "loading" again, and "slow" when it never loads', () => {
    vi.useFakeTimers();
    const states: FrameState[] = [];
    const v = render(<Shown on><Frame {...props((s) => states.push(s))} /></Shown>);
    act(() => { frame()!.dispatchEvent(new Event('load')); });
    v.rerender(<Shown on><Frame {...props((s) => states.push(s))} src={SRC + '&x=1'} /></Shown>);
    expect(states.at(-1)).toBe('loading');
    act(() => { vi.advanceTimersByTime(SLOW_MS + 1000); });
    expect(states.at(-1)).toBe('slow');
  });
});

describe('kept Board: a Start that settles while hidden lands on return', () => {
  const cedar = { id: 'c0a7150000000000000000c3', name: 'cedar', status: 'stopped', project_id: 'p1' } as unknown as BoardComputer;

  it('a refusal answered while hidden: the tile is no longer busy and shows it once shown again', async () => {
    let release: ((a: FixtureAnswer) => void) | null = null;
    bootFixtureCore({ rules: [reply(computerLifecycleRoute, () => new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer)] });
    let on = true;
    const wrapper = ({ children }: { children: ReactNode }) => <Shown on={on}>{children}</Shown>;
    const h = renderHook(() => useBoardPower([cedar], () => undefined), { wrapper });
    await act(async () => { h.result.current(cedar)?.run(); });
    await waitFor(() => expect(h.result.current(cedar)?.busy).toBe(true));
    // The Start request has reached core (busy shows before it is sent).
    await waitFor(() => expect(release).not.toBeNull());
    on = false;
    h.rerender();
    await act(async () => { release!(answers.refused(400, 'BAD_REQUEST')); await new Promise((r) => setTimeout(r, 20)); });
    on = true;
    h.rerender();
    await waitFor(() => expect(h.result.current(cedar)?.busy).toBe(false));
    expect(h.result.current(cedar)?.outcome?.kind).toBe('failed');
  });
});

describe('kept Board: a Connect over SSH that settles while hidden lands on return (the form)', () => {
  const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
  const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
  beforeEach(() => { resetSshAttempts(); });

  it('the session it started is picked once the form shows again', async () => {
    const user = userEvent.setup();
    let release: ((a: FixtureAnswer) => void) | null = null;
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), () => new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer),
      ],
    });
    const onPick = vi.fn();
    const form = <SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />;
    const v = render(<Shown on>{form}</Shown>);
    await user.type(screen.getByRole('textbox', { name: /Host/ }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    // The create has reached core (after the form's read of the sessions).
    await waitFor(() => expect(release).not.toBeNull());
    v.rerender(<Shown on={false}>{form}</Shown>);
    await act(async () => { release!(answers.ok({ success: true })); await new Promise((r) => setTimeout(r, 20)); });
    expect(onPick).not.toHaveBeenCalled();
    v.rerender(<Shown on>{form}</Shown>);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]![0]).toMatchObject({ program: 'terminal', ssh: { host: 'db.example.com', user: 'ops' } });
  });
});

describe('kept Board: a Check again that settles while hidden lands on return (the read back)', () => {
  const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
  const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
  const row = (n: number) => ({ terminal_id: String(n), shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, is_ssh: true, client_count: 0, ssh_host: 'db.example.com', ssh_user: 'ops', ssh_port: 22 });
  let posts: number[] = [];
  let reads: Array<(a: FixtureAnswer) => void> = [];
  beforeEach(() => {
    resetSshAttempts();
    posts = [];
    reads = [];
    let first = true;
    bootFixtureCore({
      rules: [
        // The form's first read (picking the number) answers at once; each read back waits for the test.
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => {
          if (first) { first = false; return answers.ok([]); }
          return new Promise<FixtureAnswer>((r) => { reads.push(r); }) as unknown as FixtureAnswer;
        }),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), (req) => { posts.push(Number((req.body as { terminal_id: number }).terminal_id)); return answers.pending5xx(); }),
      ],
    });
  });
  const unknownThenCheck = async (onPick: () => void) => {
    const user = userEvent.setup();
    const form = <SshForm computers={[computer]} failed={false} onRetry={vi.fn()} taken={() => []} onPick={onPick} onBack={vi.fn()} />;
    const v = render(<Shown on>{form}</Shown>);
    await user.type(screen.getByRole('textbox', { name: /Host/ }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText(/Starting the connection to .* may have gone through/);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(reads).toHaveLength(1));
    v.rerender(<Shown on={false}>{form}</Shown>);
    return { v, form };
  };

  it('started: the session is picked once the form shows again, and nothing is sent again', async () => {
    const onPick = vi.fn();
    const { v, form } = await unknownThenCheck(onPick);
    await act(async () => { reads[0]!(answers.ok([row(posts[0]!)])); await new Promise((r) => setTimeout(r, 20)); });
    expect(onPick).not.toHaveBeenCalled();
    v.rerender(<Shown on>{form}</Shown>);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]![0]).toMatchObject({ session: posts[0], ssh: { host: 'db.example.com' } });
    expect(posts).toHaveLength(1);
  });

  it('nothing listed: on return it is still unknown and Connect comes back to try the same number', async () => {
    const { v, form } = await unknownThenCheck(vi.fn());
    await act(async () => { reads[0]!(answers.ok([])); await new Promise((r) => setTimeout(r, 20)); });
    v.rerender(<Shown on>{form}</Shown>);
    expect(await screen.findByText(/No session is listed on that number now, but the first try may still land/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
    expect(document.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('pending');
    // The Check again that ended while hidden is not left busy.
    expect(screen.getByRole('button', { name: /Check again/ })).toBeEnabled();
  });

  it('a read that could not answer while hidden: Check again is usable on return', async () => {
    const { v, form } = await unknownThenCheck(vi.fn());
    await act(async () => { reads[0]!(answers.refused(500, 'INTERNAL')); await new Promise((r) => setTimeout(r, 20)); });
    v.rerender(<Shown on>{form}</Shown>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Check again/ })).toBeEnabled());
  });

  it('a Check again still out when Connect retries the same number (visible): its answer still counts', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const { v, form } = await unknownThenCheck(onPick);
    v.rerender(<Shown on>{form}</Shown>);
    await act(async () => { reads[0]!(answers.ok([])); await new Promise((r) => setTimeout(r, 20)); });
    await screen.findByText(/but the first try may still land/);
    await user.click(screen.getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(reads).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    await screen.findByText(/Starting the connection to .* may have gone through/);
    expect(new Set(posts).size).toBe(1);
    await act(async () => { reads[1]!(answers.ok([row(posts[0]!)])); await new Promise((r) => setTimeout(r, 20)); });
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]![0]).toMatchObject({ session: posts[0] });
  });

  it('the sticky notice\'s Check again proves it started while hidden: on return the pick closes the form and no new notice opens', async () => {
    const user = userEvent.setup();
    const props = { failed: false, onRetry: vi.fn(), taken: () => [], onBack: vi.fn() };
    // A parent that closes the form once it picks, as the picker does.
    function Host({ on }: { on: boolean }) {
      const [picked, setPicked] = useState(false);
      return <Shown on={on}>{picked ? <p>picked</p> : <SshForm computers={[computer]} {...props} onPick={() => setPicked(true)} />}</Shown>;
    }
    const v = render(<Host on />);
    await user.type(screen.getByRole('textbox', { name: /Host/ }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText(/Starting the connection to .* may have gone through/);
    v.rerender(<Host on={false} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(openToasts().map((x) => x.id)).toEqual(['t1']);
    let proved: unknown;
    await act(async () => { void Promise.resolve(T.shown[0]!.check!()).then((x) => { proved = x; }); await new Promise((r) => setTimeout(r, 10)); });
    await waitFor(() => expect(reads).toHaveLength(1));
    await act(async () => { reads[0]!(answers.ok([row(posts[0]!)])); await new Promise((r) => setTimeout(r, 20)); });
    expect(proved).toBe(true);
    v.rerender(<Host on />);
    expect(await screen.findByText('picked')).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(T.shown.map((x) => x.id)).toEqual(['t1']);
    expect(openToasts()).toEqual([]);
  });

  it('answered unknown while hidden, shown again with no running computer: the outcome line is there, with Check again', async () => {
    const user = userEvent.setup();
    let release: ((a: FixtureAnswer) => void) | null = null;
    bootFixtureCore({
      rules: [
        reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => answers.ok([])),
        reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), () => new Promise<FixtureAnswer>((r) => { release = r; }) as unknown as FixtureAnswer),
      ],
    });
    const props = { failed: false, onRetry: vi.fn(), taken: () => [], onPick: vi.fn(), onBack: vi.fn() };
    const v = render(<Shown on><SshForm computers={[computer]} {...props} /></Shown>);
    await user.type(screen.getByRole('textbox', { name: /Host/ }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: /User/ }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(release).not.toBeNull());
    v.rerender(<Shown on={false}><SshForm computers={[computer]} {...props} /></Shown>);
    await act(async () => { release!(answers.pending5xx()); await new Promise((r) => setTimeout(r, 20)); });
    v.rerender(<Shown on><SshForm computers={[]} {...props} /></Shown>);
    expect(await screen.findByText(/Starting the connection to .* may have gone through/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
  });

  it('unloaded for good (not kept): the read back settles the attempt and shows nothing', async () => {
    const onPick = vi.fn();
    const { v } = await unknownThenCheck(onPick);
    page.shown = true;
    v.unmount();
    await act(async () => { reads[0]!(answers.ok([row(posts[0]!)])); await new Promise((r) => setTimeout(r, 20)); });
    expect(onPick).not.toHaveBeenCalled();
  });
});
