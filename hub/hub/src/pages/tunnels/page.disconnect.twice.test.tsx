// Disconnect's confirm, pressed twice before the page draws again (a held Enter repeats faster than a frame; two clicks
// in one event turn): the second press sends nothing, and the confirm stays open, busy, until the first request's answer
// closes it. Before, the second press answered at once with "nothing sent" and closed the confirm while the first was
// still out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChanges } from '@core/changes';
import { transport } from '@core/transport';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetDisconnectForTests } from './disconnect';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';

const S1 = 'S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51';

/** The DELETEs that went out, by session id. */
function deletes(): string[] {
  const sent: string[] = [];
  const tr = transport();
  const real = tr.fetch.bind(tr);
  vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
    if (meta.route.id === routes.disconnect.id) sent.push(decodeURIComponent(meta.path.split('/').pop() ?? ''));
    return real(url, init, meta);
  });
  return sent;
}
/** Opens Disconnect's confirm from the ⋯ menu of a row of S1 (its inside :5432). */
async function pressDisconnect(): Promise<HTMLElement> {
  const tb = await screen.findByRole('table', { name: strings.title });
  const row = (await within(tb).findByText('127.0.0.1:5432')).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['disc.menu']}`) }));
  return screen.findByRole('alertdialog', { name: strings['disc.title'] });
}

beforeEach(() => {
  // eslint-disable-next-line no-restricted-globals -- each test starts with no held change kept by an earlier one
  localStorage.removeItem('hub.v3.changes');
  resetChanges();
  resetDisconnectForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('tunnels disconnect: two presses of the confirm', () => {
  it('the second sends nothing and the confirm stays open until the first request answers', async () => {
    // The DELETE's answer is lost after 300 ms: the first request is out that long.
    await renderPage(page, { state: 'disconnect-lost-listed' });
    const sent = deletes();
    const dlg = await pressDisconnect();
    const go = within(dlg).getByRole('button', { name: strings['disc.action'] });
    // Both presses in one turn, before React draws the busy confirm.
    act(() => {
      fireEvent.click(go);
      fireEvent.click(go);
    });
    // The first request goes out (after the press is recorded); the second press's own answer settled long before.
    await waitFor(() => expect(sent).toEqual([S1]));
    // The first request is still out (its answer is lost only after 300 ms): the confirm is still open.
    expect(screen.getByRole('alertdialog', { name: strings['disc.title'] })).toBeInTheDocument();
    // The first request's answer closes it.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent).toEqual([S1]);
  });
});
