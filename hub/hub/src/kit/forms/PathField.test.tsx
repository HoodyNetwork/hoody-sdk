// PathField: a path typed with the typed folder's entries offered (the "@" picker's rules), or chosen with Browse;
// the host reads one folder at a time, and only entries of the folder asked for are ever offered.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Dialog } from '../overlays/Dialog';
import { PathField, type PathEntry, type PathReads } from './PathField';
import { browseOrder, pathCrumbs, pathSplit, pathUp } from './pathPick';

const TREE: Record<string, PathEntry[]> = {
  '': [{ name: 'notes.md', dir: false }, { name: 'projects', dir: true }, { name: '.config', dir: true }, { name: 'pro.txt', dir: false }, { name: '~old', dir: true }],
  'projects/': [{ name: 'shop', dir: true }, { name: 'README.md', dir: false }],
  'projects/shop/': [{ name: 'index.ts', dir: false }],
  '.config/': [],
  'odd/': [{ name: '~archive', dir: true }, { name: 'foo..bar', dir: true }, { name: 'ok', dir: true }],
};

/** A host that answers at once, or holds every read (`hold`), or fails it (`fail`). `asked` records every want. */
function Host({ initial = '', mode, hold = false, fail = false, asked, picked, isDisabled }: { initial?: string; mode?: 'folder' | 'file' | 'any'; hold?: boolean; fail?: boolean; asked?: (d: string | null) => void; picked?: (v: string) => void; isDisabled?: boolean }) {
  const [v, setV] = useState(initial);
  const [dir, setDir] = useState<string | null>(null);
  const want = useCallback((d: string | null) => { asked?.(d); setDir(d); }, [asked]);
  const known = dir !== null && !hold && !fail && dir in TREE;
  const read: PathReads = { entries: known ? TREE[dir]! : [], dir: known ? dir : null, reading: dir !== null && hold, failed: dir !== null && (fail || (!hold && !(dir in TREE))), want };
  return (
    <div>
      <p>Outside</p>
      <PathField label="Folder" rootLabel="~" mode={mode} value={v} onChange={(x) => { setV(x); picked?.(x); }} read={read} isDisabled={isDisabled} />
    </div>
  );
}

const box = () => screen.getByRole('combobox', { name: 'Folder' });
/** The offered entries (not the line an empty list shows, which react-aria also draws as an option). */
const rows = () => screen.queryAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.textContent);

beforeEach(() => {
  boot();
});

describe('the path rules', () => {
  it('splits a typed path; "/", "~" or ".." anywhere is outside the root', () => {
    expect(pathSplit('projects/sh')).toEqual({ dir: 'projects/', name: 'sh' });
    expect(pathSplit('')).toEqual({ dir: '', name: '' });
    for (const p of ['/etc', '~/x', 'a/../b', '..x']) expect(pathSplit(p), p).toBe('outside');
  });
  it('steps up and lists the place, top first; Browse lists folders, files, then hidden ones', () => {
    expect(pathUp('a/b/')).toBe('a/');
    expect(pathUp('a/')).toBe('');
    expect(pathUp('')).toBe('');
    expect(pathCrumbs('a/b/')).toEqual([['', ''], ['a/', 'a'], ['a/b/', 'b']]);
    expect(browseOrder(TREE['']!).map((e) => e.name)).toEqual(['projects', '~old', 'notes.md', 'pro.txt', '.config']);
  });
});

