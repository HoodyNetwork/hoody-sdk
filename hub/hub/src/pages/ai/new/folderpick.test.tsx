// Vitest: New chat's "Another folder…" is typed or browsed (kit PathField) relative to the agent's home folder,
// with the "@" picker's reads (usePathReads: one hook, its fence kept), or an absolute path as typed (never listed:
// a typed path is the person's). A path that leaves home by name ("~", "..") or a relative one while home is unknown names no folder. With commitTyped
// (the settings places, s2) a typed path is chosen only on Enter or blur.
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, userEvent } from '@app/testing';
import type * as LinksModule from '../../files/links';
import { folderOfKey } from '../folders/key';
import type { FoldersRead } from './data';
import { typedFolder } from './logic';
import { FolderDialog, FolderField } from './Options';
import strings from './NewChat.strings.en.json';

/** Each folder the field reads, by absolute path: a listing (the files program's entries). */
let tree: Record<string, unknown[]> = {};
const asked: string[] = [];
vi.mock('../../files/links', async (orig) => ({
  ...(await orig<typeof LinksModule>()),
  useFolder: vi.fn((_c: unknown, path: string) => ({
    data: undefined, dataUpdatedAt: 0, isPending: false, isError: false, isFetching: false, fetchStatus: 'idle',
    refetch: stable(path),
  })),
}));
const fns = new Map<string, () => Promise<unknown>>();
function stable(path: string) {
  if (!fns.has(path)) fns.set(path, () => {
    asked.push(path);
    const r = tree[path];
    return Promise.resolve(r ? { isSuccess: true, data: { entries: r }, dataUpdatedAt: Date.now() } : { isSuccess: false, data: undefined, dataUpdatedAt: 0 });
  });
  return fns.get(path)!;
}
const dirE = (name: string, type = 'dir') => ({ name, dir: true, lossy: false, type });
const fileE = (name: string) => ({ name, dir: false, lossy: false, type: 'file' });

const TARGET = { project: { id: 'p1' }, container: { id: 'c-123456', server_name: 'node-a' } } as unknown as NonNullable<FoldersRead['target']>;
const read = (home: string | null, target: FoldersRead['target'] = TARGET): FoldersRead => ({ folders: [], state: 'ok', retry: null, home, target });

let chosen: Array<string | null> = [];
function Host({ home, target, initial = null, commitTyped = false }: { home: string | null; target?: FoldersRead['target']; initial?: string | null; commitTyped?: boolean }) {
  const [v, setV] = useState<string | null>(initial);
  return <FolderField computer="atlas" folders={read(home, target)} value={v} onChange={(x) => { chosen.push(x); setV(x); }} noHome commitTyped={commitTyped} />;
}
const box = () => screen.getByRole('combobox', { name: strings['folder.path'] });
const rows = () => screen.queryAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.textContent);
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const homeBad = (home: string) => strings['folder.pathBadHome'].replace('{{home}}', home);

beforeEach(() => {
  tree = { '/': [dirE('home'), dirE('srv'), dirE('bin', 'symlink')], '/home': [dirE('ada')], '/srv': [dirE('data')], '/srv/data': [], '/home/ada': [dirE('shop'), fileE('notes.md'), dirE('link', 'symlink'), dirE('.config')], '/home/ada/shop': [dirE('api'), fileE('README.md')] };
  asked.length = 0;
  fns.clear();
  chosen = [];
});
afterEach(cleanup);

describe('the typed folder', () => {
  it('relative under home, absolute as typed; "~", "..", or relative with home unknown name none', () => {
    expect(typedFolder('shop', '/home/ada')).toBe('/home/ada/shop');
    expect(typedFolder('shop/api/', '/home/ada/')).toBe('/home/ada/shop/api');
    expect(typedFolder('/srv/data/', '/home/ada')).toBe('/srv/data');
    expect(typedFolder('/', '/home/ada')).toBe('/');
    expect(typedFolder('/srv/x', null)).toBe('/srv/x');
    expect(typedFolder('shop', null)).toBeNull();
    expect(typedFolder('~/shop', '/home/ada')).toBeNull();
    expect(typedFolder('shop/../..', '/home/ada')).toBeNull();
    expect(typedFolder('', '/home/ada'), 'nothing typed names no folder').toBeNull();
    expect(typedFolder('a\u0007b', '/home/ada')).toBeNull();
  });
});

