// Saving who can open a computer's programs (C9): every save asks first and says what it means for
// someone holding a program's address; it sends the version it read as If-Match, once. 412 means the rules
// changed elsewhere: nothing changed, read them again. A lost answer is held: Check again reads the rules back
// and never sends again. Rules set elsewhere are never written from here.
import { heldChanges, queryClient as coreQueryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness: another tab's sender on the same core, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { refreshAccess, useSetAccess } from './data';
import { accessAddElsewhere, accessSends, computers, resetAccess } from './fixtures';
import { permissionsTesting, SLOW } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';
import pageStrings from './strings.en.json';

const { leaveAndReturn, openPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const [ATLAS, SECOND, THIRD] = computers;
if (!ATLAS || !SECOND || !THIRD) throw new Error('fixture computers');

async function openDrawer(c: (typeof computers)[number], state?: string) {
  const d = await openPermissions(c, state);
  // 30 s, to allow for a slow test machine.
  await within(d).findByText(strings['acc.now.anyone'], undefined, { timeout: 30000 });
  return d;
}

async function pickAndSave(d: HTMLElement, choice: 'acc.private' | 'acc.myIp' | 'acc.anyone') {
  await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings[choice]) }));
  if (choice === 'acc.myIp') await within(d).findByText(/Singapore/, undefined, SLOW);
  await userEvent.click(within(d).getByRole('button', { name: strings['acc.save'] }));
  return screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
}

// Core proves a held write on any fresh read of the rules, so the band may already be gone: Check again when shown.
async function checkIfShown(d: HTMLElement) {
  const b = within(d).queryAllByRole('button', { name: strings['acc.held.check'] })[0];
  if (b) await userEvent.click(b).catch(() => undefined);
}

const confirmIn = (c: HTMLElement) => userEvent.click(within(c).getByRole('button', { name: strings['acc.confirm.go'] }));

/** Another tab's sender of the same save, on the same core: it frees a held change without this drawer acting. */
let otherSet: ReturnType<typeof useSetAccess> | null = null;
function OtherTab() {
  otherSet = useSetAccess();
  return null;
}

