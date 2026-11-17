// Vitest: Add a program's notices that replace a list (the computer gone for an app or its
// extensions, a stopped computer's browser, an app's computer not running) move the focus
// only when the control that held it went away (to the notice's first button, else the notice, else the step's title),
// or after a press that changes the view to one that takes none (to its title). A later read never pulls the focus
// back from a crumb the person focused.
import { answers, BOARD_BROWSER_IDS, boardFixtureRoute, bootFixtureCore, CoreQueryProvider, reply } from '@core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSIONS_PATH } from '../codeExtensions';
import { NOTES_TEAM } from '../fixtures';
import type { BoardComputer } from '../computers';
import type { Power } from './lifecycle';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas')]} failed={false} complete onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
/** The current step's name in the crumbs: the one target the focus moves to. */
const stepTitle = () => document.querySelector<HTMLElement>('[aria-current="step"]');
const firstCrumb = () => screen.getAllByRole('button', { name: /^Back to / })[0]!;
const settle = () => act(async () => { await new Promise((x) => setTimeout(x, 0)); });
/** The first control of the open step's form (BrowserForm and SshForm focus it when they open). */
const formFirst = async () => { await screen.findAllByRole('textbox'); return document.querySelector('form')!.querySelector<HTMLElement>('input, button')!; };
const EXT_LIST = {
  instance: { id: 1, state: 'running', startedAt: null },
  observed: { status: 'ok', scope: 'instance', instanceId: 1, extensions: [{ logicalKey: 'ms-python.python', publisher: 'ms-python', name: 'python', stagedVersion: null, installedVersion: '1.0.0', status: 'running', reason: '', installedOnly: true }] },
  desired: { status: 'ok', scope: 'shared-across-instances', extensions: [] },
  partial: false,
  message: '',
};
const power = (o: Partial<Power> = {}): Power => ({ op: 'start', heldOp: null, ownHold: false, holdId: null, heldFrom: null, busy: false, pending: false, outcome: null, run() {}, check: async () => true, dismiss: async () => false, ...o });

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('a notice never pulls the focus back from a crumb the person focused', () => {
  const cases: [string, Partial<PickerProps>, string][] = [
    ['the computer of an app is gone', { start: { step: 'app', computer: 'c-missing' } }, S['picker.appGone']!],
    ['the computer of the extensions is gone', { start: { step: 'extension', computer: 'c-missing' } }, S['picker.extensionGone']!],
    ['the browser of a stopped computer', { computers: [pc('c2', 'cedar', 'stopped')], start: { step: 'browser', computer: 'c2' } }, S['browser.stopped']!.replace('{{computer}}', 'cedar')],
    ['an app on a stopped computer, its Start offered', { computers: [pc('c2', 'cedar', 'stopped')], start: { step: 'app', computer: 'c2' }, power: () => power() }, S['picker.appStart']!],
  ];
  for (const [what, p, text] of cases) {
    it(`${what}: a later read leaves the focused crumb where it is`, async () => {
      const { rerender } = render(picker(p));
      expect(await screen.findByText(text)).toBeInTheDocument();
      const crumb = firstCrumb();
      crumb.focus();
      rerender(picker({ ...p, computers: [...(p.computers ?? [pc('c1', 'atlas')])] }));
      await settle();
      rerender(picker({ ...p, computers: [...(p.computers ?? [pc('c1', 'atlas')])] }));
      await settle();
      expect(crumb).toHaveFocus();
    });
  }
});

describe('a press that changes the view: the new view takes the focus, never the page', () => {
  it("the computer of the extensions is gone: Choose a computer moves it to the computer step's title", async () => {
    const user = userEvent.setup();
    render(picker({ start: { step: 'extension', computer: 'c-missing' } }));
    expect(await screen.findByText(S['picker.extensionGone']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.appChooseAgain']! }));
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });
  it('the computer of an app is gone and none is left: Choose a computer moves it to the computer step\'s title', async () => {
    const user = userEvent.setup();
    render(picker({ computers: [], start: { step: 'app', computer: 'c-missing' } }));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.appChooseAgain']! }));
    expect(await screen.findByText(/No computers in Personal/)).toBeInTheDocument();
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });
  it("the computer of an app is gone: Choose a computer opens the computer step, whose title takes the focus", async () => {
    const user = userEvent.setup();
    render(picker({ start: { step: 'app', computer: 'c-missing' } }));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: S['picker.appChooseAgain']! }));
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });
});

