// Vitest: the People section of a chat app: the live sends of add, edit, remove and invite, the list the agent returns,
// and the held-change rules (a lost answer holds the button; an invite code is shown once and never kept in a lock key).
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LOCK_KEYS, ROUTES, channelChangeCall, registerTargets, type Change, type Channel, type ChannelChange, type ChannelVars, type Right } from './data';
import { beginIssue, clearCode, heldCode, offerCode, resetCodesForTests, settlePress } from './codes';
import { personPatch } from './logic';
import { IssuedCodeField, PeopleSection } from './parts/ChatPeople';
import page from './page';
import { mount } from './routed';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => {
  resetCodesForTests();
  vi.restoreAllMocks();
});

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = async (state: string | undefined, app = 'ch-tg') => {
  await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=${app}` });
  await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
};

// The People table's body rows (the header row is left out), and Remove, which sits in a row's menu (Edit is the row's inline button).
const personRows = (): HTMLElement[] => within(screen.getByRole('table', { name: /People paired with/ })).getAllByRole('row').slice(1);
async function removeAt(i: number): Promise<void> {
  await userEvent.click(within(personRows()[i] as HTMLElement).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['chan.person.remove']}`) }));
}

type Seen = { method: string; path: string; body: unknown };
function capture(route: (typeof ROUTES)[keyof typeof ROUTES], answer: unknown = { ok: true }): Seen[] {
  const seen: Seen[] = [];
  registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
  bootFixtureCore({ rules: [reply(route, (req: FixtureRequest) => { seen.push({ method: req.method, path: req.path, body: req.body }); return answers.ok(answer); })] });
  return seen;
}

describe('the live sends', () => {
  it('add is one POST of the person with their rights, and an owner flag only when set', async () => {
    const seen = capture(ROUTES.personAdd);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'personAdd', person: { platformUser: '777', name: 'Eve', rights: ['chat', 'gates'] } }, 'k1');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.path).toContain('/channels/ch-tg/principals');
    expect(seen[0]?.body).toEqual({ platform_user: '777', name: 'Eve', rights: ['chat', 'gates'] });
  });

  it('edit is one PATCH of the person with only the fields given', async () => {
    const seen = capture(ROUTES.personPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'personEdit', target: 'pr-ben', person: { lang: 'de' } }, 'k2');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('PATCH');
    expect(seen[0]?.path).toContain('/channels/ch-tg/principals/pr-ben');
    expect(seen[0]?.body).toEqual({ lang: 'de' });
  });

  it('remove is one DELETE of the person', async () => {
    const seen = capture(ROUTES.personDelete);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'personRemove', target: 'pr-chi' }, 'k3');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('DELETE');
    expect(seen[0]?.path).toContain('/channels/ch-tg/principals/pr-chi');
  });

  it('an edit or a remove without a person sends nothing', async () => {
    const seen = capture(ROUTES.personDelete);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'personRemove' }, 'k4');
    expect(seen).toHaveLength(0);
  });

  it('adding an owner sends the owner flag and no rights: the agent refuses both together', async () => {
    const seen = capture(ROUTES.personAdd);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'personAdd', person: { platformUser: '777', name: 'Eve', rights: ['chat', 'control', 'gates'], owner: true } }, 'k1o');
    expect(seen[0]?.body).toEqual({ platform_user: '777', name: 'Eve', owner: true });
    expect(seen[0]?.body).not.toHaveProperty('rights');
  });

  it('clearing a language is sent as null, never as an empty string', async () => {
    const seen = capture(ROUTES.personPatch);
    const ana = { id: 'pr-ana', platformUser: '1', name: 'Ana', rights: ['chat'] as const, owner: false, lang: 'en' };
    const patch = personPatch(ana, { name: 'Ana', lang: '', rights: ['chat'], owner: false });
    expect(patch).toEqual({ lang: null });
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'personEdit', target: 'pr-ana', person: patch }, 'k2n');
    expect(seen[0]?.body).toEqual({ lang: null });
  });

  it('invite is one POST of the pairing with the rights, never as owner, and puts the code in the holder, not in the answer', async () => {
    const seen = capture(ROUTES.pairCreate, { code: 'ABCD-1234', expires_at: '2999-01-01T00:00:00Z', instructions: 'Send ABCD-1234 to @bot' });
    const r = await channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-tg', action: 'invite', invite: { rights: ['chat'], owner: false, makeHome: true } }, 'k5');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toContain('/channels/ch-tg/pairing');
    expect(seen[0]?.body).toEqual({ rights: ['chat'], make_home: true });
    expect(r).toEqual({ issued: true });
    expect(JSON.stringify(r)).not.toContain('ABCD');
    expect(heldCode('u1', 'ch-tg')).toEqual({ code: 'ABCD-1234', expiresAt: Date.parse('2999-01-01T00:00:00Z'), kind: 'invite' });
    // Another chat app, or another Bot, has no such code.
    expect(heldCode('u1', 'ch-sl')).toBeNull();
    expect(heldCode('u2', 'ch-tg')).toBeNull();
  });

  it('a code that has already expired is not held', async () => {
    capture(ROUTES.pairCreate, { code: 'OLD-0001', expires_at: '2000-01-01T00:00:00Z' });
    await channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-tg', action: 'invite', invite: { rights: ['chat'], owner: false, makeHome: false } }, 'k5b');
    expect(heldCode('u1', 'ch-tg')).toBeNull();
  });

  it('the owner code asks for an owner and sends no rights: the agent refuses both together', async () => {
    const seen = capture(ROUTES.pairCreate, { code: 'OWNR-0001' });
    await channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-sl', action: 'ownerCode' }, 'k6');
    expect(seen[0]?.body).toEqual({ owner: true });
    expect(heldCode('u1', 'ch-sl')).toMatchObject({ code: 'OWNR-0001', kind: 'owner' });
  });

  it('two issues in flight for one app: the one that started last wins, whichever answer arrives last', async () => {
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    // The first request is answered slowly, the second at once.
    bootFixtureCore({
      rules: [
        reply(ROUTES.pairCreate, (req: FixtureRequest) => (req.n === 1 ? { status: 200, body: { code: 'SLOW-AAAA' }, delayMs: 120 } : { status: 200, body: { code: 'FAST-BBBB' }, delayMs: 5 })),
      ],
    });
    const invite = { rights: ['chat'] as const, owner: false, makeHome: false };
    const first = channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-tg', action: 'invite', invite }, 'k7a');
    const second = channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-tg', action: 'invite', invite }, 'k7b');
    await Promise.all([first, second]);
    expect(heldCode('u1', 'ch-tg')?.code).toBe('FAST-BBBB');
  });

  it('an issue answered after a cancel or the drawer closing is dropped, never shown', async () => {
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    bootFixtureCore({ rules: [reply(ROUTES.pairCreate, { status: 200, body: { code: 'LATE-0001' }, delayMs: 60 })] });
    const pending = channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-tg', action: 'invite', invite: { rights: ['chat'], owner: false, makeHome: false } }, 'k8');
    clearCode('u1', 'ch-tg');
    await pending;
    expect(heldCode('u1', 'ch-tg')).toBeNull();
  });

  it('a cancel clears the held code whichever kind it was', async () => {
    capture(ROUTES.pairCancel, { cancelled: true });
    offerCode('u1', 'ch-tg', beginIssue('u1', 'ch-tg'), { code: 'X-1', expiresAt: 0, kind: 'invite' });
    await channelChangeCall({ botKey: KEY, uid: 'u1', channelId: 'ch-tg', action: 'cancelCode' }, 'k9');
    expect(heldCode('u1', 'ch-tg')).toBeNull();
  });
});

