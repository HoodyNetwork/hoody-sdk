// Vitest (New script, step 1 "What it does"): the example prompts under the description. Pressing one only fills the box:
// the flow stays on its first step and nothing is checked, built or made; words the person already typed are kept exactly
// (the example goes after them, once); the caret lands at the end of the box. The examples are not the ready-made ideas of
// Start from an idea. Replaced: the overview (one computer whose assistant is on) and the bound sends (spies).
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  const spy = (name: string) => async () => { io.sent.push(name); return { outcome: 'done', data: {} }; };
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useBoundSends: () => ({ shown: true, validate: spy('validate'), write: spy('write'), instantiate: spy('instantiate') }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import { EXAMPLES } from './new/StepWhat';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

type Key = keyof typeof strings;
const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const box = () => screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW) as Promise<HTMLTextAreaElement>;
const examples = async () => within(await screen.findByRole('list', { name: strings['new.examples'] }, SLOW));
const fill = (id: string) => strings[`new.ex.${id}.fill` as Key];
const label = (id: string) => strings[`new.ex.${id}` as Key];

async function open() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  const field = await box();
  return { r, user, field, at: loc(r) };
}
/** Still on the first step, with nothing sent. */
const stayed = (r: Parameters<typeof loc>[0], at: string) => {
  expect(loc(r)).toBe(at);
  expect(io.sent).toEqual([]);
};

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  io.sent.length = 0;
});

describe('New script flow: example prompts under the description', () => {
  it('4 to 6 examples, each a button with its own words, none of them a ready-made idea', async () => {
    await open();
    const buttons = (await examples()).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    expect(buttons.length).toBeLessThanOrEqual(6);
    expect(buttons.map((b) => b.textContent)).toEqual(EXAMPLES.map(label));
    const ready = Object.entries(strings).filter(([k]) => /^idea\.[\w-]+$/.test(k)).map(([, v]) => v);
    for (const id of EXAMPLES) {
      expect(ready).not.toContain(label(id));
      expect(fill(id).trim()).not.toBe('');
    }
  });

  it('pressing one fills the empty box, puts the caret at its end, stays on the step and sends nothing', async () => {
    const { r, user, field, at } = await open();
    const id = EXAMPLES[0];
    await user.click((await examples()).getByRole('button', { name: label(id) }));
    await waitFor(() => expect(field.value).toBe(fill(id)));
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.selectionStart).toBe(fill(id).length);
    stayed(r, at);
  });

  it('words already typed are kept exactly, spaces and line breaks too: the example goes after them', async () => {
    const { r, user, field, at } = await open();
    await user.type(field, 'Keep this{Enter}');
    const id = EXAMPLES[4];
    await user.click((await examples()).getByRole('button', { name: label(id) }));
    await waitFor(() => expect(field.value).toBe(`Keep this\n\n${fill(id)}`));
    stayed(r, at);
  });

  it('pressing the same example twice adds it once', async () => {
    const { r, user, field, at } = await open();
    const id = EXAMPLES[2];
    const list = await examples();
    await user.click(list.getByRole('button', { name: label(id) }));
    await user.click(list.getByRole('button', { name: label(id) }));
    await waitFor(() => expect(field.value).toBe(fill(id)));
    stayed(r, at);
  });
});