describe("the control that held the focus went away: the notice's first button takes it, else the notice, else the title", () => {
  it('the browser form is replaced by the stopped card while its field has the focus', async () => {
    const p: Partial<PickerProps> = { start: { step: 'browser', computer: 'c1' } };
    const { rerender } = render(picker(p));
    const field = (await screen.findAllByRole('textbox'))[0]!;
    field.focus();
    expect(field).toHaveFocus();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas', 'stopped')] }));
    expect(await screen.findByText(S['browser.stopped']!.replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: S['picker.backStep']! })).toHaveFocus());
    const crumb = firstCrumb();
    crumb.focus();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas', 'stopped')] }));
    await settle();
    expect(crumb).toHaveFocus();
  });

  it("an app's Start has the focus and its computer leaves the list: the gone notice's Choose a computer takes it", async () => {
    const p: Partial<PickerProps> = { start: { step: 'app', computer: 'c2' }, power: () => power() };
    const { rerender } = render(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')] }));
    (await screen.findByRole('button', { name: S['tile.start']! })).focus();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: S['picker.appChooseAgain']! })).toHaveFocus());
  });

  it("the extensions' search has the focus and the computer leaves the list: the search stays and keeps it", async () => {
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => answers.ok(EXT_LIST))] });
    const p: Partial<PickerProps> = { start: { step: 'extension', computer: 'c1' } };
    const { rerender } = render(picker(p));
    const search = await screen.findByRole('searchbox', { name: S['picker.searchExtensions']! });
    await waitFor(() => expect(search).toHaveFocus());
    rerender(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')] }));
    expect(await screen.findByText(S['picker.extensionGone']!)).toBeInTheDocument();
    await settle();
    expect(search).toHaveFocus();
  });

  it("the extensions' Try again has the focus and the computer leaves the list: the gone notice's Choose a computer takes it", async () => {
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => answers.refused(500, 'internal-error'))] });
    const p: Partial<PickerProps> = { start: { step: 'extension', computer: 'c1' } };
    const { rerender } = render(picker(p));
    expect(await screen.findByText(S['picker.extensionsFailed']!)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Try again' }).focus();
    rerender(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')] }));
    expect(await screen.findByText(S['picker.extensionGone']!)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: S['picker.appChooseAgain']! })).toHaveFocus());
  });


  it('a notice with nothing to take the focus parks it on the title; the gone notice that follows takes it from there', async () => {
    const p: Partial<PickerProps> = { start: { step: 'app', computer: 'c2' } };
    const { rerender } = render(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')], power: () => power() }));
    (await screen.findByRole('button', { name: S['tile.start']! })).focus();
    rerender(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')], power: () => power({ busy: true }) }));
    await waitFor(() => expect(stepTitle()).toHaveFocus());
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: S['picker.appChooseAgain']! })).toHaveFocus());
  });

  it('a crumb the person focuses after the focus parked keeps it when the gone notice comes (parked hands over only from the title)', async () => {
    const p: Partial<PickerProps> = { start: { step: 'app', computer: 'c2' } };
    const { rerender } = render(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')], power: () => power() }));
    (await screen.findByRole('button', { name: S['tile.start']! })).focus();
    rerender(picker({ ...p, computers: [pc('c2', 'cedar', 'stopped')], power: () => power({ busy: true }) }));
    await waitFor(() => expect(stepTitle()).toHaveFocus());
    const crumb = firstCrumb();
    crumb.focus();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    await settle();
    // The crumb the person focused is the same control after the read (not drawn again elsewhere), and keeps the focus.
    expect(crumb.isConnected).toBe(true);
    expect(crumb).toHaveFocus();
  });

  it("an app's Start goes away when the computer turns busy while it has the focus", async () => {
    const p: Partial<PickerProps> = { computers: [pc('c2', 'cedar', 'stopped')], start: { step: 'app', computer: 'c2' } };
    const { rerender } = render(picker({ ...p, power: () => power() }));
    const startBtn = await screen.findByRole('button', { name: S['tile.start']! });
    startBtn.focus();
    rerender(picker({ ...p, power: () => power({ busy: true }) }));
    expect(await screen.findByText(S['picker.appStarting']!)).toBeInTheDocument();
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });
});

