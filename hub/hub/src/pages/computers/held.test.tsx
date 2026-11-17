// C9: a create, copy or delete whose answer was lost stays held until a fresh list proves it (never on a plain
// read), and the drawer or dialog that sent it reopens on the held change, never on a fresh form. A create and a copy
// are proved only by a computer the list did not show at the press (copy.proof.test.tsx: what the copy press records).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { computersTable } from './data';
import page from './page';
import strings from './strings.en.json';

const rows = (...r: Array<Record<string, unknown>>) => [[...r]];
const proves = (k: string, identity: unknown, answers: unknown[][]) => computersTable.changes![k]!.proves!(identity, answers as never);
const P = 'p'.repeat(24);
const X = 'x'.repeat(24);
// The server a create or copy is sent to; every row below sits on it (listMadeNew `server`: made.server.test.ts).
const SV = 's1';

describe('computers: held create, copy and delete are proved by the list', () => {
  it('create: a list without the sent name proves nothing; with it, applied', () => {
    const id = computersTable.changes!.create!.identity!({ project: P, body: { name: 'cedar-2', server_id: SV }, before: [], realm: 'all' } as never);
    expect(id).toEqual({ project: P, name: 'cedar-2', before: [], realm: 'all', server: SV });
    expect(proves('create', id, rows({ id: X, name: 'cedar', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('create', id, rows({ id: X, name: 'cedar-2', project_id: 'q'.repeat(24), server_id: SV }))).toBeUndefined();
    expect(proves('create', id, rows({ id: X, name: 'cedar-2', project_id: P, server_id: SV }))).toBe('applied');
  });
  it('create: a row the list showed under that name at the press proves nothing (a refused duplicate); a new one does', () => {
    const Y = 'y'.repeat(24);
    const id = computersTable.changes!.create!.identity!({ project: P, body: { name: 'cedar', server_id: SV }, before: [X], realm: 'all' } as never);
    expect(proves('create', id, rows({ id: X, name: 'cedar', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('create', id, rows({ id: X, name: 'cedar', project_id: P, server_id: SV }, { id: Y, name: 'cedar', project_id: P, server_id: SV }))).toBe('applied');
  });
  it('create: with no list at the press (no `before`), no read proves it', () => {
    // Sent from the base host ('all', which a new row of any realm satisfies): only the missing `before` refuses.
    const id = computersTable.changes!.create!.identity!({ project: P, body: { name: 'cedar-2', server_id: SV }, realm: 'all' } as never);
    expect(id).toEqual({ project: P, name: 'cedar-2', realm: 'all', server: SV });
    expect(proves('create', id, rows({ id: X, name: 'cedar-2', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('create', { project: P, name: 'cedar-2', realm: 'all', server: SV }, rows({ id: X, name: 'cedar-2', project_id: P, server_id: SV }))).toBeUndefined();
  });
  it("create: a realm's create is proved only by a row in that realm, never by another realm's row an All-realms read shows", () => {
    const R = 'a'.repeat(24);
    const S = 'b'.repeat(24);
    const Y = 'y'.repeat(24);
    // Sent in realm R, whose list showed no atlas in P at the press: P's atlas of realm S was out of its view.
    const id = computersTable.changes!.create!.identity!({ project: P, body: { name: 'atlas', server_id: SV }, before: [], realm: R } as never);
    expect(id).toEqual({ project: P, name: 'atlas', before: [], realm: R, server: SV });
    // An All-realms read-back shows S's atlas (the API refused the duplicate): nothing is proved, the create stays held.
    expect(proves('create', id, rows({ id: X, name: 'atlas', project_id: P, server_id: SV, realm_ids: [S] }))).toBeUndefined();
    expect(proves('create', id, rows({ id: X, name: 'atlas', project_id: P, server_id: SV }))).toBeUndefined();
    // The computer it made carries R.
    expect(proves('create', id, rows({ id: X, name: 'atlas', project_id: P, server_id: SV, realm_ids: [S] }, { id: Y, name: 'atlas', project_id: P, server_id: SV, realm_ids: [S, R] }))).toBe('applied');
    // Sent from the base host ('all'): a new row of any realm counts.
    const all = computersTable.changes!.create!.identity!({ project: P, body: { name: 'atlas', server_id: SV }, before: [X], realm: 'all' } as never);
    expect(proves('create', all, rows({ id: X, name: 'atlas', project_id: P, server_id: SV, realm_ids: [S] }))).toBeUndefined();
    expect(proves('create', all, rows({ id: Y, name: 'atlas', project_id: P, server_id: SV, realm_ids: [] }))).toBe('applied');
    // No realm in the identity: no read proves it.
    expect(proves('create', { project: P, name: 'atlas', before: [], server: SV }, rows({ id: Y, name: 'atlas', project_id: P, server_id: SV, realm_ids: [R] }))).toBeUndefined();
  });
  it('create: a row with no id proves nothing', () => {
    const id = computersTable.changes!.create!.identity!({ project: P, body: { name: 'cedar-2', server_id: SV }, before: [], realm: 'all' } as never);
    expect(proves('create', id, rows({ name: 'cedar-2', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('create', id, rows({ id: '', name: 'cedar-2', project_id: P, server_id: SV }))).toBeUndefined();
  });
  it('copy: proved only by the sent name in the sent project', () => {
    const id = computersTable.changes!.copy!.identity!({ id: X, name: 'a-copy', project: P, server: SV, before: [], realm: 'all' } as never);
    expect(id).toEqual({ computer: X, name: 'a-copy', project: P, before: [], realm: 'all', server: SV });
    expect(proves('copy', id, rows({ id: X, name: 'a', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('copy', id, rows({ id: 'y'.repeat(24), name: 'a-copy', project_id: 'q'.repeat(24), server_id: SV }))).toBeUndefined();
    expect(proves('copy', id, rows({ id: 'y'.repeat(24), name: 'a-copy', project_id: P, server_id: SV }))).toBe('applied');
  });
  it('copy: the row a copy to a taken name found proves nothing (the API answers that copy 409); a new one does', () => {
    const Y = 'y'.repeat(24);
    const Z = 'z'.repeat(24);
    // The list showed Y as a-copy in P at the press: the API refuses the copy (a computer with this name already
    // exists in the target project), and its lost 409 must not read as made when the read-back shows Y again.
    const id = computersTable.changes!.copy!.identity!({ id: X, name: 'a-copy', project: P, server: SV, before: [Y], realm: 'all' } as never);
    expect(proves('copy', id, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('copy', id, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV }, { id: Z, name: 'a-copy', project_id: P, server_id: SV }))).toBe('applied');
  });
  it("copy: a realm's copy is proved only by a row in that realm; one from the base host by a new row of any realm", () => {
    const R = 'a'.repeat(24);
    const S = 'b'.repeat(24);
    const Y = 'y'.repeat(24);
    // Sent in realm R, whose list showed no a-copy in P: an All-realms read-back shows S's a-copy (the API refused the
    // copy, the name is taken project-wide): nothing is proved.
    const id = computersTable.changes!.copy!.identity!({ id: X, name: 'a-copy', project: P, server: SV, before: [], realm: R } as never);
    expect(id).toEqual({ computer: X, name: 'a-copy', project: P, before: [], realm: R, server: SV });
    expect(proves('copy', id, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV, realm_ids: [S] }))).toBeUndefined();
    expect(proves('copy', id, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
    // The copy it made is put in R only.
    expect(proves('copy', id, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV, realm_ids: [R] }))).toBe('applied');
    // From the base host the copy takes the source's realms: a new row of any realm counts, the old one never.
    const all = computersTable.changes!.copy!.identity!({ id: X, name: 'a-copy', project: P, server: SV, before: [Y], realm: 'all' } as never);
    expect(proves('copy', all, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV, realm_ids: [S] }))).toBeUndefined();
    expect(proves('copy', all, rows({ id: 'z'.repeat(24), name: 'a-copy', project_id: P, server_id: SV, realm_ids: [] }))).toBe('applied');
  });
  it('copy: with no list at the press (no `before`), no realm, or a row with no id, no read proves it', () => {
    const Y = 'y'.repeat(24);
    const none = computersTable.changes!.copy!.identity!({ id: X, name: 'a-copy', project: P, server: SV, realm: 'all' } as never);
    expect(none).toEqual({ computer: X, name: 'a-copy', project: P, realm: 'all', server: SV });
    expect(proves('copy', none, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
    // A hold recorded before `before` and `realm` were kept (the old identity): held until the warned Dismiss.
    expect(proves('copy', { computer: X, name: 'a-copy', project: P }, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('copy', { computer: X, name: 'a-copy', project: P, before: [] }, rows({ id: Y, name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
    const id = computersTable.changes!.copy!.identity!({ id: X, name: 'a-copy', project: P, server: SV, before: [], realm: 'all' } as never);
    expect(proves('copy', id, rows({ name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
    expect(proves('copy', id, rows({ id: '', name: 'a-copy', project_id: P, server_id: SV }))).toBeUndefined();
  });
  it('delete: proved only when the row is gone from a list that answered; a list that still has it proves nothing', () => {
    const id = { computer: X };
    expect(proves('remove', id, rows({ id: X, name: 'a' }))).toBeUndefined();
    expect(proves('remove', id, [[]])).toBeUndefined();
    expect(proves('remove', id, rows({ id: 'y'.repeat(24), name: 'b' }))).toBe('applied');
  });
  it('rename and realms: proved only by the sent name or exact realm set', () => {
    expect(proves('rename', { computer: X, name: 'new' }, rows({ id: X, name: 'old' }))).toBeUndefined();
    expect(proves('rename', { computer: X, name: 'new' }, rows({ id: X, name: 'new' }))).toBe('applied');
    expect(proves('setRealms', { computer: X, realms: ['a', 'b'] }, rows({ id: X, realm_ids: ['a'] }))).toBeUndefined();
    expect(proves('setRealms', { computer: X, realms: ['a', 'b'] }, rows({ id: X, realm_ids: ['b', 'a'] }))).toBe('applied');
  });
  it('realms: a move out of the realm in view is proved by the every-realm list (the realm list no longer shows the row)', () => {
    expect(computersTable.changes!.setRealms!.reads).toEqual(['computers', 'accountComputers', 'importComputers']);
    const id = { computer: X, realms: ['b'] };
    const account = (...r: Array<Record<string, unknown>>) => [{ rows: r, complete: true }];
    // Realm a's list lacks the row once it moved to b; the every-realm list shows it with exactly the sent set.
    expect(proves('setRealms', id, [[[]], account({ id: X, realm_ids: ['b'] })])).toBe('applied');
    expect(proves('setRealms', id, [[[]], account({ id: X, realm_ids: ['a'] })])).toBeUndefined();
    expect(proves('setRealms', id, [[[]], account()])).toBeUndefined();
    expect(proves('setRealms', id, [[[]]])).toBeUndefined();
  });
  it('ssh key, aliases and redeem: proved by a fresh read, never by a plain one', () => {
    const key = 'ssh-ed25519 AAAAkey one';
    const id = computersTable.changes!.sshKey!.identity!({ id: X, key } as never);
    expect(JSON.stringify(id)).not.toContain('AAAAkey');
    expect(proves('sshKey', id, rows({ id: X, ssh_public_key: '' }))).toBeUndefined();
    expect(proves('sshKey', id, rows({ id: X, ssh_public_key: key }))).toBe('applied');
    const gone = computersTable.changes!.sshKey!.identity!({ id: X, key: null } as never);
    expect(proves('sshKey', gone, rows({ id: X, ssh_public_key: key }))).toBeUndefined();
    expect(proves('sshKey', gone, rows({ id: X }))).toBe('applied');
    const al = { computer: X, port: 3000, name: 'shop' };
    expect(proves('aliasCreate', al, [[{ [X]: [] }]])).toBeUndefined();
    expect(proves('aliasCreate', al, [[{ [X]: [{ id: 'a1', name: 'shop', port: 3000 }] }]])).toBe('applied');
    expect(proves('aliasRemove', { alias: 'a1' }, [[{ [X]: [{ id: 'a1', name: 'shop', port: 3000 }] }]])).toBeUndefined();
    expect(proves('aliasRemove', { alias: 'a1' }, [[{ [X]: [] }]])).toBe('applied');
    expect(proves('aliasRemove', { alias: 'a1' }, [])).toBeUndefined();
    expect(proves('redeem', {}, rows())).toBeUndefined();
    expect(proves('redeem', {}, rows({ id: X, name: 'a' }))).toBe('applied');
  });
  it('create: the drawer reopens on the held change, with no form and no second send', async () => {
    await renderPage(page, { state: 'pendingOps' });
    await screen.findByRole('table', {}, { timeout: 8000 });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['create.go'] }));
    expect(await within(dlg).findByText(/may already have been made/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dlg).queryByRole('textbox', { name: strings['field.name'] })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const again = await screen.findByRole('dialog');
    expect(await within(again).findByText(/may already have been made/i)).toBeInTheDocument();
    expect(within(again).queryByRole('textbox', { name: strings['field.name'] })).toBeNull();
    expect(within(again).getByRole('button', { name: strings['held.dismiss'] })).toBeInTheDocument();
  });
});
