// A live (not expired) computer whose delete lost its answer: the dialog says it is held once, with one Check again,
// and that Check again reads the computers list (the delete's declared proof, remove.check). Nothing is sent again.
// Its Stop tracking still asks first (the warning that a lost delete may have gone through).
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { computers, removeSends } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

describe('computers: a held delete of a live computer', () => {
  it('shows one held line and one Check again, Check again reads the list, and Stop tracking keeps its warning', async () => {
    const c = computers.find((x) => x.status === 'running') ?? computers[0]!;
    const r = await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'removeLost' });
    const reads = () => r.queryClient.getQueryCache().findAll().filter((q) => JSON.stringify(q.queryKey).includes('"computers"')).reduce((n, q) => n + q.state.dataUpdateCount + q.state.errorUpdateCount, 0);
    await userEvent.click(await screen.findByRole('button', { name: fill(strings['menu.actions'], { name: c.name }) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.delete'] }));
    await userEvent.type(await screen.findByLabelText(`Type ${c.name} to confirm`), c.name);
    await userEvent.click(screen.getByRole('button', { name: strings['delete.go'] }));
    const dlg = await screen.findByRole('alertdialog', { name: fill(strings['delete.title'], { name: c.name }) });
    expect(await within(dlg).findByText(fill(strings['held.remove'], { name: c.name }), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dlg).getAllByText(fill(strings['held.remove'], { name: c.name }))).toHaveLength(1);
    const checks = within(dlg).getAllByRole('button', { name: strings['held.check'] });
    expect(checks).toHaveLength(1);
    const before = reads();
    await userEvent.click(checks[0]!);
    await waitFor(() => expect(reads()).toBeGreaterThan(before), { timeout: 8000 });
    expect(removeSends).toHaveLength(1);
    // The computer is still listed, so the hold stands; Stop tracking asks before it frees anything.
    expect(within(dlg).getByText(fill(strings['held.remove'], { name: c.name }))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['held.dismiss'] }));
    expect(await screen.findByRole('alertdialog', { name: strings['held.dismissTitle'] })).toBeInTheDocument();
    expect(screen.getByText(strings['held.dismissBodyChange'])).toBeInTheDocument();
    expect(screen.queryByText(strings['held.dismissBody'])).toBeNull();
  }, 40000);
});