describe('a read never pulls the focus to the list or the form from a crumb (their focus runs when they open)', () => {
  const steps: [string, Partial<PickerProps>, () => Promise<HTMLElement>][] = [
    ["the program step's first tile", { start: { step: 'program', computer: 'c1' } }, async () => (await screen.findAllByRole('row'))[0]!], // the step's first tile
    ["the web page form's first field", { start: { step: 'link' } }, async () => (await screen.findAllByRole('textbox'))[0]!],
    // These two forms draw their own first control (a select, a computer choice): their focus must also run only when they open.
    ["the browser form's first control", { start: { step: 'browser', computer: 'c1' } }, formFirst],
    ["the SSH form's first control", { start: { step: 'ssh' } }, formFirst],
  ];
  for (const [what, p, target] of steps) {
    it(`${what} takes the focus when its step opens`, async () => {
      render(picker(p));
      const el = await target();
      await waitFor(() => expect(el).toHaveFocus());
    });
    it(`${what}: two later reads leave a focused crumb where it is`, async () => {
      const { rerender } = render(picker(p));
      await waitFor(async () => expect(await target()).toHaveFocus());
      const crumb = firstCrumb();
      crumb.focus();
      rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
      await settle();
      rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
      await settle();
      expect(crumb).toHaveFocus();
    });
  }





  it("the gone notice's button had the focus and the empty Board is clicked: later reads leave it on the page", async () => {
    const p: Partial<PickerProps> = { start: { step: 'app', computer: 'c-missing' } };
    const { rerender } = render(picker(p));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: S['picker.appChooseAgain']! });
    choose.focus();
    choose.blur();
    expect(document.body).toHaveFocus();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    await settle();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    await settle();
    expect(document.body).toHaveFocus();
  });

  // The window loses the focus (another app, another tab): the browser blurs the control with no relatedTarget but keeps
  // it as the active element, so nothing is lost and nothing moves; coming back focuses it again.
  it("the gone notice's button had the focus and the window loses it: reads move nothing, and on return it still has it", async () => {
    const p: Partial<PickerProps> = { start: { step: 'app', computer: 'c-missing' } };
    const { rerender } = render(picker(p));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: S['picker.appChooseAgain']! });
    choose.focus();
    fireEvent.blur(choose);
    expect(choose).toHaveFocus();
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    await settle();
    expect(choose).toHaveFocus();
    fireEvent.focus(choose);
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    await settle();
    expect(choose).toHaveFocus();
  });
});

