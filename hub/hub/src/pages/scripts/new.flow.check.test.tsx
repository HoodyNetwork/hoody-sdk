// Vitest (New script): Check checks the exact snapshot bytes on the bound
// computer; only a verdict for the current snapshot unlocks Continue; a check without an answer is "could not be
// checked", never ready; problems are listed and focused; an edit drops the verdict at once and re-checks the new bytes;
// a late verdict of older bytes is ignored.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type V = { outcome: string; data?: unknown };
const io = vi.hoisted(() => ({
  sent: [] as Array<{ code: string; exec: number; target?: { container: { id: string } } }>,
  answers: [] as Array<(v: V) => void>,
  fails: [] as Array<(e: unknown) => void>,
}));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    // The bound sends: the check goes to the draft's computer and folder.
    useBoundSends: (b: { target: { container: { id: string } }; exec: number } | null) => ({ shown: true, validate: (code: string) => { io.sent.push({ code, exec: b?.exec ?? 0, ...(b ? { target: b.target } : {}) }); return new Promise<V>((res, rej) => { io.answers.push(res); io.fails.push(rej); }); } }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const codeBox = () => screen.getByRole('textbox', { name: strings['new.code'] }) as HTMLTextAreaElement;
const cont = () => screen.getByRole('button', { name: strings['flow.continue'] }) as HTMLButtonElement;
const off = (b: HTMLElement) => (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true';
const CODE = 'export default () => new Response("notes");';
const READY: V = { outcome: 'done', data: { publishable: true, results: { dependencies: {} } } };
const PROBLEMS: V = { outcome: 'done', data: { publishable: false, results: { typecheck: { errors: [{ line: 1, message: 'Cannot find name x.' }, { line: 3, message: 'Missing return.' }] } } } };
const answer = async (i: number, v: V) => { await act(async () => { io.answers[i]?.(v); }); };

async function toCheck() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  // Choosing the write way goes on to Where by itself (nothing to type on What).
  await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
  const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
  await user.clear(address);
  await user.type(address, '/notes');
  await user.click(cont());
  await waitFor(() => expect(loc(r)).toMatch(/step=write/));
  await user.clear(codeBox());
  await user.type(codeBox(), CODE);
  await user.click(cont());
  await waitFor(() => expect(loc(r)).toMatch(/step=check/));
  await waitFor(() => expect(io.sent.length).toBe(1));
  return { r, user };
}

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  io.sent.length = 0;
  io.answers.length = 0;
  io.fails.length = 0;
});

