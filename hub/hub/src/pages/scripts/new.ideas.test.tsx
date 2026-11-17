// Vitest (New script): Pick an idea's "+N more, built by the assistant" opens a curated menu of ideas the
// assistant builds, in three groups, simple ones first. Choosing one only fills the description: the step goes to Describe
// it with the idea's words in the box (after anything already typed), the caret at their end, and the flow stays on its
// first step. A ready-made idea picked before is no longer shown beside the description or on Check off the idea way (it stays
// picked on the grid).
// None of them is a ready-made idea or an example, and with the assistant unavailable they are not offered.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ writer: true }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: () => fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1', { writer: io.writer }), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2', { writer: io.writer })])(),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    // Check's own send never answers here: the step is drawn while it checks.
    useBoundSends: () => ({ shown: true, validate: () => new Promise(() => undefined) }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import { EXAMPLES, MORE_IDEAS } from './new/StepWhat';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

type Key = keyof typeof strings;
const s = (k: string) => strings[k as Key];
/** A name pattern for a string key's words (some end in a question mark). */
const words = (k: string) => new RegExp(s(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const ALL = MORE_IDEAS.flatMap((g) => [...g.ids]);
const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const moreName = () => s('flow.what.more').replace('{{count}}', String(ALL.length));
const describeBox = () => screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW) as Promise<HTMLTextAreaElement>;
const ideaCard = () => screen.getByRole('button', { name: new RegExp(strings['flow.what.ideaCard']) });
const cont = () => screen.getByRole('button', { name: strings['flow.continue'] });

/** The flow on its first step, moved to the idea way by its card. */
async function toIdeas() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.ideaCard']) }, SLOW));
  await screen.findByRole('radiogroup', { name: strings['new.pickIdea'] }, SLOW);
  return { r, user };
}

/** Open the more ideas menu and return it. */
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: moreName() }));
  return screen.findByRole('menu', undefined, SLOW);
}

/** The menu row whose label reads the idea's words. */
const row = (menu: HTMLElement, id: string) => {
  const el = within(menu).getByText(s(`more.${id}`), { selector: '[slot="label"]' }).closest<HTMLElement>('[role^="menuitem"]');
  if (!el) throw new Error(`no row ${id}`);
  return el;
};

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  io.writer = true;
});

