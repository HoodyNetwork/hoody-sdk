// Vitest: the link drawers are built from kit structure. Give it a link shows the coming address in a verdict plate and
// keeps its questions link inside one closed Why; Link settings is setting groups (the CORS switch, the limits as rows,
// Delete last in a danger group); Re-point says what changes in a verdict plate. What each drawer sends, and when its
// button is off, stays as it was.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawers, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BotLink, BotView, Change, Computer, LinkOffer } from './data';
import { LIMITS } from './logic';
import { GiveLinkDrawer, LimitsDrawer, RepointDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const bot = { key: 'c1~global~chief', id: 'chief', uid: 'u-chief', name: 'Chief' } as BotView;
const link = { cors: true, limits: { key_rpm: 60, bot_rpm: 120, key_concurrency: 4, bot_concurrency: 8 } } as unknown as BotLink;
const offer: LinkOffer = { door: 'ready', suggestedLabel: 'quiet-amber-heron-bot', zone: 'bots.example.test' };

const stubChange = <R, V>(calls: V[]) =>
  ({
    run: async (v: V) => {
      calls.push(v);
      return { outcome: 'done' as const };
    },
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<R, V>;

async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
afterEach(cleanup);

/** No loose paragraph or hand-made heading in the drawer's body: text sits in kit slots. */
const noLooseText = (dlg: HTMLElement) => {
  expect(dlg.querySelector('h3[class*="sectionTitle"], p[class*="help"], [class*="urlPreview"]')).toBeNull();
};

describe('Give it a link', () => {
  const give = (calls: { label: string; cors: boolean }[], o: LinkOffer | undefined = offer) =>
    show(<GiveLinkDrawer open onClose={() => undefined} bot={bot} offer={o} create={stubChange<BotLink, { label: string; cors: boolean }>(calls)} />);

  it('names the coming address in a verdict plate, with making a key as what comes next', async () => {
    await give([]);
    const dlg = await screen.findByRole('dialog', { name: S['giveLink.title'] });
    const plate = within(dlg).getByRole('group', { name: S['giveLink.previewLabel'] });
    expect(within(plate).getByText(/^https:\/\/quiet-amber-heron-bot\./)).toBeInTheDocument();
    expect(within(plate).getByText(S['giveLink.keyNext'] as string)).toBeInTheDocument();
    noLooseText(dlg);
  });

  it('the CORS choice is a setting switch, and the questions link sits in one closed Why', async () => {
    await give([]);
    const dlg = await screen.findByRole('dialog', { name: S['giveLink.title'] });
    expect(within(dlg).getByRole('switch', { name: S['giveLink.cors'] })).toBeChecked();
    expect(within(dlg).queryByRole('link', { name: S['limits.more'] })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: S['giveLink.corsWhy'] }));
    expect(within(dlg).getByRole('link', { name: S['limits.more'] })).toBeInTheDocument();
  });

  it('a closed door says so in one band and shows no plate', async () => {
    await give([], { ...offer, door: 'off' });
    const dlg = await screen.findByRole('dialog', { name: S['giveLink.title'] });
    expect(within(within(dlg).getByRole('status')).getByText(S['link.door.off'] as string)).toBeInTheDocument();
    expect(within(dlg).queryByRole('group', { name: S['giveLink.previewLabel'] })).toBeNull();
    expect(within(dlg).getByRole('button', { name: S['giveLink.create'] })).toBeDisabled();
  });

  it('sends the typed name and the switch as shown', async () => {
    const calls: { label: string; cors: boolean }[] = [];
    await give(calls);
    const dlg = await screen.findByRole('dialog', { name: S['giveLink.title'] });
    await userEvent.type(within(dlg).getByLabelText(S['giveLink.labelField'] as string), 'my-bot-link');
    await userEvent.click(within(dlg).getByRole('switch', { name: S['giveLink.cors'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: S['giveLink.create'] }));
    expect(calls).toEqual([{ label: 'my-bot-link', cors: false }]);
  });
});

describe('Link settings', () => {
  const limits = (patches: unknown[], removes: unknown[] = []) =>
    show(<LimitsDrawer open onClose={() => undefined} link={link} patch={stubChange<BotLink, { enabled?: boolean; cors?: boolean; limits?: BotLink['limits'] }>(patches as never[])} remove={stubChange<void, { action: 'deleteLink' }>(removes as never[])} />);

  it('is setting groups: the CORS switch, the four limits as named rows, Delete last in a danger group', async () => {
    await limits([]);
    const dlg = await screen.findByRole('dialog', { name: S['linkSet.title'] });
    noLooseText(dlg);
    expect(within(dlg).getByRole('switch', { name: S['giveLink.cors'] })).toBeChecked();
    const group = within(dlg).getByRole('group', { name: S['linkSet.limits'] });
    for (const l of LIMITS) expect(within(group).getByRole('textbox', { name: S[`linkSet.lim.${l.name}`] })).toBeInTheDocument();
    const danger = within(dlg).getByRole('group', { name: S['linkSet.delete'] });
    expect(danger.closest('[data-sg-tone="danger"]')).not.toBeNull();
    const groups = [...dlg.querySelectorAll('[data-setting-group]')];
    expect(groups[groups.length - 1]).toBe(danger.closest('[data-setting-group]'));
    const del = within(danger).getByRole('button', { name: S['linkSet.deleteGo'] });
    expect(del.getAttribute('data-variant')).toMatch(/^danger/);
    // the questions link is inside the drawer's one closed Why
    expect(within(dlg).queryByRole('link', { name: S['limits.more'] })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: S['linkSet.why'] }));
    expect(within(dlg).getByRole('link', { name: S['limits.more'] })).toBeInTheDocument();
  });

  it('a value outside its range is named under its field and Save is off; nothing is clamped', async () => {
    const patches: unknown[] = [];
    await limits(patches);
    const dlg = await screen.findByRole('dialog', { name: S['linkSet.title'] });
    const field = within(dlg).getByRole('textbox', { name: S['linkSet.lim.key_rpm'] });
    await userEvent.clear(field);
    await userEvent.type(field, '601');
    await userEvent.tab();
    expect(field).toHaveValue('601');
    expect(within(dlg).getByText((S['linkSet.rangeBad'] as string).replace('{{min}}', '1').replace('{{max}}', '600'))).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: S['ui.save'] })).toBeDisabled();
    expect(patches).toEqual([]);
  });

  it('Save sends the switch and the four numbers', async () => {
    const patches: unknown[] = [];
    await limits(patches);
    const dlg = await screen.findByRole('dialog', { name: S['linkSet.title'] });
    const field = within(dlg).getByRole('textbox', { name: S['linkSet.lim.bot_concurrency'] });
    await userEvent.clear(field);
    await userEvent.type(field, '32');
    await userEvent.click(within(dlg).getByRole('switch', { name: S['giveLink.cors'] }));
    await userEvent.click(within(dlg).getByRole('button', { name: S['ui.save'] }));
    expect(patches).toEqual([{ cors: false, limits: { key_rpm: 60, bot_rpm: 120, key_concurrency: 4, bot_concurrency: 32 } }]);
  });

  it('Delete asks first and sends only once confirmed', async () => {
    const removes: unknown[] = [];
    await limits([], removes);
    const dlg = await screen.findByRole('dialog', { name: S['linkSet.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: S['linkSet.deleteGo'] }));
    const ask = await screen.findByRole('alertdialog', { name: S['linkSet.deleteTitle'] });
    expect(removes).toEqual([]);
    await userEvent.click(within(ask).getByRole('button', { name: S['linkSet.deleteGo'] }));
    expect(removes).toEqual([{ action: 'deleteLink' }]);
  });
});

describe('Re-point', () => {
  it('says what changes in a verdict plate', async () => {
    const computers = [{ id: 'c1', name: 'Atlas', server: 's', flag: '', state: 'running', listState: 'ok', suspended: 0, hasMore: false }] as unknown as Computer[];
    await show(<RepointDrawer open onClose={() => undefined} bot={bot} computers={computers} repoint={stubChange<BotLink, { computerId: string }>([])} />);
    const dlg = await screen.findByRole('dialog', { name: S['repoint.title'] });
    noLooseText(dlg);
    expect(within(within(dlg).getByRole('group', { name: S['repoint.whatLabel'] })).getByText(S['repoint.what'] as string)).toBeInTheDocument();
  });
});
