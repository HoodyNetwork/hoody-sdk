// A held change another page sent (core's heldBy 'other', under the shared locks) is that page's to settle: the
// drawer here shows it read-only, naming the page, with no Check again and no Dismiss (Dismiss here would free
// nothing). This page's own held change keeps both (held-footer.test.tsx, held.test.tsx).
import { defineMutation, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

describe('computers: a held change another page sent', () => {
  it('an SSH key change sent from Keys shows read-only in the SSH drawer, naming Keys', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=connect' });
    const atlas = fixtureWorld.current;
    const keys = defineMutation<{ id: string }>(routes.setSshKey, {
      input: (v) => ({ params: { id: v.id }, body: { ssh_public_key: 'ssh-ed25519 AAAAkeys page' } }),
      lock: 'computer.ssh_key',
      lockKey: (v) => ({ computer: v.id }),
      page: 'keys',
    });
    await act(async () => { expect((await keys.run({ id: atlas.id })).outcome).toBe('pending'); });
    const open = await screen.findByRole('button', { name: new RegExp(`^(${strings['ssh.key.replace']}|${strings['ssh.key.set']})$`) }, { timeout: 8000 });
    await userEvent.click(open);
    const dlg = await screen.findByRole('dialog');
    const keysName = strings['held.from.keys'];
    expect(await within(dlg).findByText(strings['held.elsewhere'].replace('{{page}}', keysName))).toBeInTheDocument();
    expect(within(dlg).queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: strings['held.check'] })).toBeNull();
  });
});
