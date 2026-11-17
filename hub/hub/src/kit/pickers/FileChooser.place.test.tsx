// FileChooser's place: the title names the computer, Up reaches the computer's top folder when the root is "/" (and says
// why it stops at a narrower root), the side column names the top folder and the home folder by what they are, each step
// of the path opens its folder (a deep path folds its middle steps into one menu), and the box takes an absolute path or
// "~" as well as a filter. A one-place host answers from a small tree.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { FileChooser, type FileChooserProps } from './FileChooser';
import type { ChooserEntry, ChooserPlace, ChooserReads } from './fileChooser';

const D = (name: string): ChooserEntry => ({ name, dir: true });
const F = (name: string): ChooserEntry => ({ name, dir: false, size: 10 });
const TREE: Record<string, ChooserEntry[]> = {
  '': [D('etc'), D('home'), D('srv')],
  'etc/': [F('hosts')],
  'home/': [D('ada')],
  'home/ada/': [D('apps'), D('src'), F('notes.md')],
  'home/ada/apps/': [D('one')],
  'home/ada/apps/one/': [D('two')],
  'home/ada/apps/one/two/': [D('three')],
  'home/ada/apps/one/two/three/': [],
  'srv/': [],
};

function Host({ asked, ...p }: Partial<FileChooserProps> & { asked?: (place: ChooserPlace | null) => void }) {
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const want = useCallback((x: ChooserPlace | null) => { asked?.(x); setPlace(x); }, [asked]);
  const reads = useMemo<ChooserReads>(() => {
    const entries = place ? TREE[place.dir] : undefined;
    return { folder: { place: entries ? place : null, entries: entries ?? [], failed: place !== null && !entries }, want };
  }, [place, want]);
  return <FileChooser isOpen onClose={() => undefined} overlayId="test-place" mode="folder" reads={reads} rootLabel="/" start="home/ada/" home="home/ada/" computerName="atlas" onChoose={() => undefined} {...p} />;
}

const dlg = () => screen.getByRole('dialog');
const button = (name: string | RegExp) => within(dlg()).getByRole('button', { name });
const current = () => dlg().querySelector('[aria-current="location"]')?.textContent;
const box = () => within(dlg()).getByRole('searchbox', { name: 'Filter or path' });
const rowNames = () => within(within(dlg()).getByRole('listbox', { name: 'In this folder' })).queryAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.textContent);

beforeEach(() => {
  boot();
  window.localStorage.clear();
});

describe('the title', () => {
  it('names the computer the files are on', () => {
    render(<Host />);
    expect(screen.getByRole('dialog', { name: 'Choose a folder on atlas' })).toBeInTheDocument();
  });
  it('a host that names no computer keeps the plain title; a caller\'s own title wins', () => {
    const { unmount } = render(<Host computerName={undefined} />);
    expect(screen.getByRole('dialog', { name: 'Choose a folder' })).toBeInTheDocument();
    unmount();
    render(<Host title="Pick the project folder" />);
    expect(screen.getByRole('dialog', { name: 'Pick the project folder' })).toBeInTheDocument();
  });
});

describe('Up, the places and the steps', () => {
  it('on the whole computer Up goes from home to "/", then stops there and says why', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    expect(current()).toBe('ada');
    await userEvent.click(button('Up one folder'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/' });
    await userEvent.click(button('Up one folder'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: '' });
    expect(current()).toBe('/');
    expect(rowNames()).toEqual(['etc', 'home', 'srv']);
    const up = button('Up one folder');
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).toHaveAccessibleDescription(/This is the computer's top folder\./);
    // Back retraces the way, and has a reason while there is none.
    await userEvent.click(button('Back'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/' });
  });

  it('a narrower root stops Up there and says so; its place is named by its path', async () => {
    render(<Host rootLabel="/srv/shop" start="" home={undefined} />);
    const up = button('Up one folder');
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).toHaveAccessibleDescription(/Only \/srv\/shop and the folders in it can be shown here\./);
    expect(button('Top folder (/srv/shop)')).toBeInTheDocument();
    expect(within(dlg()).queryByRole('button', { name: /^Computer/ })).toBeNull();
  });

  it('the places name the computer\'s top folder and the home folder; each opens', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    await userEvent.click(button('Computer (/)'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: '' });
    await userEvent.click(button('Home (/home/ada)'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/ada/' });
  });

  it('each step of the path is its own button and opens its folder; the open folder is not a button', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    expect(within(dlg()).queryByRole('button', { name: 'ada' })).toBeNull();
    await userEvent.click(button('home'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/' });
    await userEvent.click(button('Back'));
    await userEvent.click(button('/'));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: '' });
  });

  it('a deep path folds its middle steps into one menu, whose entries open them', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} start="home/ada/apps/one/two/three/" />);
    // "/" › [Folders between] › two › three
    expect(button('/')).toBeInTheDocument();
    expect(button('two')).toBeInTheDocument();
    expect(current()).toBe('three');
    expect(within(dlg()).queryByRole('button', { name: 'apps' })).toBeNull();
    await userEvent.click(button('Folders between'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['home', 'ada', 'apps', 'one']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'apps' }));
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/ada/apps/' });
  });

  it('folders are listed by name, without a trailing "/", and said to be folders', () => {
    render(<Host />);
    expect(rowNames().slice(0, 2)).toEqual(['apps', 'src']);
    expect(rowNames().some((n) => n?.includes('/'))).toBe(false);
    expect(within(dlg()).getByRole('option', { name: 'apps, folder' })).toBeInTheDocument();
  });
});

describe('the box', () => {
  it('an absolute path opens on Enter; "/" alone is the top folder', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    await userEvent.type(box(), '/etc/{Enter}');
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'etc/' });
    expect(current()).toBe('etc');
    await userEvent.type(box(), '/{Enter}');
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: '' });
    expect(current()).toBe('/');
  });

  it('an absolute path with no trailing "/" opens the folder it names on Enter', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    await userEvent.type(box(), '/srv{Enter}');
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'srv/' });
  });

  it('"~" names the home folder', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} start="" />);
    await userEvent.type(box(), '~/');
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/ada/' });
    await userEvent.type(box(), 'apps{Enter}');
    expect(asked).toHaveBeenLastCalledWith({ computer: null, dir: 'home/ada/apps/' });
  });

  it('a folder that is not there says so in plain words', async () => {
    render(<Host />);
    await userEvent.type(box(), '/nope{Enter}');
    await act(async () => {});
    expect(within(dlg()).getByText("Couldn't open /nope. It does not exist, or it can't be read.")).toBeInTheDocument();
  });

  it('a name without "/" still filters the open folder', async () => {
    render(<Host />);
    await userEvent.type(box(), 'ap');
    expect(rowNames()).toEqual(['apps']);
  });

  it('a narrower root keeps typed paths inside it', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} rootLabel="~" start="" home={undefined} />);
    asked.mockClear();
    await userEvent.type(box(), '/etc/');
    expect(within(dlg()).getByText('Only paths inside ~ are listed.')).toBeInTheDocument();
    expect(asked.mock.calls.every(([p]) => p === null)).toBe(true);
    expect(button('Home (~)')).toBeInTheDocument();
  });
});
