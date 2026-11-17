// Vitest: cancelling the pairing (owner) code of a chat app. The code is shown once, so the button is there whenever the app still
// waits for its owner, not only in the session that made the code. It is a held change: a lost answer holds it, never a second send.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROUTES, channelChangeCall, registerTargets } from './data';
import fixtures from './fixtures';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state: string | undefined, app: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=${app}` });

describe('the live send', () => {
  it('is one DELETE of the channel\'s pairing and nothing else', async () => {
    const seen: Array<{ method: string; path: string; body: unknown }> = [];
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    bootFixtureCore({ rules: [reply(ROUTES.pairCancel, (req: FixtureRequest) => { seen.push({ method: req.method, path: req.path, body: req.body }); return answers.ok({ cancelled: true }); })] });
    await channelChangeCall({ botKey: KEY, channelId: 'ch-sl', action: 'cancelCode' }, 'idem-1');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('DELETE');
    expect(seen[0]?.path).toContain('/channels/ch-sl/pairing');
  });
});

describe('the app drawer of an app waiting for its owner', () => {
  it('offers the owner code and cancelling the current code, though no code was made here', async () => {
    await open(undefined, 'ch-sl');
    expect(await screen.findByRole('button', { name: strings['chan.ownerCode'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['chan.cancelCode'] })).toBeInTheDocument();
  }, 60_000);

  it('says the code no longer works once cancelled, and drops a code shown here', async () => {
    await open(undefined, 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.ownerCode'] }));
    expect(await screen.findByText(strings['chan.codeNote'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.cancelCode'] }));
    expect(await screen.findByText(strings['chan.codeCancelled'])).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.codeNote'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['chan.ownerCode'] })).toBeInTheDocument();
  });

  it('an app that has its owner has nothing to cancel', async () => {
    await open(undefined, 'ch-tg');
    // a connected app keeps its token behind Replace; the page is drawn once that is there
    await screen.findByRole('button', { name: strings['setup.token.replace'] });
    expect(screen.queryByRole('button', { name: strings['chan.cancelCode'] })).toBeNull();
  });

  it('a cancel that was not sent hides the code at once and says it may still work, with the reason', async () => {
    await open('channelChangeNotSent', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    expect(await screen.findByText(strings['chan.press.cancelNotSent'])).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.codeCancelled'])).toBeNull();
    expect(screen.queryByText(strings['chan.codeNote'])).toBeNull();
    // the refusal is its own line, a refusal and not a failure
    expect(screen.getByText(strings['chan.press.cancelNotSent']).closest('[data-outcome]')).toHaveAttribute('data-outcome', 'not_sent');
    expect(screen.queryByText(strings['chan.failed'], { exact: false })).toBeNull();
  });

  it('an owner code that was not sent says the earlier code may still work', async () => {
    await open('channelChangeNotSent', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.ownerCode'] }));
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.codeNote'])).toBeNull();
  });

  it('the next press takes the line away', async () => {
    await open('channelChangeNotSent', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    await screen.findByText(strings['chan.press.cancelNotSent']);
    await userEvent.click(screen.getByRole('button', { name: strings['chan.ownerCode'] }));
    await waitFor(() => expect(screen.queryByText(strings['chan.press.cancelNotSent'])).toBeNull());
    expect(await screen.findByText(strings['chan.press.issueNotSent'])).toBeInTheDocument();
  });

  it('a lost answer holds the button and says it may have gone through, with Check again', async () => {
    await open('channelChangePending', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    expect(await screen.findByText(strings['chan.maybe'])).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: strings['chan.cancelCode'] })).toBeDisabled());
    expect(screen.queryByText(strings['chan.codeCancelled'])).toBeNull();
  });
});

describe('a code press in Setup whose answer is lost', () => {
  it('pressing Owner code says the code may have changed, never an old code', async () => {
    await open('channelChangePending', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.ownerCode'] }));
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
    expect(screen.queryByText(strings['chan.codeNote'])).toBeNull();
  });

  it('pressing Cancel says the same', async () => {
    await open('channelChangePending', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
  });
});

describe('the app drawer of an app with people but no owner, under any direct-message policy', () => {
  it('offers the owner code in Setup, where People sends the person who has no owner yet', async () => {
    await open('channelOwnerless', 'ch-tg');
    expect(await screen.findByRole('button', { name: strings['chan.ownerCode'] })).toBeInTheDocument();
  }, 60_000);
});

describe('an owner code under a direct-message policy that never redeems it', () => {
  it('says so in Setup, offers Settings, and does not issue one', async () => {
    await open('channelOwnerlessOpen', 'ch-tg');
    const note = await screen.findByText(strings['chan.ownerCode.needsPolicy']);
    // a notice, not a paragraph in the step: a kit Band whose action opens Settings
    const band = note.closest('[role="status"], [role="alert"]') as HTMLElement;
    expect(band).not.toBeNull();
    expect(screen.getByRole('button', { name: strings['chan.ownerCode'] })).toBeDisabled();
    await userEvent.click(within(band).getByRole('button', { name: strings['chan.invite.openSettings'] }));
    expect(await screen.findByRole('button', { name: new RegExp(strings['set.all']) })).toBeInTheDocument();
  }, 60_000);

  it('the owner-code policies (owner, pairing) get no such note', async () => {
    await open('channelOwnerless', 'ch-tg');
    await screen.findByRole('button', { name: strings['chan.ownerCode'] });
    expect(screen.queryByText(strings['chan.ownerCode.needsPolicy'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['chan.ownerCode'] })).toBeEnabled();
  }, 60_000);
});

describe('a press that was dismissed', () => {
  it('leaves nothing open: a later, unrelated hold is not blamed on the code', async () => {
    await open('channelChangePending', 'ch-sl');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.ownerCode'] }));
    expect(await screen.findByText(strings['chan.code.mayHaveChanged'])).toBeInTheDocument();
    // stop tracking the lost answer
    await userEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop tracking anyway' }));
    await waitFor(() => expect(screen.queryByText(strings['chan.code.mayHaveChanged'])).toBeNull());
    // an unrelated change now goes pending: Settings, rename
    await userEvent.click(screen.getByRole('button', { name: strings['chan.rail.settings'] }));
    const name = await screen.findByRole('textbox', { name: strings['chan.name.label'] });
    await userEvent.type(name, ' two');
    await userEvent.click(screen.getByRole('button', { name: strings['chan.name.save'] }));
    expect(await screen.findByText(strings['chan.maybe'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.rail.setup'] }));
    expect(screen.queryByText(strings['chan.code.mayHaveChanged'])).toBeNull();
  }, 60_000);
});

describe('a refused cancel belongs to the drawer\'s code, not to one tab', () => {
  it('cancel not sent in Setup, then an invite and its cancel in People: Setup shows no stale line', async () => {
    // one app with no owner, direct messages on pairing: Setup makes owner codes, People makes invites
    const st = fixtures.states.channelOwnerless as { channelChange?: unknown };
    const was = st.channelChange;
    try {
      st.channelChange = { outcome: 'not_sent', code: 'READ_BACK_FIRST' };
      await open('channelOwnerless', 'ch-tg');
      await userEvent.click(await screen.findByRole('button', { name: strings['chan.cancelCode'] }));
      expect(await screen.findByText(strings['chan.press.cancelNotSent'])).toBeInTheDocument();
      // the agent takes the next presses
      st.channelChange = { outcome: 'done', data: { issued: true, demo: { code: 'INV-X', expiresAt: 0 } } };
      await userEvent.click(screen.getByRole('button', { name: strings['chan.rail.people'] }));
      // the refusal is about the app's code, so People shows it too
      expect(await screen.findByText(strings['chan.press.cancelNotSent'])).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.go'] }));
      await userEvent.click(await screen.findByRole('button', { name: strings['chan.invite.cancel'] }));
      await userEvent.click(screen.getByRole('button', { name: strings['chan.rail.setup'] }));
      await screen.findByRole('button', { name: strings['chan.cancelCode'] });
      expect(screen.queryByText(strings['chan.press.cancelNotSent'])).toBeNull();
    } finally {
      st.channelChange = was;
    }
  }, 60_000);
});
