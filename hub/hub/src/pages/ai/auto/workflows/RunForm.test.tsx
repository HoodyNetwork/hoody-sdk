// Run… drawer over a fake run api (money may be spent): one start per Start run; a required input left empty sends nothing;
// a lost answer shows as unknown with no Start run, and closing and reopening the drawer keeps it (no second start);
// Check again only reads; a spending-limit refusal is named; a started run links its chat.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRealm, setTarget } from '@core/ctx';
import { boot, R1, R2, TARGET } from '@core/test/env';
import { parseWorkflows } from './logic';
import type { Run } from './runs';
import type { RunApi, RunBody, StartSettled } from './runApi';
import { resetRunStores, RunForm } from './RunForm';
import strings from './Run.strings.en.json';

const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const [wf] = parseWorkflows({ items: [{ name: 'deploy', entry_point: 'go', params: [{ name: 'repo', required: true }, { name: 'branch', default: 'main' }] }] }, { hiddenCap: false });
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const LOST: StartSettled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };

function fake(start: StartSettled[], runs: Run[] = []) {
  const sent = { starts: [] as RunBody[], lists: 0 };
  const make = (): RunApi => ({
    // A call without a context is never sent (workflowRunApi): only calls given one count.
    start: async (b, ctx) => { if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } }; sent.starts.push(b); return start.shift() ?? { ok: true, body: { session_id: 's1', run_id: null } }; },
    list: async (ctx) => { if (!ctx) return { ok: false }; sent.lists++; return { ok: true, runs, skipped: 0 }; },
  });
  return { sent, make };
}
function open(f: ReturnType<typeof fake>, onClose = () => {}) {
  return render(<RunForm workflow={wf!} realm="global" computer="box" onClose={onClose} makeApi={f.make} chatHref={(sid, realm) => `/chat/${realm}/${sid}`} />);
}
const startButton = () => screen.queryByRole('button', { name: words('run.start') });
const type = (label: string, v: string) => fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`^${label}`) }), { target: { value: v } });

beforeEach(() => { boot({ realm: R1 }); resetRunStores(); });
afterEach(cleanup);