describe('computers: saving who can open (Permissions tab)', () => {
  beforeEach(() => resetAccess());

  it('Private asks first, sends the read version as If-Match once, and says Saved only when the rules read back so', async () => {
    const d = await openDrawer(THIRD);
    const c = await pickAndSave(d, 'acc.private');
    expect(c).toHaveTextContent(strings['acc.confirm.private']);
    expect(accessSends).toHaveLength(0);
    // Nothing about the result is said before the rules are read again (no "moved" or "didn't go through" from the stale read).
    const said: string[] = [];
    const watch = new MutationObserver(() => {
      for (const k of ['acc.moved', 'acc.movedUnknown'] as const) if (d.textContent?.includes(strings[k])) said.push(k);
    });
    watch.observe(d, { subtree: true, childList: true, characterData: true });
    await confirmIn(c);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    watch.disconnect();
    expect(said).toEqual([]);
    expect(d).toHaveTextContent(strings['acc.now.private']);
    expect(accessSends).toHaveLength(1);
    expect(accessSends[0]).toMatchObject({ id: THIRD.id, ifMatch: 'file:v0', body: { computer: THIRD.id, groups: {}, permissions: {}, default: 'deny' } });
  });

  it('Only my IP warns how the person can be locked out, then writes just their address', async () => {
    const d = await openDrawer(THIRD);
    const c = await pickAndSave(d, 'acc.myIp');
    expect(c).toHaveTextContent(strings['acc.confirm.myIp'].replace('{{ip}}', '203.0.113.7'));
    expect(c).toHaveTextContent(/until you change this here in the Hub/);
    await confirmIn(c);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(accessSends[0]?.body).toMatchObject({ groups: { 'hub-my-ip': { type: 'ip', range: '203.0.113.7/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' });
  });

  it('cancelling the question sends nothing', async () => {
    const d = await openDrawer(THIRD);
    const c = await pickAndSave(d, 'acc.private');
    await userEvent.click(within(c).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(accessSends).toHaveLength(0);
  });

  it('the question names the computer it changes', async () => {
    const d = await openDrawer(THIRD);
    await pickAndSave(d, 'acc.private');
    expect(await screen.findByRole('alertdialog', { name: strings['acc.confirm.title'].replace('{{name}}', THIRD.name) })).toBeInTheDocument();
    expect(strings['acc.confirm.title']).toContain('{{name}}');
  });

  it('rules written elsewhere while the question is open: it closes unanswered and nothing is sent', async () => {
    const d = await openDrawer(THIRD);
    await pickAndSave(d, 'acc.private');
    // Another tab adds a group the Hub's choices can't write over: the question was asked over rules that are gone.
    accessAddElsewhere(THIRD.id, 'team');
    await refreshAccess();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(accessSends).toHaveLength(0);
  });

  it('a Stop tracking question is about one held change: another tab frees it and sends the same change again, and the question is over', async () => {
    const d = await openDrawer(THIRD, 'accessLost');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.dismiss'] }));
    await screen.findByRole('alertdialog', { name: strings['acc.held.dismissTitle'] });
    // Another tab stops tracking that change and sends it again while the question is still open here.
    const [h] = heldChanges('computer.access');
    expect(h?.hold).toBeTruthy();
    render(createElement(QueryClientProvider, { client: coreQueryClient }, createElement(OtherTab)));
    const vars = { id: THIRD.id, want: { kind: 'private' as const }, from: Number((h!.identity as { from?: unknown }).from), body: { computer: THIRD.id, groups: {}, permissions: {}, default: 'deny' } };
    await act(async () => {
      await otherSet!.dismiss(vars, h!.hold as string);
      await otherSet!.mutateAsync(vars).catch(() => undefined);
    });
    // The same change over the same version, held again under a new token: its band shows, and nobody asked about it.
    await waitFor(() => expect(heldChanges('computer.access')[0]?.hold).toBeTruthy(), SLOW);
    expect(heldChanges('computer.access')[0]!.hold).not.toBe(h!.hold);
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(accessSends).toHaveLength(2);
  }, 40000);

  it('412: says the rules changed elsewhere and nothing changed here; reading again sends nothing', async () => {
    const d = await openDrawer(THIRD, 'accessStale');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.stale'], undefined, SLOW);
    expect(d).not.toHaveTextContent(strings['acc.saved']);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.stale.reload'] }));
    await waitFor(() => expect(d).not.toHaveTextContent(strings['acc.stale']));
    expect(accessSends).toHaveLength(1);
  });

  it('a lost answer over an unchanged version stays may-have-gone-through (it may still land): never "did not go through", never resent', async () => {
    const d = await openDrawer(THIRD, 'accessLost');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    expect(d).not.toHaveTextContent(/failed/i);
    await checkIfShown(d);
    await checkIfShown(d);
    expect(d).toHaveTextContent(strings['acc.held.private']);
    expect(d).not.toHaveTextContent(strings['acc.saved']);
    expect(d).toHaveTextContent(strings['acc.now.anyone']);
    expect(accessSends).toHaveLength(1);
  });

  it('Dismiss of a held change asks first, then frees it, says no result and sends nothing', async () => {
    const d = await openDrawer(THIRD, 'accessLost');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.dismiss'] }));
    const ask = await screen.findByRole('alertdialog');
    // The question says which computer's change it lets go.
    expect(ask).toHaveTextContent(strings['acc.held.dismissBodyOn'].replace('{{name}}', THIRD.name));
    await userEvent.click(within(ask).getByRole('button', { name: strings['acc.held.dismissGo'] }));
    await waitFor(() => expect(d).not.toHaveTextContent(strings['acc.held.private']), SLOW);
    for (const k of ['acc.saved', 'acc.moved', 'acc.movedUnknown'] as const) expect(d).not.toHaveTextContent(strings[k]);
    expect(accessSends).toHaveLength(1);
  });

  it('a PUT that lands after the first read: held through that read, then Saved once the rules read so, sent once', async () => {
    const d = await openDrawer(THIRD, 'accessLostLate');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    for (let n = 0; n < 4 && within(d).queryByText(strings['acc.held.private']); n++) {
      expect(d).not.toHaveTextContent(strings['acc.saved']);
      await checkIfShown(d);
    }
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(d).toHaveTextContent(strings['acc.now.private']);
    expect(accessSends).toHaveLength(1);
  });

  it('a lost answer, then someone else changed the rules: says it is not known whether yours went first, never "Saved"', async () => {
    const d = await openDrawer(THIRD, 'accessLostOther');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await checkIfShown(d);
    await within(d).findByText(strings['acc.movedUnknown'], undefined, SLOW);
    expect(d).not.toHaveTextContent(strings['acc.saved']);
    expect(d).toHaveTextContent(strings['acc.now.myIp'].replace('{{ip}}', '198.51.100.9'));
    expect(accessSends).toHaveLength(1);
  });

  it('Only my IP after the person moved: the new address is a change, saved over the read version', async () => {
    const d = await openPermissions(ATLAS, 'accessNewIp');
    await within(d).findByText(strings['acc.now.myIp'].replace('{{ip}}', '203.0.113.7'), undefined, SLOW);
    await within(d).findByText(/198\.51\.100\.4/, undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.save'] }));
    const c = await screen.findByRole('alertdialog');
    expect(c).toHaveTextContent(strings['acc.confirm.myIp'].replace('{{ip}}', '198.51.100.4'));
    await confirmIn(c);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(accessSends[0]).toMatchObject({ ifMatch: 'file:v4', body: { groups: { 'hub-my-ip': { range: '198.51.100.4/32' } } } });
  });

  it('the tab left and shown again while held: the result still shows once the rules prove it', async () => {
    const d = await openDrawer(THIRD, 'accessLostLate');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    const d2 = await leaveAndReturn(pageStrings);
    for (let n = 0; n < 4 && within(d2).queryByText(strings['acc.held.private']); n++) await checkIfShown(d2);
    await within(d2).findByText(strings['acc.saved'], undefined, SLOW);
    expect(accessSends).toHaveLength(1);
  });

  it('a lost answer that did write: Check again proves it from the rules and shows the new rule, never resends', async () => {
    const d = await openDrawer(THIRD, 'accessLostApplied');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    await within(d).findByText(strings['acc.held.private'], undefined, SLOW);
    await checkIfShown(d);
    await waitFor(() => expect(d).not.toHaveTextContent(strings['acc.held.private']), SLOW);
    await within(d).findByText(strings['acc.now.private'], undefined, SLOW);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(accessSends).toHaveLength(1);
  });

  it('after Saved, nothing says what applies until the project scope is read again too (the rules may come back first)', async () => {
    const d = await openDrawer(THIRD, 'accessScopeLate');
    await confirmIn(await pickAndSave(d, 'acc.private'));
    // The rules re-read answers at once, the scope's 1.5 s later: no Private yet, no Saved.
    await new Promise((r) => setTimeout(r, 400));
    expect(d).not.toHaveTextContent(strings['acc.now.private']);
    expect(d).not.toHaveTextContent(strings['acc.saved']);
    await within(d).findByText(strings['acc.saved'], undefined, SLOW);
    expect(d).toHaveTextContent(strings['acc.now.private']);
  });

  it('rules set elsewhere: says the Hub cannot change them without losing them, offers no Save', async () => {
    const d = await openPermissions(SECOND);
    await within(d).findByText(strings['acc.adv.cantChange'], { exact: false }, SLOW);
    expect(within(d).queryByRole('button', { name: strings['acc.save'] })).toBeNull();
  });
});
