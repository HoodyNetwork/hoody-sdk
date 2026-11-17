// Vitest (forms-bots): the link drawers name what keeps their button off, and the API's refusal of a name.
//   - Give it a link with no offer (its read is on its way, or failed): the band says why Create link is off (before: off
//     with no word);
//   - a name the API refuses (409 BOT_LABEL_TAKEN / BOT_LABEL_RESERVED): said in the banner and at the field, until the
//     name changes (before: only "The link wasn't made");
//   - New key on a link that already has a key named "default" (New Bot makes one): the form starts on a free name, and a
//     taken name is said at the field with the button off (before: the first New key always answered 409 with no reason);
//   - an edit refused with 409 BOT_KEY_NAME_TAKEN says so.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawers, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider, bootFixtureCore } from '@core';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotLink, BotView, Change, KeyFields, LinkKey, LinkOffer } from './data';
import { freeKeyName, keyNameTaken } from './logic';
import { GiveLinkDrawer, KeyDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

const bot = { key: 'c1~global~chief', id: 'chief', uid: 'u-chief', name: 'Chief' } as BotView;
const offer: LinkOffer = { door: 'ready', suggestedLabel: 'quiet-amber-heron-bot', zone: 'bots.example.test' };

async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
// The key form's IP field reads through the core (as keys.expiry.test.tsx boots it).
beforeEach(() => {
  bootFixtureCore({ rules: [] });
});
afterEach(cleanup);

type Sent = { label: string; cors: boolean };
/** A create that answers every send with the given refusal, as the page's change would show it. */
function Give({ o, code, sent }: { o: LinkOffer | undefined; code?: string; sent: Sent[] }) {
  const [st, setSt] = useState<{ outcome: string; code?: string }>({ outcome: 'idle' });
  const create = {
    run: async (v: Sent) => {
      sent.push(v);
      setSt({ outcome: 'failed', code });
      return { outcome: 'failed' as const, code };
    },
    outcome: st.outcome, data: undefined, code: st.code, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<BotLink, Sent>;
  return <GiveLinkDrawer open onClose={() => undefined} bot={bot} offer={o} create={create} />;
}
const giveDialog = () => screen.findByRole('dialog', { name: strings['giveLink.title'] });
const createLink = (dlg: HTMLElement) => within(dlg).getByRole('button', { name: strings['giveLink.create'] });
const labelBox = (dlg: HTMLElement) => within(dlg).getByRole('textbox', { name: strings['giveLink.labelField'] });

describe('Give it a link: no offer', () => {
  it('says why Create link is off', async () => {
    await show(<Give o={undefined} sent={[]} />);
    const dlg = await giveDialog();
    expect(createLink(dlg)).toBeDisabled();
    expect(within(dlg).getByText(strings['giveLink.unread'])).toBeVisible();
  });

  it('control: a ready offer shows no such band and Create link is on', async () => {
    await show(<Give o={offer} sent={[]} />);
    const dlg = await giveDialog();
    expect(createLink(dlg)).not.toBeDisabled();
    expect(within(dlg).queryByText(strings['giveLink.unread'])).toBeNull();
  });
});

describe('Give it a link: a name the API refuses', () => {
  it.each([
    ['BOT_LABEL_TAKEN', strings['label.err.taken']],
    ['BOT_LABEL_RESERVED', strings['label.err.reserved']],
  ])('%s is said in the banner and at the field, until the name changes', async (code, words) => {
    const sent: Sent[] = [];
    await show(<Give o={offer} code={code} sent={sent} />);
    const dlg = await giveDialog();
    fireEvent.change(labelBox(dlg), { target: { value: 'chief-support-bot' } });
    expect(labelBox(dlg)).not.toBeInvalid();
    await userEvent.click(createLink(dlg));
    await waitFor(() => expect(labelBox(dlg)).toBeInvalid());
    expect(sent).toEqual([{ label: 'chief-support-bot', cors: true }]);
    expect(within(dlg).getByText(strings['giveLink.failed'])).toBeVisible();
    expect(within(dlg).getAllByText(words).length).toBeGreaterThanOrEqual(2);
    // Another name: the field no longer carries the refusal of the old one; nothing was sent again by itself.
    fireEvent.change(labelBox(dlg), { target: { value: 'chief-support-bot-2' } });
    expect(labelBox(dlg)).not.toBeInvalid();
    expect(sent).toHaveLength(1);
  });

  it('control: another refusal marks no field', async () => {
    await show(<Give o={offer} code="SERVER_BOT_URL_LIMIT" sent={[]} />);
    const dlg = await giveDialog();
    fireEvent.change(labelBox(dlg), { target: { value: 'chief-support-bot' } });
    await userEvent.click(createLink(dlg));
    await waitFor(() => expect(within(dlg).getByText(strings['giveLink.failed'])).toBeVisible());
    expect(labelBox(dlg)).not.toBeInvalid();
    expect(within(dlg).queryByText(strings['label.err.taken'])).toBeNull();
  });
});

describe('key names on one link', () => {
  it('a name is taken whatever its case', () => {
    expect(keyNameTaken('Default', ['default'])).toBe(true);
    expect(keyNameTaken('ci', ['default', 'CI'])).toBe(true);
    expect(keyNameTaken('ci-2', ['default', 'CI'])).toBe(false);
    expect(keyNameTaken('default', [])).toBe(false);
  });
  it('a new key starts on "default" while that is free, else on the first free key-N', () => {
    expect(freeKeyName([])).toBe('default');
    expect(freeKeyName(['ci'])).toBe('default');
    expect(freeKeyName(['default'])).toBe('key-2');
    expect(freeKeyName(['Default', 'KEY-2'])).toBe('key-3');
  });
});

const change = (run: unknown, outcome = 'idle', code?: string) =>
  ({ run, outcome, data: undefined, code, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined }) as never;
const stored: LinkKey = { id: 'k2', name: 'ci', prefix: 'hk_k2', enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: '', createdAt: '2026-10-01T00:00:00Z', rotatedAt: null };
const nameBox = () => screen.getByRole('textbox', { name: strings['keyForm.name'] }) as HTMLInputElement;
const makeKey = () => screen.getByRole('button', { name: strings['keyForm.create'] });

describe('New key on a link that already has keys', () => {
  it('starts on a free name when "default" exists, and sends that name', async () => {
    const minted: KeyFields[] = [];
    const mint = async (v: KeyFields) => {
      minted.push(v);
      return { outcome: 'failed' as const };
    };
    await show(<KeyDrawer open onClose={() => undefined} editing={null} mint={change(mint)} edit={change(async () => ({ outcome: 'done' }))} taken={['default']} />);
    expect(nameBox().value).toBe('key-2');
    expect(nameBox()).not.toBeInvalid();
    expect(makeKey()).not.toBeDisabled();
    await userEvent.click(makeKey());
    await waitFor(() => expect(minted).toHaveLength(1));
    expect(minted[0]?.name).toBe('key-2');
  });

  it('a taken name is said at the field and the button is off; nothing is sent', async () => {
    const minted: KeyFields[] = [];
    const mint = async (v: KeyFields) => {
      minted.push(v);
      return { outcome: 'failed' as const };
    };
    await show(<KeyDrawer open onClose={() => undefined} editing={null} mint={change(mint)} edit={change(async () => ({ outcome: 'done' }))} taken={['default', 'ci']} />);
    fireEvent.change(nameBox(), { target: { value: 'Default' } });
    expect(nameBox()).toBeInvalid();
    expect(screen.getByText(strings['keyForm.nameTaken'])).toBeVisible();
    expect(makeKey()).toBeDisabled();
    expect(minted).toHaveLength(0);
    fireEvent.change(nameBox(), { target: { value: 'laptop' } });
    expect(nameBox()).not.toBeInvalid();
    expect(makeKey()).not.toBeDisabled();
  });

  it('control: with no other key the form starts on "default", as before', async () => {
    await show(<KeyDrawer open onClose={() => undefined} editing={null} mint={change(async () => ({ outcome: 'done' }))} edit={change(async () => ({ outcome: 'done' }))} />);
    expect(nameBox().value).toBe('default');
    expect(makeKey()).not.toBeDisabled();
  });
});

describe('Edit key', () => {
  it("keeps its own name, and another key's name is taken", async () => {
    await show(<KeyDrawer open onClose={() => undefined} editing={stored} mint={change(async () => ({ outcome: 'done' }))} edit={change(async () => ({ outcome: 'done' }))} taken={['default']} />);
    expect(nameBox().value).toBe('ci');
    expect(nameBox()).not.toBeInvalid();
    fireEvent.change(nameBox(), { target: { value: 'default' } });
    expect(nameBox()).toBeInvalid();
    expect(screen.getByRole('button', { name: strings['ui.save'] })).toBeDisabled();
  });

  it('a save refused with 409 BOT_KEY_NAME_TAKEN says the name is taken', async () => {
    await show(<KeyDrawer open onClose={() => undefined} editing={stored} mint={change(async () => ({ outcome: 'done' }))} edit={change(async () => ({ outcome: 'failed' }), 'failed', 'BOT_KEY_NAME_TAKEN')} taken={[]} />);
    expect(screen.getByText(strings['keyForm.editFailed'])).toBeVisible();
    expect(screen.getByText(strings['keyForm.nameTaken'])).toBeVisible();
  });
});