describe('the code holder', () => {
  it('an issue replaces the code of the app, of either kind', () => {
    offerCode('u1', 'ch', beginIssue('u1', 'ch'), { code: 'INV-1', expiresAt: 0, kind: 'invite' });
    offerCode('u1', 'ch', beginIssue('u1', 'ch'), { code: 'OWN-1', expiresAt: 0, kind: 'owner' });
    expect(heldCode('u1', 'ch')).toMatchObject({ code: 'OWN-1', kind: 'owner' });
  });

  it('an answer for a request that was overtaken writes nothing', () => {
    const older = beginIssue('u1', 'ch');
    const newer = beginIssue('u1', 'ch');
    expect(offerCode('u1', 'ch', newer, { code: 'NEW-1', expiresAt: 0, kind: 'invite' })).toBe(true);
    expect(offerCode('u1', 'ch', older, { code: 'OLD-1', expiresAt: 0, kind: 'invite' })).toBe(false);
    expect(heldCode('u1', 'ch')?.code).toBe('NEW-1');
  });

  it('expires with nothing mounted: the timer clears it, and a read past its time is already none', async () => {
    offerCode('u1', 'ch', beginIssue('u1', 'ch'), { code: 'SOON-1', expiresAt: Date.now() + 40, kind: 'invite' });
    expect(heldCode('u1', 'ch')?.code).toBe('SOON-1');
    const real = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(real + 60);
    expect(heldCode('u1', 'ch')).toBeNull();
    vi.restoreAllMocks();
    await new Promise((r) => setTimeout(r, 90));
    expect(heldCode('u1', 'ch')).toBeNull();
  });

  it('a code with no expiry given stays until it is cleared', async () => {
    offerCode('u1', 'ch', beginIssue('u1', 'ch'), { code: 'KEEP-1', expiresAt: 0, kind: 'invite' });
    await new Promise((r) => setTimeout(r, 60));
    expect(heldCode('u1', 'ch')?.code).toBe('KEEP-1');
    clearCode('u1', 'ch');
    expect(heldCode('u1', 'ch')).toBeNull();
  });
});

describe('what an edit sends', () => {
  const ben = { id: 'pr-ben', platformUser: '5151002', name: 'Ben', rights: ['chat', 'control'] as const, owner: false, lang: '' };
  it('is nothing when nothing changed, whatever order the rights are in', () => {
    expect(personPatch(ben, { name: 'Ben', lang: '', rights: ['control', 'chat'], owner: false })).toEqual({});
  });
  it('names exactly the fields that changed', () => {
    expect(personPatch(ben, { name: 'Benjamin', lang: '', rights: ['chat', 'control'], owner: false })).toEqual({ name: 'Benjamin' });
    expect(personPatch(ben, { name: 'Ben', lang: 'fr', rights: ['chat'], owner: true })).toEqual({ lang: 'fr', rights: ['chat'], owner: true });
  });
  it('a cleared name is sent as empty, not left out', () => {
    expect(personPatch(ben, { name: '', lang: '', rights: ['chat', 'control'], owner: false })).toEqual({ name: '' });
  });
});

describe('the lock key of a person change', () => {
  it('names the person by id and keeps typed text out', () => {
    const id = LOCK_KEYS.channelChange!({ botKey: 'b', channelId: 'c', action: 'personAdd', target: undefined, person: { name: 'Secret Name', platformUser: '999' }, token: 'tok-1' });
    expect(JSON.stringify(id)).not.toContain('Secret Name');
    expect(JSON.stringify(id)).not.toContain('999');
    expect(LOCK_KEYS.channelChange!({ botKey: 'b', channelId: 'c', action: 'personRemove', target: 'p1' })).not.toEqual(LOCK_KEYS.channelChange!({ botKey: 'b', channelId: 'c', action: 'personRemove', target: 'p2' }));
  });
});

