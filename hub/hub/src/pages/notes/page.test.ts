// Vitest: the notes page in its fixture states.
import { describe, expect, it, onTestFinished } from 'vitest';
import { fixtureWorld } from '@core';
import fixtures from './fixtures';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

describe('notes page', () => {
  it('lists the notes of each computer under its name', async () => {
    await renderPage(page, {});
    const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    await within(table).findByText('Weekly plan', undefined, { timeout: 8000 });
    expect(within(table).getByText('Staging release notes')).toBeInTheDocument();
    expect(await screen.findByText(strings['state.older'], undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a note\'s row menu opens its computer on the Computers page', async () => {
    const { router } = await renderPage(page, {});
    const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    const row = await within(table).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.openComputer'] }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.searchStr).toMatch(/\/computers\?sel=/));
  });

  it('offers "Use with your agent" in the header (AgentHint)', async () => {
    await renderPage(page, {});
    expect(await screen.findByRole('button', { name: 'Use with your agent' }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('shows the empty state when there is no computer', async () => {
    await renderPage(page, { state: 'none' });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
  });

  // No computer lists a note: one kit empty state, never a hand list of computers.
  it('no notes on any running computer, some stopped: "No notes to show" (a stopped one may hold notes), each named, New note first and Computers next', async () => {
    await renderPage(page, { state: 'empty' });
    const card = (await screen.findByRole('heading', { name: strings['empty.someTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    expect(screen.queryByRole('heading', { name: strings['empty.noneTitle'] })).toBeNull();
    // atlas, borealis, granite and harbor are running and answered with no note; cedar, dune, ember and fjord are not running.
    expect(card).toHaveTextContent("atlas, borealis, granite and 1 more have no notes yet. cedar, dune, ember and 1 more aren't running.");
    expect(within(card).getByRole('button', { name: strings['action.new'] })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: strings['action.computers'] })).toBeInTheDocument();
    // One kit card: no hand list of computers.
    expect(card.querySelector('ul, li')).toBeNull();
  });

  it('every computer running and answering with its whole list, none holding a note: "No notes yet", "none of them", New note first', async () => {
    await renderPage(page, { state: 'emptyRunning' });
    const card = (await screen.findByRole('heading', { name: strings['empty.noneTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    expect(card).toHaveTextContent(strings['empty.allNone']);
    expect(within(card).getAllByRole('button')[0]).toHaveAccessibleName(strings['action.new']);
  });

  it('no running computer\'s Notes answered: the kit error state (not an empty one), the computers named, Try again first', async () => {
    await renderPage(page, { state: 'error' });
    const card = (await screen.findByRole('heading', { name: kitStrings['state.errorTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    expect(screen.queryByRole('heading', { name: strings['empty.someTitle'] })).toBeNull();
    expect(card).toHaveTextContent(/atlas[^.]* gave no full list of notes\./);
    expect(within(card).getAllByRole('button')[0]).toHaveAccessibleName(new RegExp(strings['action.tryAgain'], 'i'));
  });

  it('Try again reads again exactly the computers that gave no whole list: not one that answered, is blocked or is stopped', async () => {
    // Each computer's answer in this state, counted as the page reads it (one read per load). granite answers whole and
    // empty; borealis gives no whole list (cantTell); atlas (no access) and harbor (older) are blocked; the rest are stopped.
    const answers = (fixtures.states.refusals.notes as { data: Record<string, unknown> }).data;
    const none = (fixtures.states.empty.notes as { data: Record<string, unknown> }).data;
    const before = { ...answers };
    const reads: Record<string, number> = {};
    const value: Record<string, unknown> = { ...answers };
    const id = (name: string) => fixtureWorld.computers.find((c) => c.name === name)!.id;
    value[id('granite')] = none[id('granite')];
    for (const c of fixtureWorld.computers) {
      reads[c.id] = 0;
      Object.defineProperty(answers, c.id, { configurable: true, enumerable: true, get: () => { reads[c.id]! += 1; return value[c.id]; } });
    }
    onTestFinished(() => { for (const k of Object.keys(answers)) delete answers[k]; Object.assign(answers, before); });
    await renderPage(page, { state: 'refusals' });
    const card = (await screen.findByRole('heading', { name: strings['empty.someTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    expect(card).toHaveTextContent(/borealis gave no full list of notes\./);
    expect(card).toHaveTextContent(/granite has no notes yet\./);
    const first = { ...reads };
    // borealis now answers whole and empty.
    value[id('borealis')] = none[id('borealis')];
    await userEvent.click(within(card).getByRole('button', { name: strings['action.tryAgain'] }));
    // The card is drawn again while the read runs: read it afresh.
    const now = async () => (await screen.findByRole('heading', { name: strings['empty.someTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    await waitFor(async () => expect(await now()).toHaveTextContent(/borealis and granite have no notes yet\./), { timeout: 8000 });
    const again = Object.fromEntries(Object.keys(reads).map((k) => [k, (reads[k] ?? 0) - (first[k] ?? 0)]).filter(([, n]) => n !== 0));
    expect(again, 'read again: borealis only, once').toEqual({ [id('borealis')]: 1 });
    expect(await now()).toHaveTextContent(/atlas and harbor can't be read here\./);
  });

  it('only stopped computers: they are named as not running, and Computers is the way on (no New note)', async () => {
    await renderPage(page, { state: 'onlyStopped' });
    const card = (await screen.findByRole('heading', { name: strings['empty.someTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    expect(card).toHaveTextContent(/(isn't|aren't) running\./);
    expect(within(card).getByRole('button', { name: strings['action.computers'] })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: strings['action.new'] })).toBeNull();
  });

  it('Notes that cannot be read here or did not answer: each named, Try again first, then Computers (stopped ones)', async () => {
    await renderPage(page, { state: 'refusals' });
    const card = (await screen.findByRole('heading', { name: strings['empty.someTitle'] }, { timeout: 8000 })).parentElement as HTMLElement;
    expect(card).toHaveTextContent(/harbor[^.]* can't be read here\./);
    expect(card).toHaveTextContent(/borealis[^.]* gave no full list of notes\./);
    expect(within(card).getByRole('button', { name: strings['action.tryAgain'] })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: strings['action.computers'] })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: strings['action.new'] })).toBeNull();
  });

  it('says why a computer has no notes to show', async () => {
    await renderPage(page, { state: 'mixed' });
    expect(await screen.findByText(strings['state.protected'])).toBeInTheDocument();
    expect(screen.getByText(strings['state.notOwner'])).toBeInTheDocument();
    expect(screen.getByText(strings['state.busy'])).toBeInTheDocument();
  });

  it('closing an unknown New note keeps it held: the next New note offers Check again, not Create', async () => {
    await renderPage(page, { state: 'createPending' });
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    const open = async () => userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }))[0] as HTMLElement);
    await open();
    await userEvent.type(await screen.findByLabelText(strings['new.field']), 'Q4 plan');
    await userEvent.click(await screen.findByRole('button', { name: strings['new.create'] }));
    await screen.findByRole('button', { name: 'Check again' }, { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['new.title'] })).toBeNull());
    await open();
    expect(await screen.findByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['new.create'] })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
    // The explicit way out: only the person's own press releases the hold.
    await userEvent.click(screen.getByRole('button', { name: strings['new.allowAgainShort'] })); // its dialog is titled new.allowAgain
    await userEvent.click(await screen.findByRole('button', { name: strings['new.allowAgainConfirm'] }));
    expect(await screen.findByRole('button', { name: strings['new.create'] })).toBeInTheDocument();
  });
});