describe('typing a path', () => {
  it('offers the typed folder\'s entries, folders first, starts-with first; a hidden name only after a typed dot', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    await userEvent.click(box());
    expect(asked).toHaveBeenLastCalledWith('');
    expect(rows()).toEqual(['projects/', 'notes.md', 'pro.txt']);
    await userEvent.type(box(), 'pro');
    expect(rows()).toEqual(['projects/', 'pro.txt']);
    await userEvent.clear(box());
    await userEvent.type(box(), '.');
    expect(rows()).toEqual(['.config/']);
  });

  it('a picked folder is written with its "/" and the next level is offered at once; a picked file closes the list', async () => {
    const asked = vi.fn();
    const picked = vi.fn();
    render(<Host asked={asked} picked={picked} />);
    await userEvent.click(box());
    await userEvent.click(screen.getByRole('option', { name: 'projects/' }));
    expect(box()).toHaveValue('projects/');
    expect(asked).toHaveBeenLastCalledWith('projects/');
    expect(rows()).toEqual(['shop/', 'README.md']);
    await userEvent.click(screen.getByRole('option', { name: 'README.md' }));
    expect(box()).toHaveValue('projects/README.md');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('mode folder offers folders only, and says so when a folder holds none', async () => {
    render(<Host mode="folder" initial="projects/shop/" />);
    await userEvent.click(box());
    expect(rows()).toEqual([]);
    expect(screen.getByText('No folders here.')).toBeInTheDocument();
  });

  it('a path outside the root is kept as typed, reads nothing and says only paths inside are listed', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} />);
    await userEvent.click(box());
    await userEvent.type(box(), '/etc');
    expect(box()).toHaveValue('/etc');
    expect(asked).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Only paths inside ~ are listed.')).toBeInTheDocument();
  });

  it('while the read is out it says Reading…, and a failed read says so; nothing stale is offered', async () => {
    const { unmount } = render(<Host hold />);
    await userEvent.click(box());
    expect(rows()).toEqual([]);
    expect(screen.getByText('Reading…')).toBeInTheDocument();
    unmount();
    render(<Host fail />);
    await userEvent.click(box());
    expect(screen.getByText("Couldn't read this folder.")).toBeInTheDocument();
  });

  it('a hidden match only: says how to see hidden names', async () => {
    render(<Host initial="conf" />);
    await userEvent.click(box());
    expect(screen.getByText('Type a dot to see hidden names.')).toBeInTheDocument();
  });

  it('the root is read with the field; a field taken away tells the host to stop reading', async () => {
    const asked = vi.fn();
    const { unmount } = render(<Host asked={asked} />);
    expect(box()).toHaveAccessibleDescription('Paths are inside ~.');
    await userEvent.click(box());
    expect(asked).toHaveBeenLastCalledWith('');
    unmount();
    expect(asked).toHaveBeenLastCalledWith(null);
  });
  it('a name that would read as outside the root ("~" first at the root, or ".."): neither offered nor opened in Browse', async () => {
    const asked = vi.fn();
    render(<Host initial="odd/" asked={asked} />);
    await userEvent.click(box());
    // Below the root a "~" is an ordinary first letter; ".." anywhere is not.
    expect(rows()).toEqual(['~archive/', 'ok/']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    const dlg = screen.getByRole('dialog');
    const names = () => within(within(dlg).getByRole('listbox')).getAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.textContent);
    expect(names()).toEqual(['~archive', 'ok']);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Up one folder' }));
    expect(names()).not.toContain('~old');
    expect(asked.mock.calls.flat().some((d) => typeof d === 'string' && (d.startsWith('~') || d.includes('..')))).toBe(false);
  });
  it('another host (a new want): the old one is told to stop and the new one is asked for the open folder', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const field = (want: (d: string | null) => void) => <PathField label="Folder" rootLabel="~" value="" onChange={() => {}} read={{ entries: [], dir: null, want }} />;
    const { rerender, unmount } = render(field(a));
    await userEvent.click(box());
    expect(a).toHaveBeenLastCalledWith('');
    rerender(field(b));
    expect(a).toHaveBeenLastCalledWith(null);
    expect(b).toHaveBeenLastCalledWith('');
    unmount();
    expect(b).toHaveBeenLastCalledWith(null);
  });
  it('a host whose want changes every render is told once, in DEV; a stable want never is', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const field = (want: (d: string | null) => void) => <PathField label="Folder" rootLabel="~" value="" onChange={() => {}} read={{ entries: [], dir: null, want }} />;
    const stable = vi.fn();
    const r = render(field(stable));
    for (let i = 0; i < 5; i++) r.rerender(field(stable));
    expect(err).not.toHaveBeenCalled();
    for (let i = 0; i < 6; i++) r.rerender(field(() => {}));
    const said = err.mock.calls.filter((c) => String(c[0]).includes('hub PathField'));
    expect(said).toHaveLength(1);
    err.mockRestore();
  });

  it('a typed absolute path reads as itself: the root is not drawn before it', async () => {
    render(<Host initial="projects" />);
    expect(screen.getByText('~/')).toBeInTheDocument();
    await userEvent.clear(box());
    await userEvent.type(box(), '/srv/data');
    expect(screen.queryByText('~/')).toBeNull();
    expect(box()).toHaveValue('/srv/data');
    expect(box()).not.toHaveAccessibleDescription(/Paths are inside/u);
  });

  it('in a dialog, Escape with the list open closes the list only; the next Escape closes the dialog', async () => {
    const closed = vi.fn();
    function InDialog() {
      const [v, setV] = useState('');
      const want = useCallback(() => {}, []);
      return (
        <Dialog isOpen onOpenChange={(o) => { if (!o) closed(); }} title="Pick" overlayId="path-test">
          <PathField label="Folder" rootLabel="~" value={v} onChange={setV} read={{ entries: [], dir: null, want }} />
        </Dialog>
      );
    }
    render(<InDialog />);
    await userEvent.type(box(), 'proj');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(closed).not.toHaveBeenCalled();
    expect(box()).toHaveValue('proj');
    await userEvent.keyboard('{Escape}');
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('nothing is read while the list is closed or the field is disabled', async () => {
    const asked = vi.fn();
    render(<Host asked={asked} isDisabled />);
    expect(asked).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Browse' })).toBeDisabled();
  });
});