describe('Run… drawer', () => {
  it('names the cost, asks for the declared inputs, and sends nothing while a required one is empty', async () => {
    const f = fake([]);
    open(f);
    expect(screen.getByText(words('run.subtitle', { computer: 'box' }))).toBeTruthy();
    fireEvent.click(startButton()!);
    await settle();
    expect(f.sent.starts).toHaveLength(0);
    expect(screen.getByText(words('run.problem', { name: 'repo' }))).toBeTruthy();
  });
  it('a start sends the inputs once and links the new chat', async () => {
    const f = fake([]);
    open(f);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    expect(f.sent.starts).toEqual([{ inputs: { repo: 'shop' } }]);
    expect(screen.getByText(words('run.out.started', { name: 'deploy' }))).toBeTruthy();
    expect(screen.getByRole('link', { name: words('run.open') }).getAttribute('href')).toBe('/chat/global/s1');
    expect(startButton()).toBeNull();
  });
  it('a lost answer is unknown: no Start run, and reopening the drawer neither forgets it nor sends again', async () => {
    const f = fake([LOST]);
    const r = open(f);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    expect(screen.getByText(words('run.out.unknown', { name: 'deploy', computer: 'box' }))).toBeTruthy();
    expect(startButton()).toBeNull();
    r.unmount();
    open(f);
    await settle();
    expect(screen.getByText(words('run.out.unknown', { name: 'deploy', computer: 'box' }))).toBeTruthy();
    expect(startButton()).toBeNull();
    expect(f.sent.starts).toHaveLength(1);
  });
  it('Check again only reads the runs; Stop tracking allows a new start', async () => {
    const f = fake([LOST]);
    open(f);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    await settle();
    expect(f.sent.lists).toBe(1);
    expect(f.sent.starts).toHaveLength(1);
    expect(screen.getByText(words('run.seen.none', { name: 'deploy' }))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: words('run.forget') }));
    await settle();
    expect(startButton()).not.toBeNull();
  });
  it('a spending-limit refusal says so; nothing started, so Start run stays', async () => {
    const f = fake([{ ok: false, err: { kind: 'failed', code: 'spend_cap', status: 409 } }]);
    open(f);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    expect(screen.getByText(words('run.out.spendCap'))).toBeTruthy();
    expect(startButton()).not.toBeNull();
  });
  it('another computer shown: nothing is sent or read, the unknown start stays with its own computer, and comes back with it', async () => {
    const f = fake([LOST]);
    const r = open(f);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    act(() => setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } }));
    await settle();
    expect(screen.getByText(words('run.moved', { computer: 'box' }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    expect(startButton()).toBeNull();
    r.unmount();
    // A drawer opened on the other computer has its own store: a start there is a new one.
    open(f);
    expect(startButton()).not.toBeNull();
    cleanup();
    act(() => setTarget(TARGET));
    open(f);
    await settle();
    expect(screen.getByText(words('run.out.unknown', { name: 'deploy', computer: 'box' }))).toBeTruthy();
    expect(f.sent.starts).toHaveLength(1);
  });
  it('a workflow listed in its own realm: a realm switch with the drawer open sends and reads nothing', async () => {
    const f = fake([LOST]);
    render(<RunForm workflow={wf!} realm={R1} computer="box" onClose={() => {}} makeApi={f.make} />);
    type('repo', 'shop');
    act(() => setRealm(R2));
    await settle();
    // Nothing was started, so it does not send the person back "to see this run".
    expect(screen.getByText(words('run.movedIdle'))).toBeTruthy();
    expect(screen.queryByText(words('run.moved', { computer: 'box' }))).toBeNull();
    expect(startButton()).toBeNull();
    expect(f.sent.starts).toHaveLength(0);
  });
  it('an input named __proto__ is typed into its own field and sent', async () => {
    const [proto] = parseWorkflows({ items: [{ name: 'odd', entry_point: 'go', params: [{ name: '__proto__', required: true }] }] }, { hiddenCap: false });
    const f = fake([]);
    render(<RunForm workflow={proto!} realm="global" computer="box" onClose={() => {}} makeApi={f.make} />);
    expect((screen.getByRole('textbox', { name: /^__proto__/ }) as HTMLInputElement).value).toBe('');
    type('__proto__', 'v1');
    fireEvent.click(startButton()!);
    await settle();
    expect(f.sent.starts).toHaveLength(1);
    expect(JSON.stringify(f.sent.starts[0])).toBe('{"inputs":{"__proto__":"v1"}}');
  });
  it('a lost start of a workflow listed in its own realm survives a page-realm switch: reopened, it is still unknown, no second start', async () => {
    const f = fake([LOST]);
    const r = render(<RunForm workflow={wf!} realm={R1} computer="box" onClose={() => {}} makeApi={f.make} />);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    r.unmount();
    act(() => setRealm(R2));
    render(<RunForm workflow={wf!} realm={R1} computer="box" onClose={() => {}} makeApi={f.make} />);
    await settle();
    expect(screen.getByText(words('run.out.unknown', { name: 'deploy', computer: 'box' }))).toBeTruthy();
    expect(startButton()).toBeNull();
    expect(f.sent.starts).toHaveLength(1);
  });
  it('two drawers open on the same workflow share one start: a press in one takes Start run away from both, one start in all', async () => {
    let release: (v: StartSettled) => void = () => undefined;
    const f = fake([]);
    const make = (): RunApi => ({ ...f.make(), start: (b, ctx) => { if (ctx) f.sent.starts.push(b); return new Promise<StartSettled>((res) => { release = res; }); } });
    render(<><RunForm workflow={wf!} realm="global" computer="box" onClose={() => {}} makeApi={make} /><RunForm workflow={wf!} realm="global" computer="box" onClose={() => {}} makeApi={make} /></>);
    const boxes = screen.getAllByRole('textbox', { name: /^repo/ });
    for (const b of boxes) fireEvent.change(b, { target: { value: 'shop' } });
    const [first, second] = screen.getAllByRole('button', { name: words('run.start') });
    fireEvent.click(first!);
    fireEvent.click(second!);
    await settle();
    expect(f.sent.starts).toHaveLength(1);
    act(() => release(LOST));
    await settle();
    expect(screen.queryAllByRole('button', { name: words('run.start') })).toHaveLength(0);
    expect(screen.getAllByText(words('run.out.unknown', { name: 'deploy', computer: 'box' }))).toHaveLength(2);
    expect(f.sent.starts).toHaveLength(1);
  });
  it('a page-realm switch with the drawer kept open, then back: still one start, the unknown one', async () => {
    const f = fake([LOST]);
    render(<RunForm workflow={wf!} realm={R1} computer="box" onClose={() => {}} makeApi={f.make} />);
    type('repo', 'shop');
    fireEvent.click(startButton()!);
    await settle();
    act(() => setRealm(R2));
    await settle();
    expect(startButton()).toBeNull();
    act(() => setRealm(R1));
    await settle();
    expect(screen.getByText(words('run.out.unknown', { name: 'deploy', computer: 'box' }))).toBeTruthy();
    expect(startButton()).toBeNull();
    expect(f.sent.starts).toHaveLength(1);
  });
});

// The words of an unknown start, a refusal and a spending limit.
describe('Run… words', () => {
  it('an unknown start warns that a new start after Stop tracking is a second paid run', () => {
    for (const k of ['run.out.unknown', 'run.out.error', 'run.out.unread'] as const) expect(strings[k]).toMatch(/Stop tracking.*second paid run/);
  });
  it('a lost answer is not called "no answer came back" (a late answer the page dropped also lands here)', () => {
    expect(strings['run.out.unknown']).not.toMatch(/No answer came back/i);
  });
  it('a refusal on the way (proxy, gateway) is not blamed on the agent', () => {
    expect(strings['run.out.refused']).not.toMatch(/agent/i);
  });
  it('the spending-limit words also cover a spending-limit file the agent cannot read', () => {
    expect(strings['run.out.spendCap']).toMatch(/file/);
  });
});
