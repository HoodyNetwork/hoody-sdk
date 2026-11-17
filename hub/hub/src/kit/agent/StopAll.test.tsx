// StopAllButton and StopAllResult: the confirm, the headline from per-item outcomes, the failures kept
// when complete is true, no Continue without a cursor, Stop all again without `after`, not_covered with its reason.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { agent } from '@core';
import { StopAllButton, StopAllConfirm, StopAllResult } from './StopAll';
import { createStopRun } from './stop';

type Answer = Awaited<ReturnType<agent.StopApi['stop']>>;
// The route always sends the three arrays; a fixture names only what the case is about.
const ok = (b: unknown): Answer => ({ ok: true, body: { started_during_call: [], behind_cursor: [], not_covered: [], ...(b as object) } });
const item = (id: string, outcome: string, detail?: string) => ({ kind: 'session', id, outcome, ...(detail ? { detail } : {}) });
function setup(...answers: Answer[]) {
  const sent: Array<string | undefined> = [];
  let i = 0;
  const run = createStopRun({ api: { stop: (after) => { sent.push(after); return Promise.resolve(answers[Math.min(i++, answers.length - 1)]!); } } });
  const ui = render(<><StopAllButton run={run} realm="Work" computer="atlas" estimate={3} /><StopAllResult run={run} realm="Work" /></>);
  return { run, sent, ui };
}
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
async function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Stop everything in this realm…' }));
  await flush();
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Stop everything' }));
  await flush();
}

describe('the confirm', () => {
  it('names the realm, says loops are paused not deleted, calls the count an estimate; sends nothing until confirmed', async () => {
    const { sent } = setup(ok({ items: [], complete: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop everything in this realm…' }));
    await flush();
    const d = screen.getByRole('alertdialog');
    expect(d).toHaveTextContent('Stop everything in realm Work?');
    expect(d).toHaveTextContent('Loops are paused, not deleted.');
    expect(d).toHaveTextContent('About 3 things look to be running. That is an estimate');
    expect(sent.length).toBe(0);
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(sent.length).toBe(0);
  });
});

describe('the result', () => {
  it('complete:true with a failed item: the headline counts the failure, the item is listed, and it never says everything stopped', async () => {
    setup(ok({ items: [item('a', 'stopped'), item('b', 'failed', 'did not return in time')], complete: true }));
    await confirm();
    expect(screen.getByText('1 stopped · 0 already done · 1 may still be running')).toBeInTheDocument();
    expect(screen.getByText('session b: did not return in time')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/everything (was )?stopped/i);
    expect(screen.queryByRole('button', { name: 'Continue with the next 256' })).toBeNull();
  });
  it('complete:false without a cursor: no Continue', async () => {
    setup(ok({ items: [item('a', 'stopped')], complete: false }));
    await confirm();
    expect(screen.queryByRole('button', { name: 'Continue with the next 256' })).toBeNull();
  });
  it('a cursor offers Continue, which sends exactly that cursor and adds the page', async () => {
    const { sent } = setup(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), ok({ items: [item('b', 'stopped')], complete: true }));
    await confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with the next 256' }));
    await flush();
    expect(sent).toEqual([undefined, 'c1']);
    expect(screen.getByText('2 stopped · 0 already done · 0 may still be running')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with the next 256' })).toBeNull();
  });
  it('items behind the cursor offer Stop all again, which sends no cursor', async () => {
    const { sent } = setup(ok({ items: [item('a', 'stopped')], behind_cursor: [{ kind: 'task', id: 't' }], complete: true }), ok({ items: [item('t', 'stopped')], complete: true }));
    await confirm();
    expect(screen.getByText('1 thing was not reached yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop all again' }));
    await flush();
    expect(sent).toEqual([undefined, undefined]);
  });
  it('not_covered is listed with its reason', async () => {
    setup(ok({ items: [item('a', 'stopped')], complete: true, not_covered: [{ kind: 'sync_request', reason: 'stop it from its computer' }, { kind: 'old_job', reason: 'no owner record', count: 3 }] }));
    await confirm();
    expect(screen.getByText('sync_request: stop it from its computer')).toBeInTheDocument();
    expect(screen.getByText('old_job (3): no owner record')).toBeInTheDocument();
  });
  it('a sweep that stops nothing new says so and offers nothing more', async () => {
    setup(ok({ items: [item('a', 'already_done')], complete: true }));
    await confirm();
    expect(screen.getByText('Nothing new was stopped.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stop all again|Continue/ })).toBeNull();
  });
  it('a lost answer reads as unknown with Stop all again and no Continue', async () => {
    setup({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } });
    await confirm();
    expect(screen.getByRole('alert')).toHaveTextContent('The answer didn\'t arrive');
    expect(screen.getByRole('button', { name: 'Stop all again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue/ })).toBeNull();
  });
  it('a refusal says nothing was changed and the code', async () => {
    setup({ ok: false, err: { kind: 'failed', code: 'realm_scope_unsupported', status: 400, retryAfter: null, details: {} } });
    await confirm();
    expect(screen.getByRole('alert')).toHaveTextContent('The agent refused to stop everything (realm_scope_unsupported). Nothing was changed.');
  });
});

describe('StopAllConfirm (a host menu item opens it)', () => {
  it('controlled: confirming closes it and starts a sweep without a cursor', async () => {
    const sent: Array<string | undefined> = [];
    const run = createStopRun({ api: { stop: (after) => { sent.push(after); return Promise.resolve(ok({ items: [], complete: true })); } } });
    const changes: boolean[] = [];
    render(<StopAllConfirm run={run} realm="Work" computer="atlas" isOpen onOpenChange={(o) => changes.push(o)} />);
    await flush();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Stop everything' }));
    await flush();
    expect(sent).toEqual([undefined]);
    expect(changes).toContain(false);
  });
});

describe('StopAll: confirm wording and queued messages', () => {
  it('the confirm does not promise to remove queued messages', async () => {
    setup(ok({ items: [], complete: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop everything in this realm…' }));
    await flush();
    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).not.toMatch(/waiting queued messages/);
    expect(text).toMatch(/queued are not removed and may start afterwards/);
  });
  it('a call that is not complete does not blame a page limit', async () => {
    setup(ok({ items: [item('a', 'stopped')], started_during_call: [{ kind: 'session', id: 'n' }], complete: false }));
    await confirm();
    expect(document.body.textContent).not.toMatch(/page limit/);
    expect(screen.getByText(/did not reach everything/)).toBeInTheDocument();
  });
  it('a refused continuation keeps the counts and says the latest request was refused', async () => {
    setup(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), { ok: false, err: { kind: 'failed', code: 'forbidden', status: 403, retryAfter: null, details: {} } });
    await confirm();
    fireEvent.click(screen.getByRole('button', { name: /Continue with the next/ }));
    await flush();
    expect(screen.getByText('1 stopped · 0 already done · 0 may still be running')).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/refused the latest request \(forbidden\)/);
    expect(document.body.textContent).not.toMatch(/Nothing was changed/);
  });
  it('at the page cap with more left it explains and offers a fresh sweep', async () => {
    let n = 0;
    const run = createStopRun({ api: { stop: () => Promise.resolve(ok({ items: [item('i' + n, 'stopped')], complete: false, next_cursor: 'c' + ++n })) } });
    render(<StopAllResult run={run} realm="Work" />);
    await run.start();
    while (run.view().canContinue) await run.next();
    await flush();
    expect(screen.getByText(/Pages stop at 10 in one sweep/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue with the next/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop all again' })).toBeInTheDocument();
  });
});
