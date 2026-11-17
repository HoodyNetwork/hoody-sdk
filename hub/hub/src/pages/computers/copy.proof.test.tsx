// A copy whose answer was lost is proved only by a computer the list did not show at the press (data.ts copy,
// listMadeNew). The press records `before` (every id the list showed, the row under the sent name among them) and
// `realm` (the realm it lands in, 'all' for the base host). A copy named as a computer its project already holds is
// refused by the API (409, "A computer with this name already exists in the target project"): when that answer is
// lost, Check again reads the list, finds the row that was already there, and must keep the copy held, never call it
// made. Here the copy takes the source's own name in its own project, the plainest taken name.
import { heldChanges } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as dataModule from './data';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

// Every Check again of the copy, by what its read-back answered (true: the read proved the copy and freed it).
const h = vi.hoisted(() => ({ checks: [] as boolean[] }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useCopy: () => {
      const m = real.useCopy();
      const readBack = async (only?: { hold: string }) => {
        const ok = await (m.readBack as (o?: { hold: string }) => Promise<boolean>)(only);
        h.checks.push(ok);
        return ok;
      };
      return { ...m, readBack };
    },
  };
});

const found = computers.find((x) => x.name === 'cedar');
if (!found) throw new Error('fixture cedar');
const cedar = found;
const HEX24 = /^[0-9a-f]{24}$/;
const heldBand = (name: string) => strings['held.copy'].replace('{{name}}', name);
type CopyIdentity = { computer?: string; name?: string; project?: string; before?: unknown; realm?: unknown };

/** Copy cedar as `cedar` (taken in its project) in the realm shown (default: the world's own) or All realms; the copy
 *  is answered "may have gone through" (pendingOps). The band says so; the identity core keeps is returned. */
async function copyToTakenName(realm?: 'all') {
  await renderPage(page, { state: 'pendingOps', path: `/computers?sel=${encodeURIComponent(handleOf(cedar))}&tab=ports`, ...(realm ? { realm } : {}) });
  // The page's list is in (the table shows cedar) before the press: `before` is read from it.
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', cedar.name) }, { timeout: 30000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
  const dlg = await screen.findByRole('dialog');
  const field = within(dlg).getByLabelText(strings['field.name']) as HTMLInputElement;
  await userEvent.clear(field);
  await userEvent.type(field, cedar.name);
  const go = within(dlg).getByRole('button', { name: strings['copyd.go'] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  expect(await within(dlg).findByText(heldBand(cedar.name), {}, { timeout: 8000 })).toBeInTheDocument();
  const held = heldChanges('computer.copy', { realm: 'all' });
  expect(held).toHaveLength(1);
  return { dlg, identity: (held[0]?.identity ?? {}) as CopyIdentity };
}

/** Check again on the band, then wait for its read-back to answer. */
async function checkAgain(dlg: HTMLElement) {
  await userEvent.click(within(dlg).getByRole('button', { name: strings['held.check'] }));
  await waitFor(() => expect(h.checks).toHaveLength(1), { timeout: 8000 });
}

beforeEach(() => {
  h.checks = [];
});

describe('computers: a lost copy to a taken name is never read as made', () => {
  it('in a realm: the press records the row shown under that name and the realm; Check again keeps it held', async () => {
    const { dlg, identity } = await copyToTakenName();
    expect(identity).toMatchObject({ computer: cedar.id, name: cedar.name, project: cedar.project_id });
    expect(identity.before).toEqual(expect.arrayContaining([cedar.id]));
    // The realm shown, which holds cedar (the copy is put in it only).
    expect(identity.realm).toMatch(HEX24);
    expect(cedar.realm_ids).toContain(identity.realm);
    await checkAgain(dlg);
    // The list read back holds cedar, the row that was there: nothing proved, the copy stays held and shown so.
    expect(h.checks).toEqual([false]);
    expect(heldChanges('computer.copy', { realm: 'all' })).toHaveLength(1);
    expect(within(dlg).getByText(heldBand(cedar.name))).toBeInTheDocument();
  }, 60000);

  it("in All realms: the base host's copy records 'all'; Check again keeps it held", async () => {
    const { dlg, identity } = await copyToTakenName('all');
    expect(identity).toMatchObject({ computer: cedar.id, name: cedar.name, project: cedar.project_id, realm: 'all' });
    expect(identity.before).toEqual(expect.arrayContaining([cedar.id]));
    await checkAgain(dlg);
    expect(h.checks).toEqual([false]);
    expect(heldChanges('computer.copy', { realm: 'all' })).toHaveLength(1);
    expect(within(dlg).getByText(heldBand(cedar.name))).toBeInTheDocument();
  }, 60000);
});