describe('a control removed by its own press or by a read never leaves the focus on the page', () => {

  it('the computer of a new browser leaves the list while its form has the focus: a gone notice takes it, and Choose a computer moves it to that step', async () => {
    const user = userEvent.setup();
    const p: Partial<PickerProps> = { start: { step: 'browser', computer: 'c1' } };
    const { rerender } = render(picker(p));
    (await screen.findAllByRole('textbox'))[0]!.focus();
    rerender(picker({ ...p, computers: [pc('c2', 'cedar')] }));
    expect(await screen.findByText(S['picker.browserGone']!)).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: S['picker.appChooseAgain']! });
    await waitFor(() => expect(choose).toHaveFocus());
    await user.click(choose);
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });

  it("the extensions' Try again is pressed: its search field takes the focus while the list reads again", async () => {
    const user = userEvent.setup();
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => answers.refused(500, 'internal-error'))] });
    render(picker({ start: { step: 'extension', computer: 'c1' } }));
    expect(await screen.findByText(S['picker.extensionsFailed']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('searchbox', { name: S['picker.searchExtensions']! })).toHaveFocus());
  });

  it("the notebooks' Try again is pressed: the title holds the focus while they read, then the next Try again takes it", async () => {
    const user = userEvent.setup();
    bootFixtureCore({ rules: [reply(boardFixtureRoute('notes', 'GET', '/api/v1/notes/notebooks'), () => answers.refused(500, 'internal-error'))] });
    render(picker({ start: { step: 'notebook', computer: 'c1' } }));
    expect(await screen.findByText(S['picker.notebooksFailed']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(document.body).not.toHaveFocus());
    expect(await screen.findByText(S['picker.notebooksFailed']!)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
  });

  it("a notebook's pages Try again is pressed: its search field takes the focus while they read again", async () => {
    const user = userEvent.setup();
    bootFixtureCore({ rules: [
      reply(boardFixtureRoute('notes', 'GET', '/api/v1/notes/notebooks'), () => answers.ok({ notebooks: [{ id: NOTES_TEAM, name: 'Team', user: { id: 'a1b2c3d4e5f6a7b8c9d0e1f2', role: 'owner' }, status: 1 }] })),
      reply(boardFixtureRoute('notes', 'GET', `/api/v1/notes/notebooks/${NOTES_TEAM}/nodes`), () => answers.refused(500, 'internal-error')),
    ] });
    render(picker({ start: { step: 'notebook', computer: 'c1' } }));
    await user.click(await screen.findByRole('option', { name: /^Team/ }));
    expect(await screen.findByText(S['picker.pagesFailed']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('searchbox', { name: S['picker.searchPages']! })).toHaveFocus());
  });

  it("the computer step's unread Try again is pressed: the search field takes the focus while the list reads again", async () => {
    const user = userEvent.setup();
    const p: Partial<PickerProps> = { start: { step: 'computer' } };
    let retried = 0;
    const { rerender } = render(picker({ ...p, computers: [], failed: true, onRetry: () => { retried++; } }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(retried).toBe(1);
    rerender(picker({ ...p, computers: null, failed: false }));
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('the Computer crumb is pressed: the computer step, which takes no focus itself, gets it on its title', async () => {
    const user = userEvent.setup();
    render(picker({ start: { step: 'program', computer: 'c1' } }));
    await waitFor(async () => expect((await screen.findAllByRole('row'))[0]).toHaveFocus());
    await user.click(firstCrumb());
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });
});

describe('a step whose computer is not there (still reading, or gone) keeps a lost focus in the panel (picker-focus-lows 1b)', () => {
  it("the browser form has the focus and the computers read again: the title holds it, and the form takes it back (its first control)", async () => {
    const p: Partial<PickerProps> = { start: { step: 'browser', computer: 'c1' } };
    const { rerender } = render(picker(p));
    (await screen.findAllByRole('textbox'))[0]!.focus();
    rerender(picker({ ...p, computers: null }));
    await waitFor(() => expect(stepTitle()).toHaveFocus());
    rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
    expect((await screen.findAllByRole('textbox')).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement?.closest('form')).not.toBeNull());
  });

  it("the browser's computer is gone and the Session crumb is pressed: the session step, with no list to draw, gets it on its title", async () => {
    const user = userEvent.setup();
    const p: Partial<PickerProps> = { start: { step: 'browser', computer: 'c1' } };
    const { rerender } = render(picker(p));
    expect((await screen.findAllByRole('textbox')).length).toBeGreaterThan(0);
    rerender(picker({ ...p, computers: [pc('c2', 'cedar')] }));
    expect(await screen.findByText(S['picker.browserGone']!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Session' }));
    await waitFor(() => expect(stepTitle()).toHaveTextContent('Session'));
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });

  it("a notebook's computer is gone while its pages are open and the Notes crumb is pressed: the notes step gets it on its title", async () => {
    const user = userEvent.setup();
    bootFixtureCore({ rules: [
      reply(boardFixtureRoute('notes', 'GET', '/api/v1/notes/notebooks'), () => answers.ok({ notebooks: [{ id: NOTES_TEAM, name: 'Team', user: { id: 'a1b2c3d4e5f6a7b8c9d0e1f2', role: 'owner' }, status: 1 }] })),
      reply(boardFixtureRoute('notes', 'GET', `/api/v1/notes/notebooks/${NOTES_TEAM}/nodes`), () => answers.ok({ nodes: [{ id: 'c1b2c3d4e5f6a7b8c9d0e1f2', type: 'page', name: 'Roadmap', rootId: 'x', parentId: 'x' }], total: 1 })),
    ] });
    const p: Partial<PickerProps> = { start: { step: 'notebook', computer: 'c1' } };
    const { rerender } = render(picker(p));
    await user.click(await screen.findByRole('option', { name: /^Team/ }));
    expect(await screen.findByRole('searchbox', { name: S['picker.searchPages']! })).toBeInTheDocument();
    rerender(picker({ ...p, computers: [pc('c2', 'cedar')] }));
    await settle();
    const notesCrumb = screen.getAllByRole('button', { name: 'Back to Notes' }).at(-1)!;
    await user.click(notesCrumb);
    await waitFor(() => expect(stepTitle()).toHaveTextContent('Notes'));
    await waitFor(() => expect(stepTitle()).toHaveFocus());
  });

});

describe('a form that comes back in its step takes the focus only when the Picker would (picker-form-inline-focus-refs 1c)', () => {
  const inForm = () => document.activeElement?.closest('form') ?? null;
  const allBrowsers = Array.from({ length: BOARD_BROWSER_IDS[1] }, (_, i) => ({ project: 'p1', computer: 'c1', program: 'browser' as const, session: i + 1 }));
  // Each way back: [what, the props that hide the form, the props that bring it back].
  const returns: [string, Partial<PickerProps>, Partial<PickerProps>][] = [
    ['the browser form after the computers read again', { start: { step: 'browser', computer: 'c1' }, computers: null }, { start: { step: 'browser', computer: 'c1' } }],
    ['the browser form after its full card', { start: { step: 'browser', computer: 'c1' }, known: allBrowsers }, { start: { step: 'browser', computer: 'c1' }, known: [] }],
    ['the SSH form after none was running', { start: { step: 'ssh' }, computers: [pc('c1', 'atlas', 'stopped')] }, { start: { step: 'ssh' } }],
  ];
  for (const [what, hidden, back] of returns) {
    for (const [who, target] of [['a crumb', firstCrumb], ['the title, focused by the person', () => stepTitle()!]] as const) {
      it(`${what}: ${who} keeps the focus`, async () => {
        const { rerender } = render(picker(hidden));
        await settle();
        expect(inForm()).toBeNull();
        const el = target();
        act(() => { el.focus(); });
        rerender(picker(back));
        expect((await screen.findAllByRole('textbox')).length).toBeGreaterThan(0);
        await settle();
        expect(el).toHaveFocus();
      });
    }
  }

  // The panel still counts the focus as inside and the page has it, as after a control React removes in a commit (it gets
  // no blur). A form ref that ran again on a later render would take it (the Picker's opening() says yes there), so
  // the ref must run only on mount.
  for (const [what, p] of [['the browser form', { start: { step: 'browser', computer: 'c1' } }], ['the SSH form', { start: { step: 'ssh' } }]] as const) {
    it(`${what}: a panel control that had the focus is removed, and later reads leave the focus on the page`, async () => {
      const { rerender } = render(picker(p));
      await waitFor(() => expect(inForm()).not.toBeNull());
      act(() => {
        const gone = document.createElement('button');
        screen.getByRole('navigation', { name: S['picker.title'] }).parentElement!.append(gone);
        gone.focus();
        // A direct removal, which jsdom gives no blur: only a fixture for the state a React commit removal leaves, not a model
        // of a browser removing a control.
        gone.remove();
      });
      expect(document.body).toHaveFocus();
      rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
      await settle();
      rerender(picker({ ...p, computers: [pc('c1', 'atlas')] }));
      await settle();
      expect(document.body).toHaveFocus();
    });
  }

  it('the browser form opened by a press takes the focus (a fresh step)', async () => {
    const user = userEvent.setup();
    render(picker({ start: { step: 'session', computer: 'c1', program: 'browser' } }));
    await user.click(screen.getByRole('row', { name: /^New browser with options/ }));
    await waitFor(() => expect(inForm()).not.toBeNull());
  });
});
