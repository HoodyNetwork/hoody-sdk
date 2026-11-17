// "Rename realms…" in the realm menu and the
// phone sheet opens one Dialog listing every realm (name, short id, a pen). The pen opens the row's form: the name goes
// through core's alias write once (C9), the colour is this browser's. A lost answer holds every rename until a fresh
// read of the alias map settles it. A token session pinned to one realm cannot rename: no entry, and the hook is null.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-aria-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type * as CoreShellMod from '@core/shell';
import type { PageManifest } from '@kit/page';
import { Toaster } from '@kit/states/Toast';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import { useRenameRealms } from '@kit';
import { RenameRealmsProvider } from './RenameRealms';
import { PhoneContext, RealmSwitcher } from './Switchers';

const R1 = '6a00000000000000000000c1';
const R2 = '6a00000000000000000000c2';
type Fn = (...a: unknown[]) => unknown;
const core = vi.hoisted(() => ({
  pinned: null as string | null,
  aliases: {} as Record<string, string>,
  setAlias: undefined as unknown as Fn,
  read: undefined as unknown as Fn,
  tint: undefined as unknown as Fn,
  load: undefined as unknown as Fn,
}));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return {
    ...real,
    useCan: () => true,
    // A live context for the kit's sticky toast (usePendingToast captures one and shows the toast only while alive).
    capture: () => ({ gen: 1 }),
    alive: () => true,
    onBump: () => () => {},
    readRealmAliases: () => core.read(),
    useRealms: () => ({
      selected: R2,
      pinned: core.pinned,
      rows: [R1, R2].map((id) => ({
        id,
        name: core.aliases[id] ? { kind: 'alias', text: core.aliases[id] } : { kind: 'short', text: `${id.slice(0, 4)}…${id.slice(-4)}` },
        tint: id === R1 ? 'blue' : 'green',
        computers: 1,
      })),
    }),
  };
});
vi.mock('@core/shell', async (orig) => {
  const real = await orig<typeof CoreShellMod>();
  return {
    ...real,
    setRealmAlias: (...a: unknown[]) => core.setAlias(...a),
    setRealmTint: (...a: unknown[]) => core.tint(...a),
    loadRealms: () => core.load(),
  };
});

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const realms = [
  { id: R1, name: 'Acme client', color: 'blue' },
  { id: R2, name: '6a00…00c2', color: 'green' },
] as ShellData['realms'];

/** A page: it reaches the opener through @kit, never the shell. */
function OpenFromPage({ id }: { id?: string }) {
  const open = useRenameRealms();
  return open ? <button onClick={() => open(id)}>page rename</button> : <p>no rename</p>;
}

function mount(node: ReactNode, data: Partial<ShellData> = {}, pages = ['home']) {
  render(
    <RouterProvider navigate={vi.fn()}>
      <PagesProvider pages={pages.map(pg)}>
        <ShellDataProvider value={{ realms, realmId: R2, computers: [], setRealm: vi.fn(), ...data } as ShellData}>
          <RenameRealmsProvider>{node}</RenameRealmsProvider>
          <Toaster />
        </ShellDataProvider>
      </PagesProvider>
    </RouterProvider>,
  );
}
const press = async (el: Element) => act(async () => { fireEvent.click(el); });
const openRealmMenu = async () => press(screen.getByRole('button', { name: / Realm$/ }));
const openDialog = async () => {
  await openRealmMenu();
  await press(screen.getByRole('menuitem', { name: 'Rename realms…' }));
};
const dialog = () => screen.getByRole('dialog', { name: 'Rename realms' });
const nameField = () => screen.getByRole('textbox', { name: 'Name' });
const typeName = (v: string) => act(async () => { fireEvent.change(nameField(), { target: { value: v } }); });
const save = async () => press(screen.getByRole('button', { name: 'Save' }));
/** The polite status line that says `text` (the dialog has other live regions). */
const statusSays = (text: string) => expect(screen.getByText(text).closest('[role="status"]')).not.toBeNull();

