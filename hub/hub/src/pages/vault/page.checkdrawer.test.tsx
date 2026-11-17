// Vitest: the drawer's Check again says what it found. When the read cannot prove a held save,
// the drawer's band says it in the same words as the page banner's Check again, never nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldChanges } from '@core';
import page from './page';
import strings from './strings.en.json';
import kitForms from '@kit/forms/forms.strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import { resetChanges } from '@core/changes';
import * as data from './data';
import { heldIdentity } from './logic';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof data>();
  return { ...real, checkHold: vi.fn(real.checkHold) };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.mocked(data.checkHold).mockClear();
});

/** A new entry saved under `unknown` (every change answers 502): the drawer holds it. */
async function heldSave(): Promise<HTMLElement> {
  await renderPage(page, { state: 'unknown', path: '/vault?edit=new' });
  await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'held-save');
  await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
  await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
  await screen.findAllByText(/Saving held-save in Personal may have gone through/);
  return screen.getByRole('dialog');
}

/** The drawer's text node that carries `words` (the band joins several sentences in one node). */
const said = (drawer: HTMLElement, words: string) =>
  within(drawer).queryByText((_, el) => !!el && el.children.length === 0 && (el.textContent ?? '').includes(words));

describe("the drawer's Check again", () => {
  it('says the save is not shown yet when the read does not prove it (the banner words)', async () => {
    const drawer = await heldSave();
    expect(said(drawer, strings['hold.unproven'])).toBeNull();
    await userEvent.click(within(drawer).getByRole('button', { name: kitForms['outcome.check'] }));
    await waitFor(() => expect(said(drawer, strings['hold.unproven'])).toBeInTheDocument());
    expect(data.checkHold).toHaveBeenCalledTimes(1);
    // Nothing is sent again.
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('says the vault could not be read when the read failed', async () => {
    const drawer = await heldSave();
    vi.mocked(data.checkHold).mockResolvedValueOnce('unread');
    await userEvent.click(within(drawer).getByRole('button', { name: kitForms['outcome.check'] }));
    await waitFor(() => expect(said(drawer, strings['hold.unread'])).toBeInTheDocument());
    expect(said(drawer, strings['hold.unproven'])).toBeNull();
  });

  // A second Check again drops the first one's sentence at once, then shows only its own.
  it('a repeated Check again drops the old finding at once, then shows only the new one', async () => {
    const drawer = await heldSave();
    await userEvent.click(within(drawer).getByRole('button', { name: kitForms['outcome.check'] }));
    await waitFor(() => expect(said(drawer, strings['hold.unproven'])).toBeInTheDocument());
    let answer!: (v: Awaited<ReturnType<typeof data.checkHold>>) => void;
    vi.mocked(data.checkHold).mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    await userEvent.click(within(drawer).getByRole('button', { name: kitForms['outcome.check'] }));
    await waitFor(() => expect(data.checkHold).toHaveBeenCalledTimes(2));
    expect(said(drawer, strings['hold.unproven'])).toBeNull();
    expect(said(drawer, strings['hold.unread'])).toBeNull();
    await act(async () => answer('unread'));
    await waitFor(() => expect(said(drawer, strings['hold.unread'])).toBeInTheDocument());
    expect(said(drawer, strings['hold.unproven'])).toBeNull();
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('drops what it found once the hold is freed elsewhere, leaving only the freed-elsewhere words', async () => {
    const drawer = await heldSave();
    await userEvent.click(within(drawer).getByRole('button', { name: kitForms['outcome.check'] }));
    await waitFor(() => expect(said(drawer, strings['hold.unproven'])).toBeInTheDocument());
    const h = heldChanges(data.LOCK).find((x) => heldIdentity(x.identity)?.op === 'put')!;
    await act(async () => {
      expect(await data.dismissHold({ change: h, id: heldIdentity(h.identity)!, own: true, from: h.from })).toBe(true);
    });
    await waitFor(() => expect(said(drawer, strings['edit.freedElsewhere'])).toBeInTheDocument());
    expect(said(drawer, strings['hold.unproven'])).toBeNull();
  });
});
