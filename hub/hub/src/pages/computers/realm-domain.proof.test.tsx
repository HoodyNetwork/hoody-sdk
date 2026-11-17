// A page that names no realm API domain (no hx-api-realm-domain meta) sends a realm's create and copy to the base host
// (core hubApiBase): the API adds no realm there, and a copy takes its source's realms. So the hold records 'all', and
// a read-back finds the new computer in whatever realm it landed in. A realm id it was never put in would keep the
// hold for good. realmDomain is overridden for the whole file; core's own routing is not (only what the page records is
// judged here). With a realm domain (every other page test) the realm shown is recorded: copy.proof.test.tsx.
import { heldChanges } from '@core';
import type * as Core from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

vi.mock('@core', async (importOriginal) => ({ ...(await importOriginal<typeof Core>()), realmDomain: () => '' }));

const named = (name: string) => {
  const c = computers.find((x) => x.name === name);
  if (!c) throw new Error(`fixture ${name}`);
  return c;
};

describe('computers: no realm API domain, so a realm shown is not where a new computer lands', () => {
  it("Get a computer: the create's hold records the base host ('all'), not the realm shown", async () => {
    const atlas = named('atlas');
    await renderPage(page, { state: 'pendingOps' });
    await screen.findByRole('table', {}, { timeout: 8000 });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const d = await screen.findByRole('dialog');
    const name = within(d).getByLabelText(strings['field.name']);
    await userEvent.clear(name);
    await userEvent.type(name, 'atlas');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    expect(await within(d).findByText(strings['held.create'].replace('{{name}}', 'atlas'), {}, { timeout: 8000 })).toBeInTheDocument();
    // Before: the realm shown (the world's own, 24 hex) was recorded.
    expect(heldChanges('computer.create', { realm: 'all' })).toMatchObject([{ identity: { project: atlas.project_id, name: 'atlas', before: expect.arrayContaining([atlas.id]), realm: 'all' } }]);
  }, 40000);

  it("Copy: the copy's hold records the base host ('all'), not the realm shown", async () => {
    const cedar = named('cedar');
    await renderPage(page, { state: 'pendingOps', path: `/computers?sel=${encodeURIComponent(handleOf(cedar))}&tab=ports` });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', cedar.name) }, { timeout: 30000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const dlg = await screen.findByRole('dialog');
    const field = within(dlg).getByLabelText(strings['field.name']) as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, cedar.name);
    const go = within(dlg).getByRole('button', { name: strings['copyd.go'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(go);
    expect(await within(dlg).findByText(strings['held.copy'].replace('{{name}}', cedar.name), {}, { timeout: 8000 })).toBeInTheDocument();
    // Before: the realm shown (24 hex, one of cedar's) was recorded.
    expect(heldChanges('computer.copy', { realm: 'all' })).toMatchObject([{ identity: { computer: cedar.id, name: cedar.name, project: cedar.project_id, before: expect.arrayContaining([cedar.id]), realm: 'all' } }]);
  }, 60000);
});
