// Keys > API keys: a key with no name reads "Unnamed key" in its row and its Delete question, and a
// realm with no key offers Show all realms once. On a phone: a stale ?sel= draws no floating New key
// beside its "not in the list" detail, and an empty list's one primary New key is its empty state's, with no float.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('keys: unnamed keys, empty realms and the phone list', () => {
  it('a key with no name reads "Unnamed key" in its row and in its Delete question', async () => {
    await renderPage(page, { state: 'unnamedKey' });
    const name = new RegExp(strings.unnamed);
    await screen.findByRole('row', { name }, { timeout: 8000 });
    await waitFor(
      async () => {
        if (screen.getByRole('row', { name }).getAttribute('aria-selected') !== 'true') await userEvent.click(screen.getByRole('row', { name }));
        expect(screen.getByRole('row', { name })).toHaveAttribute('aria-selected', 'true');
      },
      { timeout: 10000, interval: 300 },
    );
    await userEvent.click(await screen.findByRole('button', { name: strings['act.delete'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(strings['del.title'].replace('{{name}}', strings.unnamed))).toBeInTheDocument();
  }, 40000);

  it('a realm with no key offers Show all realms once', async () => {
    await renderPage(page, { state: 'realmEmpty' });
    await screen.findByText(/No key works in/, {}, { timeout: 8000 });
    expect(screen.getAllByRole('button', { name: strings['band.showAll'] })).toHaveLength(1);
  }, 40000);

  describe('on a phone', () => {
    const atWidth = (width: number) =>
      class {
        constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
        observe() {
          this.cb([{ contentRect: { width } }]);
        }
        unobserve() {}
        disconnect() {}
      };
    const fab = () => document.querySelector('[data-hub-fab]');
    afterEach(() => vi.unstubAllGlobals());

    it('a stale ?sel= shows its detail with no floating New key', async () => {
      vi.stubGlobal('ResizeObserver', atWidth(390));
      await renderPage(page, { path: '/keys?sel=hdy_dead.000000' });
      expect(await screen.findByText(strings['insp.notFound'], {}, { timeout: 10000 })).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 300));
      expect(fab()).toBeNull();
    }, 30000);

    it("an empty list's one primary New key is its empty state's, with no float", async () => {
      vi.stubGlobal('ResizeObserver', atWidth(390));
      await renderPage(page, { state: 'empty', path: '/keys' });
      await screen.findByText(strings['st.empty.title'], {}, { timeout: 10000 });
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: strings['action.new'] }).filter((b) => /primary/i.test(b.className))).toHaveLength(1),
      );
      expect(fab()).toBeNull();
    }, 30000);
  });
});
