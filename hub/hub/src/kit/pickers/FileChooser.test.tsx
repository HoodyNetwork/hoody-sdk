// FileChooser: one dialog for choosing files or a folder on a computer. A fake host answers folders, previews and
// searches for two computers; the tests pin what a person can do and what the caller is handed.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { ComputerChoice } from './ComputerPicker';
import { FileChooser, type FileChooserProps } from './FileChooser';
import type { ChooserEntry, ChooserFileRef, ChooserFindAsk, ChooserFound, ChooserPlace, ChooserReads, ChooserResult } from './fileChooser';

const F = (name: string, size: number, modified = 1_700_000_000_000): ChooserEntry => ({ name, dir: false, size, modified });
const D = (name: string): ChooserEntry => ({ name, dir: true });

const TREES: Record<string, Record<string, ChooserEntry[]>> = {
  atlas: {
    '': [D('home'), D('etc'), F('readme.txt', 120), F('.profile', 30)],
    'home/': [D('ada')],
    'home/ada/': [D('shop'), F('notes.md', 1200), F('big.iso', 64 * 1024 * 1024)],
    'home/ada/shop/': [F('index.ts', 400), F('cart.ts', 900), F('shot.png', 2048)],
    'etc/': [F('hosts', 80)],
  },
  beta: {
    '': [D('srv'), F('motd', 10)],
    'srv/': [F('app.log', 5000), F('quarterly-report-final-version-2026-with-notes.tar.gz', 10)],
  },
};

const COMPUTERS: ComputerChoice[] = [
  { id: 'atlas', name: 'atlas', realm: { name: 'Personal' }, running: true, state: 'Running' },
  { id: 'beta', name: 'beta', realm: { name: 'Personal' }, running: true, state: 'Running' },
  { id: 'cedar', name: 'cedar', running: false, state: 'Stopped', disabledReason: 'Stopped. Start it to read its files.' },
];

interface Spy {
  asked: ChooserPlace[];
  previews: (ChooserFileRef | null)[];
  finds: (ChooserFindAsk | null)[];
  retries: number;
}
const newSpy = (): Spy => ({ asked: [], previews: [], finds: [], retries: 0 });

/** A host that answers at once from TREES. `fail`: every folder read fails; `blocked`: a folder under "etc/" is never read. */
function useHost(spy: Spy, o: { fail?: boolean; single?: string; noExtras?: boolean } = {}): ChooserReads {
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const [file, setFile] = useState<ChooserFileRef | null>(null);
  const [ask, setAsk] = useState<ChooserFindAsk | null>(null);
  const want = useCallback((p: ChooserPlace | null) => { if (p) spy.asked.push(p); setPlace(p); }, [spy]);
  const wantPreview = useCallback((f: ChooserFileRef | null) => { spy.previews.push(f); setFile(f); }, [spy]);
  const wantFind = useCallback((a: ChooserFindAsk | null) => { spy.finds.push(a); setAsk(a); }, [spy]);
  return useMemo(() => {
    const tree = place ? TREES[o.single ?? place.computer ?? ''] : undefined;
    const entries = place && tree ? tree[place.dir] : undefined;
    const blocked = place?.dir === 'etc/deep/';
    const found: ChooserFound[] = [];
    if (ask) {
      const t = TREES[o.single ?? ask.computer ?? ''] ?? {};
      for (const [dir, list] of Object.entries(t)) if (dir.startsWith(ask.dir)) for (const e of list) if (e.name.includes(ask.query)) found.push({ ...e, dir_in: dir });
    }
    return {
      folder: {
        place: entries && !o.fail && !blocked ? place : null,
        entries: entries && !o.fail && !blocked ? entries : [],
        failed: place !== null && !blocked && (o.fail === true || !entries),
        error: { kind: 'unavailable', status: 503 },
        ...(blocked ? { blocked: 'Folders this deep can\'t be opened here.' } : {}),
        retry: () => { spy.retries += 1; },
      },
      want,
      ...(o.noExtras ? {} : {
        preview: {
          of: file,
          state: !file ? { kind: 'loading' as const }
            : file.name.endsWith('.png') ? { kind: 'image' as const, url: 'data:image/png;base64,AAAA' }
              : file.name.endsWith('.iso') ? { kind: 'none' as const, why: 'Too big to preview here.' }
                : { kind: 'text' as const, text: `first line of ${file.name}`, more: false },
          want: wantPreview,
        },
        find: {
          of: ask, items: found,
          off: (p: ChooserPlace) => (p.dir === '' ? 'Open a folder first.' : null),
          want: wantFind,
        },
      }),
    };
  }, [place, file, ask, o.fail, o.single, o.noExtras, spy, want, wantPreview, wantFind]);
}