describe('New script: more ideas under Pick an idea', () => {
  it('the list holds every more idea once, in three groups, simple ones first, each with its own words', () => {
    expect(MORE_IDEAS.map((g) => g.group)).toEqual(['moreSimple', 'moreFurther', 'moreHoody']);
    expect(new Set(ALL).size).toBe(ALL.length);
    expect(ALL.length).toBeGreaterThanOrEqual(12);
    const ready = Object.entries(strings).filter(([k]) => /^idea\.[\w-]+$/.test(k)).map(([, v]) => v);
    const examples = EXAMPLES.map((id) => s(`new.ex.${id}`));
    const fills = new Set<string>();
    for (const id of ALL) {
      for (const k of [`more.${id}`, `more.${id}.body`, `more.${id}.fill`]) expect(s(k)?.trim(), k).toBeTruthy();
      expect(ready).not.toContain(s(`more.${id}`));
      expect(examples).not.toContain(s(`more.${id}`));
      fills.add(s(`more.${id}.fill`));
    }
    expect(fills.size).toBe(ALL.length);
  });

  it('"+N more" says the assistant builds them, and opens the groups in order, each idea with its line', async () => {
    const { user } = await toIdeas();
    expect(moreName()).toMatch(/assistant/);
    const menu = await openMore(user);
    const groups = within(menu).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label') ?? (g.getAttribute('aria-labelledby') ? document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent : null))).toEqual(MORE_IDEAS.map((g) => s(`flow.what.${g.group}`)));
    MORE_IDEAS.forEach((g, i) => {
      const rows = within(groups[i]!).getAllByRole('menuitem');
      expect(rows.map((el) => el.querySelector('[slot="label"]')?.textContent)).toEqual(g.ids.map((id) => s(`more.${id}`)));
      g.ids.forEach((id, j) => expect(rows[j]!.textContent).toContain(s(`more.${id}.body`)));
    });
  });

  it('choosing one goes to Describe it with its words in the box, the caret at their end, still on the first step', async () => {
    const { r, user } = await toIdeas();
    const before = loc(r);
    const id = MORE_IDEAS[2].ids[0];
    await user.click(row(await openMore(user), id));
    const box = await describeBox();
    expect(box.value).toBe(s(`more.${id}.fill`));
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(box.selectionStart).toBe(box.value.length);
    expect(screen.queryByRole('radiogroup', { name: strings['new.pickIdea'] })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(loc(r)).toBe(before);
  });

  it('a ready-made idea picked before is not shown beside the description, and is still picked back on the grid', async () => {
    const { user } = await toIdeas();
    const tpl = 'kv-note';
    await user.click(screen.getByRole('radio', { name: words(`idea.${tpl}`) }));
    // The side card is the wizard's aside, named by its title.
    const rail = () => screen.getByRole('complementary', { name: strings['flow.rail.title'] });
    expect(rail().textContent).toContain(s(`idea.${tpl}`));
    const id = MORE_IDEAS[1].ids[2];
    await user.click(row(await openMore(user), id));
    await describeBox();
    await waitFor(() => expect(rail().textContent).toContain(s(`more.${id}.fill`)));
    expect(rail().textContent).not.toContain(s(`idea.${tpl}`));
    await user.click(ideaCard());
    expect((await screen.findByRole('radio', { name: words(`idea.${tpl}`) }, SLOW)).getAttribute('aria-checked')).toBe('true');
  });

  it('off the idea way, Check shows no ready-made idea picked before (the write way, through to Check)', async () => {
    const { r, user } = await toIdeas();
    const tpl = 'kv-note';
    await user.click(screen.getByRole('radio', { name: words(`idea.${tpl}`) }));
    // Choosing the write way goes on to Where by itself.
    await user.click(screen.getByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }));
    const address = await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    await user.clear(address);
    await user.type(address, '/notes');
    await user.click(cont());
    await waitFor(() => expect(loc(r)).toMatch(/step=write/));
    const code = screen.getByRole('textbox', { name: strings['new.code'] });
    await user.clear(code);
    await user.type(code, 'export default () => new Response("notes");');
    await user.click(cont());
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
    // Check is drawn (it is checking the code), with its summary: the address, and no ready-made idea or its line.
    await screen.findByText(strings['flow.check.checking'].replace('{{computer}}', 'atlas'), undefined, SLOW);
    expect(screen.getAllByText('/notes').length).toBeGreaterThan(0);
    expect(screen.queryByText(s(`idea.${tpl}`))).toBeNull();
    expect(screen.queryByText(strings['flow.check.ideaMade'])).toBeNull();
  });

  it('words already typed are kept: the idea goes after them, once', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.type(await describeBox(), 'Keep my words');
    await user.click(ideaCard());
    await screen.findByRole('radiogroup', { name: strings['new.pickIdea'] }, SLOW);
    const id = MORE_IDEAS[0].ids[1];
    await user.click(row(await openMore(user), id));
    expect((await describeBox()).value).toBe(`Keep my words\n\n${s(`more.${id}.fill`)}`);
    // The same idea again adds nothing.
    await user.click(ideaCard());
    await screen.findByRole('radiogroup', { name: strings['new.pickIdea'] }, SLOW);
    await user.click(row(await openMore(user), id));
    expect((await describeBox()).value).toBe(`Keep my words\n\n${s(`more.${id}.fill`)}`);
  });

  it('with the assistant unavailable the more ideas are not offered (the ready-made ones still are)', async () => {
    io.writer = false;
    await toIdeas();
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: moreName() })).toBeNull();
  });
});
