// The write side of Shared folders on real core (fixture transport): Share a folder, Turn off / Turn on,
// the access change, Try again and Stop sharing. Each is sent once; an answer that does not come back is held as "may
// have gone through" with Check again, which only reads; a question acts only on the share it was opened for; a
// session that may not write sees no change at all.
import { bootFixtureCore, queryClient, type FixtureRule } from '@core';
import kitStrings from '@kit/strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a test harness for the section, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ATLAS_ID, CEDAR_ID, shareRules, shareStates, shareWire, type ShareRulesOpts } from './fixtures';
import { useFilesComputers } from '../data';
import { useShareWrites } from './manage';
import { ShareDialog } from './ShareDialog';
import { SharesSection } from './SharesSection';
import type { ShareList } from './wire';
import strings from './strings.en.json';

const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
const show = (node: ReactElement, rules: FixtureRule[]) => {
  bootFixtureCore({ rules });
  return render(routed(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>));
};
const toCedar = (w: Record<string, unknown>) => ({ ...w, target_computer_id: CEDAR_ID });
const ATLAS = { id: ATLAS_ID };
const WAIT = { timeout: 8000 };
const table = (name: string) => screen.findByRole('table', { name }, WAIT);
const rowOf = async (text: string) => (await within(await table(strings['given.title'])).findAllByText(text, undefined, WAIT))[0]!.closest('tr') as HTMLElement;
async function openMenu(row: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  return screen.findByRole('menu');
}
async function pick(row: HTMLElement, label: string): Promise<void> {
  await userEvent.click(within(await openMenu(row)).getByRole('menuitem', { name: label }));
}
const setup = (opts: ShareRulesOpts = {}, shares: Record<string, unknown>[] = [toCedar(shareStates.on)]) => {
  const sent: string[] = [];
  show(<SharesSection computer={ATLAS} canWrite />, shareRules({ shares, sent, ...opts }));
  return sent;
};
/** Types into the folder field, then closes its list of folders (Escape closes the list only), as a person moving on does. */
async function typeFolder(box: HTMLElement, text: string): Promise<void> {
  await userEvent.type(box, text);
  if (box.getAttribute('aria-expanded') === 'true') await userEvent.keyboard('{Escape}');
}
/** Chooses cedar in the open computer picker (its list is a dialog named as the field). */
async function pickCedar(): Promise<void> {
  const list = await screen.findByRole('dialog', { name: strings['new.with'] }, WAIT);
  await userEvent.click(within(list).getByText('cedar'));
}
const DEEP = 'open-share-link';
const writesOf = (sent: string[]) => sent.map((s) => s.split(' ')[0]);
/** Fills Share a folder for /srv/data (typed below the top folder, as the folder field takes it) with cedar and presses Share folder. */
async function shareData(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: strings['act.share'] }, WAIT));
  const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
  await typeFolder(within(dialog).getByRole('combobox', { name: strings['new.folder'] }), 'srv/data');
  await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
  await pickCedar();
  await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
}

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

describe('a session that may not write', () => {
  it('sees the lists with no Share a folder and no change in any menu', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [toCedar(shareStates.readWrite)] }));
    const row = await rowOf('/srv/data');
    expect(screen.queryByRole('button', { name: strings['act.share'] })).toBeNull();
    const menu = await openMenu(row);
    for (const k of ['act.turnOff', 'act.turnOn', 'act.readOnly', 'act.readWrite', 'act.tryAgain', 'act.stop'] as const) expect(within(menu).queryByRole('menuitem', { name: strings[k] })).toBeNull();
  }, 40000);
});

