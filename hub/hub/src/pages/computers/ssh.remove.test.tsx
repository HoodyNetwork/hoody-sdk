// Removing a computer's SSH key sends ssh_public_key: null, the API's only way to clear it: an empty string is a 400
// there, so a removal sent as '' never removed anything.
// The fixtures refuse an empty key as the API does (fixtures.ts sshKeyBodyProblem).
import { within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { interpolate } from '@kit';
import { sshKeySends } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHfixturefixturefixturefixturefixturefixtur ada@laptop';

beforeEach(() => {
  sshKeySends.length = 0;
});

async function openSsh(name: string, sel: string) {
  await renderPage(page, { path: `/computers?sel=${sel}&tab=connect` });
  await userEvent.click(await screen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: interpolate(strings['sshd.title'], { name }) });
}

describe('computers: removing an SSH key', () => {
  it('Remove key sends null (never an empty string), and the removal goes through', async () => {
    const d = await openSsh('atlas', 'atlas.00a1');
    await userEvent.click(within(d).getByRole('button', { name: strings['sshd.remove'] }));
    expect(within(d).getByText(interpolate(strings['sshd.removeBody'], { name: 'atlas' }))).toBeInTheDocument();
    // The footer's submit now reads Remove key too: the last one in the drawer is the footer's.
    const go = within(d).getAllByRole('button', { name: strings['sshd.removeGo'] }).at(-1)!;
    await userEvent.click(go);
    await waitFor(() => expect(sshKeySends).toHaveLength(1));
    expect(sshKeySends[0]).toEqual({ path: expect.stringMatching(/^\/computers\/[^/]+$/), body: { ssh_public_key: null } });
    // Done: the drawer closes (a refused removal would keep it open with its error).
    await waitFor(() => expect(screen.queryByRole('dialog', { name: interpolate(strings['sshd.title'], { name: 'atlas' }) })).toBeNull(), { timeout: 4000 });
  });

  it('a key added or replaced is sent trimmed, as the key itself', async () => {
    const d = await openSsh('atlas', 'atlas.00a1');
    await userEvent.type(within(d).getByRole('textbox', { name: strings['sshd.field'] }), `  ${KEY}  `);
    await userEvent.click(within(d).getByRole('button', { name: /^(Replace key|Save key)$/ }));
    await waitFor(() => expect(sshKeySends).toHaveLength(1));
    expect(sshKeySends[0]?.body).toEqual({ ssh_public_key: KEY });
  });
});