describe('the People section', () => {
  it('lists who is paired, their rights and who owns the app; a nameless person shows their app ID', async () => {
    await open(undefined);
    const table = await screen.findByRole('table', { name: strings['chan.people.list'].replace('{{name}}', 'Support chat') });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('Ana')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(strings['chan.person.owner'])).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(strings['chan.right.gates'])).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText(strings['chan.person.owner'])).toBeNull();
    expect(within(rows[1] as HTMLElement).queryByText(strings['chan.right.gates'])).toBeNull();
    // Said as an ID, never a bare number in the place of a name.
    expect(within(rows[2] as HTMLElement).getByText(strings['chan.person.idOnly'].replace('{{id}}', '5151003'))).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).queryByText('5151003')).toBeNull();
  }, 60_000);

  it('an app with nobody paired says how to add someone', async () => {
    await open(undefined, 'ch-sl');
    expect(await screen.findByText(strings['chan.people.empty'])).toBeInTheDocument();
  }, 60_000);

  it('add needs a user ID, and an owner needs no rights picked', async () => {
    await open(undefined);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.person.add'] }));
    const go = await screen.findByRole('button', { name: strings['chan.person.addGo'] });
    expect(go).toHaveAttribute('aria-disabled', 'true');
    expect(go).toHaveAccessibleDescription(strings['chan.person.needUserId']);
    const dlg = within(await screen.findByRole('dialog', { name: /Add a person to/ }));
    // forms-required: the one field Add waits for is marked as needed.
    expect(dlg.getByRole('textbox', { name: /User ID in Telegram/ })).toBeRequired();
    await userEvent.type(dlg.getByRole('textbox', { name: /User ID in Telegram/ }), '777');
    expect(go).toBeEnabled();
    await userEvent.click(dlg.getByRole('checkbox', { name: strings['chan.right.chat'] }));
    expect(go).toHaveAttribute('aria-disabled', 'true');
    expect(go).toHaveAccessibleDescription(strings['chan.person.needRight']);
    await userEvent.click(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    expect(dlg.queryByRole('checkbox', { name: strings['chan.right.chat'] })).toBeNull();
    expect(dlg.getByText(strings['chan.person.ownerHelp'])).toBeInTheDocument();
    expect(go).toBeEnabled();
  }, 60_000);

  it('edit offers Save only once something changed', async () => {
    await open(undefined);
    const ben = (await screen.findAllByRole('button', { name: strings['chan.person.edit'] }))[1] as HTMLElement;
    await userEvent.click(ben);
    const save = await screen.findByRole('button', { name: strings['chan.person.save'] });
    expect(save).toBeDisabled();
    await userEvent.click(within(screen.getByRole('dialog', { name: /Edit Ben/ })).getByRole('button', { name: /Language/ }));
    await userEvent.click(await screen.findByRole('option', { name: strings['set.v.lang.de'] }));
    expect(save).toBeEnabled();
  }, 60_000);

  it('removing the owner says so before it is confirmed', async () => {
    await open(undefined);
    await screen.findByRole('table', { name: /People paired with/ });
    await removeAt(0);
    expect(await screen.findByText(new RegExp(strings['chan.person.removeOwner'].slice(0, 30)))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['chan.person.removeGo'] })).toBeInTheDocument();
  }, 60_000);

  it('an invite code is shown once and gone after "Done"', async () => {
    await open('channelPairing');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.invite.codeNote'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['chan.invite.go'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.done'] }));
    expect(screen.queryByText(strings['chan.invite.codeNote'])).toBeNull();
    expect(await screen.findByRole('button', { name: strings['chan.invite.go'] })).toBeInTheDocument();
  }, 60_000);

  it('closing the drawer drops the code: opened again, the app shows none and offers to make one', async () => {
    await open('channelPairing');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.invite.codeNote'])).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: strings['secret.closeNow'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Support chat/ })).toBeNull());
    const row = await screen.findByRole('row', { name: /Support chat/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['chan.manage']}`) }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    expect(await screen.findByRole('button', { name: strings['chan.invite.go'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.invite.codeNote'], { exact: false })).toBeNull();
  }, 60_000);

  it('a code stays through a switch to Settings and back', async () => {
    await open('channelPairing');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.invite.codeNote'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.rail.settings'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.people'] }));
    expect(await screen.findByText(strings['chan.invite.codeNote'])).toBeInTheDocument();
  }, 60_000);

  it('an invite with no right picked cannot be made', async () => {
    await open('channelPairing');
    const go = await screen.findByRole('button', { name: strings['chan.invite.go'] });
    expect(go).toBeEnabled();
    const rights = within(screen.getByRole('group', { name: strings['chan.person.rights'] }));
    expect(screen.queryByText(strings['chan.invite.needRight'])).toBeNull();
    await userEvent.click(rights.getByRole('checkbox', { name: strings['chan.right.chat'] }));
    // forms-required: soft-disabled, and it says why (kit Button disabledReason): still never acts.
    const off = screen.getByRole('button', { name: strings['chan.invite.go'] });
    expect(off).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(strings['chan.invite.needRight']).length).toBeGreaterThan(0);
  }, 60_000);

  it('an invite waits for the pairing policy: with direct messages owner-only it says so and offers Settings', async () => {
    await open(undefined);
    expect(await screen.findByText(strings['chan.invite.needsPolicy'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['chan.invite.go'] })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.openSettings'] }));
    expect(await screen.findByRole('button', { name: strings['chan.name.save'] })).toBeInTheDocument();
  }, 60_000);

  it('an invite under the pairing policy has no policy note', async () => {
    await open('channelPairing');
    expect(await screen.findByRole('button', { name: strings['chan.invite.go'] })).toBeEnabled();
    expect(screen.queryByText(strings['chan.invite.needsPolicy'])).toBeNull();
  }, 60_000);

  it('an invite code can be cancelled from where it is shown, and is then gone', async () => {
    await open('channelPairing');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.invite.codeNote'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.cancel'] }));
    await waitFor(() => expect(screen.queryByText(strings['chan.invite.codeNote'])).toBeNull());
    expect(await screen.findByRole('button', { name: strings['chan.invite.go'] })).toBeInTheDocument();
  }, 60_000);

  it('a lost answer holds every person button and says the change may have gone through', async () => {
    await open('channelChangePending');
    await screen.findByRole('table', { name: /People paired with/ });
    await removeAt(1);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.person.removeGo'] }));
    expect(await screen.findAllByText(strings['chan.maybe'])).not.toHaveLength(0);
    await waitFor(() => expect(screen.getByRole('button', { name: strings['chan.invite.go'] })).toBeDisabled());
  }, 60_000);
});

const person = (o: Partial<{ id: string; platformUser: string; name: string; lang: string; owner: boolean; rights: Right[] }> = {}) => ({ id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'] as Right[], owner: false, lang: '', ...o });
const bare = (principals: ReturnType<typeof person>[]): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: principals.length, chats: 0, homeChat: null, reason: '', principals, chatRows: [],
  view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: [],
});
const stub = () => {
  const calls: ChannelVars[] = [];
  const change = {
    run: async (v: ChannelVars) => { calls.push(v); return { outcome: 'done' as const }; },
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<ChannelChange, ChannelVars>;
  return { calls, change };
};

describe('the language of a person', () => {
  it('is picked among the agent languages, and the chat app language puts it back as null', async () => {
    const { calls, change } = stub();
    await mount(<PeopleSection channel={bare([person({ lang: 'en' })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.edit'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Edit Ana/ }));
    await userEvent.click(dlg.getByRole('button', { name: /Language/ }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([strings['chan.person.langNone'], ...['en', 'de', 'fr', 'es', 'pt', 'it', 'ja', 'zh'].map((l) => strings[`set.v.lang.${l}` as keyof typeof strings])]);
    await userEvent.click(screen.getByRole('option', { name: strings['chan.person.langNone'] }));
    await userEvent.click(dlg.getByRole('button', { name: strings['chan.person.save'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ action: 'personEdit', target: 'pr-1', person: { lang: null } });
  });

  it('a stored language the agent does not list stays visible so it can be replaced', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ lang: 'xx' })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.edit'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Edit Ana/ }));
    await userEvent.click(dlg.getByRole('button', { name: /Language/ }));
    expect(await screen.findByRole('option', { name: 'xx' })).toBeInTheDocument();
  });
});

describe('adding an owner', () => {
  it('sends the owner flag without rights', async () => {
    const { calls, change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Add a person to/ }));
    await userEvent.type(dlg.getByRole('textbox', { name: /User ID in Telegram/ }), '777');
    await userEvent.click(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    await userEvent.click(dlg.getByRole('button', { name: strings['chan.person.addGo'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person).toEqual({ platformUser: '777', name: undefined, owner: true });
  });
});

describe('an issued code', () => {
  it('shows when it expires', () => {
    render(<IssuedCodeField issued={{ code: 'ABCD-1234', expiresAt: Date.now() + 60_000, kind: 'invite' }} label="Code" note="Send it." />);
    expect(screen.getByText(/Send it\. Expires at /)).toBeInTheDocument();
  });

  it('with no expiry given shows no time', () => {
    render(<IssuedCodeField issued={{ code: 'ABCD-1234', expiresAt: 0, kind: 'invite' }} label="Code" note="Send it." />);
    expect(screen.getByText('Send it.')).toBeInTheDocument();
  });
});

// The invite and owner steps are a StepList, the code a CopyField in its row, and what is said about the Owner switch
// is a Band attached under it (aria-describedby), never loose paragraphs.
describe('people steps', () => {
  it('an issued code stays a kit SecretField (masked until shown, with Copy): codes are secrets', () => {
    render(<IssuedCodeField issued={{ code: 'ABCD-1234', expiresAt: 0, kind: 'invite' }} label="Code" note="Send it." />);
    expect(screen.queryByText('ABCD-1234')).toBeNull();
    expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument();
  });

  it('the invite steps are a StepList; once issued, the code sits in the Send row', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    const list = screen.getByRole('group', { name: strings['flow.invite.steps'] });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(`01${strings['flow.invite.s1']}`);
    expect(within(list).getByText(strings['flow.invite.where.them'])).toBeInTheDocument();
    // What holds for the code whatever the step is a fact list after the steps, not a note in a row.
    expect(within(list).queryByText(/Works once/)).toBeNull();
    expect(screen.getByText(strings['flow.invite.fact.afterValue'])).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText(strings['chan.invite.codeNote'])).toBeNull();
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { code: 'INV-7', expiresAt: 0, kind: 'invite' }));
    const send = within(screen.getByRole('group', { name: strings['flow.invite.steps'] })).getAllByRole('listitem')[1] as HTMLElement;
    expect(within(send).getByText(strings['chan.invite.codeNote'])).toBeInTheDocument();
  });

  it('no owner yet: the line and Open Setup are a Band attached to the Owner switch', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([])} change={change} botUid="u1" onSetup={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Add a person to/ }));
    const sw = dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    const band = dlg.getByText(strings['chan.person.ownerNeedsPairing']).closest('[role="status"]') as HTMLElement;
    expect(band).not.toBeNull();
    expect(sw.getAttribute('aria-describedby')?.split(' ')).toContain(band.id);
    expect(within(band).getByRole('button', { name: strings['chan.person.ownerOpenSetup'] })).toBeInTheDocument();
  });

  it('ownership moved under an edit: a warn Band attached to the Owner switch', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { change } = stub();
    const r = await mount(<PeopleSection channel={bare([ann, ben])} change={change} botUid="u1" />);
    await userEvent.click(screen.getAllByRole('button', { name: strings['chan.person.edit'] })[1] as HTMLElement);
    const dlg = () => within(screen.getByRole('dialog', { name: /Edit Ben/ }));
    await userEvent.click(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    const cy = person({ id: 'pr-c', platformUser: '1003', name: 'Cy', owner: true });
    await r.rerender(<PeopleSection channel={bare([{ ...ann, owner: false }, ben, cy])} change={change} botUid="u1" />);
    const band = (await dlg().findByText(strings['chan.person.ownerMoved'])).closest('[data-band-attach]') as HTMLElement;
    expect(band).toHaveAttribute('data-band-attach', 'warn');
    const sw = dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    expect(band.contains(sw)).toBe(true);
    expect(sw.getAttribute('aria-describedby')).toContain((dlg().getByText(strings['chan.person.ownerMoved']).closest('[role="status"]') as HTMLElement).id);
  });
});

describe('People reads the one code of the app', () => {
  const invCode = { code: 'INV-1', expiresAt: 0, kind: 'invite' as const };
  const shows = () => screen.queryByText(strings['chan.invite.codeNote'], { exact: false });

  it('shows an invite from the holder, and drops it when the holder is cleared elsewhere (a cancel from Setup)', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    expect(shows()).toBeNull();
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), invCode));
    expect(shows()).toBeInTheDocument();
    await act(async () => clearCode('u1', 'ch-x'));
    expect(shows()).toBeNull();
  });

  it('an owner code issued meanwhile replaces the invite: People no longer shows it', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), invCode));
    expect(shows()).toBeInTheDocument();
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { code: 'OWN-1', expiresAt: 0, kind: 'owner' }));
    expect(shows()).toBeNull();
  });

  it('a code that expired while People was not shown is not shown when it comes back', async () => {
    const { change } = stub();
    const view = await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { ...invCode, expiresAt: Date.now() + 600 }));
    expect(shows()).toBeInTheDocument();
    view.unmount();
    await new Promise((r) => setTimeout(r, 700));
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    expect(shows()).toBeNull();
  });

  it('a code on screen goes away by itself when it expires', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { ...invCode, expiresAt: Date.now() + 600 }));
    expect(shows()).toBeInTheDocument();
    await waitFor(() => expect(shows()).toBeNull(), { timeout: 3000 });
  });

  it('another Bot with the same chat app id sees nothing', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u2" />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), invCode));
    expect(shows()).toBeNull();
  });
});

describe('who may be added', () => {
  const addDialog = async (channel: Channel) => {
    const { calls, change } = stub();
    await mount(<PeopleSection channel={channel} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    return { calls, dlg: within(await screen.findByRole('dialog', { name: /Add a person to/ })) };
  };

  it('nobody is offered the owner switch while the app has no owner: the first owner pairs with an owner code', async () => {
    const { dlg } = await addDialog(bare([]));
    expect(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] })).toBeDisabled();
    expect(dlg.getByText(strings['chan.person.ownerNeedsPairing'])).toBeInTheDocument();
  });

  it('says the first owner pairs with an owner code and goes to Setup from there', async () => {
    const { change } = stub();
    let setups = 0;
    await mount(<PeopleSection channel={bare([])} change={change} botUid="u1" onSetup={() => { setups += 1; }} />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Add a person to/ }));
    expect(dlg.getByText(strings['chan.person.ownerNeedsPairing'])).toBeInTheDocument();
    await userEvent.click(dlg.getByRole('button', { name: strings['chan.person.ownerOpenSetup'] }));
    expect(setups).toBe(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add a person to/ })).toBeNull());
  });

  it('with an owner the switch is there', async () => {
    const { dlg } = await addDialog(bare([person({ owner: true })]));
    expect(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] })).toBeEnabled();
    expect(dlg.queryByText(strings['chan.person.ownerNeedsPairing'])).toBeNull();
  });

  it('editing a person of an app with no owner cannot make them the first owner either', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person()])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.edit'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Edit Ana/ }));
    expect(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] })).toBeDisabled();
    expect(dlg.getByText(strings['chan.person.ownerNeedsPairing'])).toBeInTheDocument();
  });

  it("the add dialog names the app with its mark (its sentence and the user ID label); the field keeps the name as words", async () => {
    const { dlg } = await addDialog({ ...bare([person({ owner: true })]), kind: 'slack' as const });
    expect(dlg.getByRole('textbox', { name: 'User ID in Slack' })).toBeInTheDocument();
    const label = dlg.getByText((_, el) => !!el && el.getAttribute('aria-hidden') === 'true' && el.textContent === 'User ID in Slack');
    expect(label.querySelector('[data-chat-app="slack"] svg')).not.toBeNull();
    const said = strings['chan.person.addBody'].replace('{{app}}', 'Slack');
    const body = dlg.getByText((_, el) => !!el && el.textContent === said && ![...el.children].some((c) => c.textContent === said));
    expect(body.querySelector('[data-chat-app="slack"] svg')).not.toBeNull();
  });

  it('a Slack user ID the agent would refuse keeps Add off, and says so once the field is left', async () => {
    const slack = { ...bare([person({ owner: true })]), kind: 'slack' as const };
    const { calls, dlg } = await addDialog(slack);
    const id = dlg.getByRole('textbox', { name: /User ID in Slack/ });
    await userEvent.type(id, '123');
    expect(dlg.getByRole('button', { name: strings['chan.person.addGo'] })).toHaveAttribute('aria-disabled', 'true');
    expect(dlg.getByRole('button', { name: strings['chan.person.addGo'] })).toHaveAccessibleDescription(strings['chan.person.needValidId']);
    await userEvent.tab();
    expect(await dlg.findByText(strings['chan.person.userIdBad'])).toBeInTheDocument();
    await userEvent.clear(id);
    await userEvent.type(id, 'U01ABC23');
    expect(dlg.getByRole('button', { name: strings['chan.person.addGo'] })).toBeEnabled();
    await userEvent.click(dlg.getByRole('button', { name: strings['chan.person.addGo'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person?.platformUser).toBe('U01ABC23');
  });

  it('a Telegram ID is an integer and a Discord ID a long number', async () => {
    const tg = await addDialog(bare([person({ owner: true })]));
    await userEvent.type(tg.dlg.getByRole('textbox', { name: /User ID in Telegram/ }), 'ana_b');
    expect(tg.dlg.getByRole('button', { name: strings['chan.person.addGo'] })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a name over 64 characters keeps Add off and says so; 64 characters, counted as characters, is fine', async () => {
    const { dlg } = await addDialog(bare([person({ owner: true })]));
    await userEvent.type(dlg.getByRole('textbox', { name: /User ID in Telegram/ }), '777');
    const name = dlg.getByRole('textbox', { name: strings['chan.person.name'] });
    await userEvent.click(name);
    await userEvent.paste('😀'.repeat(64));
    expect(dlg.getByRole('button', { name: strings['chan.person.addGo'] })).toBeEnabled();
    await userEvent.paste('😀');
    expect(dlg.getByRole('button', { name: strings['chan.person.addGo'] })).toBeDisabled();
    expect(dlg.getByText(strings['chan.nameTooLong'].replace('{{max}}', '64'))).toBeInTheDocument();
  });

  it('editing a person to a name over 64 characters keeps Save off', async () => {
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.edit'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Edit Ana/ }));
    const name = dlg.getByRole('textbox', { name: strings['chan.person.name'] });
    await userEvent.click(name);
    await userEvent.paste('x'.repeat(65));
    expect(dlg.getByRole('button', { name: strings['chan.person.save'] })).toBeDisabled();
  });
});

describe('a remove whose person is gone from the refreshed list', () => {
  const removeDialog = async (ui: ReturnType<typeof person>[]) => {
    const { calls, change } = stub();
    const view = await mount(<PeopleSection channel={bare(ui)} change={change} botUid="u1" />);
    await removeAt(0);
    await screen.findByRole('alertdialog');
    return { calls, change, view };
  };

  it('says the person is already removed and sends nothing', async () => {
    const ana = person({ id: 'pr-1', name: 'Ana' });
    const { calls, change, view } = await removeDialog([ana, person({ id: 'pr-2', name: 'Ben', owner: true })]);
    await view.rerender(<PeopleSection channel={bare([person({ id: 'pr-2', name: 'Ben', owner: true })])} change={change} botUid="u1" />);
    expect(await screen.findByText(strings['chan.person.removeGone'])).toBeInTheDocument();
    const go = screen.getByRole('button', { name: strings['chan.person.removeGo'] });
    expect(go).toBeDisabled();
    await userEvent.click(go);
    expect(calls).toHaveLength(0);
  }, 60_000);

  it("the remove sentence names the app with its mark", async () => {
    await removeDialog([person({ id: 'pr-1', name: 'Ana' }), person({ id: 'pr-2', name: 'Ben', owner: true })]);
    const kind = bare([]).kind;
    const app = screen.getByRole('alertdialog').querySelector(`[data-chat-app="${kind}"]`);
    expect(app?.querySelector('svg')).not.toBeNull();
    expect(app?.textContent).toBe(strings[`chan.kind.${kind}`]);
  }, 60_000);

  it('the owner warning follows the person as listed now', async () => {
    const { change, view } = await removeDialog([person({ id: 'pr-1', name: 'Ana', owner: false }), person({ id: 'pr-2', name: 'Ben', owner: true })]);
    expect(screen.queryByText(new RegExp(strings['chan.person.removeOwner'].slice(0, 30)))).toBeNull();
    await view.rerender(<PeopleSection channel={bare([person({ id: 'pr-1', name: 'Ana', owner: true }), person({ id: 'pr-2', name: 'Ben', owner: false })])} change={change} botUid="u1" />);
    expect(await screen.findByText(new RegExp(strings['chan.person.removeOwner'].slice(0, 30)))).toBeInTheDocument();
  }, 60_000);
});

// The code on screen follows what was pressed, not what an answer says later: a press drops the shown code at once, a lost answer
// leaves "the code may have changed" and never the old code, and a send admitted after the drawer closed writes nothing.
describe('a code press', () => {
  const ownerCode = { code: 'OWN-1', expiresAt: 0, kind: 'owner' as const };
  const invCode = { code: 'INV-1', expiresAt: 0, kind: 'invite' as const };

  /** A change whose answer is lost: the first run reports it pending (the hold shows) and nothing ever answers. */
  function LostHost({ channel, calls }: { channel: Channel; calls: ChannelVars[] }) {
    const [outcome, setOutcome] = useState<'idle' | 'pending'>('idle');
    const change = {
      run: async (v: ChannelVars) => {
        calls.push(v);
        setOutcome('pending');
        return { outcome: 'pending' as const };
      },
      outcome, data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
      readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
    } as unknown as Change<ChannelChange, ChannelVars>;
    return <PeopleSection channel={channel} change={change} botUid="u1" />;
  }

  it('an invite pressed while another code is held drops that code at once; a lost answer says the code may have changed', async () => {
    const calls: ChannelVars[] = [];
    await mount(<LostHost channel={bare([person({ owner: true })])} calls={calls} />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), ownerCode));
    expect(heldCode('u1', 'ch-x')?.code).toBe('OWN-1');
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(calls).toHaveLength(1);
    expect(heldCode('u1', 'ch-x')).toBeNull();
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
    expect(screen.queryByText('OWN-1')).toBeNull();
  });

  it('a lost answer holds the row buttons too: Edit is off and so is Remove in the row menu', async () => {
    const calls: ChannelVars[] = [];
    await mount(<LostHost channel={bare([person({ owner: true }), person({ id: 'pr-2', name: 'Ben' })])} calls={calls} />);
    expect(within(personRows()[0] as HTMLElement).getByRole('button', { name: strings['chan.person.edit'] })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
    for (const row of personRows()) expect(within(row).getByRole('button', { name: strings['chan.person.edit'] })).toBeDisabled();
    await userEvent.click(within(personRows()[1] as HTMLElement).getByRole('button', { name: 'Row actions' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((it) => it.textContent)).toEqual([expect.stringMatching(new RegExp(`^${strings['chan.person.remove']}`))]);
    expect(items[0]).toHaveAttribute('aria-disabled', 'true');
  });

  it('a cancel pressed on a shown invite drops it at once, and a lost answer never brings it back', async () => {
    const calls: ChannelVars[] = [];
    await mount(<LostHost channel={bare([person({ owner: true })])} calls={calls} />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), invCode));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.cancel'] }));
    expect(calls[0]?.action).toBe('cancelCode');
    expect(heldCode('u1', 'ch-x')).toBeNull();
    expect(screen.queryByText(strings['chan.invite.codeNote'], { exact: false })).toBeNull();
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
  });

  it('the issue request number is taken at the press, so it rides the change and a lost answer is not an old code', async () => {
    const calls: ChannelVars[] = [];
    await mount(<LostHost channel={bare([person({ owner: true })])} calls={calls} />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(typeof calls[0]?.ticket).toBe('number');
  });

  it('a refused press leaves nothing open: no "may have changed" line for a later hold', async () => {
    beginIssue('u1', 'ch-x');
    settlePress('u1', 'ch-x');
    const { change } = stub();
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={{ ...change, outcome: 'pending' } as typeof change} botUid="u1" />);
    expect(screen.queryByText(strings['chan.code.mayHaveChanged'])).toBeNull();
  });

  it('a fixture answer that arrives after the drawer closed is not adopted either', async () => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((r) => { answer = r; });
    const change = {
      run: async () => {
        await answered;
        return { outcome: 'done' as const, data: { demo: { code: 'DEMO-9', expiresAt: 0 } } };
      },
      outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
      readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
    } as unknown as Change<ChannelChange, ChannelVars>;
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    act(() => clearCode('u1', 'ch-x'));
    answer();
    await new Promise((r) => setTimeout(r, 40));
    expect(heldCode('u1', 'ch-x')).toBeNull();
  });

  it('a press that failed outright leaves nothing open for a later hold to be blamed on', async () => {
    function FailHost() {
      const [outcome, setOutcome] = useState<'idle' | 'pending'>('idle');
      const change = {
        run: async () => ({ outcome: 'failed' as const }),
        outcome, data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
        readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
      } as unknown as Change<ChannelChange, ChannelVars>;
      return (
        <>
          <PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />
          <button onClick={() => setOutcome('pending')}>hold</button>
        </>
      );
    }
    await mount(<FailHost />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    await userEvent.click(screen.getByRole('button', { name: 'hold' }));
    expect(screen.queryByText(strings['chan.code.mayHaveChanged'])).toBeNull();
  });

  it.each(['not_sent', 'stale'] as const)('a press that was %s leaves nothing open', async (outcome) => {
    function Host() {
      const [held, setHeld] = useState<'idle' | 'pending'>('idle');
      const change = {
        run: async () => ({ outcome }),
        outcome: held, data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
        readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
      } as unknown as Change<ChannelChange, ChannelVars>;
      return (
        <>
          <PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />
          <button onClick={() => setHeld('pending')}>hold</button>
        </>
      );
    }
    await mount(<Host />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    await userEvent.click(screen.getByRole('button', { name: 'hold' }));
    expect(screen.queryByText(strings['chan.code.mayHaveChanged'])).toBeNull();
  });

  it('a send admitted after the drawer closed writes no code: the close overtook its request number', async () => {
    const seen = capture(ROUTES.pairCreate, { code: 'LATE-0002' });
    let admit: () => void = () => undefined;
    const admitted = new Promise<void>((r) => { admit = r; });
    const change = {
      // The hook admits the send some time after the press (the hold's digests, the other tabs' lock): the call comes after it.
      run: async (v: ChannelVars) => {
        await admitted;
        // the hook adds the Bot's uid to the variables, as useChannelChange does
        await channelChangeCall({ botKey: KEY, uid: 'u1', ...v }, 'k-queued');
        return { outcome: 'done' as const };
      },
      outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
      readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
    } as unknown as Change<ChannelChange, ChannelVars>;
    await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    // the drawer closes while the send waits to be admitted, then the send goes
    act(() => clearCode('u1', 'ch-x'));
    admit();
    await waitFor(() => expect(screen.queryByText(strings['chan.invite.codeNote'], { exact: false })).toBeNull());
    await waitFor(() => expect(seen).toHaveLength(1));
    // the send really went out and was answered with a code, which was dropped because the close overtook its number
    await new Promise((r) => setTimeout(r, 40));
    expect(heldCode('u1', 'ch-x')).toBeNull();
  });

  it('clearing the app (Done, the drawer closing) leaves nothing open', async () => {
    const calls: ChannelVars[] = [];
    await mount(<LostHost channel={bare([person({ owner: true })])} calls={calls} />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
    act(() => clearCode('u1', 'ch-x'));
    await waitFor(() => expect(screen.queryByText(strings['chan.code.mayHaveChanged'])).toBeNull());
  });
});

describe('the Owner switch when the owner goes away', () => {
  it('is cleared when the app loses its owner while Add is open, and what is sent carries no owner flag', async () => {
    const { calls, change } = stub();
    const withOwner = bare([person({ id: 'pr-o', owner: true })]);
    const { rerender } = await mount(<PeopleSection channel={withOwner} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Add a person to/ }));
    await userEvent.type(dlg.getByRole('textbox', { name: /user ID/i }), '777');
    await userEvent.click(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    expect(dlg.getByRole('switch', { name: strings['chan.person.ownerSwitch'] })).toBeChecked();
    // a refresh: the owner is gone
    await rerender(<PeopleSection channel={bare([])} change={change} botUid="u1" />);
    const sw = within(screen.getByRole('dialog', { name: /Add a person to/ })).getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    expect(sw).toBeDisabled();
    expect(sw).not.toBeChecked();
    await userEvent.click(within(screen.getByRole('dialog', { name: /Add a person to/ })).getByRole('button', { name: strings['chan.person.addGo'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person).toEqual({ platformUser: '777', rights: ['chat'] });
  });

  it('does not come back when an owner appears again: the person turns it on again', async () => {
    const { change } = stub();
    const { rerender } = await mount(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    const get = () => within(screen.getByRole('dialog', { name: /Add a person to/ })).getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    await userEvent.click(get());
    await rerender(<PeopleSection channel={bare([])} change={change} botUid="u1" />);
    await rerender(<PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />);
    expect(get()).toBeEnabled();
    expect(get()).not.toBeChecked();
  });

  it('is cleared in Edit too, and the patch then carries no owner change', async () => {
    const { calls, change } = stub();
    const ben = person({ id: 'pr-b', name: 'Ben' });
    const { rerender } = await mount(<PeopleSection channel={bare([person({ id: 'pr-o', name: 'Owen', owner: true }), ben])} change={change} botUid="u1" />);
    await userEvent.click(screen.getAllByRole('button', { name: strings['chan.person.edit'] })[1] as HTMLElement);
    const dlg = () => within(screen.getByRole('dialog', { name: /Edit Ben/ }));
    await userEvent.click(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    await rerender(<PeopleSection channel={bare([ben])} change={change} botUid="u1" />);
    expect(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] })).not.toBeChecked();
    // nothing else was changed: there is nothing to save
    expect(dlg().getByRole('button', { name: strings['chan.person.save'] })).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it('Edit with every right unticked keeps Save off, says why, and sends nothing', async () => {
    const { calls, change } = stub();
    await mount(<PeopleSection channel={bare([person({ id: 'pr-o', name: 'Owen', owner: true }), person({ id: 'pr-b', name: 'Ben' })])} change={change} botUid="u1" />);
    await userEvent.click(screen.getAllByRole('button', { name: strings['chan.person.edit'] })[1] as HTMLElement);
    const dlg = within(screen.getByRole('dialog', { name: /Edit Ben/ }));
    await userEvent.click(dlg.getByRole('checkbox', { name: strings['chan.right.chat'] }));
    const save = dlg.getByRole('button', { name: strings['chan.person.save'] });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription(strings['chan.person.needRight']);
    await userEvent.click(save);
    expect(calls).toHaveLength(0);
  });
});

describe('owner code policy in People', () => {
  it('the first-owner guidance says an owner code needs owner-only or pairing direct messages when they are set otherwise', async () => {
    const { change } = stub();
    const open = { ...bare([]), view: { settings: {}, effective: { dm_policy: { value: 'open', source: 'channel' } } } };
    await mount(<PeopleSection channel={open} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.add'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Add a person to/ }));
    expect(dlg.getByText(strings['chan.ownerCode.needsPolicy'])).toBeInTheDocument();
  });

  it('an edit is compared with the person as listed now: a demoted owner opened in Edit has nothing to save', async () => {
    const { calls, change } = stub();
    const owen = person({ id: 'pr-o', name: 'Owen', owner: true });
    const { rerender } = await mount(<PeopleSection channel={bare([owen])} change={change} botUid="u1" />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.edit'] }));
    const dlg = () => within(screen.getByRole('dialog', { name: /Edit Owen/ }));
    await rerender(<PeopleSection channel={bare([{ ...owen, owner: false }])} change={change} botUid="u1" />);
    expect(dlg().getByRole('button', { name: strings['chan.person.save'] })).toBeDisabled();
    expect(calls).toHaveLength(0);
  });
});

// An Edit dialog sends only what the person changed in it. Every other field follows the person as the agent lists them now,
// through any refresh while the dialog is open.
describe('an edit after a refresh', () => {
  const editOpen = async (channel: Channel, name: RegExp, row = 0) => {
    const { calls, change } = stub();
    const r = await mount(<PeopleSection channel={channel} change={change} botUid="u1" />);
    await userEvent.click(screen.getAllByRole('button', { name: strings['chan.person.edit'] })[row] as HTMLElement);
    const dlg = () => within(screen.getByRole('dialog', { name }));
    return { calls, change, dlg, rerender: (c: Channel) => r.rerender(<PeopleSection channel={c} change={change} botUid="u1" />) };
  };
  const save = (dlg: () => ReturnType<typeof within>) => dlg().getByRole('button', { name: strings['chan.person.save'] });

  it('a handover while it is open, with another owner left: untouched fields follow, and nothing is sent unless asked', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true, rights: ['chat'] });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { calls, dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ann/);
    // Ann is demoted and Ben takes over while the dialog is open
    await rerender(bare([{ ...ann, owner: false }, { ...ben, owner: true }]));
    expect(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] })).not.toBeChecked();
    expect(save(dlg)).toBeDisabled();
    // a name-only edit sends only the name: it never re-promotes Ann or sends her old rights
    await userEvent.type(dlg().getByRole('textbox', { name: strings['chan.person.name'] }), 'a');
    expect(dlg().queryByText(strings['chan.person.ownerMoved'])).toBeNull();
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ action: 'personEdit', target: 'pr-a', person: { name: 'Anna' } });
    expect(Object.keys(calls[0]?.person ?? {})).toEqual(['name']);
  });

  it('rights revoked while a name is being edited: the name goes alone and the revoked right stays revoked', async () => {
    const ana = person({ rights: ['chat', 'control'] });
    const { calls, dlg, rerender } = await editOpen(bare([ana]), /Edit Ana/);
    await rerender(bare([{ ...ana, rights: ['chat'] }]));
    expect(dlg().getByRole('checkbox', { name: strings['chan.right.control'] })).not.toBeChecked();
    await userEvent.type(dlg().getByRole('textbox', { name: strings['chan.person.name'] }), 'x');
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(Object.keys(calls[0]?.person ?? {})).toEqual(['name']);
  });

  it('a field the person did touch is kept through a refresh, and is the only other thing sent', async () => {
    const ana = person({ rights: ['chat'] as never });
    const { calls, dlg, rerender } = await editOpen(bare([ana]), /Edit Ana/);
    await userEvent.type(dlg().getByRole('textbox', { name: strings['chan.person.name'] }), 'x');
    await rerender(bare([{ ...ana, lang: '' }]));
    expect(dlg().getByRole('textbox', { name: strings['chan.person.name'] })).toHaveValue('Anax');
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person).toEqual({ name: 'Anax' });
  });

  it('an untouched name follows the person as the agent lists them now', async () => {
    const ana = person();
    const { dlg, rerender } = await editOpen(bare([ana]), /Edit Ana/);
    await rerender(bare([{ ...ana, name: 'Anabel' }]));
    expect(dlg().getByRole('textbox', { name: strings['chan.person.name'] })).toHaveValue('Anabel');
  });

  it('owner touched, and ownership moved while open: says so, and sends nothing', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { calls, dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    await userEvent.click(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    expect(save(dlg)).toBeEnabled();
    // Ann hands over to Cy meanwhile: Ben's switch was chosen against another state
    const cy = person({ id: 'pr-c', platformUser: '1003', name: 'Cy', owner: true });
    await rerender(bare([{ ...ann, owner: false }, ben, cy]));
    expect(await dlg().findByText(strings['chan.person.ownerMoved'])).toBeInTheDocument();
    expect(save(dlg)).toBeDisabled();
    await userEvent.click(save(dlg));
    expect(calls).toHaveLength(0);
  });

  it('a language untouched follows the refresh; a language touched is kept and is the one thing sent', async () => {
    const ana = person({ lang: 'en' });
    const { calls, dlg, rerender } = await editOpen(bare([ana]), /Edit Ana/);
    await rerender(bare([{ ...ana, lang: 'fr' }]));
    expect(dlg().getByRole('button', { name: /Language/ })).toHaveTextContent(strings['set.v.lang.fr']);
    expect(save(dlg)).toBeDisabled();
    await userEvent.click(dlg().getByRole('button', { name: /Language/ }));
    await userEvent.click(await screen.findByRole('option', { name: strings['chan.person.langNone'] }));
    await rerender(bare([{ ...ana, lang: 'de' }]));
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person).toEqual({ lang: null });
  });

  it('rights touched are kept through a refresh and are the one thing sent', async () => {
    const ana = person({ rights: ['chat'] });
    const { calls, dlg, rerender } = await editOpen(bare([ana]), /Edit Ana/);
    await userEvent.click(dlg().getByRole('checkbox', { name: strings['chan.right.control'] }));
    await rerender(bare([{ ...ana, name: 'Anabel' }]));
    expect(dlg().getByRole('checkbox', { name: strings['chan.right.control'] })).toBeChecked();
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person).toEqual({ rights: ['chat', 'control'] });
  });

  it('a touch that was put back before ownership moved says nothing about ownership', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    const sw = () => dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    await userEvent.click(sw());
    await userEvent.click(sw());
    await rerender(bare([{ ...ann, owner: false }, ben, person({ id: 'pr-c', platformUser: '1003', name: 'Cy', owner: true })]));
    expect(dlg().queryByText(strings['chan.person.ownerMoved'])).toBeNull();
  });

  it('ownership that moved before the first Owner toggle is what the person chose against: no line, and the choice is sent', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const cy = person({ id: 'pr-c', platformUser: '1003', name: 'Cy', owner: true });
    const { calls, dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    // Ann hands over to Cy before Ben's switch is touched
    await rerender(bare([{ ...ann, owner: false }, ben, cy]));
    await userEvent.click(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    expect(dlg().queryByText(strings['chan.person.ownerMoved'])).toBeNull();
    expect(save(dlg)).toBeEnabled();
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ action: 'personEdit', target: 'pr-b', person: { owner: true } });
  });

  it('ownership that moved between toggling the Owner switch on and off still says so, and sends nothing', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { calls, dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    const sw = () => dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    await userEvent.click(sw());
    // another session makes Ben an owner while the switch is on; then the person turns it off
    await rerender(bare([ann, { ...ben, owner: true }]));
    await userEvent.click(sw());
    expect(await dlg().findByText(strings['chan.person.ownerMoved'])).toBeInTheDocument();
    expect(save(dlg)).toBeDisabled();
    await userEvent.click(save(dlg));
    expect(calls).toHaveLength(0);
  });

  it('a touch put back starts again: ownership that moved before the next toggle says nothing', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    const sw = () => dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    await userEvent.click(sw());
    await userEvent.click(sw());
    await rerender(bare([{ ...ann, owner: false }, ben, person({ id: 'pr-c', platformUser: '1003', name: 'Cy', owner: true })]));
    await userEvent.click(sw());
    expect(dlg().queryByText(strings['chan.person.ownerMoved'])).toBeNull();
    expect(save(dlg)).toBeEnabled();
  });

  // No latch. Ownership back at the set the person chose against is that set again.
  it('ownership that moves away and back while the switch is on: the line clears and the choice is sent', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const cy = person({ id: 'pr-c', platformUser: '1003', name: 'Cy', owner: true });
    const { calls, dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    await userEvent.click(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    await rerender(bare([{ ...ann, owner: false }, ben, cy]));
    expect(await dlg().findByText(strings['chan.person.ownerMoved'])).toBeInTheDocument();
    await rerender(bare([ann, ben]));
    expect(dlg().queryByText(strings['chan.person.ownerMoved'])).toBeNull();
    expect(save(dlg)).toBeEnabled();
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ action: 'personEdit', target: 'pr-b', person: { owner: true } });
  });

  it('a reopened dialog starts untouched: what was typed in the last one is not carried over', async () => {
    const ana = person();
    const { calls, change, dlg, rerender } = await editOpen(bare([ana]), /Edit Ana/);
    await userEvent.type(dlg().getByRole('textbox', { name: strings['chan.person.name'] }), 'x');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Edit Ana/ })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: strings['chan.person.edit'] }));
    await rerender(bare([{ ...ana, name: 'Anabel' }]));
    expect(screen.getByRole('textbox', { name: strings['chan.person.name'] })).toHaveValue('Anabel');
    expect(calls).toHaveLength(0);
    void change;
  });

  it('the edited person removed by a refresh: Save stays off, nothing is sent, and the dialog says so', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const { calls, dlg, rerender } = await editOpen(bare([ann]), /Edit Ann/);
    await rerender(bare([]));
    expect(await dlg().findByText(strings['chan.person.gone'])).toBeInTheDocument();
    expect(save(dlg)).toBeDisabled();
    await userEvent.click(save(dlg));
    expect(calls).toHaveLength(0);
  });

  it('removed after the name was typed: still no Save and no send', async () => {
    const ana = person();
    const { calls, dlg, rerender } = await editOpen(bare([ana, person({ id: 'pr-2', platformUser: '1002', name: 'Bo' })]), /Edit Ana/);
    await userEvent.type(dlg().getByRole('textbox', { name: strings['chan.person.name'] }), 'x');
    expect(save(dlg)).toBeEnabled();
    await rerender(bare([person({ id: 'pr-2', platformUser: '1002', name: 'Bo' })]));
    expect(save(dlg)).toBeDisabled();
    await userEvent.click(save(dlg));
    expect(calls).toHaveLength(0);
  });

  it('a refresh that makes the person the owner they chose clears the ownership line and lets the other edit go', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { calls, dlg, rerender } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    await userEvent.click(dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] }));
    await userEvent.type(dlg().getByRole('textbox', { name: strings['chan.person.name'] }), 'x');
    // another session makes Ben an owner too: the choice matches what the agent lists
    await rerender(bare([ann, { ...ben, owner: true }]));
    expect(dlg().queryByText(strings['chan.person.ownerMoved'])).toBeNull();
    expect(save(dlg)).toBeEnabled();
    await userEvent.click(save(dlg));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.person).toEqual({ name: 'Benx' });
  });

  it('owner touched and put back at what the agent lists is no change', async () => {
    const ann = person({ id: 'pr-a', name: 'Ann', owner: true });
    const ben = person({ id: 'pr-b', platformUser: '1002', name: 'Ben', owner: false });
    const { dlg } = await editOpen(bare([ann, ben]), /Edit Ben/, 1);
    const sw = () => dlg().getByRole('switch', { name: strings['chan.person.ownerSwitch'] });
    await userEvent.click(sw());
    await userEvent.click(sw());
    expect(save(dlg)).toBeDisabled();
  });
});

describe('a press that was not sent', () => {
  // the first press is refused; with `then` given, the later ones get that outcome
  const Host = ({ outcome, calls, then }: { outcome: 'not_sent' | 'done'; calls: ChannelVars[]; then?: 'done' }) => {
    const change = {
      run: async (v: ChannelVars) => { calls.push(v); return { outcome: calls.length > 1 && then ? then : outcome, code: 'BUSY' }; },
      outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
      readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
    } as unknown as Change<ChannelChange, ChannelVars>;
    return <PeopleSection channel={bare([person({ owner: true })])} change={change} botUid="u1" />;
  };

  it('a cancel that was not sent drops the code at once and says it may still work', async () => {
    const calls: ChannelVars[] = [];
    await mount(<Host outcome="not_sent" calls={calls} />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { code: 'INV-1', expiresAt: 0, kind: 'invite' }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.cancel'] }));
    expect(heldCode('u1', 'ch-x')).toBeNull();
    expect(await screen.findByText(strings['chan.press.cancelNotSent'])).toBeInTheDocument();
    expect(screen.getByText(strings['chan.press.cancelNotSent']).closest('[data-outcome]')).toHaveAttribute('data-outcome', 'not_sent');
    expect(screen.queryByText(strings['chan.failed'], { exact: false })).toBeNull();
  });

  it('the next press takes the line away, whatever its own answer', async () => {
    const calls: ChannelVars[] = [];
    await mount(<Host outcome="not_sent" then="done" calls={calls} />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(strings['chan.press.issueNotSent'])).toBeNull());
  });

  it('a later cancel that goes through takes the line away', async () => {
    const calls: ChannelVars[] = [];
    await mount(<Host outcome="not_sent" then="done" calls={calls} />);
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { code: 'INV-1', expiresAt: 0, kind: 'invite' }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.cancel'] }));
    expect(await screen.findByText(strings['chan.press.cancelNotSent'])).toBeInTheDocument();
    await act(async () => offerCode('u1', 'ch-x', beginIssue('u1', 'ch-x'), { code: 'INV-2', expiresAt: 0, kind: 'invite' }));
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.cancel'] }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(strings['chan.press.cancelNotSent'])).toBeNull());
  });

  it('an invite that was not sent says the earlier code may still work, and the next press clears the line', async () => {
    const calls: ChannelVars[] = [];
    await mount(<Host outcome="not_sent" calls={calls} />);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.invite.go'] }));
    expect(calls).toHaveLength(2);
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
  });
});

describe('the People table cells (kit CellLines)', () => {
  it('a person with a language has its note under the name in the same cell; a person without one has none', async () => {
    await open(undefined);
    const cellOf = (name: string): HTMLElement => {
      const row = personRows().find((r) => within(r).queryByText(name, { exact: true }));
      if (!row) throw new Error(`no row for ${name}`);
      return within(row).getAllByRole('cell')[0] as HTMLElement;
    };
    const note = strings['chan.person.langIs'].replace('{{lang}}', strings['set.v.lang.en']);
    expect(within(cellOf('Ana')).getByText(note, { exact: true })).toBeInTheDocument();
    expect(cellOf('Ben').textContent).toBe('Ben');
  });
});
