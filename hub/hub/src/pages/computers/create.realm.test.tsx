// Get a computer inside a realm: the create goes to that realm's API host, and the API always adds that realm to
// the new computer (the API's own rule on a realm host). So the form shows it as a
// fact (the Realm row: its name and the reason, nothing to untick), and never sends it in realm_ids; a realm the
// person picks is sent once. In All realms nothing is fixed. The Note field says it is optional and who reads it.
import * as core from '@core';
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

const sent = vi.hoisted(() => ({ calls: [] as { project: string; body: Record<string, unknown> }[], realmsList: 'real' as 'real' | 'pending' }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const m = { mutateAsync: (v: { project: string; body: Record<string, unknown> }) => (sent.calls.push(v), Promise.resolve({ outcome: 'done' as const })) };
  // 'pending': the page's realm list has not arrived (a slow or failed /realms read).
  const useRealms: typeof real.useRealms = () => {
    const r = real.useRealms();
    return sent.realmsList === 'pending' ? undefined : r;
  };
  return { ...real, useCreate: () => m, useRealms };
});

const [host, other, third] = fixtureWorld.realms;

async function openMore(realm?: string) {
  await renderPage(page, { path: '/computers', ...(realm !== undefined && { realm }) });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
  return d;
}
const box = (d: HTMLElement, name: string) => within(d).getByRole('checkbox', { name: new RegExp(`^${name}`) });
/** The Realm row: the realm the computer is made in, shown as a fact. */
const realmRow = (d: HTMLElement) => d.querySelector('[data-create-row="realm"]') as HTMLElement | null;
/** The realm is fixed: named in its row with the reason, and no control anywhere in the form can untick it. */
function expectFixed(d: HTMLElement, name: string) {
  const row = realmRow(d);
  expect(row).not.toBeNull();
  expect(within(row!).getByText(strings['create.realm'])).toBeInTheDocument();
  expect(within(row!).getByText(name)).toBeInTheDocument();
  expect(within(row!).getByText(strings['create.realmHost'])).toBeInTheDocument();
  expect(within(row!).queryByRole('checkbox')).toBeNull();
  expect(within(row!).queryByRole('switch')).toBeNull();
  expect(within(row!).queryByRole('button')).toBeNull();
  expect(within(d).queryByRole('checkbox', { name: new RegExp(`^${name}`) })).toBeNull();
}

describe('Get a computer: the realm it is made in', () => {
  beforeEach(() => {
    sent.calls = [];
    sent.realmsList = 'real';
    vi.restoreAllMocks();
  });

  it('inside a realm, that realm is shown as fixed, with the reason', async () => {
    const d = await openMore();
    expectFixed(d, host!.name);
    expect(box(d, other!.name)).not.toBeChecked();
    // A picker row is a div with aria-disabled, which toBeEnabled() does not read.
    expect(box(d, other!.name)).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(d).queryByText(/options? changed/)).toBeNull();
  }, 40000);

  it('inside a realm, the create never sends that realm; a realm the person picks is sent once', async () => {
    const d = await openMore();
    await userEvent.click(box(d, other!.name));
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    expect(sent.calls[0]!.body.realm_ids).toEqual([other!.id]);
  }, 40000);

  it('inside a realm with nothing else picked, the create sends no realm_ids at all', async () => {
    const d = await openMore();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    expect(sent.calls[0]!.body).not.toHaveProperty('realm_ids');
  }, 40000);

  it('a realm picked then unchecked is not sent', async () => {
    const d = await openMore();
    await userEvent.click(box(d, other!.name));
    await userEvent.click(box(d, other!.name));
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    expect(sent.calls[0]!.body).not.toHaveProperty('realm_ids');
  }, 40000);

  it('the realm it lands in is shown before More options, and while the realm list has not arrived', async () => {
    sent.realmsList = 'pending';
    await renderPage(page, { path: '/computers' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    expectFixed(d, host!.name);
    // Before More options: the fold is still closed.
    expect(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) })).toHaveAttribute('aria-expanded', 'false');
  }, 40000);

  it("a token session pinned to a realm locks the pin, which is where core sends the create", async () => {
    const real = core.realmsView();
    vi.spyOn(core, 'useRealms').mockReturnValue({ ...real, selected: 'all', pinned: third!.id });
    const d = await openMore('all');
    expectFixed(d, third!.name);
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    expect(sent.calls[0]!.body).not.toHaveProperty('realm_ids');
  }, 40000);

  it('in All realms nothing is locked or preselected, and the realm that was fixed can be picked and is sent', async () => {
    const d = await openMore('all');
    expect(box(d, host!.name)).not.toBeChecked();
    expect(box(d, host!.name)).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(d).queryByText(strings['create.realmHost'])).toBeNull();
    expect(realmRow(d)).toBeNull();
    await userEvent.click(box(d, host!.name));
    expect(box(d, host!.name)).toBeChecked();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    expect(sent.calls[0]!.body.realm_ids).toEqual([host!.id]);
  }, 40000);

  it('the Note field says it is optional and who can read it', async () => {
    const d = await openMore();
    const note = within(d).getByRole('textbox', { name: strings['create.comment'] });
    expect(note).toHaveAttribute('placeholder', strings['create.commentPlaceholder']);
    expect(note).toHaveAccessibleDescription(strings['create.commentHelp']);
  }, 40000);
});
