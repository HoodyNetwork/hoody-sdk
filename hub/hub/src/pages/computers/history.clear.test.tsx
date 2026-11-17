// The Run tab's command history can be cleared: the History menu ends with a Clear entry, which asks first,
// then empties the list for this computer. Nothing is sent to the computer.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

async function runOnce(cmd: string) {
  const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 });
  await userEvent.clear(box);
  await userEvent.type(box, cmd);
  await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
  await waitFor(() => expect(screen.queryByText(strings['run.running'])).toBeNull(), { timeout: 8000 });
}

async function openHistory() {
  await userEvent.click(screen.getByRole('button', { name: strings['run.history'] }));
  return screen.findByRole('menu');
}

describe('computers: Run tab, clearing the command history', () => {
  it('Clear history asks first, then the menu shows no commands', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run' });
    await runOnce('uptime');
    let menu = await openHistory();
    expect(within(menu).getByRole('menuitem', { name: 'uptime' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(`^${strings['run.historyClear']}`) }));
    const ask = await screen.findByRole('alertdialog');
    expect(ask).toHaveTextContent(strings['run.historyClear.title']);
    await userEvent.click(within(ask).getByRole('button', { name: strings['run.historyClear.go'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    menu = await openHistory();
    expect(within(menu).queryByRole('menuitem', { name: 'uptime' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: strings['run.historyEmpty'] })).toBeInTheDocument();
  });

  it('cancelling the question keeps the history', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run' });
    await runOnce('df -h');
    let menu = await openHistory();
    await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(`^${strings['run.historyClear']}`) }));
    const ask = await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(ask).not.toBeInTheDocument());
    menu = await openHistory();
    expect(within(menu).getByRole('menuitem', { name: 'df -h' })).toBeInTheDocument();
  });

  it('a Clear while a command is still running is not undone when its answer comes', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=run', latency: 'slow' });
    const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 15000 });
    await userEvent.type(box, 'sleep 5');
    await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    await screen.findByText(strings['run.running'], {}, { timeout: 5000 });
    // Kept as soon as it is sent, before the answer.
    let menu = await openHistory();
    expect(within(menu).getByRole('menuitem', { name: 'sleep 5' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(`^${strings['run.historyClear']}`) }));
    const ask = await screen.findByRole('alertdialog');
    await userEvent.click(within(ask).getByRole('button', { name: strings['run.historyClear.go'] }));
    await waitFor(() => expect(screen.queryByText(strings['run.running'])).toBeNull(), { timeout: 15000 });
    menu = await openHistory();
    expect(within(menu).queryByRole('menuitem', { name: 'sleep 5' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: strings['run.historyEmpty'] })).toBeInTheDocument();
  }, 40000);

  it('with no commands there is nothing to clear', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=run' });
    await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 });
    const menu = await openHistory();
    expect(within(menu).queryByRole('menuitem', { name: new RegExp(`^${strings['run.historyClear'] ?? 'Clear'}`) })).toBeNull();
  });

  it('the empty history says why nothing can be picked, and the kit gives no missing-reason warning', async () => {
    const errors = vi.spyOn(console, 'error');
    try {
      await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=run' });
      await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 });
      const menu = await openHistory();
      const empty = within(menu).getByRole('menuitem', { name: strings['run.historyEmpty'] });
      expect(empty).toHaveAttribute('aria-disabled', 'true');
      expect(menu).toHaveTextContent(strings['run.historyEmptyWhy']);
      // Nothing on the page (the Run history, the computers' row menus) warns of a disabled item without its reason.
      expect(errors.mock.calls.filter((c) => String(c[0]).includes('without a reason')).map((c) => String(c[0]))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});
