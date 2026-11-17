// Keys: two leftovers of the page's own flows.
// - With no key at all the empty state's New key is the page's one primary: the header's New key stands back
//   (a view has one primary action).
// - A remove refused under another page's hold closes the remove dialog: the tab shows that page's change read-only,
//   and the dialog had only a Check again left that could settle nothing of its own.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const answer = vi.hoisted(() => ({ next: null as Record<string, unknown> | null }));
vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const useSetSshKey = real.useSetSshKey as () => (v: unknown) => Promise<unknown>;
  return {
    ...real,
    useSetSshKey: () => {
      const send = useSetSshKey();
      return async (v: unknown) => (answer.next ? answer.next : send(v));
    },
  };
});

const primaries = (name: string) =>
  screen.queryAllByRole('button', { name }).filter((b) => /primary/i.test(b.className));

describe('keys: the empty state and a refused remove', () => {
  it('no key at all: one primary New key, the empty state\'s', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['st.empty.title'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['action.new'] }).length).toBeGreaterThan(1);
    expect(primaries(strings['action.new'])).toHaveLength(1);
  }, 30000);

  it('a remove refused under another page\'s hold closes the dialog', async () => {
    answer.next = { outcome: 'pending', code: 'HELD_BY_OTHER', from: null };
    await renderPage(page);
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.remove'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.rmGo'] }));
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['ssh.rmGo'] })).toBeNull());
    answer.next = null;
  }, 30000);
});