type HostProps = Partial<FileChooserProps> & { spy?: Spy; fail?: boolean; chosen?: (r: readonly ChooserResult[]) => void | Promise<void> };
function Host({ spy = newSpy(), fail, chosen, ...rest }: HostProps) {
  const reads = useHost(spy, { fail });
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <FileChooser
        isOpen={open}
        onClose={() => setOpen(false)}
        overlayId="test-chooser"
        mode="file"
        reads={reads}
        computers={COMPUTERS}
        current="atlas"
        rootLabel="/"
        start="home/ada/"
        onChoose={(r) => { const out = chosen?.(r); if (out) return out.then(() => setOpen(false)); setOpen(false); return undefined; }}
        {...rest}
      />
    </div>
  );
}

const dlg = () => screen.getByRole('dialog', { name: /^Choose|^Attach/ });
const list = () => within(dlg()).getByRole('listbox', { name: 'In this folder' });
const rows = () => within(list()).queryAllByRole('option').filter((o) => o.hasAttribute('data-key')).map((o) => o.getAttribute('data-key'));
const row = (name: string | RegExp) => within(list()).getByRole('option', { name });
const box = () => within(dlg()).getByRole('searchbox', { name: 'Filter or path' });
const primary = (name: string | RegExp) => within(dlg()).getByRole('button', { name });
async function pickComputer(name: string) {
  await userEvent.click(within(dlg()).getByRole('button', { name: /Computer$/ }));
  const panel = await screen.findByRole('dialog', { name: 'Computer' });
  await userEvent.click(within(panel).getByText(name));
}

beforeEach(() => {
  boot();
  window.localStorage.clear();
});

describe('one file', () => {
  it('opens on the caller\'s computer and folder; a press selects, Choose hands back the structured pick', async () => {
    const spy = newSpy();
    const chosen = vi.fn();
    render(<Host spy={spy} chosen={chosen} />);
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'home/ada/' });
    expect(rows()).toEqual(['shop', 'big.iso', 'notes.md']);
    expect(primary('Choose')).toBeDisabled();
    await userEvent.click(row(/^notes\.md/));
    expect(chosen).not.toHaveBeenCalled();
    expect(row(/^notes\.md/)).toHaveAccessibleName(/selected/);
    await userEvent.click(primary('Choose'));
    expect(chosen).toHaveBeenCalledWith([{ computer: { id: 'atlas', name: 'atlas' }, realm: 'Personal', path: 'home/ada/notes.md', fullPath: '/home/ada/notes.md', name: 'notes.md', kind: 'file', size: 1200 }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a second press on the selected file chooses it', async () => {
    const chosen = vi.fn();
    render(<Host chosen={chosen} />);
    await userEvent.click(row(/^notes\.md/));
    await userEvent.click(row(/^notes\.md/));
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(chosen.mock.calls[0]![0][0].path).toBe('home/ada/notes.md');
  });

  it('a folder opens; Up, Back and the steps above go back; the row shows size and time', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    expect(row(/^notes\.md/)).toHaveAccessibleName(/1\.2 KB/);
    await userEvent.click(row('shop, folder'));
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'home/ada/shop/' });
    expect(within(dlg()).getByText('shop')).toHaveAttribute('aria-current', 'location');
    await userEvent.click(primary('Up one folder'));
    expect(spy.asked.at(-1)!.dir).toBe('home/ada/');
    await userEvent.click(primary('Back'));
    expect(spy.asked.at(-1)!.dir).toBe('home/ada/shop/');
    await userEvent.click(within(dlg()).getByRole('button', { name: 'home' }));
    expect(spy.asked.at(-1)!.dir).toBe('home/');
    await userEvent.click(within(dlg()).getByRole('button', { name: '/' }));
    expect(spy.asked.at(-1)!.dir).toBe('');
    expect(primary('Up one folder')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the computer', () => {
  it('switching computers keeps the place on each one', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    await userEvent.click(row('shop, folder'));
    await pickComputer('beta');
    expect(spy.asked.at(-1)).toEqual({ computer: 'beta', dir: '' });
    await userEvent.click(row('srv, folder'));
    await pickComputer('atlas');
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'home/ada/shop/' });
    await pickComputer('beta');
    expect(spy.asked.at(-1)).toEqual({ computer: 'beta', dir: 'srv/' });
  });

  it('a computer that cannot be opened is listed with its reason and cannot be picked', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    await userEvent.click(within(dlg()).getByRole('button', { name: /Computer$/ }));
    const panel = await screen.findByRole('dialog', { name: 'Computer' });
    expect(within(panel).getByText('Stopped. Start it to read its files.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByText('cedar'));
    expect(spy.asked.some((p) => p.computer === 'cedar')).toBe(false);
  });

  it('the pick names the computer it was made on', async () => {
    const chosen = vi.fn();
    render(<Host chosen={chosen} />);
    await pickComputer('beta');
    await userEvent.click(row('srv, folder'));
    await userEvent.click(row(/^app\.log/));
    await userEvent.click(primary('Choose'));
    expect(chosen.mock.calls[0]![0][0]).toMatchObject({ computer: { id: 'beta', name: 'beta' }, fullPath: '/srv/app.log', size: 5000 });
  });

  it('no computer to open: the list asks for one and nothing is read', () => {
    const spy = newSpy();
    render(<Host spy={spy} current="cedar" />);
    expect(within(dlg()).getByText('Choose a computer to see its files.')).toBeInTheDocument();
    expect(spy.asked).toEqual([]);
  });
});

