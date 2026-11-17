// Vitest: with no computer shown, a computer list the shell does not know yet never reads as "no computer" (C9, the
// knc rule). Loading reads as loading, a failed read as not loaded with the shell's Try again, and "No computer
// selected" with "Pick a computer" only once the list is known. renderPage mounts no shell, so the shell's data is
// replaced; the page and the shared ComputerRequired read the same replacement.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data context, replaced as a test harness, not page code
import type * as ShellContext from '@shell/context';
import strings from './strings.en.json';

const held = vi.hoisted(() => ({ shell: null as Partial<ShellData> | null }));
vi.mock('@shell/context', async (orig) => {
  const m = await orig<typeof ShellContext>();
  return { ...m, useShellData: () => (held.shell ? { realms: [], realmId: 'all', computers: [], ...held.shell } : m.useShellData()) };
});
const { default: page } = await import('./page');

afterEach(() => { held.shell = null; });

const noneWords = () => [screen.queryByText(strings['st.title.noComputer']), screen.queryByText(strings['st.pick']), screen.queryByText(strings['subtitle.none'])];

describe('programs: no computer shown while the computer list is not known', () => {
  it('shows loading, never "No computer selected" or "Pick a computer", while the list loads', async () => {
    held.shell = { computersRead: 'loading' };
    await renderPage(page, { computer: false });
    expect(await screen.findByRole('heading', { name: strings['title'] })).toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    for (const w of noneWords()) expect(w).toBeNull();
  });

  it('shows not loaded with the shell\'s Try again, never "No computer selected", when the list read failed', async () => {
    const retryComputers = vi.fn();
    held.shell = { computersRead: 'unknown', retryComputers };
    await renderPage(page, { computer: false });
    const again = await screen.findByRole('button', { name: /Try again/ });
    for (const w of noneWords()) expect(w).toBeNull();
    await userEvent.click(again);
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('says "No computer selected" with the pick once the list is known and nothing is chosen', async () => {
    held.shell = {};
    await renderPage(page, { computer: false });
    expect(await screen.findByText(strings['st.title.noComputer'])).toBeInTheDocument();
    expect(screen.getByText(strings['subtitle.none'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });
});
