// Vitest: the Referrals page's writes as the page wires them, on its fixture states:
// where Join…, Release… and the form show, what each confirm says, and what a lost answer or a refusal leaves
// on the page. The C9 rules themselves (one send, proofs, reload, realm, tabs) are writes.test.tsx, on the real core.
import { describe, expect, it } from 'vitest';
import { act, cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const open = (state?: string) => renderPage(page, { path: '/referrals', ...(state ? { state } : {}) });
const user = () => userEvent.setup();
const releaseOf = (code: string) => screen.queryByRole('button', { name: `Retire ${code}` });
const field = () => screen.queryByRole('textbox', { name: strings['create.label'] });
const pending = () => document.querySelectorAll('[data-outcome="pending"]');
const failedNote = () => document.querySelector('[data-outcome="failed"]');
const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));

async function join() {
  await user().click(await screen.findByRole('button', { name: strings['join.action'] }, { timeout: T }));
  const d = within(await screen.findByRole('alertdialog'));
  await user().click(d.getByRole('button', { name: strings['join.confirm'] }));
  await settle();
}
async function create(code: string) {
  const box = await screen.findByRole('textbox', { name: strings['create.label'] }, { timeout: T });
  await user().type(box, code);
  await user().click(screen.getByRole('button', { name: strings['create.action'] }));
  await settle();
}
async function release(code: string) {
  await user().click(await screen.findByRole('button', { name: `Retire ${code}` }, { timeout: T }));
  const d = within(await screen.findByRole('alertdialog'));
  await user().click(d.getByRole('button', { name: strings['release.confirm'] }));
  await settle();
}