beforeEach(() => {
  core.pinned = null;
  core.aliases = { [R1]: 'Acme client' };
  core.setAlias = vi.fn(() => Promise.resolve({}));
  core.read = vi.fn(() => Promise.resolve({}));
  core.tint = vi.fn(() => true);
  core.load = vi.fn(() => Promise.resolve(null));
});
afterEach(() => {
  vi.useRealTimers();
});
// The kit's toast queue is global, and a dialog unmounted with a held rename shows its sticky toast a tick later:
// clear what an earlier test left before this one looks for its own toast.
beforeEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const r = render(<Toaster />);
  for (const b of screen.queryAllByRole('button', { name: 'Dismiss' })) await act(async () => { fireEvent.click(b); });
  r.unmount();
});

describe('Rename realms: the entry and the list', () => {
  it('the realm menu has "Rename realms…"; it opens a dialog with every realm, its short id and a pen', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    const d = dialog();
    expect(d).toHaveTextContent('Acme client');
    expect(d).toHaveTextContent('6a00…00c1');
    expect(d).toHaveTextContent('6a00…00c2');
    expect(d.textContent).not.toMatch(/[0-9a-f]{24}/);
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename 6a00…00c2' })).toBeInTheDocument();
  });

  it('a token session pinned to one realm has no entry, and the hook gives pages nothing to open', async () => {
    core.pinned = R1;
    mount(
      <>
        <RealmSwitcher />
        <OpenFromPage />
      </>,
      { setRealm: undefined },
    );
    await openRealmMenu();
    expect(screen.queryByRole('menuitem', { name: 'Rename realms…' })).toBeNull();
    expect(screen.getByText('no rename')).toBeInTheDocument();
  });

  it('with no realm listed there is nothing to rename: no entry in the realm menu', async () => {
    mount(<RealmSwitcher />, { realms: [], realmId: 'all' }, ['home', 'realms']);
    await openRealmMenu();
    expect(screen.getByRole('menuitem', { name: 'New realm…' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Rename realms…' })).toBeNull();
  });

  it('the phone sheet has the same entry', async () => {
    mount(<PhoneContext />);
    await press(screen.getByRole('button', { name: / Realm and computer$/ }));
    await press(screen.getByRole('button', { name: 'Rename realms…' }));
    expect(dialog()).toBeInTheDocument();
  });

  it('a page opens it on one realm (useRenameRealms): straight into that row\'s form', async () => {
    mount(<OpenFromPage id={R1} />);
    await press(screen.getByText('page rename'));
    expect(dialog()).toBeInTheDocument();
    expect(nameField()).toHaveValue('Acme client');
  });
});

describe('Rename realms: the form', () => {
  it('the pen opens the form in place; an unnamed realm has an empty name with its short id as placeholder', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename 6a00…00c2' }));
    expect(nameField()).toHaveValue('');
    expect(nameField()).toHaveAttribute('placeholder', '6a00…00c2');
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument();
  });

  it('Save sends the name once; a second press while it runs sends nothing; done shows a polite status', async () => {
    let resolve: (v: Record<string, string>) => void = () => {};
    core.setAlias = vi.fn(() => new Promise((r) => { resolve = r; }));
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('Acme');
    await save();
    await save();
    expect(core.setAlias).toHaveBeenCalledTimes(1);
    expect(core.setAlias).toHaveBeenCalledWith(R1, 'Acme');
    await act(async () => resolve({ [R1]: 'Acme' }));
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    statusSays('Renamed to Acme');
  });

  it('Enter in the name saves', async () => {
    const user = userEvent.setup();
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('Acme');
    await act(async () => { nameField().focus(); });
    await user.keyboard('{Enter}');
    expect(core.setAlias).toHaveBeenCalledWith(R1, 'Acme');
  });

  it('the name is sent trimmed', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('  Acme  ');
    await save();
    expect(core.setAlias).toHaveBeenCalledWith(R1, 'Acme');
  });

  it('a cleared name is sent as empty: the realm shows its short id again', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('');
    await save();
    expect(core.setAlias).toHaveBeenCalledWith(R1, '');
  });

  it('a colour pick is kept on this device; with the name unchanged nothing is sent', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await press(screen.getByRole('radio', { name: 'Pink' }));
    await save();
    expect(core.tint).toHaveBeenCalledWith(R1, 'pink');
    expect(core.setAlias).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('Escape in the form closes the form only; Escape again closes the dialog', async () => {
    const user = userEvent.setup();
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await act(async () => { nameField().focus(); });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(dialog()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename realms' })).toBeNull());
  });
});

describe('Rename realms: refusals in plain words, the text kept', () => {
  const cases: Array<[string, unknown, string]> = [
    ['reserved', { code: 'ALIAS_INVALID', reason: 'reserved', word: 'all', notSent: true }, '“all” is a word the Hub uses. Pick another name.'],
    ['length', { code: 'ALIAS_INVALID', reason: 'length', notSent: true }, 'Names can be up to 64 characters.'],
    ['control', { code: 'ALIAS_INVALID', reason: 'control', notSent: true }, "Names can't contain hidden or control characters."],
    ['taken', { code: 'NAME_TAKEN', id: R2, notSent: true, kind: 'not_sent' }, 'Another realm is already called that.'],
    // The name map was read without a usable ETag, so setAlias refused before any write.
    ['names not read safely', { code: 'CAS_REQUIRED', notSent: true, kind: 'not_sent' }, "The realm names could not be read safely, so the rename wasn't sent. Try again."],
    ['failed', { status: 500, code: 'INTERNAL' }, "Couldn't rename the realm. Its name wasn't changed."],
    // The alias write carries If-Match; a rename made elsewhere since the read is refused, nothing saved.
    ['changed elsewhere (412)', { status: 412, code: 'PRECONDITION_FAILED', kind: 'failed' }, 'It changed in the meantime. Check the current state, then try again.'],
    ['changed elsewhere (412, no code)', { status: 412 }, 'It changed in the meantime. Check the current state, then try again.'],
  ];
  for (const [what, err, words] of cases) {
    it(`${what}: "${words}"`, async () => {
      core.setAlias = vi.fn(() => Promise.reject(err));
      mount(<RealmSwitcher />);
      await openDialog();
      await press(screen.getByRole('button', { name: 'Rename Acme client' }));
      await typeName('all');
      await save();
      expect(dialog()).toHaveTextContent(words);
      expect(nameField()).toHaveValue('all');
    });
  }
});

describe('Rename realms: a 412 is a definite refusal, never resent by itself', () => {
  it('shows the conflict words, keeps the form and the typed name, and sends once', async () => {
    core.setAlias = vi.fn(() => Promise.reject({ status: 412, code: 'PRECONDITION_FAILED', kind: 'failed' }));
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('Acme');
    await save();
    expect(dialog()).toHaveTextContent('It changed in the meantime. Check the current state, then try again.');
    expect(dialog()).not.toHaveTextContent("Couldn't rename");
    expect(dialog()).not.toHaveTextContent('Rename sent, no answer yet.');
    expect(nameField()).toHaveValue('Acme');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(core.setAlias).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });
});

describe('Rename realms: a lost answer is held, never failed (C9)', () => {
  const lose = async () => {
    core.setAlias = vi.fn(() => Promise.reject({ kind: 'pending', pending: true }));
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('Acme');
    await save();
  };

  it('the row says it was sent with no answer; every pen waits; nothing is resent', async () => {
    await lose();
    expect(dialog()).toHaveTextContent('Rename sent, no answer yet.');
    expect(dialog()).not.toHaveTextContent("Couldn't rename");
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rename 6a00…00c2' })).toBeDisabled();
    expect(core.setAlias).toHaveBeenCalledTimes(1);
  });

  it('Check again reads the map: the new name there means renamed (and the shell reloads its names)', async () => {
    await lose();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme' }));
    await press(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => statusSays('Renamed to Acme'));
    expect(core.load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).not.toBeDisabled();
    expect(core.setAlias).toHaveBeenCalledTimes(1);
  });

  it('Check again reads the old name: not yet, the hold stays (the write may still land), and a later read settles it', async () => {
    await lose();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme client' }));
    await press(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(dialog()).toHaveTextContent('Not applied yet'));
    expect(dialog()).not.toHaveTextContent("The rename didn't apply.");
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).toBeDisabled();
    expect(core.setAlias).toHaveBeenCalledTimes(1);
    // The write landed meanwhile: the next Check again reads the new name and settles it.
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme' }));
    await press(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => statusSays('Renamed to Acme'));
    expect(core.setAlias).toHaveBeenCalledTimes(1);
  });

  it('after a read found the old name, Stop tracking frees the pens with words that it may still go through; nothing is sent', async () => {
    await lose();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme client' }));
    await press(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(dialog()).toHaveTextContent('Not applied yet'));
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).toBeDisabled();
    await press(screen.getByRole('button', { name: 'Stop tracking' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Acme client' })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: 'Rename 6a00…00c2' })).not.toBeDisabled();
    expect(dialog()).toHaveTextContent('Stopped tracking. The rename may still go through');
    expect(within(dialog()).queryByRole('button', { name: 'Check again' })).toBeNull();
    expect(core.setAlias).toHaveBeenCalledTimes(1);
  });

  it('Stop tracking is offered only once a read found the old name', async () => {
    await lose();
    expect(within(dialog()).queryByRole('button', { name: 'Stop tracking' })).toBeNull();
  });

  it('a Check again whose read fails keeps the hold', async () => {
    await lose();
    core.read = vi.fn(() => Promise.reject({ status: 503 }));
    await press(screen.getByRole('button', { name: 'Check again' }));
    await act(async () => { await Promise.resolve(); });
    expect(dialog()).toHaveTextContent('Rename sent, no answer yet.');
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).toBeDisabled();
  });
});

// Each test below failed before its fix.
describe('Rename realms: one hold, owned by the provider, settled once', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  };
  const lose = async (pen = 'Rename Acme client', to = 'Acme') => {
    core.setAlias = vi.fn(() => Promise.reject({ kind: 'pending', pending: true }));
    await press(screen.getByRole('button', { name: pen }));
    await typeName(to);
    await save();
  };
  const closeDialog = async () => {
    await press(within(dialog()).getByRole('button', { name: (n, el) => n === 'Close' && !el.hasAttribute('data-dialog-close') }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename realms' })).toBeNull());
  };
  /** The sticky toast's Check again (the dialog closed while the rename was held). */
  const toastCheck = async () => {
    const body = await screen.findByText(/The window closed before the server confirmed it/);
    const toast = body.closest('[data-outcome]') as HTMLElement;
    return within(toast).getByRole('button', { name: 'Check again' });
  };
  const dialogCheck = () => within(dialog()).getByRole('button', { name: 'Check again' });

  it('a Check again from the toast of an earlier rename never clears a newer held rename', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await lose(); // A: Acme client -> Acme, answer lost
    await closeDialog();
    const late = deferred<Record<string, string>>();
    core.read = vi.fn(() => late.promise);
    await press(await toastCheck()); // A's toast read, still out
    await openDialog();
    // The reopened dialog settles A with its own fresh read.
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme' }));
    core.aliases = { [R1]: 'Acme' };
    await press(dialogCheck());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Acme' })).not.toBeDisabled());
    await lose('Rename Acme', 'Acme two'); // B: Acme -> Acme two, answer lost
    expect(dialog()).toHaveTextContent('Rename sent, no answer yet.');
    // A's old toast read lands now, showing A's name: it must not touch B.
    await act(async () => { late.resolve({ [R1]: 'Acme' }); await late.promise; });
    expect(dialog()).toHaveTextContent('Rename sent, no answer yet.');
    expect(screen.getByRole('button', { name: 'Rename Acme' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rename 6a00…00c2' })).toBeDisabled();
  });

  it('the toast of a rename another read already settled closes on Check again without reading again', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await lose();
    await closeDialog();
    const check = await toastCheck();
    await openDialog();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme' }));
    await press(dialogCheck());
    await waitFor(() => statusSays('Renamed to Acme'));
    expect(core.read).toHaveBeenCalledTimes(1);
    await press(check);
    await waitFor(() => expect(screen.queryByText(/The window closed before the server confirmed it/)).toBeNull());
    expect(core.read).toHaveBeenCalledTimes(1);
  });

  it('a toast Check again that proves the rename closes the toast', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await lose();
    await closeDialog();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme' }));
    await press(await toastCheck());
    await waitFor(() => expect(screen.queryByText(/The window closed before the server confirmed it/)).toBeNull());
    expect(core.load).toHaveBeenCalled();
  });

  it('a dialog reopened while the toast reads shows the settled state, not a stale pending outcome', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await lose();
    await closeDialog();
    const late = deferred<Record<string, string>>();
    core.read = vi.fn(() => late.promise);
    await press(await toastCheck());
    await openDialog();
    expect(dialog()).toHaveTextContent('Rename sent, no answer yet.');
    await act(async () => { late.resolve({ [R1]: 'Acme' }); await late.promise; });
    await waitFor(() => expect(within(dialog()).queryByRole('button', { name: 'Check again' })).toBeNull());
    expect(dialog()).not.toHaveTextContent(/may have gone through/i);
    expect(dialog()).not.toHaveTextContent('Rename sent, no answer yet.');
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).not.toBeDisabled();
  });

  it('Check again reading a third name says it was renamed elsewhere (not "didn\'t apply") and reloads the names', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await lose();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Client North' }));
    await press(dialogCheck());
    await waitFor(() => statusSays('It was renamed somewhere else meanwhile and is now called Client North.'));
    expect(dialog()).not.toHaveTextContent("The rename didn't apply.");
    expect(core.load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Rename Acme client' })).not.toBeDisabled();
  });

  it('Check again reading the old name reloads the names too', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await lose();
    core.read = vi.fn(() => Promise.resolve({ [R1]: 'Acme client' }));
    await press(dialogCheck());
    await waitFor(() => expect(dialog()).toHaveTextContent('Not applied yet'));
    expect(core.load).toHaveBeenCalledTimes(1);
  });
});

