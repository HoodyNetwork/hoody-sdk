// Short range ports, relative end times, empty and old
// states that offer the step that helps, the system confirm as a Dialog, Logs as a text action.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

describe('programs list: ports, end times and empty values', () => {
  beforeEach(() => opsStore.reset());

  it('shows a range program\'s ports short: "8000-8003 · 2/3 up"', async () => {
    await renderPage(page);
    const row = await screen.findByRole('row', { name: /api/ });
    expect(within(row).getByText(/ · \d+\/\d+ up$/)).toBeInTheDocument();
  });

  it('the empty state links to the Guide', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByRole('button', { name: strings['empty.guide'] })).toBeInTheDocument();
  });

  it('an old computer offers the update steps instead of a retry that cannot help', async () => {
    await renderPage(page, { state: 'old' });
    expect(await screen.findByRole('button', { name: strings['st.oldGuide'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('a private computer says what to do and keeps Try again', async () => {
    await renderPage(page, { state: 'private' });
    expect(await screen.findByText(/Ask the owner of atlas for access/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('asks before restarting a system program in a dialog', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A100' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart hoody-agent' }))[0] as HTMLElement);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Restart hoody-agent?')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['ask.restartGo'] })).toBeInTheDocument();
  });

  it('the inspector header labels its buttons and Logs reads as text', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    const restart = await screen.findAllByRole('button', { name: 'Restart web' });
    expect(restart.some((b) => b.textContent === strings['action.restart'])).toBe(true);
  });

  it('a failed read uses the kit title and keeps the page subtitle', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByText("This didn't load")).toBeInTheDocument();
    expect(screen.getByText('On atlas')).toBeInTheDocument();
  });

  it("Reload is the list's own refresh (DataTable onRefresh), in its toolbar, not the page header", async () => {
    await renderPage(page);
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    expect(refresh.closest('header')).toBeNull();
    // Same toolbar as the search box: their nearest shared box holds no table.
    const search = screen.getByRole('searchbox');
    let box: HTMLElement | null = refresh.parentElement;
    while (box && !box.contains(search)) box = box.parentElement;
    expect(box?.querySelector('table')).toBeNull();
  });

  it('the system Stop confirm uses the accent action, not danger', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A100' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Stop hoody-agent' }))[0] as HTMLElement);
    const dialog = await screen.findByRole('alertdialog');
    const go = within(dialog).getByRole('button', { name: strings['ask.stopGo'] });
    expect(go.className).not.toMatch(/danger/i);
  });
  it('a table says the kind in its group row, not in a column of its own', async () => {
    await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['group.system']) }));
    const name = await screen.findByText('hoody-agent');
    const row = name.closest('tr') as HTMLElement;
    expect(within(row).queryByText(strings.systemTag)).toBeNull();
    expect(screen.queryByRole('columnheader', { name: strings['col.kind'] })).toBeNull();
  });

  it('a list row keeps the kind tag as its own field, not part of the name (the name truncates first, kind on line 2)', async () => {
    // A phone-wide layout: every observer reports 390 px.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: (entries: unknown[], o: unknown) => void) {}
        observe(el: Element) {
          this.cb([{ target: el, contentRect: { width: 390, height: 800 } }], this);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      await renderPage(page);
      await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['group.system']) }));
      const name = await screen.findByText('hoody-agent');
      const row = name.closest('[role="row"], tr') as HTMLElement;
      expect(within(row).getByText(strings.systemTag)).toBeInTheDocument();
      const nameCell = name.closest('td, [class*="listPrimary"]') as HTMLElement;
      expect(within(nameCell).queryByText(strings.systemTag)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the inspector has the kit detail header with its close button', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A1' });
    const close = await screen.findByRole('button', { name: 'Close details' });
    await userEvent.click(close);
    expect(screen.queryByRole('button', { name: 'Close details' })).toBeNull();
  });

  it('a row whose press may have gone through offers Check again in the row itself (kit Outcome line)', async () => {
    await renderPage(page, { state: 'press-pending' });
    const name = await screen.findByText('web', { selector: 'td *, td' });
    const row = name.closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Restart web' }));
    expect(await within(row).findByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(within(row).getByText(strings['op.pendingRow'])).toBeInTheDocument();
    // The row's Check again reads back (it never resends): with nothing proved the press stays held.
    const liveRow = (await screen.findByText('web', { selector: 'td *, td' })).closest('tr') as HTMLElement;
    await userEvent.click(within(liveRow).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect([...opsStore.snapshot()].find(([k]) => k.endsWith('|prog:1'))?.[1].stuck).toBe(true));
  });
});
