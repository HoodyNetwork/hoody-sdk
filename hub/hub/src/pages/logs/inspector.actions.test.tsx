// Vitest: the Inspector's actions are one kit ActionBar: Explain is the primary, "Around this
// moment" and "This computer" sit beside it, and the other places plus "Copy for support" are in ⋯. A whole web
// address is a link with its ids masked; a path stays text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@app/testing';
import { supportLine } from './logic';
import { asTx } from './parts/words';
import type { OutState } from './controller';
import type { DataItem } from './logic';
import { Inspector } from './parts/Inspector';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const visit = (url: string): DataItem => ({
  kind: 'kit',
  k: 'k1',
  t: 1_700_000_000_000,
  id: 1,
  row: { id: 1, serviceName: 'files', method: 'GET', url, status: 500, durationMs: 12, level: 'error' },
});
const helper: DataItem = { kind: 'helper', k: 'h1', t: 1_700_000_000_000, row: { level: 'error', message: 'x' } };

const place = (id: string, label: string) => ({ id, label: table[label] as string, onPress: vi.fn() });
const base = { t, out: undefined as OutState | undefined };
const group = () => screen.getByRole('group', { name: table['act.group'] });
/** Records what the page copies (the kit's copy goes through navigator.clipboard). */
const clipboard = () => {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
  return written;
};
/** A page region (#hub-main) of the given width: ActionBar folds its secondaries into ⋯ below 600 px. */
const mainOf = (width: number) => {
  const main = document.createElement('div');
  main.id = 'hub-main';
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(main);
  return main;
};
const openMore = async () => {
  await act(async () => {
    fireEvent.click(within(group()).getByRole('button', { name: 'More actions' }));
  });
};

describe('Inspector actions', () => {
  afterEach(() => {
    cleanup();
    document.getElementById('hub-main')?.remove();
    vi.restoreAllMocks();
  });

  it('shows Explain as the one primary, Around and This computer beside it, and nothing else as a button', () => {
    const onExplain = vi.fn();
    const onAround = vi.fn();
    const links = [place('computer', 'lk.computer'), place('bots', 'lk.bots'), place('script', 'lk.script')];
    render(<Inspector {...base} item={visit('/files/a.txt')} onExplain={onExplain} onAround={onAround} links={links} />);
    const names = within(group()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual([table['act.around'], table['lk.computer'], table['act.explain'], 'More actions']);
    fireEvent.click(within(group()).getByRole('button', { name: table['act.explain'] }));
    expect(onExplain).toHaveBeenCalledTimes(1);
    fireEvent.click(within(group()).getByRole('button', { name: table['act.around'] }));
    expect(onAround).toHaveBeenCalledWith(1_700_000_000_000);
    fireEvent.click(within(group()).getByRole('button', { name: table['lk.computer'] }));
    expect(links[0]?.onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('keeps the other places and Copy for support in ⋯, the copy last; each place runs its own handler', async () => {
    const links = [place('computer', 'lk.computer'), place('bots', 'lk.bots'), place('programs', 'lk.programs')];
    render(<Inspector {...base} item={visit('/files/a.txt')} onExplain={() => {}} onAround={() => {}} links={links} />);
    await openMore();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([table['lk.bots'], table['lk.programs'], table['act.copy']]);
    for (const [i, label] of [[1, 'lk.bots'], [2, 'lk.programs']] as const) {
      if (!screen.queryByRole('menuitem', { name: table[label] })) await openMore();
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: table[label] }));
      });
      expect(links[i]?.onPress).toHaveBeenCalledTimes(1);
    }
    expect(links[0]?.onPress).not.toHaveBeenCalled();
  });

  it('Copy for support copies the support line of the shown line, the same text the old control copied', async () => {
    const written = clipboard();
    const item = visit('/files/a.txt');
    render(<Inspector {...base} item={item} onExplain={() => {}} onAround={() => {}} />);
    await openMore();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: table['act.copy'] }));
    });
    const line = supportLine(item, asTx(t));
    expect(line).toContain('GET');
    expect(written).toEqual([line]);
  });

  it('on a narrow page folds Around and This computer into ⋯, before the other places and the copy', async () => {
    mainOf(390);
    const onAround = vi.fn();
    const links = [place('computer', 'lk.computer'), place('bots', 'lk.bots')];
    render(<Inspector {...base} item={visit('/files/a.txt')} onExplain={() => {}} onAround={onAround} links={links} />);
    const names = within(group()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual([table['act.explain'], 'More actions']);
    await openMore();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([table['act.around'], table['lk.computer'], table['lk.bots'], table['act.copy']]);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: table['lk.computer'] }));
    });
    expect(links[0]?.onPress).toHaveBeenCalledTimes(1);
    await openMore();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: table['act.around'] }));
    });
    expect(onAround).toHaveBeenCalledWith(1_700_000_000_000);
  });

  it('has only Copy for support in ⋯ and no Around for an AI helper line with no places', async () => {
    render(<Inspector {...base} item={helper} onExplain={() => {}} onAround={() => {}} />);
    expect(within(group()).queryByRole('button', { name: table['act.around'] })).toBeNull();
    expect(within(group()).getByRole('button', { name: table['act.explain'] })).toBeTruthy();
    await openMore();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([table['act.copy']]);
  });

  it('shows a whole program address as a link with its ids masked, still copyable; a path stays text', () => {
    const url = `https://${ID}-${ID}.example.test/files/a.txt`;
    const { container } = render(<Inspector {...base} item={visit(url)} onExplain={() => {}} onAround={() => {}} />);
    expect(container.textContent).not.toContain(ID);
    expect(container.innerHTML).not.toContain(ID);
    const fact = screen.getByText(table['det.address'] as string).closest('div') as HTMLElement;
    expect(fact.className).toMatch(/factWide/);
    expect(within(fact).getAllByRole('button').length).toBeGreaterThanOrEqual(2); // open (secret link) + copy
    cleanup();
    render(<Inspector {...base} item={visit('/files/a.txt')} onExplain={() => {}} onAround={() => {}} />);
    const path = screen.getByText(table['det.address'] as string).closest('div') as HTMLElement;
    expect(path.textContent).toContain('/files/a.txt');
  });

  it('masks a web address whose secret is a token in the query, on a host with no id; open and copy use it whole', async () => {
    const TOKEN = 'tok_9f8e7d6c5b4a';
    const url = `https://downloads.example.test/get/a.txt?token=${TOKEN}`;
    const written = clipboard();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Inspector {...base} item={visit(url)} onExplain={() => {}} onAround={() => {}} />);
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.body.innerHTML).not.toContain('downloads.example.test');
    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      expect(`${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`).not.toContain(TOKEN);
    }
    expect(document.querySelector('a[href]')).toBeNull();
    const fact = screen.getByText(table['det.address'] as string).closest('div') as HTMLElement;
    const shown = within(fact).getByRole('button', { name: /^https:\/\/••••/ });
    await act(async () => {
      fireEvent.click(shown);
    });
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener');
    await act(async () => {
      fireEvent.click(within(fact).getByRole('button', { name: /copy/i }));
    });
    expect(written).toEqual([url]);
  });
});