describe('Rename realms: keyboard', () => {
  it('Escape, Cancel and a finished Save give the focus back to that row\'s pen', async () => {
    const user = userEvent.setup();
    mount(<RealmSwitcher />);
    await openDialog();
    const pen = () => screen.getByRole('button', { name: 'Rename Acme client' });
    await press(pen());
    await act(async () => { nameField().focus(); });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(pen()));
    await press(pen());
    await press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(pen()));
    await press(pen());
    await typeName('Acme');
    await save();
    await waitFor(() => statusSays('Renamed to Acme'));
    await waitFor(() => expect(document.activeElement).toBe(pen()));
  });

  it('Enter that ends an IME composition does not save', async () => {
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await typeName('Acme');
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Enter', keyCode: 229 }); });
    expect(core.setAlias).not.toHaveBeenCalled();
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Enter', isComposing: true }); });
    expect(core.setAlias).not.toHaveBeenCalled();
    expect(nameField()).toHaveValue('Acme');
  });
});

describe('Rename realms: words', () => {
  it('a colour kept with a failed name says only the name was not changed', async () => {
    core.setAlias = vi.fn(() => Promise.reject({ status: 500, code: 'INTERNAL' }));
    mount(<RealmSwitcher />);
    await openDialog();
    await press(screen.getByRole('button', { name: 'Rename Acme client' }));
    await press(screen.getByRole('radio', { name: 'Red' }));
    await typeName('Acme');
    await save();
    expect(core.tint).toHaveBeenCalledWith(R1, 'red');
    expect(dialog()).toHaveTextContent("Couldn't rename the realm. Its name wasn't changed.");
    expect(dialog()).not.toHaveTextContent('Nothing was changed');
  });
});
