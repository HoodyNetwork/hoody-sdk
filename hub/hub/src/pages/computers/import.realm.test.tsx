// A realm with no computer, whose account has computers in other realms, offers "Add one from another
// realm" beside Create. The picker lists the account's computers this realm does not hold; Next opens the existing
// Realms drawer for the pick with this realm ticked and its own realms kept, and only Save sends: one realm change,
// held (never shown as failed) when its answer is lost. All realms has nothing to import.
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import * as C from '@core/changes';
import { interpolate } from '@kit';
import { computers as fixtureComputers, importLanded, realmSends } from './fixtures';
import { importableRows } from './parts/Drawers';
import page from './page';
import strings from './strings.en.json';

const LAB = fixtureWorld.realm('Lab').id;
const PERSONAL = fixtureWorld.realm('Personal').id;
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

const openPicker = async (state = 'emptyElsewhere') => {
  await renderPage(page, { path: '/computers', state, realm: LAB });
  await userEvent.click(await screen.findByRole('button', { name: strings['zero.empty.import'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['importd.title'] });
};

describe('importableRows: only a known set of realms that lacks this one', () => {
  const row = (realm_ids: unknown) => ({ ...fixtureComputers[0]!, realm_ids }) as (typeof fixtureComputers)[number];
  it('offers no realm and other realms; never this realm, and never a missing, null or malformed set', () => {
    const none = row([]), other = row([PERSONAL]), here = row([LAB, PERSONAL]);
    expect(importableRows([none, other, here, row(undefined), row(null), row('x'), row([PERSONAL, 5])], LAB)).toEqual([none, other]);
  });
});

describe('computers: an empty realm takes a computer from another realm', () => {
  beforeEach(() => { realmSends.length = 0; importLanded.shown = true; delete importLanded.read; });

  it('offers it beside Create; the picker lists only computers outside this realm, with their realms', async () => {
    const d = await openPicker();
    expect(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 })).toHaveTextContent(interpolate(strings['importd.in'], { realms: 'Personal' }));
    const inLab = fixtureWorld.computers.filter((c) => c.realm_ids.includes(LAB)).map((c) => c.name);
    expect(inLab.length).toBeGreaterThan(0);
    for (const name of inLab) expect(within(d).queryByRole('radio', { name: new RegExp(`^${name}\\b`) })).toBeNull();
    // fjord is in no realm (the fixture). A realm host lists only its own computers (the API: an empty realm_ids on
    // a computer is "in no realm"), so fjord is not here and is offered, saying so.
    expect(within(d).getByRole('radio', { name: /^fjord\b/ })).toHaveTextContent(strings['importd.inNone']);
    expect(within(d).getByRole('button', { name: strings['importd.next'] })).toBeDisabled();
    expect(realmSends).toEqual([]);
  }, 40000);

  it('Next opens the Realms drawer with this realm ticked; only Save sends, once, keeping its other realms', async () => {
    const d = await openPicker();
    await userEvent.click(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 }));
    await userEvent.click(within(d).getByRole('button', { name: strings['importd.next'] }));
    const r = await screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) });
    expect(within(r).getByRole('checkbox', { name: /Lab/ })).toBeChecked();
    expect(within(r).getByRole('checkbox', { name: /Personal/ })).toBeChecked();
    expect(realmSends).toEqual([]);
    await userEvent.click(within(r).getByRole('button', { name: strings['realmsd.save'] }));
    await waitFor(() => expect(realmSends).toHaveLength(1));
    expect(realmSends[0]!.id).toBe(atlas.id);
    expect([...((realmSends[0]!.body as { realm_ids: string[] }).realm_ids)].sort()).toEqual([LAB, PERSONAL].sort());
  }, 40000);

  it('a computer in no realm can be picked: Next ticks only this realm, and Save sends exactly it, once', async () => {
    const fjord = fixtureWorld.computers.find((c) => c.name === 'fjord')!;
    // The Realms drawer reads the pick's realms fresh: the fixture answers that read with no realm, as the list does.
    importLanded.read = [];
    const d = await openPicker();
    await userEvent.click(await within(d).findByRole('radio', { name: /^fjord\b/ }, { timeout: 8000 }));
    await userEvent.click(within(d).getByRole('button', { name: strings['importd.next'] }));
    const r = await screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'fjord' }) });
    expect(within(r).getByRole('checkbox', { name: /Lab/ })).toBeChecked();
    expect(within(r).getByRole('checkbox', { name: /Personal/ })).not.toBeChecked();
    await userEvent.click(within(r).getByRole('button', { name: strings['realmsd.save'] }));
    await waitFor(() => expect(realmSends).toHaveLength(1));
    expect(realmSends[0]!.id).toBe(fjord.id);
    expect((realmSends[0]!.body as { realm_ids: string[] }).realm_ids).toEqual([LAB]);
  }, 40000);

  it('a lost answer is held in the drawer, never shown as failed, and Save waits', async () => {
    const d = await openPicker('emptyElsewhereLost');
    await userEvent.click(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 }));
    await userEvent.click(within(d).getByRole('button', { name: strings['importd.next'] }));
    const r = await screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) });
    await userEvent.click(within(r).getByRole('button', { name: strings['realmsd.save'] }));
    await waitFor(() => expect(realmSends).toHaveLength(1));
    await waitFor(() => expect(within(r).getByRole('button', { name: strings['realmsd.save'] })).toBeDisabled(), { timeout: 8000 });
    // The drawer shows the hold (the realm-change Held card) in place of the form.
    expect(within(r).queryByRole('checkbox', { name: /Lab/ })).toBeNull();
    expect(within(r).queryByText(/didn.t go through/i)).toBeNull();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  const saveAtlas = async (state: string) => {
    const d = await openPicker(state);
    await userEvent.click(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 }));
    await userEvent.click(within(d).getByRole('button', { name: strings['importd.next'] }));
    const title = interpolate(strings['realmsd.title'], { name: 'atlas' });
    const r = await screen.findByRole('dialog', { name: title });
    await userEvent.click(within(r).getByRole('button', { name: strings['realmsd.save'] }));
    await waitFor(() => expect(realmSends).toHaveLength(1));
    return { r, title };
  };

  it('a lost answer that did go through: core\'s own read-back proves it and the drawer closes, with no press and one send', async () => {
    const { title } = await saveAtlas('emptyElsewhereLanded');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull(), { timeout: 8000 });
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('a lost answer proved only later: the hold stays until Check again reads it, then the drawer closes; one send', async () => {
    importLanded.shown = false;
    const { r, title } = await saveAtlas('emptyElsewhereLanded');
    const check = await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    importLanded.shown = true;
    await userEvent.click(check);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull(), { timeout: 8000 });
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('Dismiss anyway on the hold keeps the drawer open on its form (the person says it did not go through)', async () => {
    const d = await openPicker('emptyElsewhereLost');
    await userEvent.click(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 }));
    await userEvent.click(within(d).getByRole('button', { name: strings['importd.next'] }));
    const title = interpolate(strings['realmsd.title'], { name: 'atlas' });
    const r = await screen.findByRole('dialog', { name: title });
    await userEvent.click(within(r).getByRole('button', { name: strings['realmsd.save'] }));
    await userEvent.click(await within(r).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    expect(await within(screen.getByRole('dialog', { name: title })).findByRole('checkbox', { name: /Lab/ }, { timeout: 8000 })).toBeInTheDocument();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('your own Dismiss is never read as proof: the drawer keeps its form even when the computer reads as the sent set', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    importLanded.read = [LAB, PERSONAL];
    await userEvent.click(await within(r).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    expect(await within(screen.getByRole('dialog', { name: title })).findByRole('checkbox', { name: /Lab/ }, { timeout: 8000 })).toBeInTheDocument();
    await new Promise((res) => setTimeout(res, 500));
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('a reopen whose fresh read fails offers Retry and keeps no earlier row pickable', async () => {
    let d = await openPicker('emptyElsewhereFlaky');
    expect(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['importd.title'] })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: strings['zero.empty.import'] }));
    d = await screen.findByRole('dialog', { name: strings['importd.title'] });
    expect(await within(d).findByRole('button', { name: /retry|try again/i }, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).getByRole('button', { name: strings['importd.next'] })).toBeDisabled();
  }, 40000);

  it('a reopen whose fresh read is still on its way shows no earlier row and keeps Next off', async () => {
    let d = await openPicker('emptyElsewhereSlowReopen');
    await userEvent.click(await within(d).findByRole('radio', { name: /atlas/ }, { timeout: 8000 }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['importd.title'] })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: strings['zero.empty.import'] }));
    d = await screen.findByRole('dialog', { name: strings['importd.title'] });
    await new Promise((r) => setTimeout(r, 300));
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).getByRole('button', { name: strings['importd.next'] })).toBeDisabled();
  }, 40000);

  it('a hold that ends without proof (freed in another view) is not proof: the drawer stays, its form starts from the realms read now', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    // Another tab's warned Dismiss: the shared hold is gone, nothing here proved the change.
    await act(async () => { C.resetChanges(); });
    const box = await within(screen.getByRole('dialog', { name: title })).findByRole('checkbox', { name: /Lab/ }, { timeout: 8000 });
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    expect(box).toBeChecked();
    expect(within(screen.getByRole('dialog', { name: title })).getByRole('checkbox', { name: /Personal/ })).toBeChecked();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('after a hold ends unproved, a computer moved since gives the form its new baseline: nothing old is left to send', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    importLanded.read = [LAB];
    await act(async () => { C.resetChanges(); });
    const d = screen.getByRole('dialog', { name: title });
    await waitFor(() => expect(within(d).getByRole('checkbox', { name: /Personal/ })).not.toBeChecked(), { timeout: 8000 });
    expect(within(d).getByRole('checkbox', { name: /Lab/ })).toBeChecked();
    // The form equals what the computer has now: Save has nothing to send.
    expect(within(d).getByRole('button', { name: strings['realmsd.save'] })).toBeDisabled();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('after a hold ends unproved, a computer read that fails closes the drawer, with no claim and nothing sent again', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    importLanded.read = 'fail';
    await act(async () => { C.resetChanges(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull(), { timeout: 8000 });
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('while the read after an end is out, the form is locked: Save cannot send the proved set again', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    importLanded.read = { slow: [LAB, PERSONAL], ms: 1500 };
    await act(async () => { C.resetChanges(); });
    const d = screen.getByRole('dialog', { name: title });
    const save = await within(d).findByRole('button', { name: strings['realmsd.save'] }, { timeout: 8000 });
    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(realmSends).toHaveLength(1);
    // The read shows exactly the sent set: proof, the drawer closes; still one send.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull(), { timeout: 8000 });
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('a read still out when the drawer closes and reopens on the same computer touches nothing in the new drawer', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    importLanded.read = { slow: [LAB, PERSONAL], ms: 5000 };
    await act(async () => { C.resetChanges(); });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull(), { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: strings['zero.empty.import'] }));
    const p = await screen.findByRole('dialog', { name: strings['importd.title'] });
    await userEvent.click(await within(p).findByRole('radio', { name: /atlas/ }, { timeout: 8000 }));
    await userEvent.click(within(p).getByRole('button', { name: strings['importd.next'] }));
    const again = await screen.findByRole('dialog', { name: title });
    // Past the old read's answer (5 s after it was sent).
    await new Promise((res) => setTimeout(res, 5500));
    expect(screen.getByRole('dialog', { name: title })).toBe(again);
    expect(within(again).getByRole('button', { name: strings['realmsd.save'] })).toBeEnabled();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('a read naming one realm twice is not proof of two: the drawer stays on the realms it names', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    importLanded.read = [LAB, LAB];
    await act(async () => { C.resetChanges(); });
    const d = screen.getByRole('dialog', { name: title });
    await waitFor(() => expect(within(d).getByRole('checkbox', { name: /Personal/ })).not.toBeChecked(), { timeout: 8000 });
    expect(within(d).getByRole('checkbox', { name: /Lab/ })).toBeChecked();
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('a read whose realm list holds a non-id is no answer: the drawer closes with no claim, nothing sent again', async () => {
    const { r, title } = await saveAtlas('emptyElsewhereLost');
    await within(r).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    importLanded.read = 'malformed';
    await act(async () => { C.resetChanges(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull(), { timeout: 8000 });
    expect(realmSends).toHaveLength(1);
  }, 40000);

  it('a list that is not whole says so', async () => {
    const more = await openPicker('emptyElsewhereMore');
    expect(await within(more).findByText(strings['importd.more'], undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  it('an unreadable list offers Retry and no computer', async () => {
    const down = await openPicker('emptyElsewhereDown');
    expect(await within(down).findByRole('button', { name: /retry|try again/i }, { timeout: 8000 })).toBeInTheDocument();
    expect(within(down).queryByRole('radio')).toBeNull();
    expect(within(down).getByRole('button', { name: strings['importd.next'] })).toBeDisabled();
  }, 40000);

  it('on All realms every computer already shows: no import offer', async () => {
    await renderPage(page, { path: '/computers', state: 'emptyElsewhere', realm: 'all' });
    await screen.findByText(strings['zero.empty.title'], undefined, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: strings['zero.empty.import'] })).toBeNull();
  }, 40000);
});

// The subtitle is one line (no numbered steps), and Next sits in the drawer's own footer with Cancel.
describe('computers: the Add from another realm drawer', () => {
  it('says what to do in one line and puts Next and Cancel in its footer', async () => {
    const d = await openPicker();
    expect(strings['importd.lede']).not.toMatch(/\n|^1\./);
    expect(within(d).getByText(strings['importd.lede'])).toBeInTheDocument();
    expect(strings['importd.lede']).toMatch(/already ticked/);
    const footer = d.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole('button', { name: strings['importd.next'] })).toBeDisabled();
    await userEvent.click(within(footer as HTMLElement).getByRole('button', { name: /^Cancel$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['importd.title'] })).toBeNull());
  }, 40000);
});