describe('Share a folder', () => {
  it('says why it cannot be sent yet, sends once with read only by default, and the new share shows in the list', async () => {
    const sent = setup();
    await userEvent.click(await screen.findByRole('button', { name: strings['act.share'] }, WAIT));
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
    // Nothing typed: the foot says what is missing, and the primary does nothing.
    expect(within(dialog).getAllByText(strings['why.empty']).length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    expect(sent).toEqual([]);
    const box = within(dialog).getByRole('combobox', { name: strings['new.folder'] });
    await typeFolder(box, 'hoody/shares/x-0123abcd');
    expect(within(dialog).getAllByText(strings['why.received']).length).toBeGreaterThan(0);
    await userEvent.clear(box);
    await typeFolder(box, 'srv/data/');
    expect(within(dialog).getAllByText(strings['why.target']).length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
    await pickCedar();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    expect(await rowOf('/srv/data')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBe(`POST /computers/${ATLAS_ID}/storage/shares ${JSON.stringify({ source_path: '/srv/data', mode: 'readonly', target_computer_id: CEDAR_ID })}`);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.title'] })).toBeNull(), WAIT);
  }, 60000);

  it('read and write is chosen with its warning, and a folder already shared with that computer is not offered again', async () => {
    const sent = setup();
    await userEvent.click(await screen.findByRole('button', { name: strings['act.share'] }, WAIT));
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
    await typeFolder(within(dialog).getByRole('combobox', { name: strings['new.folder'] }), 'home/ada/projects');
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
    await pickCedar();
    expect(within(dialog).getAllByText(strings['why.exists'].replace('{{to}}', 'cedar')).length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    expect(sent).toEqual([]);
    await typeFolder(within(dialog).getByRole('combobox', { name: strings['new.folder'] }), '2');
    expect(within(dialog).queryByText(/can change and delete/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('radio', { name: strings['access.readwrite'] }));
    expect(within(dialog).getByText(strings['new.rwWarn'].replace('{{to}}', 'cedar').replace('{{from}}', 'atlas'))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    await waitFor(() => expect(sent).toHaveLength(1), WAIT);
    expect(sent[0]).toContain('"mode":"readwrite"');
  }, 60000);

  it('an answer that is lost is held: never sent again, Check again only reads, and a list that shows the share frees it', async () => {
    const sent = setup({ create: 'lostApplied' });
    await shareData();
    const held = strings['held.create'].replace('{{path}}', '/srv/data').replace('{{to}}', 'cedar');
    expect((await screen.findAllByText(held, undefined, WAIT)).length).toBeGreaterThan(0);
    expect(writesOf(sent)).toEqual(['POST']);
    // The form is gone: no second Share folder while the first may have gone through.
    const dialog = screen.getByRole('dialog', { name: strings['new.title'] });
    expect(within(dialog).queryByRole('button', { name: strings['new.go'] })).toBeNull();
    expect(within(dialog).queryByRole('combobox', { name: strings['new.folder'] })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    await waitFor(() => expect(screen.queryByText(held)).toBeNull(), WAIT);
    expect(writesOf(sent)).toEqual(['POST']);
  }, 60000);

  it('a lost answer the lists do not show stays held: Check again sends nothing and no other change is offered', async () => {
    const sent = setup({ create: 'lost' });
    await shareData();
    const held = strings['held.create'].replace('{{path}}', '/srv/data').replace('{{to}}', 'cedar');
    expect((await screen.findAllByText(held, undefined, WAIT)).length).toBeGreaterThan(0);
    const dialog = screen.getByRole('dialog', { name: strings['new.title'] });
    await userEvent.click(within(dialog).getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.getAllByText(held).length).toBeGreaterThan(0);
    expect(writesOf(sent)).toEqual(['POST']);
    await userEvent.keyboard('{Escape}');
    const item = within(await openMenu(await rowOf('/home/ada/projects'))).getByRole('menuitem', { name: new RegExp(strings['act.turnOff']) });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  }, 60000);

  it('a refusal the Hub knows is said in its own words, and nothing is held', async () => {
    const sent = setup({ create: [400, 'SERVER_STORAGE_SHARE_LIMIT'] });
    await shareData();
    expect(await screen.findByText(strings['err.limit'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/may have gone through/)).toBeNull();
    expect(writesOf(sent)).toEqual(['POST']);
  }, 60000);

  it('a 409 without the one definite code is held as unknown, never shown as failed', async () => {
    setup({ create: [409, 'CONFLICT'] });
    await shareData();
    const held = strings['held.create'].replace('{{path}}', '/srv/data').replace('{{to}}', 'cedar');
    expect((await screen.findAllByText(held, undefined, WAIT)).length).toBeGreaterThan(0);
  }, 60000);
});

describe('what a create is bound to', () => {
  const held = strings['held.create'].replace('{{path}}', '/srv/data').replace('{{to}}', 'cedar');
  /** Opens Share a folder for /srv/data with cedar chosen, nothing pressed yet. */
  async function fill(access: 'readonly' | 'readwrite' = 'readonly'): Promise<HTMLElement> {
    await userEvent.click(await screen.findByRole('button', { name: strings['act.share'] }, WAIT));
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
    await typeFolder(within(dialog).getByRole('combobox', { name: strings['new.folder'] }), 'srv/data');
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
    await pickCedar();
    if (access === 'readwrite') await userEvent.click(within(dialog).getByRole('radio', { name: strings['access.readwrite'] }));
    return dialog;
  }

  it('a share made elsewhere since the list was read is found by the read just before the send: nothing is sent', async () => {
    const control: NonNullable<ShareRulesOpts['control']> = {};
    const sent = setup({ control });
    const dialog = await fill();
    expect(within(dialog).queryByText(strings['why.exists'].replace('{{to}}', 'cedar'))).toBeNull();
    control.add!(toCedar(shareWire({ id: 'sh_else', source_path: '/srv/data' })));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    expect((await within(dialog).findAllByText(strings['why.exists'].replace('{{to}}', 'cedar'), undefined, WAIT)).length).toBeGreaterThan(0);
    expect(sent).toEqual([]);
  }, 60000);

  it('when what the computer shares cannot be read just before, nothing is sent and the dialog says so', async () => {
    const control: NonNullable<ShareRulesOpts['control']> = {};
    const sent = setup({ control });
    const dialog = await fill();
    control.failLists!(true);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    expect(await within(dialog).findByText(strings['new.unread'].replace('{{name}}', 'atlas'), undefined, WAIT)).toBeInTheDocument();
    expect(sent).toEqual([]);
    expect(screen.queryByText(held)).toBeNull();
  }, 60000);

  it('a lost create is freed only by a new share with the access that was asked', async () => {
    const control: NonNullable<ShareRulesOpts['control']> = {};
    const sent = setup({ create: 'lost', control });
    const dialog = await fill('readwrite');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    expect((await screen.findAllByText(held, undefined, WAIT)).length).toBeGreaterThan(0);
    // A read-only share of that folder to cedar turns up: not what was asked, so it stays held.
    control.add!(toCedar(shareWire({ id: 'sh_ro', source_path: '/srv/data' })));
    await userEvent.click(within(dialog).getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.getAllByText(held).length).toBeGreaterThan(0);
    // A new read-and-write one does.
    control.add!(toCedar(shareWire({ id: 'sh_rw', source_path: '/srv/data', mode: 'readwrite' })));
    await userEvent.click(within(dialog).getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    await waitFor(() => expect(screen.queryByText(held)).toBeNull(), WAIT);
    expect(writesOf(sent)).toEqual(['POST']);
  }, 60000);

  it('a folder link opens Share a folder while another change is held, but it cannot be sent', async () => {
    const sent: string[] = [];
    function Deep() {
      const [p, setP] = useState<string | undefined>(undefined);
      return (
        <>
          <button type="button" onClick={() => setP('srv/data')}>{DEEP}</button>
          <SharesSection computer={ATLAS} canWrite {...(p === undefined ? {} : { sharePath: p })} onShareClosed={() => setP(undefined)} />
        </>
      );
    }
    show(<Deep />, shareRules({ shares: [toCedar(shareStates.off)], sent, change: 'lost' }));
    await pick(await rowOf('/home/ada/projects'), strings['act.turnOn']);
    expect(await screen.findByText(strings['held.setEnabled.on'].replace('{{path}}', '/home/ada/projects'), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: DEEP }));
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
    await pickCedar();
    expect(within(dialog).getAllByText(strings['act.wait']).length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(writesOf(sent)).toEqual(['PATCH']);
  }, 60000);

  it('a change that starts while the read before the send is out stops the send', async () => {
    const sent: string[] = [];
    let release: (r: { list?: ShareList }) => void = () => undefined;
    let gate: (w: string | null) => void = () => undefined;
    function Gate() {
      const computers = useFilesComputers();
      const [wait, setWait] = useState<string | null>(null);
      gate = setWait;
      const w = useShareWrites({ rows: [], computers: computers.rows ?? [], onChanged: () => undefined });
      const atlas = computers.rows?.find((c) => c.id === ATLAS_ID);
      if (!atlas) return null;
      return <ShareDialog isOpen onClose={() => undefined} source={atlas} path="srv/data" computers={computers.rows ?? []} given={[]} readGiven={() => new Promise((r) => { release = r; })} create={w.create} wait={wait} own onShared={() => undefined} />;
    }
    show(<Gate />, shareRules({ sent }));
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
    await pickCedar();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    act(() => gate(strings['act.wait']));
    await act(async () => { release({ list: { rows: [], dropped: 0, of: `given:${ATLAS_ID}` } }); await new Promise((r) => setTimeout(r, 300)); });
    expect(sent).toEqual([]);
  }, 60000);

  it('the access cannot be changed while the read before the send is out: what is shown is what is sent', async () => {
    const sent: string[] = [];
    let release: (r: { list?: ShareList }) => void = () => undefined;
    function Pending() {
      const computers = useFilesComputers();
      const w = useShareWrites({ rows: [], computers: computers.rows ?? [], onChanged: () => undefined });
      const atlas = computers.rows?.find((c) => c.id === ATLAS_ID);
      if (!atlas) return null;
      return <ShareDialog isOpen onClose={() => undefined} source={atlas} path="srv/data" computers={computers.rows ?? []} given={[]} readGiven={() => new Promise((r) => { release = r; })} create={w.create} wait={null} own onShared={() => undefined} />;
    }
    show(<Pending />, shareRules({ sent }));
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] }, WAIT);
    await userEvent.click(within(dialog).getByRole('button', { name: new RegExp(strings['new.with']) }));
    await pickCedar();
    await userEvent.click(within(dialog).getByRole('radio', { name: strings['access.readwrite'] }));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['new.go'] }));
    const ro = within(dialog).getByRole('radio', { name: strings['access.readonly'] });
    const rw = within(dialog).getByRole('radio', { name: strings['access.readwrite'] });
    expect(ro).toBeDisabled();
    await userEvent.click(ro);
    expect(rw).toBeChecked();
    await act(async () => { release({ list: { rows: [], dropped: 0, of: `given:${ATLAS_ID}` } }); await new Promise((r) => setTimeout(r, 300)); });
    await waitFor(() => expect(writesOf(sent)).toEqual(['POST']), WAIT);
    expect(sent[0]).toContain('"mode":"readwrite"');
  }, 60000);
});

describe('changing a share', () => {
  it('Turn off asks first, sends once, and the share reads Off; Turn on sends at once', async () => {
    const sent = setup();
    await pick(await rowOf('/home/ada/projects'), strings['act.turnOff']);
    const ask = await screen.findByRole('alertdialog', { name: strings['off.title'] }, WAIT).catch(() => screen.findByRole('dialog', { name: strings['off.title'] }));
    expect(sent).toEqual([]);
    await userEvent.click(within(ask).getByRole('button', { name: strings['off.go'] }));
    await waitFor(async () => expect(within(await rowOf('/home/ada/projects')).getByText(strings['pill.off'])).toBeInTheDocument(), WAIT);
    expect(sent).toEqual([`PATCH /computers/${ATLAS_ID}/storage/shares/sh_0001 {"enabled":false}`]);
    await pick(await rowOf('/home/ada/projects'), strings['act.turnOn']);
    await waitFor(() => expect(sent).toHaveLength(2), WAIT);
    expect(sent[1]).toContain('{"enabled":true}');
  }, 60000);

  it('a lost Turn off is held on its share: the row says so, Check again only reads, a proving list frees it', async () => {
    const sent = setup({ change: 'lostApplied' });
    await pick(await rowOf('/home/ada/projects'), strings['act.turnOff']);
    await userEvent.click(await screen.findByRole('button', { name: strings['off.go'] }, WAIT));
    const held = strings['held.setEnabled.off'].replace('{{path}}', '/home/ada/projects');
    expect(await screen.findByText(held, undefined, WAIT)).toBeInTheDocument();
    expect(writesOf(sent)).toEqual(['PATCH']);
    await userEvent.click(screen.getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    await waitFor(() => expect(screen.queryByText(held)).toBeNull(), WAIT);
    expect(writesOf(sent)).toEqual(['PATCH']);
  }, 60000);

  it('a 409 on a change is held, and while it is the row reads "not sure" and offers no other change', async () => {
    const sent = setup({ change: [409, 'CONFLICT'] });
    await pick(await rowOf('/home/ada/projects'), strings['act.turnOff']);
    await userEvent.click(await screen.findByRole('button', { name: strings['off.go'] }, WAIT));
    expect(await screen.findByText(strings['held.setEnabled.off'].replace('{{path}}', '/home/ada/projects'), undefined, WAIT)).toBeInTheDocument();
    const row = await rowOf('/home/ada/projects');
    expect(within(row).getByText(strings['pill.unsure'])).toBeInTheDocument();
    expect(within(await openMenu(row)).getByRole('menuitem', { name: new RegExp(strings['act.stop'].replace('…', '')) })).toHaveAttribute('aria-disabled', 'true');
    expect(writesOf(sent)).toEqual(['PATCH']);
  }, 60000);

  it('Allow writing asks with the warning and sends the access; Make read only the other way', async () => {
    const sent = setup();
    await pick(await rowOf('/home/ada/projects'), strings['act.readWrite']);
    expect(await screen.findByText(strings['rw.body'].replace(/{{to}}/g, 'cedar').replace('{{path}}', '/home/ada/projects').replace('{{from}}', 'atlas'), undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['rw.go'] }));
    await waitFor(async () => expect(within(await rowOf('/home/ada/projects')).getByText(strings['access.readwrite'])).toBeInTheDocument(), WAIT);
    expect(sent).toEqual([`PATCH /computers/${ATLAS_ID}/storage/shares/sh_0001 {"mode":"readwrite"}`]);
    await pick(await rowOf('/home/ada/projects'), strings['act.readOnly']);
    await userEvent.click(await screen.findByRole('button', { name: strings['ro.go'] }, WAIT));
    await waitFor(() => expect(sent).toHaveLength(2), WAIT);
    expect(sent[1]).toContain('{"mode":"readonly"}');
  }, 60000);

  it('Try again is offered on a failed share only and turns it on again', async () => {
    const sent = setup({}, [toCedar(shareStates.on), toCedar(shareStates.failed)]);
    const ok = await openMenu(await rowOf('/home/ada/projects'));
    expect(within(ok).queryByRole('menuitem', { name: strings['act.tryAgain'] })).toBeNull();
    await userEvent.keyboard('{Escape}');
    const failed = (await within(await table(strings['given.title'])).findAllByText(strings['pill.failed']))[0]!.closest('tr') as HTMLElement;
    await pick(failed, strings['act.tryAgain']);
    await waitFor(() => expect(sent).toHaveLength(1), WAIT);
    expect(sent[0]).toBe(`PATCH /computers/${ATLAS_ID}/storage/shares/sh_0004 {"enabled":true}`);
  }, 60000);
});

describe('Stop sharing', () => {
  it('asks with what a read-and-write share leaves behind, sends once, and the share leaves the list', async () => {
    const sent = setup({}, [toCedar(shareStates.readWrite), toCedar(shareStates.on)]);
    await pick(await rowOf('/srv/data'), strings['act.stop']);
    expect(await screen.findByText(strings['stop.bodyRw'].replace(/{{to}}/g, 'cedar').replace('{{from}}', 'atlas'), undefined, WAIT)).toBeInTheDocument();
    expect(sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: strings['stop.go'] }));
    await waitFor(() => expect(screen.queryByText('/srv/data')).toBeNull(), WAIT);
    expect(sent).toEqual(['DELETE /storage/shares/sh_0002 null']);
  }, 60000);

  it('a lost stop is held; a list still holding the share proves nothing, one without it frees the hold', async () => {
    const sent = setup({ stop: 'lost' });
    await pick(await rowOf('/home/ada/projects'), strings['act.stop']);
    await userEvent.click(await screen.findByRole('button', { name: strings['stop.go'] }, WAIT));
    const held = strings['held.stop'].replace('{{path}}', '/home/ada/projects');
    expect(await screen.findByText(held, undefined, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: kitStrings['outcome.pending.check'] }));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.getByText(held)).toBeInTheDocument();
    expect(writesOf(sent)).toEqual(['DELETE']);
  }, 60000);

  it('a question closes unsent when its share changes under it', async () => {
    let flip = false;
    const sent: string[] = [];
    const rules = shareRules({ sent, shares: [toCedar(shareStates.on)] });
    const off = shareRules({ shares: [toCedar(shareWire({ enabled: false }))] });
    // The lists answer the share as on until `flip`, then as turned off elsewhere.
    show(<SharesSection computer={ATLAS} canWrite />, rules.map((r, i) => (i < 4 ? { ...r, answer: ((q: never) => (flip ? (off[i]!.answer as (q: never) => unknown)(q) : (r.answer as (q: never) => unknown)(q))) as never } : r)));
    await pick(await rowOf('/home/ada/projects'), strings['act.turnOff']);
    const go = await screen.findByRole('button', { name: strings['off.go'] }, WAIT);
    flip = true;
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['off.go'] })).toBeNull(), WAIT);
    expect(go).not.toBeInTheDocument();
    expect(sent).toEqual([]);
  }, 60000);
});