describe('the box', () => {
  it('filters the open folder as it is typed', async () => {
    render(<Host />);
    await userEvent.type(box(), 'not');
    expect(rows()).toEqual(['notes.md']);
    await userEvent.clear(box());
    await userEvent.type(box(), 'zzz');
    expect(within(dlg()).getByText('Nothing here matches “zzz”.')).toBeInTheDocument();
  });

  it('typed with a "/" it is a path: the folder is listed, the last part filters, Enter selects the one match', async () => {
    const spy = newSpy();
    const chosen = vi.fn();
    render(<Host spy={spy} chosen={chosen} />);
    await userEvent.type(box(), 'shop/ind');
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'home/ada/shop/' });
    expect(rows()).toEqual(['index.ts']);
    await userEvent.keyboard('{Enter}');
    expect(box()).toHaveValue('');
    expect(row(/^index\.ts/)).toHaveAccessibleName(/selected/);
    await userEvent.click(primary('Choose'));
    expect(chosen.mock.calls[0]![0][0].path).toBe('home/ada/shop/index.ts');
  });

  it('a path from the root starts at the root; a path out of it reads nothing and says so', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    await userEvent.type(box(), '/etc/');
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'etc/' });
    expect(rows()).toEqual(['hosts']);
    await userEvent.clear(box());
    const before = spy.asked.length;
    await userEvent.type(box(), '../x/');
    expect(within(dlg()).getByText('Only paths inside / are listed.')).toBeInTheDocument();
    expect(spy.asked.slice(before).every((p) => !p.dir.includes('..'))).toBe(true);
  });

  it('Arrow down moves from the box into the list; Backspace there goes up one folder', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    await userEvent.click(box());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(list().contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Backspace}');
    expect(spy.asked.at(-1)!.dir).toBe('home/');
  });
});

describe('the list', () => {
  it('hidden names show on request, and the choice is kept on this device', async () => {
    render(<Host start="" recents="test-view" />);
    expect(rows()).toEqual(['etc', 'home', 'readme.txt']);
    await userEvent.click(primary('View options'));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show hidden files' }));
    expect(rows()).toEqual(['etc', 'home', '.profile', 'readme.txt']);
    expect(JSON.parse(window.localStorage.getItem('hub.v3.pane.filechooser.test-view') ?? '{}').view.hidden).toBe(true);
  });

  it('sorts from the header: size, largest first, then smallest first', async () => {
    render(<Host />);
    await userEvent.click(primary('Sort by Size'));
    expect(rows()).toEqual(['shop', 'big.iso', 'notes.md']);
    await userEvent.click(primary(/^Size, sorted down/));
    expect(rows()).toEqual(['shop', 'notes.md', 'big.iso']);
  });

  it('a file accept refuses is listed with the reason and cannot be chosen', async () => {
    const chosen = vi.fn();
    render(<Host chosen={chosen} accept={(e) => ((e.size ?? 0) > 1024 * 1024 ? 'Over 1 MB: too large to attach.' : null)} />);
    const big = row(/^big\.iso/);
    expect(big).toHaveAttribute('aria-disabled', 'true');
    expect(big).toHaveAccessibleName(/Over 1 MB: too large to attach\./);
    expect(within(big).getByText('Over 1 MB: too large to attach.')).toBeInTheDocument();
    await userEvent.click(big);
    expect(primary('Choose')).toBeDisabled();
    expect(chosen).not.toHaveBeenCalled();
  });

  it('a long name is cut in the middle and keeps its whole name for the tip', async () => {
    render(<Host />);
    await pickComputer('beta');
    await userEvent.click(row('srv, folder'));
    const long = row(/^quarterly-report/);
    expect(long.querySelector('[title="quarterly-report-final-version-2026-with-notes.tar.gz"]')).not.toBeNull();
    expect(long.textContent).toContain('quarterly-report-final-version-2026-with-notes.tar.gz');
  });

  it('a folder that cannot be read says so with details and Try again; a folder never read says why', async () => {
    const spy = newSpy();
    const { unmount } = render(<Host spy={spy} fail />);
    expect(within(dlg()).getByText("Couldn't open /home/ada. It does not exist, or it can't be read.")).toBeInTheDocument();
    await userEvent.click(within(dlg()).getByRole('button', { name: /try again/i }));
    expect(spy.retries).toBe(1);
    unmount();
    render(<Host start="etc/deep/" />);
    expect(within(dlg()).getByText("Folders this deep can't be opened here.")).toBeInTheDocument();
  });
});

