// A disconnect whose answer was lost is core's hold (disconnectHold.ts), never the dialog's own state. The dialog closed
// and opened again for the same account still shows "may have gone through", Confirm stays locked and pressing it sends
// nothing; Check again only reads back what was removed; Stop tracking (after its warning, once no request of it is out) is
// the only other way out. A removal that landed takes the account off the page's list, and with it the dialog: the page
// (which draws this dialog all the time) then reads the hold back itself.
import { cleanup, render, screen, waitFor, within } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Api } from '../api';
import { disconnectLock, sendDisconnect } from '../disconnectHold';
import type { Account } from '../logic';
import { shownComputer } from '../shownGate';
import strings from '../strings.en.json';
import type { Settled } from '../types';
import { DisconnectDialog } from './Connect';
import { AiProvider, type AiCtx } from './ctx';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const KEYACC: Account = { id: 'anthropic', prefix: 'anthropic', label: 'Anthropic', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready' };
const SIGNACC: Account = { ...KEYACC, via: 'signin' };
const AT = { project: 'p1', computer: 'c1' };
const LOCK = () => disconnectLock(AT, KEYACC.id, 'key')!;
const CONFIRM = strings['dis.confirm.key'];
const CHECK = kit['outcome.pending.check'];

/** What GET auth shows: the key stays stored, and the sign-in signed in, until the removal lands. */
let stored = true;
let signedIn = true;
let deletes = 0;
let reads = 0;
/** The removal's answer: lost at once unless a test holds it. */
let answerDelete: () => Promise<Settled<unknown>>;
let reload: ReturnType<typeof vi.fn>;
let onClose: Mock<() => void>;
let api: Api;

/** Each draw is a new read of the list (its bundle's data time moves): the page reads unreachable holds once per read. */
let listReads = 0;
/** The page's context on computer c1; `accounts` is what its last read of the list showed. */
function ctx(accounts: Account[]): AiCtx {
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } },
    realm: null, defaults: null, models: [], bots: null, accounts, bundle: { at: ++listReads },
  };
  return { m, api, env: {}, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
}
/** The dialog as the page draws it: always there, open while it has an account. */
const draw = (a: Account | null, accounts: Account[] = [KEYACC]) => <AiProvider value={ctx(accounts)}><DisconnectDialog account={a} onClose={onClose} /></AiProvider>;
const dialog = () => screen.findByRole('alertdialog');

beforeEach(() => {
  boot();
  setTarget({ project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } });
  stored = true;
  signedIn = true;
  deletes = 0;
  reads = 0;
  answerDelete = async () => lost;
  reload = vi.fn();
  onClose = vi.fn();
  api = {
    keyDelete: vi.fn(() => { deletes++; return answerDelete(); }),
    signOut: vi.fn(() => { deletes++; return answerDelete(); }),
    auth: vi.fn(async () => { reads++; return { ok: true, body: { auth: { api_key_stored: stored, oauth_stored: signedIn } } }; }),
  } as unknown as Api;
});
afterEach(() => {
  cleanup();
  setTarget(null);
  resetAttempts();
});

