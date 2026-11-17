// Get a computer, More options: the other realms are the kit PickerPanel (multi). Inside a realm, that realm stays the
// fixed row above and is never a row of the panel nor sent in realm_ids; the panel is named for what it holds, works
// from the keyboard (one tab stop, arrows, Space ticks), and every realm ticked there is sent once.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

// `hold`: the create stays in flight until the test calls `release` (done, or a definite failure).
const sent = vi.hoisted(() => ({ calls: [] as { project: string; body: Record<string, unknown> }[], hold: false, release: (_failed?: boolean) => {} }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const m = {
    mutateAsync: (v: { project: string; body: Record<string, unknown> }) => {
      sent.calls.push(v);
      if (!sent.hold) return Promise.resolve({ outcome: 'done' as const });
      return new Promise<{ outcome: 'done' | 'failed'; code?: string }>((done) => {
        sent.release = (failed) => done(failed ? { outcome: 'failed', code: 'SERVER_ERROR' } : { outcome: 'done' });
      });
    },
  };
  return { ...real, useCreate: () => m };
});

const [host, ...others] = fixtureWorld.realms;

async function openMore(realm?: string) {
  await renderPage(page, { path: '/computers', ...(realm !== undefined && { realm }) });
  // The first render of a run also loads the page's parts; on a busy host that alone can pass 8 s.
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 30000 }));
  const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
  return d;
}

describe('Get a computer: the other realms are a PickerPanel', () => {
  beforeEach(() => {
    sent.calls = [];
    sent.hold = false;
  });
  /** Exactly one row named for each realm (no wrong, missing or doubled row). A row reads the realm's name, then its
   *  computer count: the name must be the whole first part, never a prefix of another realm's name. */
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const holdsExactly = (panel: HTMLElement, names: readonly string[]) => {
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(names.length);
    for (const n of names) expect(within(panel).getAllByRole('checkbox', { name: new RegExp(`^${esc(n)} \\d+ computers?$`) })).toHaveLength(1);
  };

  it('inside a realm, the panel is "Other realms" and holds every realm but the one the computer is made in', async () => {
    const d = await openMore();
    const panel = within(d).getByRole('group', { name: strings['create.realmsMore'] });
    holdsExactly(panel, others.map((r) => r.name));
    expect(within(panel).queryByRole('checkbox', { name: new RegExp(`^${host!.name}`) })).toBeNull();
    for (const r of within(panel).getAllByRole('checkbox')) expect(r).not.toBeChecked();
  }, 90000);

  it('from the keyboard: one tab stop, arrows move, Space ticks; both ticked realms are sent once, never the host', async () => {
    const d = await openMore();
    const panel = within(d).getByRole('group', { name: strings['create.realmsMore'] });
    const rows = within(panel).getAllByRole('checkbox');
    rows[0]!.focus();
    await userEvent.keyboard(' ');
    expect(rows[0]).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(rows[1]).toBeChecked();
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    const ids = sent.calls[0]!.body.realm_ids as string[];
    expect([...ids].sort()).toEqual(others.slice(0, 2).map((r) => r.id).sort());
    expect(ids).not.toContain(host!.id);
  }, 90000);

  it('in All realms the panel is "Realms" and holds every realm', async () => {
    const d = await openMore('all');
    const panel = within(d).getByRole('group', { name: strings['create.realms'] });
    holdsExactly(panel, fixtureWorld.realms.map((r) => r.name));
  }, 90000);

  it('while the create is in flight the panel is locked: a click or Space changes nothing, and only the realm ticked before submit is sent', async () => {
    sent.hold = true;
    const d = await openMore();
    const panel = within(d).getByRole('group', { name: strings['create.realmsMore'] });
    const [a, b] = within(panel).getAllByRole('checkbox');
    await userEvent.click(a!);
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    await vi.waitFor(() => expect(b).toHaveAttribute('aria-disabled', 'true'));
    // Each attempt is checked on its own, so two that undo each other cannot pass.
    await userEvent.click(b!);
    expect(b).not.toBeChecked();
    b!.focus();
    await userEvent.keyboard(' ');
    expect(b).not.toBeChecked();
    await userEvent.click(a!);
    expect(a).toBeChecked();
    expect(sent.calls[0]!.body.realm_ids).toEqual([others[0]!.id]);
    sent.release();
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull());
    expect(sent.calls).toHaveLength(1);
  }, 90000);

  it('while sending, the actions that change a field are held too (new name, add or remove a variable); a definite failure unlocks the form for a retry', async () => {
    sent.hold = true;
    const d = await openMore();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.envAdd'] }));
    const panel = within(d).getByRole('group', { name: strings['create.realmsMore'] });
    const [a, b] = within(panel).getAllByRole('checkbox');
    const name = within(d).getByRole('textbox', { name: strings['field.name'] });
    const before = (name as HTMLInputElement).value;
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
    const another = within(d).getByRole('button', { name: strings['create.another'] });
    const add = within(d).getByRole('button', { name: strings['create.envAdd'] });
    const remove = within(d).getByRole('button', { name: interpolate(strings['create.envRemove'], { n: 1 }) });
    await vi.waitFor(() => expect(another).toBeDisabled());
    expect(add).toBeDisabled();
    expect(remove).toBeDisabled();
    await userEvent.click(another);
    expect((name as HTMLInputElement).value).toBe(before);
    // A definite failure: the form stays, unlocked, and a retry sends what is ticked now.
    sent.release(true);
    await vi.waitFor(() => expect(b).not.toHaveAttribute('aria-disabled', 'true'));
    expect(another).toBeEnabled();
    expect(add).toBeEnabled();
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    expect(within(d).queryByRole('button', { name: interpolate(strings['create.envRemove'], { n: 1 }) })).toBeNull();
    await userEvent.click(a!);
    expect(a).toBeChecked();
    sent.hold = false;
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await vi.waitFor(() => expect(sent.calls).toHaveLength(2));
    expect(sent.calls[1]!.body.realm_ids).toEqual([others[0]!.id]);
  }, 90000);
});