describe('several files', () => {
  it('each press adds to or removes from the chosen files, across folders and computers, up to the caller\'s limit', async () => {
    const chosen = vi.fn();
    render(<Host mode="files" primaryLabel="Attach" title="Attach files" limits={{ maxFiles: 2, note: 'Text files up to 24 KB.' }} chosen={chosen} />);
    expect(within(dlg()).getByText('Text files up to 24 KB.')).toBeInTheDocument();
    expect(primary('Attach')).toBeDisabled();
    await userEvent.click(row(/^notes\.md/));
    expect(within(dlg()).getByText('1 of 2 chosen')).toBeInTheDocument();
    await pickComputer('beta');
    await userEvent.click(row('srv, folder'));
    await userEvent.click(row(/^app\.log/));
    expect(within(dlg()).getByText('2 of 2 chosen')).toBeInTheDocument();
    // The file chosen on the other computer is named with it.
    const tray = within(dlg()).getByRole('group', { name: 'Chosen files' });
    expect(within(tray).getByText('atlas: /home/ada/notes.md')).toBeInTheDocument();
    expect(within(tray).getByText('/srv/app.log')).toBeInTheDocument();
    // A third is refused in words and changes nothing.
    await userEvent.click(row(/^quarterly/));
    expect(within(dlg()).getByText('This takes 2 files at most. Remove one to choose another.')).toBeInTheDocument();
    expect(within(dlg()).getByText('2 of 2 chosen')).toBeInTheDocument();
    await userEvent.click(within(tray).getByRole('button', { name: 'Remove /srv/app.log' }));
    expect(within(dlg()).getByText('1 of 2 chosen')).toBeInTheDocument();
    await userEvent.click(row(/^app\.log/));
    await userEvent.click(primary('Attach'));
    expect(chosen.mock.calls[0]![0].map((r: ChooserResult) => `${r.computer?.name}:${r.fullPath}`)).toEqual(['atlas:/home/ada/notes.md', 'beta:/srv/app.log']);
  });

  it('a press on a chosen file takes it out again', async () => {
    render(<Host mode="files" />);
    await userEvent.click(row(/^notes\.md/));
    expect(row(/^notes\.md/)).toHaveAccessibleName(/chosen/);
    await userEvent.click(row(/^notes\.md/));
    expect(within(dlg()).getByText('0 files chosen')).toBeInTheDocument();
  });
});

describe('a folder, or either', () => {
  it('folder: files are listed but cannot be chosen; Use this folder hands back the open folder', async () => {
    const chosen = vi.fn();
    render(<Host mode="folder" chosen={chosen} />);
    expect(screen.getByRole('dialog', { name: 'Choose a folder on atlas' })).toBeInTheDocument();
    expect(row(/^notes\.md/)).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(row('shop, folder'));
    await userEvent.click(primary('Use this folder'));
    expect(chosen).toHaveBeenCalledWith([expect.objectContaining({ kind: 'folder', path: 'home/ada/shop/', fullPath: '/home/ada/shop/', name: 'shop', size: null })]);
  });

  it('any: the open folder until a file is selected, then that file', async () => {
    const chosen = vi.fn();
    render(<Host mode="any" chosen={chosen} />);
    expect(primary('Use this folder')).toBeEnabled();
    await userEvent.click(row(/^notes\.md/));
    await userEvent.click(primary('Choose'));
    expect(chosen.mock.calls[0]![0][0]).toMatchObject({ kind: 'file', path: 'home/ada/notes.md' });
  });
});

