// Get a computer and Copy record `before` (every id the page's list shows) only
// from a list known to be whole (data.ts pressBefore). Here the list is a full page (100 rows, its limit, with a later
// page): a computer of the sent name may sit beyond it, and a later read showing it would prove a change the API
// refused. So the hold of a lost create or copy names no `before`, and nothing proves it (held until the warned
// Dismiss). The read-back half of the rule, on a real lost copy: snapshots/tab.test.tsx. A list with fewer rows records
// `before` as before: copy.proof.test.tsx, realm-domain.proof.test.tsx.
import { answers, containersRoute, heldChanges, reply, type FixtureRule } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const named = (name: string) => {
  const c = computers.find((x) => x.name === name);
  if (!c) throw new Error(`fixture ${name}`);
  return c;
};
const HEX24 = /^[0-9a-f]{24}$/;
// The world's computers, then stopped ones in the first computer's project up to a full page (100 rows), and a later
// page (totalPages 2) the page never reads.
const others = Array.from({ length: 100 - computers.length }, (_, i) => ({ ...computers[0]!, id: (0x7e0000 + i).toString(16).padStart(24, '0'), name: `other-${i}`, status: 'stopped' }));
const fullPage: FixtureRule = reply(containersRoute, () => answers.ok({ data: { computers: [...computers, ...others], pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } } }), { when: (r) => r.query.include_expired !== 'true' });

describe('computers: a full page of the list records no before', () => {
  it('Get a computer: the hold of a lost create names no before', async () => {
    const atlas = named('atlas');
    await renderPage(page, { state: 'pendingOps', rules: [fullPage] });
    await screen.findByRole('table', {}, { timeout: 30000 });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const d = await screen.findByRole('dialog');
    const name = within(d).getByLabelText(strings['field.name']);
    await userEvent.clear(name);
    await userEvent.type(name, 'atlas');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    expect(await within(d).findByText(strings['held.create'].replace('{{name}}', 'atlas'), {}, { timeout: 8000 })).toBeInTheDocument();
    const held = heldChanges('computer.create', { realm: 'all' });
    expect(held).toHaveLength(1);
    // Not even atlas's id, the row this page of the list showed under that name.
    expect(held[0]?.identity).toMatchObject({ project: atlas.project_id, name: 'atlas', realm: expect.stringMatching(HEX24) });
    expect(held[0]?.identity).not.toHaveProperty('before');
  }, 60000);

  it('Copy: the hold of a lost copy names no before', async () => {
    const cedar = named('cedar');
    await renderPage(page, { state: 'pendingOps', path: `/computers?sel=${encodeURIComponent(handleOf(cedar))}&tab=ports`, rules: [fullPage] });
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
    const held = heldChanges('computer.copy', { realm: 'all' });
    expect(held).toHaveLength(1);
    // Not even cedar's id, the row this page of the list showed under that name.
    expect(held[0]?.identity).toMatchObject({ computer: cedar.id, name: cedar.name, project: cedar.project_id, realm: expect.stringMatching(HEX24) });
    expect(held[0]?.identity).not.toHaveProperty('before');
  }, 60000);
});
