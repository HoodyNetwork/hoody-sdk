// On the page: a change whose answer was lost stays held while
// the fresh listing of its folder leaves out an entry it could not read (`skipped`), whatever that entry is: a name
// missing from it is not gone. Once the listing is whole again, Check again proves it.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import fs from '@kit/forms/forms.strings.en.json';
import { resetFiles, skipInListingWhile } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneA = () => screen.getByRole('region', { name: strings['pane.a'] });
// The first render loads the page's chunks; under host load that alone can pass the 5 s default.
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] }, { timeout: 30_000 })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const dialog = () => screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
const held = () => screen.queryAllByText(/may have gone through/i);
/** Presses Check again and waits until that check has ended: the kit shows "Checking…" from the press until core's
 *  read-back (its reads, then its proof) has returned, so the hold is judged before anything is asserted. */
async function checkAgain() {
  const button = (await screen.findAllByRole('button', { name: /check again/i }))[0]!;
  await userEvent.click(button);
  await waitFor(() => expect(screen.queryAllByText(fs['outcome.checking'])).toHaveLength(0), { timeout: 30_000 });
}

beforeEach(() => resetFiles());

describe('a listing that leaves out an entry proves no absence', () => {
  it('mkdir: the new folder unreadable in the listing is not "not made": it stays held, then proves made', async () => {
    await renderPage(page, { path: ADA });
    await table();
    const stop = skipInListingWhile('/home/ada', 'lost');
    await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
    const d = await dialog();
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    expect(await screen.findAllByText(/may have gone through/i)).not.toHaveLength(0);
    await checkAgain();
    expect(held()).not.toHaveLength(0);
    stop();
    await checkAgain();
    await waitFor(() => expect(held()).toHaveLength(0));
    expect(await row(/\blost\b/)).toBeInTheDocument();
  }, 40_000);

  it('delete: gone from a listing that leaves another entry out is not "deleted": it stays held, then proves deleted', async () => {
    await renderPage(page, { path: ADA });
    await table();
    // A file named lost (its delete answer is lost): rename notes.txt, whose own answer is lost too, and prove it.
    await (async () => {
      const r = await row(/notes\.txt/);
      await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
      await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.rename'] }));
    })();
    let d = await dialog();
    await userEvent.clear(within(d).getByRole('textbox', { name: strings['name.label'] }));
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    await userEvent.click(within(d).getByRole('button', { name: strings['action.rename'] }));
    await userEvent.click((await screen.findAllByRole('button', { name: /check again/i }))[0]!);
    await waitFor(() => expect(held()).toHaveLength(0));
    const stop = skipInListingWhile('/home/ada', 'unreadable.bin');
    const r = await row(/\blost\b/);
    await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.delete'] }));
    d = await dialog();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.delete'] }));
    expect(await within(d).findAllByText(/may have gone through/i)).not.toHaveLength(0);
    await checkAgain();
    expect(held()).not.toHaveLength(0);
    stop();
    await checkAgain();
    await waitFor(() => expect(held()).toHaveLength(0));
    expect(within(await table()).queryByRole('row', { name: /\blost\b/ })).toBeNull();
  }, 40_000);
});
