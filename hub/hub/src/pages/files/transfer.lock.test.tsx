// Vitest: the Copy / Move send path below the dialog (data.ts useFilesChange). The dialog never offers these sends, so
// the hook is called directly: a destination at or inside the item is never sent, and while a change on a computer
// is out or may have gone through, core's lock (keyed by the computer, data.ts filesLockKey) refuses every other
// change there, whatever its paths (C9: never twice, never over a change not yet proved). Core admits under its
// cross-tab lock, so this holds across tabs too (core changes.crosstab.test.ts proves that admission).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import * as Data from './data';
import { resetFiles, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const h = vi.hoisted(() => ({
  hooks: {} as Record<string, { run: (v: unknown) => Promise<{ outcome: string; code?: string }> }>, vars: null as unknown, runs: 0,
  olderHolds: [] as unknown[], noVerdict: false,
}));
// Holds an earlier build filed under its per-path key (not under this build's lock key): added to core's list.
vi.mock('@core', async (importOriginal) => {
  const m = await importOriginal<typeof Core>();
  return { ...m, heldChanges: (...a: Parameters<typeof m.heldChanges>) => [...m.heldChanges(...a), ...h.olderHolds] as never };
});
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useFilesChange: (kind: Data.ChangeKind) => {
      const real = m.useFilesChange(kind);
      const wrapped = { ...real, run: (v: Data.ChangeVars) => { if (kind === 'copy') { h.runs += 1; if (!h.vars) h.vars = v; } return real.run(v); } };
      h.hooks[kind] = wrapped as never;
      return wrapped;
    },
    // A read-back settled in another tab: this tab saw no verdict.
    verdictOf: (id: unknown) => (h.noVerdict ? undefined : m.verdictOf(id)),
  };
});

const ONE_AT_A_TIME = ['READ_BACK_FIRST', 'HELD_BY_OTHER', 'BUSY'];
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const pane = () => screen.findByRole('region', { name: strings['pane.a'] });
const row = async (name: RegExp) => within(await within(await pane()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) })).findByRole('row', { name });

beforeEach(() => { resetFiles(); h.hooks = {}; h.vars = null; h.runs = 0; h.olderHolds = []; h.noVerdict = false; });

