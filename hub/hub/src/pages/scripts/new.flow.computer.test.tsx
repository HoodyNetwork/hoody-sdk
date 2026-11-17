// Vitest (New script): a draft is bound to the computer the Hub shows when it is
// made. When the Hub shows another computer the flow pauses: a band in place of the step, nothing sent, Continue off,
// and the person says which computer: Show <bound>, or Use <shown> instead. Nothing ever switches silently.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from './new/flowfix';

const io = vi.hoisted(() => ({ resolved: [] as Array<{ path: string }> }));
const CEDAR = fx.CEDAR;

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const f = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: f.overviewOf([
      f.comp(f.ATLAS, 'atlas', 'a.00a1', 'n1'),
      f.comp(f.BOREALIS, 'borealis', 'b.00b2', 'n2'),
      f.comp(f.CEDAR, 'cedar', 'c.00c3', 'n3', { on: false }),
    ]),
    useScriptsTarget: () => f.targetOf(f.shown.id),
    useResolve: () => ({ mutateAsync: async (v: { path: string }) => { io.resolved.push(v); return { outcome: 'done', data: { matched: false } }; } }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const describeBox = () => screen.getByRole('textbox', { name: strings['flow.what.describe'] });
const band = (bound: string, shown: string) => screen.queryByText(strings['flow.pause.title'].replace('{{bound}}', bound).replace('{{shown}}', shown));
const btn = (key: keyof typeof strings, name: string) => screen.queryByRole('button', { name: strings[key].replace('{{name}}', name) });

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  fx.shown.id = fx.ATLAS;
  io.resolved.length = 0;
});

describe('New script flow: the computer', () => {
  it('the draft takes the computer the Hub shows; another one shown pauses the flow and sends nothing', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
    expect(band('atlas', 'borealis')).toBeNull();
    // The top bar switches to borealis; the next render reads it.
    fx.shown.id = fx.BOREALIS;
    await user.type(describeBox(), ' daily');
    expect(await screen.findByText(strings['flow.pause.title'].replace('{{bound}}', 'atlas').replace('{{shown}}', 'borealis'), undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: strings['flow.what.describe'] })).toBeNull();
    expect((screen.getByRole('button', { name: strings['flow.continue'] }) as HTMLButtonElement).disabled || screen.getByRole('button', { name: strings['flow.continue'] }).getAttribute('aria-disabled') === 'true').toBe(true);
    const before = io.resolved.length;
    await new Promise((r) => setTimeout(r, 400));
    expect(io.resolved.length).toBe(before);
    expect(btn('flow.pause.show', 'atlas')).toBeTruthy();
    expect(btn('flow.pause.use', 'borealis')).toBeTruthy();
  });

  it('Use <shown> instead rebinds the draft and keeps what was typed', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
    await user.type(describeBox(), '!');
    fx.shown.id = fx.BOREALIS;
    await user.click(await screen.findByRole('button', { name: strings['flow.pause.use'].replace('{{name}}', 'borealis') }, SLOW));
    await waitFor(() => expect(band('atlas', 'borealis')).toBeNull());
    expect((describeBox() as HTMLTextAreaElement).value).toBe('Count sign-ups!');
    expect(screen.getByText('borealis')).toBeTruthy();
  });

  it('a shown computer that cannot take a script is never offered: only Show <bound>', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'x');
    fx.shown.id = CEDAR;
    await user.type(describeBox(), 'y');
    expect(await screen.findByText(strings['flow.pause.title'].replace('{{bound}}', 'atlas').replace('{{shown}}', 'cedar'), undefined, SLOW)).toBeTruthy();
    expect(btn('flow.pause.show', 'atlas')).toBeTruthy();
    expect(btn('flow.pause.use', 'cedar')).toBeNull();
  });

  // The overview holds the shown computer only: a new draft opened while it cannot take a script binds nothing.
  it('opened while the Hub shows a computer that cannot take one, no draft is bound to any computer silently', async () => {
    fx.shown.id = CEDAR;
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    expect(await screen.findByText(strings['new.noComputer'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: strings['flow.what.describe'] })).toBeNull();
  });
});