describe('Browse', () => {
  it('opens at the typed folder; a folder opens, Up and the place go back, Use this folder writes it', async () => {
    const asked = vi.fn();
    render(<Host initial="projects/sh" mode="folder" asked={asked} />);
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    const dlg = screen.getByRole('dialog', { name: 'Choose a folder' });
    expect(asked).toHaveBeenLastCalledWith('projects/');
    const list = within(dlg).getByRole('listbox', { name: 'In this folder' });
    expect(within(list).getAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.textContent)).toEqual(['shop', 'README.md']);
    expect(within(list).getByRole('option', { name: 'README.md' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(list).getByRole('option', { name: 'shop, folder' }));
    expect(asked).toHaveBeenLastCalledWith('projects/shop/');
    expect(within(dlg).getByText('shop')).toHaveAttribute('aria-current', 'location');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Up one folder' }));
    expect(asked).toHaveBeenLastCalledWith('projects/');
    await userEvent.click(within(dlg).getByRole('button', { name: '~' }));
    expect(asked).toHaveBeenLastCalledWith('');
    expect(within(dlg).getByRole('button', { name: 'Up one folder' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(dlg).getByRole('option', { name: 'projects, folder' }));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Use this folder' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(box()).toHaveValue('projects/');
  });

  it('mode file: a file is selected, then chosen; there is no Use this folder', async () => {
    render(<Host initial="" mode="file" />);
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    const dlg = screen.getByRole('dialog', { name: 'Choose a file' });
    expect(within(dlg).queryByRole('button', { name: 'Use this folder' })).toBeNull();
    await userEvent.click(within(dlg).getByRole('option', { name: 'projects, folder' }));
    // A press selects the file; Choose (or a second press) takes it.
    await userEvent.click(within(dlg).getByRole('option', { name: 'README.md' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(box()).toHaveValue('');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Choose' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(box()).toHaveValue('projects/README.md');
  });

  it('a folder that cannot be read says so in Browse', async () => {
    render(<Host fail />);
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await act(async () => {});
    expect(within(screen.getByRole('dialog')).getByText("Couldn't open ~. It does not exist, or it can't be read.")).toBeInTheDocument();
  });
  it('no root known (rootLabel null): a plain typed path, with no prefix and no Browse; the list only says the path is typed', async () => {
    const want = vi.fn();
    const changed = vi.fn();
    const { container } = render(<PathField label="Folder" rootLabel={null} value="" onChange={changed} read={{ entries: [], dir: null, failed: true, want }} />);
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull();
    expect(container.querySelector('[data-literal]')).toBeNull();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.keyboard('/srv/shop');
    await act(async () => {});
    expect(screen.queryByText("Couldn't read this folder.")).toBeNull();
    expect(screen.getByText("Folders aren't listed here. Type the path.")).toBeInTheDocument();
    expect(changed).toHaveBeenCalledWith('/', 'typed');
    expect(want.mock.calls.every(([d]) => d === null)).toBe(true);
  });
});