async function lostCopy() {
  await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp', state: 'transferHeld' });
  await userEvent.click(within(await row(/notes\.txt/)).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
  const d = await screen.findByRole('dialog');
  await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
  expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
  return h.vars as Data.ChangeVars;
}

describe('the copy / move send path', () => {
  it('two presses in one moment ask the send path once (the dialog guards it, not only core)', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp', state: 'transferHeld' });
    await userEvent.click(within(await row(/notes\.txt/)).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
    const d = await screen.findByRole('dialog');
    const go = await within(d).findByRole('button', { name: ts['copy.primary'] });
    act(() => { fireEvent.click(go); fireEvent.click(go); });
    expect(await within(d).findByText(/may have gone through/i)).toBeInTheDocument();
    expect(h.runs).toBe(1);
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, 20_000);

  it('never sends a destination at or inside the item, nor one that is no whole path', async () => {
    // A copy that is done holds nothing: the send path's own checks answer, not core's lock.
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp' });
    await userEvent.click(within(await row(/notes\.txt/)).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
    await userEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const v = h.vars as Data.ChangeVars;
    resetFiles();
    for (const dest of ['/home/ada/report.pdf', '/home/ada/report.pdf/x', 'tmp/x', '/tmp//x', '/tmp/../etc/x', '/', '']) {
      let r: { outcome: string; code?: string } | undefined;
      await act(async () => { r = await h.hooks.move!.run({ ...v, path: '/home/ada/report.pdf', dest }); });
      expect([r?.outcome, r?.code], dest).toEqual(['not_sent', 'NOT_ADDRESSABLE']);
    }
    // A folder copy never goes into the folder itself either, whatever the dialog let through.
    for (const dest of ['/home/ada/projects', '/home/ada/projects/site/projects']) {
      let r: { outcome: string; code?: string } | undefined;
      await act(async () => { r = await h.hooks.copy!.run({ ...v, path: '/home/ada/projects', dest, dir: true }); });
      expect([r?.outcome, r?.code], dest).toEqual(['not_sent', 'NOT_ADDRESSABLE']);
    }
    expect(sentChanges).toEqual([]);
  }, 20_000);

  it('a path over 4,096 bytes (Linux PATH_MAX) is refused unsent, never held: no request reaches the computer', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp' });
    await within(await pane()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
    // Eight parts of 256 three-byte characters: each part is one the old per-depth routes sent, the whole is not.
    const long = '/' + Array.from({ length: 8 }, () => '\u20ac'.repeat(256)).join('/');
    const v = { c: { id: 'atlas.00a1', name: 'atlas', project_id: 'p', server_name: 's' } } as unknown as Data.ChangeVars;
    const tries: [Data.ChangeKind, Partial<Data.ChangeVars>][] = [
      ['delete', { path: long }], ['rename', { path: long, to: 'n.txt' }], ['mkdir', { path: long }],
      ['copy', { path: long, dest: '/tmp/x' }], ['move', { path: long, dest: '/tmp/x' }],
    ];
    for (const [kind, more] of tries) {
      expect(h.hooks[kind], kind).toBeDefined();
      let r: { outcome: string; code?: string } | undefined;
      await act(async () => { r = await h.hooks[kind]!.run({ ...v, ...more }); });
      expect([r?.outcome, r?.code], kind).toEqual(['not_sent', 'NOT_ADDRESSABLE']);
    }
    expect(sentChanges).toEqual([]);
    expect(Data.uploadCall(v.c as never, long)).toBeNull();
  }, 20_000);

  it('a rename whose new path would pass 4,096 bytes is refused unsent too (the new name rides the body)', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp' });
    await within(await pane()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
    // The item itself fits (3,850 bytes); with a 256-character three-byte name beside it, the new path is 4,613.
    const folder = '/' + Array.from({ length: 5 }, () => '\u20ac'.repeat(256)).join('/');
    const v = { c: { id: 'atlas.00a1', name: 'atlas', project_id: 'p', server_name: 's' }, path: folder + '/x.txt', to: '\u20ac'.repeat(256) } as unknown as Data.ChangeVars;
    let r: { outcome: string; code?: string } | undefined;
    await act(async () => { r = await h.hooks.rename!.run(v); });
    expect([r?.outcome, r?.code]).toEqual(['not_sent', 'NOT_ADDRESSABLE']);
    expect(sentChanges).toEqual([]);
    // Only the length counts for the new name: one the path params could not carry ('%') still reaches the send path.
    await act(async () => { r = await h.hooks.rename!.run({ ...v, path: '/home/ada/notes.txt', to: '50%.txt' }); });
    expect(r?.code).not.toBe('NOT_ADDRESSABLE');
  }, 20_000);

  it('while a copy may have gone through, core refuses every other change on that computer, whatever its paths', async () => {
    const v = await lostCopy();
    const tries: [Data.ChangeKind, Partial<Data.ChangeVars>][] = [
      ['delete', { path: '/tmp/notes.txt' }], ['rename', { path: '/tmp/notes.txt', to: 'n.txt' }], ['delete', { path: '/home/ada', dir: true }],
      ['delete', { path: '/tmp', dir: true }], ['mkdir', { path: '/tmp/notes.txt/x' }], ['mkdir', { path: '/srv/new' }],
      ['rename', { path: '/home/ada/report.pdf', to: 'r.pdf' }],
    ];
    for (const [kind, more] of tries) {
      let r: { outcome: string; code?: string } | undefined;
      await act(async () => { r = await h.hooks[kind]!.run({ c: v.c, dir: false, size: 1, modified: 1, ...more } as Data.ChangeVars); });
      expect(r?.outcome, `${kind} ${more.path}`).toBe('not_sent');
      expect(ONE_AT_A_TIME, `${kind} ${more.path}`).toContain(r?.code);
    }
    // Another computer is another lock: its change is sent (this fixture's other computer refuses it, 403).
    let other: { outcome: string } | undefined;
    await act(async () => { other = await h.hooks.mkdir!.run({ c: { ...v.c, id: 'c-other' }, path: '/srv/new' } as Data.ChangeVars); });
    expect(other?.outcome).not.toBe('not_sent');
    expect(sentChanges.filter((x) => !x.startsWith('mkdir'))).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, 20_000);

  it('every change on a computer has one lock key, the computer alone', () => {
    const c = { id: 'c1', name: 'atlas' } as Data.FilesComputer;
    expect(Data.filesLockKey({ c, path: '/a', dest: '/b', to: 'x', op: 'o' } as Data.ChangeVars)).toEqual({ computer: 'c1' });
    expect(Data.filesLockKey({ c: { ...c, id: 'c2' } } as Data.ChangeVars)).toEqual({ computer: 'c2' });
  });

  it('a Delete refused because of a held copy says so in the page\'s words, and sends nothing', async () => {
    await lostCopy();
    await userEvent.click(screen.getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    const paneB = await screen.findByRole('region', { name: strings['pane.b'] });
    const r = await within(await within(paneB).findByRole('table')).findByRole('row', { name: /notes\.txt/ });
    await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['action.delete']}`) }));
    const d = await screen.findByRole('alertdialog');
    const go = await within(d).findByRole('button', { name: new RegExp(`^${strings['action.delete']}`, 'i') });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await within(d).findByText(strings['changes.overlap'])).toBeInTheDocument();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, 20_000);

  it('a hold an earlier build filed per path holds back every change on its computer, and none elsewhere', async () => {
    h.olderHolds = [{ hold: 'old', at: 1, identity: { kind: 'delete', computer: 'c-atlas-old', name: 'atlas', path: '/srv/media', dir: true, size: null, modified: 1 } }];
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp', state: 'transferLost' });
    await row(/notes\.txt/);
    const c = { id: 'c-atlas-old', name: 'atlas', project_id: 'p', server_name: 's' } as unknown as Data.FilesComputer;
    let r: { outcome: string; code?: string } | undefined;
    await act(async () => { r = await h.hooks.mkdir!.run({ c, path: '/var/x' } as Data.ChangeVars); });
    expect([r?.outcome, r?.code]).toEqual(['not_sent', 'HELD_OVERLAP']);
    let other: { outcome: string; code?: string } | undefined;
    await act(async () => { other = await h.hooks.mkdir!.run({ c: { ...c, id: 'c-else' }, path: '/var/x' } as Data.ChangeVars); });
    expect(other?.code).not.toBe('HELD_OVERLAP');
  }, 20_000);

  it('a lost copy settled where this tab saw no verdict stays open and says it was checked elsewhere, never done', async () => {
    h.noVerdict = true;
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp', state: 'transferNone' });
    await userEvent.click(within(await row(/notes\.txt/)).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    expect(await within(d).findByText(fill(ts['verdict.elsewhere'], { folder: '/tmp' }))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(d);
    expect(within(d).queryByText(/may have gone through/i)).toBeNull();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, 20_000);

  it('while a copy is still being sent, no other change on that computer is sent, whatever its paths', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada&b=atlas.00a1&bp=%2Ftmp', state: 'transferSlow' });
    await userEvent.click(within(await row(/notes\.txt/)).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(await within(d).findByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']));
    const v = h.vars as Data.ChangeVars;
    for (const [kind, more] of [['delete', { path: '/tmp', dir: true }], ['delete', { path: '/home/ada', dir: true }], ['mkdir', { path: '/srv/new' }]] as const) {
      let r: { outcome: string; code?: string } | undefined;
      await act(async () => { r = await h.hooks[kind]!.run({ c: v.c, size: 1, modified: 1, ...more } as Data.ChangeVars); });
      expect(r?.outcome, `${kind} ${more.path}`).toBe('not_sent');
      expect(ONE_AT_A_TIME, `${kind} ${more.path}`).toContain(r?.code);
    }
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
  }, 20_000);

  it('while a copy may have gone through, no other copy or move of the item is sent, to any destination', async () => {
    const v = await lostCopy();
    expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']);
    for (const [kind, dest] of [['copy', '/tmp/notes-1.txt'], ['move', '/tmp/notes.txt'], ['copy', '/home/ada/projects/notes.txt']] as const) {
      let r: { outcome: string; code?: string } | undefined;
      await act(async () => { r = await h.hooks[kind]!.run({ ...v, dest }); });
      expect(r?.outcome, `${kind} ${dest}`).toBe('not_sent');
      expect(['READ_BACK_FIRST', 'HELD_BY_OTHER'], `${kind} ${dest}`).toContain(r?.code);
    }
    await waitFor(() => expect(sentChanges).toEqual(['copy:/home/ada/notes.txt>/tmp/notes.txt']));
  }, 20_000);
});