describe('referrals writes on the page', () => {
  it('can join: Join… asks first with the share, that credit is not cash and the one thing the Hub cannot undo; Join makes a member', async () => {
    await open('canJoin');
    await user().click(await screen.findByRole('button', { name: strings['join.action'] }, { timeout: T }));
    const d = within(await screen.findByRole('alertdialog'));
    expect(d.getByText(strings['join.title'])).toBeInTheDocument();
    expect(d.getByText(strings['join.body'].replace('{{rate}}', '5'))).toBeInTheDocument();
    expect(d.queryByText(strings['join.body.unknown'])).toBeNull();
    expect(d.getByText(strings['join.creditOnly'])).toBeInTheDocument();
    expect(d.getByText(strings['join.leave'])).toBeInTheDocument();
    expect(d.getByRole('link', { name: strings['join.how'] })).toBeInTheDocument();
    await user().click(d.getByRole('button', { name: strings['join.confirm'] }));
    expect(await screen.findByText(strings['link.title'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('https://api.hoody.com/auth/signup?ref=q4n8w2zt')).toBeInTheDocument();
    expect(pending()).toHaveLength(0);
  });

  it('can join with no share sent: the confirm says "a share", never a guessed number, with the same two lines', async () => {
    await open('canJoinNoRate');
    await user().click(await screen.findByRole('button', { name: strings['join.action'] }, { timeout: T }));
    const d = within(await screen.findByRole('alertdialog'));
    expect(d.getByText(strings['join.body.unknown'])).toBeInTheDocument();
    expect(d.queryByText(/%/)).toBeNull();
    expect(d.getByText(strings['join.creditOnly'])).toBeInTheDocument();
    expect(d.getByText(strings['join.leave'])).toBeInTheDocument();
  });

  it('the Join confirm\'s "See how credit works" opens the share answer in place; Escape closes only that, and Join still joins', async () => {
    await open('canJoin');
    await user().click(await screen.findByRole('button', { name: strings['join.action'] }, { timeout: T }));
    const dialog = await screen.findByRole('alertdialog');
    const link = within(dialog).getByRole('link', { name: strings['join.how'] });
    await user().click(link);
    const peek = await screen.findByRole('dialog');
    expect(within(peek).getByText(strings['faq.rate.a'])).toBeInTheDocument();
    await user().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    await waitFor(() => expect(link).toHaveFocus());
    await user().click(within(dialog).getByRole('button', { name: strings['join.confirm'] }));
    expect(await screen.findByText(strings['link.title'], undefined, { timeout: T })).toBeInTheDocument();
    expect(pending()).toHaveLength(0);
  });

  it('join pending: the held banner, no Join… to press again, and nothing worded failed', async () => {
    await open('joinPending');
    await join();
    expect(await screen.findByText(strings['held.join'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['join.action'] })).toBeNull();
    expect(failedNote()).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('a member: Release… on the active custom code only, never on the joining code', async () => {
    await open();
    expect(await screen.findByText(strings['link.title'], undefined, { timeout: T })).toBeInTheDocument();
    expect(releaseOf('maya-builds')).toBeInTheDocument();
    expect(releaseOf('k7m2q9xa')).toBeNull();
    expect(field()).toBeInTheDocument();
    // the transport bound (1..64), not a shape rule
    expect(field()).toHaveAttribute('maxlength', '64');
  });

  it('release asks first (danger, plain confirm) with what it means; Release takes it off the list', async () => {
    await open();
    await user().click(await screen.findByRole('button', { name: 'Retire maya-builds' }, { timeout: T }));
    const d = within(await screen.findByRole('alertdialog'));
    expect(d.getByText('Retire maya-builds?')).toBeInTheDocument();
    expect(d.getByText(strings['release.gone'])).toBeInTheDocument();
    expect(d.queryByRole('textbox')).toBeNull();
    await user().click(d.getByRole('button', { name: strings['release.confirm'] }));
    await waitFor(() => expect(screen.queryByText('https://api.hoody.com/auth/signup?ref=maya-builds')).toBeNull());
    expect(pending()).toHaveLength(0);
  });

  it('a blocked custom code has no Release…', async () => {
    await open('blocked');
    expect(await screen.findByText(strings['code.blocked'], undefined, { timeout: T })).toBeInTheDocument();
    expect(releaseOf('maya-builds')).toBeNull();
  });

  it('states_match_fixtures: earning paused and removed show neither Release… nor the form', async () => {
    for (const s of ['earningPaused', 'removed']) {
      cleanup();
      await open(s);
      expect(await screen.findByText(strings['credit.title'], undefined, { timeout: T })).toBeInTheDocument();
      expect(releaseOf('maya-builds')).toBeNull();
      expect(field()).toBeNull();
    }
  });

  it('no custom codes left: no form', async () => {
    await open('noCustomCodes');
    expect(await screen.findByText(strings['codes.unavailable'], undefined, { timeout: T })).toBeInTheDocument();
    expect(field()).toBeNull();
  });

  it('create: the code is made and listed, and the field empties', async () => {
    await open();
    await create('Fresh-One');
    expect(await screen.findByText('https://api.hoody.com/auth/signup?ref=fresh-one', undefined, { timeout: T })).toBeInTheDocument();
    expect(field()).toHaveValue('');
  });

  it('create pending: "Creating fresh-one may have gone through" with Check again', async () => {
    await open('createPending');
    await create('fresh-one');
    expect(await screen.findByText(strings['held.create'].replace('{{code}}', 'fresh-one'), undefined, { timeout: T })).toBeInTheDocument();
    expect(failedNote()).toBeNull();
  });

  it('release pending: "Releasing maya-builds may have gone through"', async () => {
    await open('releasePending');
    await release('maya-builds');
    expect(await screen.findByText(strings['held.release'].replace('{{code}}', 'maya-builds'), undefined, { timeout: T })).toBeInTheDocument();
  });

  it('a malformed or failed read-back after a lost create keeps it held', async () => {
    for (const s of ['readbackMalformed', 'readbackError']) {
      cleanup();
      await open(s);
      await create('fresh-one');
      const title = strings['held.create'].replace('{{code}}', 'fresh-one');
      expect(await screen.findByText(title, undefined, { timeout: T })).toBeInTheDocument();
      await user().click(screen.getByRole('button', { name: 'Check again' }));
      await settle();
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('create taken: the words, the form stays', async () => {
    await open('createTaken');
    await create('fresh-one');
    expect(await screen.findByText(strings['check.taken'], undefined, { timeout: T })).toBeInTheDocument();
    expect(field()).toBeInTheDocument();
  });

  it('create refused because the account can\'t make codes: the form hides with the neutral line', async () => {
    await open('createIssuanceBlocked');
    await create('fresh-one');
    await waitFor(() => expect(field()).toBeNull());
    expect(screen.getAllByText(strings['codes.unavailable']).length).toBeGreaterThanOrEqual(1);
  });

  it('release not removable: the words', async () => {
    await open('releaseNotRemovable');
    await release('maya-builds');
    expect(await screen.findByText(strings['change.notRemovable'], undefined, { timeout: T })).toBeInTheDocument();
  });

  it('checking too fast: the words, Create stays allowed', async () => {
    await open('check429');
    await user().type(await screen.findByRole('textbox', { name: strings['create.label'] }, { timeout: T }), 'fresh-one');
    expect(await screen.findByText(strings['check.tooFast'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['create.action'] })).toBeEnabled();
  });
});