describe('disconnect: an unknown outcome is held by core', () => {
  it('kept when the dialog is opened again: Confirm stays locked and sends nothing; Check again only reads, then lets it go', async () => {
    const view = render(draw(KEYACC));
    await userEvent.click(within(await dialog()).getByRole('button', { name: CONFIRM }));
    expect(await within(await dialog()).findByRole('alert')).toHaveTextContent(kit['outcome.pending.title']);
    expect(deletes).toBe(1);
    expect(heldAttempts(LOCK())).toHaveLength(1);

    // Closed (the page drops its account), then opened again for the same account.
    view.rerender(draw(null));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    view.rerender(draw(KEYACC));
    const again = await dialog();
    expect(await within(again).findByRole('alert')).toHaveTextContent(kit['outcome.pending.title']);
    const confirm = within(again).getByRole('button', { name: CONFIRM });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(deletes).toBe(1);

    // Check again: still stored, so it stays held and says so; then gone: let go, the page reloads, still one removal.
    await userEvent.click(within(again).getByRole('button', { name: CHECK }));
    expect(await within(again).findByText(strings['dis.stillThere'])).toBeInTheDocument();
    expect(heldAttempts(LOCK())).toHaveLength(1);
    stored = false;
    await userEvent.click(within(again).getByRole('button', { name: CHECK }));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    expect(onClose).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(deletes).toBe(1);
  });

  it('Stop tracking, offered with its warning once the request is answered, lets the hold go and Confirm works again', async () => {
    render(draw(KEYACC));
    await userEvent.click(within(await dialog()).getByRole('button', { name: CONFIRM }));
    const stop = await within(await dialog()).findByRole('button', { name: strings['dis.stop'] });
    // The warning is the sentence that describes the button.
    expect(document.getElementById(stop.getAttribute('aria-describedby') ?? '')).toHaveTextContent(strings['dis.stopWarn']);
    await userEvent.click(stop);
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    const confirm = within(await dialog()).getByRole('button', { name: CONFIRM });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);
    await waitFor(() => expect(deletes).toBe(2));
  });

  it('while a request of it may still be out: neither Stop tracking nor its warning; both once it is answered', async () => {
    let answer: (r: Settled<unknown>) => void = () => undefined;
    answerDelete = () => new Promise((res) => { answer = res; });
    // Sent from elsewhere (another mount, another tab): its answer has not come yet.
    const send = sendDisconnect(api, AT, KEYACC, shownComputer());
    await waitFor(() => expect(deletes).toBe(1));
    render(draw(KEYACC));
    const d = await dialog();
    expect(await within(d).findByRole('alert')).toHaveTextContent(kit['outcome.pending.title']);
    expect(within(d).getByRole('button', { name: CONFIRM })).toBeDisabled();
    expect(within(d).queryByRole('button', { name: strings['dis.stop'] })).toBeNull();
    expect(within(d).queryByText(strings['dis.stopWarn'], { exact: false })).toBeNull();
    answer(lost);
    await send;
    const stop = await within(d).findByRole('button', { name: strings['dis.stop'] });
    expect(document.getElementById(stop.getAttribute('aria-describedby') ?? '')).toHaveTextContent(strings['dis.stopWarn']);
    expect(deletes).toBe(1);
  });

  it('Check again that reads nothing whole says nothing of "still there"', async () => {
    render(draw(KEYACC));
    await userEvent.click(within(await dialog()).getByRole('button', { name: CONFIRM }));
    const d = await dialog();
    await within(d).findByRole('button', { name: strings['dis.stop'] });
    api.auth = vi.fn(async () => { reads++; return lost; });
    await userEvent.click(within(d).getByRole('button', { name: CHECK }));
    await waitFor(() => expect(reads).toBe(2));
    expect(within(d).queryByText(strings['dis.stillThere'], { exact: false })).toBeNull();
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('a removal answered at once holds nothing', async () => {
    answerDelete = async () => ({ ok: true, body: {} });
    render(draw(KEYACC));
    await userEvent.click(within(await dialog()).getByRole('button', { name: CONFIRM }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(heldAttempts(LOCK())).toHaveLength(0);
    expect(deletes).toBe(1);
  });
});

describe('disconnect: a hold whose account the list no longer shows', () => {
  it('the removal landed: the next list read no longer shows the account, and the page reads the hold back and lets it go', async () => {
    const view = render(draw(KEYACC));
    await userEvent.click(within(await dialog()).getByRole('button', { name: CONFIRM }));
    await within(await dialog()).findByRole('button', { name: strings['dis.stop'] });
    expect(heldAttempts(LOCK())).toHaveLength(1);
    expect(reads).toBe(1);
    // The page reads its list again: the key is gone, so the account is not listed, and the page closes the dialog.
    stored = false;
    view.rerender(draw(null, []));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    expect(reads).toBe(2);
    expect(deletes).toBe(1);
  });

  it('a held sign-out whose provider the list now shows with a key (a dialog of the other lock) is read back by the page', async () => {
    const view = render(draw(SIGNACC, [SIGNACC]));
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['dis.confirm.signin'] }));
    await within(await dialog()).findByRole('button', { name: strings['dis.stop'] });
    const signLock = disconnectLock(AT, SIGNACC.id, 'signin')!;
    expect(heldAttempts(signLock)).toHaveLength(1);
    expect(reads).toBe(1);
    // The sign-out landed: the row now shows the key the provider also holds, whose dialog reads the credential lock.
    signedIn = false;
    view.rerender(draw(null, [KEYACC]));
    await waitFor(() => expect(heldAttempts(signLock)).toHaveLength(0));
    expect(reads).toBe(2);
    expect(deletes).toBe(1);
  });

  it('a list read that still shows the account leaves the reading to its dialog (control)', async () => {
    const view = render(draw(KEYACC));
    await userEvent.click(within(await dialog()).getByRole('button', { name: CONFIRM }));
    await within(await dialog()).findByRole('button', { name: strings['dis.stop'] });
    stored = false;
    view.rerender(draw(null, [KEYACC]));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(reads).toBe(1);
    expect(heldAttempts(LOCK())).toHaveLength(1);
  });

  it('a list read while the removal may still be out reads nothing; the next list read after its answer does', async () => {
    let answer: (r: Settled<unknown>) => void = () => undefined;
    answerDelete = () => new Promise((res) => { answer = res; });
    const send = sendDisconnect(api, AT, KEYACC, shownComputer());
    await waitFor(() => expect(deletes).toBe(1));
    const view = render(draw(null, []));
    expect(reads).toBe(0);
    answer(lost);
    expect(await send).toEqual({ state: 'not_confirmed' });
    expect(reads).toBe(1);
    stored = false;
    view.rerender(draw(null, []));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    expect(reads).toBe(2);
  });
});
