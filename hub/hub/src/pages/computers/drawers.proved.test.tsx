// A drawer whose change may have gone through shows the held band with Check again. When that read proves the change
// was applied, the drawer closes, as Create does: it never goes back to a live form that could send the same change
// a second time. A read that proves nothing keeps the drawer and its band open.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import type * as dataModule from './data';
import { computers } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

// What each Check again's read-back answers here: true = it proved the change applied.
const h = vi.hoisted(() => ({ proves: true, checks: 0 }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  const proving = <M extends { readBack: unknown }>(m: M): M => ({ ...m, readBack: async () => { h.checks += 1; return h.proves; } });
  return { ...real, useSetSshKey: () => proving(real.useSetSshKey()), useCopy: () => proving(real.useCopy()) };
});

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHfixturefixturefixturefixturefixturefixtur ada@laptop';
const sshTitle = interpolate(strings['sshd.title'], { name: 'atlas' });

beforeEach(() => { h.proves = true; h.checks = 0; });

async function heldSsh() {
  await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=connect' });
  await userEvent.click(await screen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 30000 }));
  const d = await screen.findByRole('dialog', { name: sshTitle });
  await userEvent.type(within(d).getByRole('textbox', { name: strings['sshd.field'] }), KEY);
  await userEvent.click(within(d).getByRole('button', { name: /^(Replace key|Save key)$/ }));
  const check = await within(d).findAllByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
  return { d, check: check[0]! };
}

describe('computers: a held change proved applied closes its drawer', () => {
  it('SSH key: Check again that proves it closes the drawer', async () => {
    const { check } = await heldSsh();
    await userEvent.click(check);
    await waitFor(() => expect(h.checks).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: sshTitle })).toBeNull(), { timeout: 4000 });
  });

  it('SSH key: Check again that proves nothing keeps the drawer open', async () => {
    h.proves = false;
    const { d, check } = await heldSsh();
    await userEvent.click(check);
    await waitFor(() => expect(h.checks).toBe(1));
    expect(d).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: sshTitle })).toBeInTheDocument();
  });

  it('Copy: Check again that proves it closes the drawer', async () => {
    const cedar = computers.find((x) => x.name === 'cedar');
    if (!cedar) throw new Error('fixture cedar');
    await renderPage(page, { state: 'pendingOps', path: `/computers?sel=${encodeURIComponent(handleOf(cedar))}&tab=ports` });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', cedar.name) }, { timeout: 30000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const d = await screen.findByRole('dialog');
    const field = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'cedar-proved');
    const go = within(d).getByRole('button', { name: strings['copyd.go'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(go);
    const check = await within(d).findAllByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    await userEvent.click(check[0]!);
    await waitFor(() => expect(h.checks).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
  });
});