describe('preview and find', () => {
  it('the selected file is previewed: text, a picture, or why not; nothing is asked before a file is selected', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    const pane = () => within(dlg()).getByRole('group', { name: 'Preview' });
    expect(within(pane()).getByText('Select a file to see it here.')).toBeInTheDocument();
    expect(spy.previews.every((f) => f === null)).toBe(true);
    await userEvent.click(row(/^notes\.md/));
    expect(spy.previews.at(-1)).toEqual({ computer: 'atlas', path: 'home/ada/notes.md', name: 'notes.md' });
    expect(within(pane()).getByText('first line of notes.md')).toBeInTheDocument();
    expect(within(pane()).getByText('/home/ada/notes.md')).toBeInTheDocument();
    await userEvent.click(row(/^big\.iso/));
    expect(within(pane()).getByText('Too big to preview here.')).toBeInTheDocument();
    await userEvent.click(row('shop, folder'));
    await userEvent.click(row(/^shot\.png/));
    expect(within(pane()).getByRole('img', { name: 'Preview of shot.png' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('Find in subfolders runs only when asked; a match opens its folder with the file selected', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    expect(spy.finds.every((a) => a === null)).toBe(true);
    await userEvent.type(box(), 'cart');
    expect(spy.finds.every((a) => a === null)).toBe(true);
    await userEvent.click(primary('Find in subfolders'));
    expect(spy.finds.at(-1)).toMatchObject({ computer: 'atlas', dir: 'home/ada/', query: 'cart' });
    expect(within(dlg()).getByText('Matches for “cart” below /home/ada/')).toBeInTheDocument();
    const match = row(/^cart\.ts/);
    expect(within(match).getByText('in /home/ada/shop/')).toBeInTheDocument();
    await userEvent.click(match);
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'home/ada/shop/' });
    expect(row(/^cart\.ts/)).toHaveAccessibleName(/selected/);
    expect(rows()).toEqual(['cart.ts', 'index.ts', 'shot.png']);
  });

  it('where the host cannot search, Find says why', async () => {
    render(<Host start="" />);
    await userEvent.type(box(), 'x');
    expect(primary('Find in subfolders')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('what the caller does with the pick', () => {
  it('a rejection stays in the dialog with its details; nothing closes', async () => {
    const chosen = vi.fn(() => Promise.reject(Object.assign(new Error('down'), { kind: 'unavailable', status: 503 })));
    render(<Host chosen={chosen} />);
    await userEvent.click(row(/^notes\.md/));
    await userEvent.click(primary('Choose'));
    await waitFor(() => expect(within(dlg()).getByText("Couldn't use this choice.")).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Choose a file on atlas' })).toBeInTheDocument();
  });

  it('the caller\'s own refusal is said in the dialog', () => {
    render(<Host problem="notes.md isn't in that folder any more." />);
    expect(within(dlg()).getByRole('alert')).toHaveTextContent("notes.md isn't in that folder any more.");
  });

  it('recent places and files are kept on this device and offered at the next opening', async () => {
    const spy = newSpy();
    const chosen = vi.fn();
    const { unmount } = render(<Host spy={spy} chosen={chosen} recents="test-recent" />);
    await userEvent.click(row('shop, folder'));
    await userEvent.click(row(/^index\.ts/));
    await userEvent.click(primary('Choose'));
    const kept = JSON.parse(window.localStorage.getItem('hub.v3.pane.filechooser.test-recent') ?? '{}');
    expect(kept.files).toEqual([{ computer: { id: 'atlas', name: 'atlas' }, path: 'home/ada/shop/index.ts' }]);
    expect(kept.places).toEqual([{ computer: { id: 'atlas', name: 'atlas' }, path: 'home/ada/shop/' }]);
    unmount();
    render(<Host spy={spy} recents="test-recent" />);
    const files = within(dlg()).getByRole('group', { name: 'Recent files' });
    await userEvent.click(within(files).getByRole('button', { name: 'index.ts' }));
    expect(spy.asked.at(-1)).toEqual({ computer: 'atlas', dir: 'home/ada/shop/' });
    expect(row(/^index\.ts/)).toHaveAccessibleName(/selected/);
  });

  it('without a recents name nothing is kept', async () => {
    render(<Host />);
    await userEvent.click(row(/^notes\.md/));
    await userEvent.click(primary('Choose'));
    expect(window.localStorage.length).toBe(0);
  });

  it('Escape closes and tells the host to stop reading', async () => {
    const spy = newSpy();
    render(<Host spy={spy} />);
    await userEvent.click(row(/^notes\.md/));
    await userEvent.keyboard('{Escape}');
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(spy.previews.at(-1)).toBeNull();
  });
});