describe('New script flow: Check it', () => {
  it('checks the exact bytes on the bound computer; Ready unlocks Continue', async () => {
    await toCheck();
    expect(io.sent[0]?.code).toBe(CODE);
    expect(io.sent[0]?.target?.container.id).toBe('c0a7150000000000000000a1');
    expect(screen.getByText(strings['flow.check.checking'].replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(off(cont())).toBe(true);
    await answer(0, READY);
    expect(await screen.findByText(strings['flow.check.ready'], undefined, SLOW)).toBeTruthy();
    expect(off(cont())).toBe(false);
    // What the script is, as the kit's label and value rows (Facts) that read from the start: never the rail's
    // list, and not the spec sheet, whose values sit at the row's end.
    const at = screen.getByText(strings['flow.rail.at'], { selector: 'dt' });
    expect(at.closest('dl')?.className).not.toMatch(/railList/);
    expect(at.closest('[class*="spec"]')).toBeNull();
  });

  it('a check with no answer could not be checked: never ready, Check again sends it again', async () => {
    const { user } = await toCheck();
    await answer(0, { outcome: 'pending' });
    expect(await screen.findByText(strings['review.checkFailed'], undefined, SLOW)).toBeTruthy();
    expect(off(cont())).toBe(true);
    await user.click(screen.getByRole('button', { name: strings['flow.built.checkAgain'] }));
    await waitFor(() => expect(io.sent.length).toBe(2));
    await answer(1, READY);
    expect(await screen.findByText(strings['flow.check.ready'], undefined, SLOW)).toBeTruthy();
  });

  it('a check that fails outright could not be checked: never ready', async () => {
    await toCheck();
    await act(async () => { io.fails[0]?.(new Error('network')); });
    expect(await screen.findByText(strings['review.checkFailed'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.check.ready'])).toBeNull();
    expect(off(cont())).toBe(true);
  });

  it('problems are counted, listed and focused; Continue stays locked', async () => {
    await toCheck();
    await answer(0, PROBLEMS);
    expect(await screen.findByText(strings['flow.check.problems'].replace('{{n}}', '2'), undefined, SLOW)).toBeTruthy();
    const first = screen.getByText(/Cannot find name x\./).closest('li');
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(screen.getByText(/Missing return\./)).toBeTruthy();
    expect(off(cont())).toBe(true);
    // The write way has no assistant to ask.
    expect(screen.queryByRole('button', { name: strings['flow.check.fix'] })).toBeNull();
    // Edit stays under the problems as the kit's inline row (never folded), alone, so no group.
    const edit = screen.getByRole('button', { name: strings['flow.check.edit'] });
    expect(edit.closest('[data-hub-inline-actions]')).not.toBeNull();
    expect(screen.queryByRole('group', { name: strings['flow.check.problemActions'] })).toBeNull();
  });

  it('problems are the kit problem list; a line opens the editor with that line selected', async () => {
    const { user } = await toCheck();
    await answer(0, PROBLEMS);
    const list = await screen.findByRole('list', { name: strings['flow.check.problemsLabel'] }, SLOW);
    // Each problem with a line is one press named by its line and message, inside the problem list.
    const line1 = screen.getByRole('button', { name: 'Line 1 Cannot find name x.' });
    expect(list.contains(line1)).toBe(true);
    await user.click(line1);
    await waitFor(() => expect(document.activeElement).toBe(codeBox()));
    expect(codeBox().selectionStart).toBe(0);
    expect(codeBox().selectionEnd).toBe(CODE.length);
    // The editor opened in place (not behind See the code); Continue stays locked.
    expect(off(cont())).toBe(true);
  });

  it('Edit the code: an edit drops the verdict at once and re-checks the new bytes; focus stays in the editor', async () => {
    const { user } = await toCheck();
    await answer(0, READY);
    await screen.findByText(strings['flow.check.ready'], undefined, SLOW);
    await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.built.seeCode']) }));
    await user.click(screen.getByRole('button', { name: strings['flow.check.edit'] }));
    await user.type(codeBox(), ' ');
    expect(off(cont())).toBe(true);
    expect(screen.queryByText(strings['flow.check.ready'])).toBeNull();
    await waitFor(() => expect(io.sent.length).toBe(2), SLOW);
    expect(io.sent[1]?.code).toBe(`${CODE} `);
    await answer(1, PROBLEMS);
    await screen.findByText(strings['flow.check.problems'].replace('{{n}}', '2'), undefined, SLOW);
    expect(document.activeElement).toBe(codeBox());
  });

  it('a late verdict of older bytes is ignored', async () => {
    const { user } = await toCheck();
    await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.built.seeCode']) }));
    await user.click(screen.getByRole('button', { name: strings['flow.check.edit'] }));
    await user.type(codeBox(), ' ');
    await waitFor(() => expect(io.sent.length).toBe(2), SLOW);
    await answer(1, PROBLEMS);
    await screen.findByText(strings['flow.check.problems'].replace('{{n}}', '2'), undefined, SLOW);
    // The first check (of the code before the edit) answers Ready late: it is not this code's verdict.
    await answer(0, READY);
    expect(screen.queryByText(strings['flow.check.ready'])).toBeNull();
    expect(off(cont())).toBe(true);
  });
});