describe('Another folder: typed or browsed', () => {
  async function another(home: string | null, target?: FoldersRead['target']) {
    render(<Host home={home} {...(target !== undefined ? { target } : {})} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
  }

  it('lists home\'s folders as typed (a link is a name only, hidden ones after a dot) and a pick is the folder under home', async () => {
    await another('/home/ada');
    expect(screen.getByText('/home/ada/')).toBeInTheDocument();
    await userEvent.type(box(), 's');
    await flush();
    expect(rows()).toEqual(['shop/']);
    await userEvent.click(screen.getByRole('option', { name: 'shop/' }));
    await flush();
    expect(box()).toHaveValue('shop/');
    expect(chosen.at(-1)).toBe('/home/ada/shop');
    expect(rows()).toEqual(['api/']);
    // A pick closes the list (a new read session): the folders are proven again from home, never below a link.
    expect([...new Set(asked)]).toEqual(['/home/ada', '/home/ada/shop']);
    await userEvent.keyboard('{Escape}');
  });

  it('a link is never gone into: typing through it reads nothing below it', async () => {
    await another('/home/ada');
    await userEvent.type(box(), 'link/');
    await flush();
    expect([...new Set(asked)]).toEqual(['/home/ada']);
    expect(rows()).toEqual([]);
    expect(chosen.at(-1)).toBe('/home/ada/link');
    await userEvent.keyboard('{Escape}');
  });

  it('an absolute path is taken as typed and never listed; the root is not drawn before it', async () => {
    await another('/home/ada');
    await userEvent.type(box(), '/srv/data');
    await flush();
    expect(chosen.at(-1)).toBe('/srv/data');
    expect(screen.queryByText('/home/ada/')).toBeNull();
    expect([...new Set(asked)]).toEqual(['/home/ada']);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(homeBad('/home/ada'))).toBeNull();
  });

  it('".." or "~" names no folder and says what to enter', async () => {
    await another('/home/ada');
    await userEvent.type(box(), 'shop/..{Escape}');
    expect(chosen.at(-1)).toBeNull();
    expect(screen.getByText(homeBad('/home/ada'))).toBeInTheDocument();
    await userEvent.clear(box());
    await userEvent.type(box(), '~/x{Escape}');
    expect(chosen.at(-1)).toBeNull();
  });

  it('home unknown: nothing is read, a relative path names none, an absolute one does; when home arrives the text is re-read', async () => {
    const r = render(<Host home={null} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await userEvent.type(box(), 'shop{Escape}');
    await flush();
    expect(asked).toEqual([]);
    expect(chosen.at(-1)).toBeNull();
    expect(screen.getByText(strings['folder.pathBad'])).toBeInTheDocument();
    r.rerender(<Host home="/home/ada" />);
    await flush();
    expect(chosen.at(-1)).toBe('/home/ada/shop');
    expect(screen.queryByText(strings['folder.pathBad'])).toBeNull();
  });

  it('no computer read (a stopped one): nothing is read', async () => {
    await another('/home/ada', null);
    await userEvent.type(box(), 's');
    await flush();
    expect(asked).toEqual([]);
    expect(rows()).toEqual([]);
    await userEvent.keyboard('{Escape}');
  });

  it('Browse opens on home, on the named computer, and writes the folder picked as its absolute path', async () => {
    await another('/home/ada');
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await flush();
    expect(screen.getByRole('dialog', { name: 'Choose a folder on atlas' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'shop, folder' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(box()).toHaveValue('/home/ada/shop/');
    expect(chosen.at(-1)).toBe('/home/ada/shop');
  });

  it('Browse reaches the whole computer: Up from home to "/", a folder outside home is chosen by its absolute path', async () => {
    await another('/home/ada');
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await flush();
    const dlg = screen.getByRole('dialog');
    // The places: the computer's top folder and the home folder, each by what it is.
    expect(screen.getByRole('button', { name: 'Computer (/)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home (/home/ada)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Up one folder' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Up one folder' }));
    await flush();
    expect(dlg.querySelector('[aria-current="location"]')?.textContent).toBe('/');
    // A link is listed by name and never opened (the fence of the reads); a real folder opens.
    await userEvent.click(await screen.findByRole('option', { name: 'srv, folder' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(box()).toHaveValue('/srv/');
    expect(chosen.at(-1)).toBe('/srv');
    expect(asked).toContain('/');
    expect(asked.some((p) => p.startsWith('/bin'))).toBe(false);
  });

  it('Browse: "/" chosen at the top is the computer\'s top folder', async () => {
    await another('/home/ada');
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Computer (/)' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(box()).toHaveValue('/');
    expect(chosen.at(-1)).toBe('/');
  });
});

describe('Another folder: what is chosen stays chosen', () => {
  it('an absolute path under home, shown again, stays absolute: a root change never moves it', async () => {
    const r = render(<Host home="/home/ada" initial="/home/ada/shop" />);
    expect(box()).toHaveValue('/home/ada/shop');
    r.rerender(<Host home="/home/other" initial="/home/ada/shop" />);
    await flush();
    expect(chosen.filter((x) => x !== '/home/ada/shop')).toEqual([]);
    expect(box()).toHaveValue('/home/ada/shop');
  });

  it('Another folder with nothing typed chooses nothing, even with home known', async () => {
    render(<Host home="/home/ada" initial="/home/ada" />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    expect(chosen).toEqual([null]);
    expect(box()).toHaveValue('');
  });

  it('Browse, then Use this folder at home, chooses the home folder', async () => {
    render(<Host home="/home/ada" />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    const before = chosen.length;
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(chosen.slice(before)).toEqual(['/home/ada']);
    expect(box()).toHaveValue('/home/ada/');
    // Emptied again, the box chooses nothing.
    await userEvent.clear(box());
    await userEvent.keyboard('{Escape}');
    expect(chosen.at(-1)).toBeNull();
  });
});

describe('commitTyped: a typed path is chosen on Enter or on leaving the box, never per keystroke', () => {
  async function another() {
    render(<Host home="/home/ada" commitTyped />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await flush();
    chosen = [];
  }
  const settleTimers = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };

  it('typing chooses nothing; Enter chooses the path once, and an unchanged Enter or a blur sends nothing again', async () => {
    await another();
    await userEvent.type(box(), '/srv/data');
    await settleTimers();
    expect(chosen).toEqual([]);
    await userEvent.keyboard('{Enter}');
    await settleTimers();
    expect(chosen).toEqual(['/srv/data']);
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    await settleTimers();
    expect(chosen).toEqual(['/srv/data']);
  });

  it('leaving the box chooses what it holds; an invalid path chooses none', async () => {
    await another();
    await userEvent.type(box(), 'shop');
    await userEvent.keyboard('{Escape}');
    await userEvent.tab();
    await settleTimers();
    expect(chosen).toEqual(['/home/ada/shop']);
    await userEvent.click(box());
    await userEvent.clear(box());
    await userEvent.type(box(), '../x');
    await userEvent.keyboard('{Escape}');
    await userEvent.tab();
    await settleTimers();
    expect(chosen).toEqual(['/home/ada/shop', null]);
  });

  it('a pick from the list chooses at once, and the Enter that picked it sends nothing more', async () => {
    await another();
    await userEvent.type(box(), 's');
    await flush();
    expect(chosen).toEqual([]);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await settleTimers();
    expect(chosen).toEqual(['/home/ada/shop']);
    await userEvent.keyboard('{Escape}');
  });

  it('a root change mid-edit chooses nothing; once chosen, the text follows the root as before', async () => {
    const r = render(<Host home={null} commitTyped />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await flush();
    chosen = [];
    await userEvent.type(box(), 'shop');
    r.rerender(<Host home="/home/ada" commitTyped />);
    await settleTimers();
    expect(chosen, 'the home folder arriving never commits the edit').toEqual([]);
    await userEvent.keyboard('{Escape}{Enter}');
    await settleTimers();
    expect(chosen).toEqual(['/home/ada/shop']);
    r.rerender(<Host home="/home/bob" commitTyped />);
    await settleTimers();
    expect(chosen).toEqual(['/home/ada/shop', '/home/bob/shop']);
  });

  it('a path typed and left by unmounting the field (the place switched to Realm) is still chosen', async () => {
    function Place() {
      const [on, setOn] = useState(true);
      return (
        <>
          {on && <Host home="/home/ada" commitTyped />}
          <button type="button" onClick={() => setOn(false)}>Realm</button>
        </>
      );
    }
    render(<Place />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await flush();
    chosen = [];
    await userEvent.type(box(), '/srv/data');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Realm' }));
    await settleTimers();
    expect(screen.queryByRole('combobox', { name: strings['folder.path'] })).toBeNull();
    expect(chosen).toEqual(['/srv/data']);
  });

  it('a Select pick right after leaving the box wins: the left text is not chosen after it', async () => {
    render(<Host home="/home/ada" commitTyped initial={null} />);
    await settleTimers();
    chosen = [];
    await userEvent.type(box(), '/srv/data');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.homeAt'].replace('{{path}}', '/home/ada') }));
    await settleTimers();
    expect(chosen.at(-1)).toBe('/home/ada');
    expect(chosen.filter((c) => c === '/srv/data').length <= 1 && chosen.indexOf('/srv/data') < chosen.lastIndexOf('/home/ada')).toBe(true);
  });

  it('Browse chooses at once', async () => {
    await another();
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await flush();
    await userEvent.click(await screen.findByRole('option', { name: 'shop, folder' }));
    await flush();
    await userEvent.click(screen.getByRole('button', { name: 'Use this folder' }));
    await settleTimers();
    expect(chosen).toEqual(['/home/ada/shop']);
  });
});

describe('Work in a folder', () => {
  it('a folder typed under home opens its page; Escape in the list does not close the dialog', async () => {
    const opened: string[] = [];
    render(<FolderDialog isOpen onOpenChange={() => {}} computer="atlas" handle="atlas" realm="aaaaaaaaaaaaaaaaaaaaaaa1" realmName="Work" folders={read('/home/ada')} onOpen={(h) => opened.push(h)} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await userEvent.type(box(), 'shop{Escape}');
    expect(screen.getByRole('dialog', { name: strings['pickFolder.title'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['pickFolder.open'] }));
    expect(opened).toHaveLength(1);
    expect(folderOfKey(opened[0]!.slice('/ai/f/'.length).split('?')[0]!)).toBe('/home/ada/shop');
  });
});
