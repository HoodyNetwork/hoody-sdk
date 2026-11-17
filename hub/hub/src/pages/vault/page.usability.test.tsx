// Vitest: saving and leaving, through the page as a person uses it: the drawer is
// opened by its button, so it has its own history entry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { showToast } from '@kit';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import type * as EditDrawerModule from './parts/EditDrawer';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

// Whether the drawer still showed its saving or unsaved state when it told the page it saved: either keeps its leave
// guard while the page closes it (the guard then asks to discard what was just saved). The page must hear of the
// save only after the drawer rendered as saved.
const atSaved = vi.hoisted(() => [] as boolean[]);
// hold.on keeps the page from hearing of the save: the drawer stays open as it does while a close is landing.
const hold = vi.hoisted(() => ({ on: false }));
vi.mock('./parts/EditDrawer', async (orig) => {
  const real = await orig<typeof EditDrawerModule>();
  const { createElement } = await import('react');
  return {
    EditDrawer: (props: EditDrawerModule.EditDrawerProps) =>
      createElement(real.EditDrawer, {
        ...props,
        onSaved: (k: string) => {
          const text = document.body.textContent ?? '';
          atSaved.push(text.includes('Unsaved changes') || text.includes('Saving'));
          if (!hold.on) props.onSaved(k);
        },
      }),
  };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  atSaved.length = 0;
  hold.on = false;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(showToast).mockClear();
});

const fillAndSave = async (name: string) => {
  await userEvent.type(await screen.findByLabelText(strings['edit.name']), name);
  await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-walk-value');
  await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
};

describe('a saved New entry closes its drawer and opens the entry', () => {
  it('from the header button: no discard question, the drawer is gone, the entry is open, Back does not reopen it', async () => {
    const { router } = await renderPage(page, { path: '/vault' });
    await screen.findByText('deploy.notes');
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.new'] })[0]!);
    await fillAndSave('walk-token');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['edit.newTitle'] })).toBeNull());
    expect(screen.queryByText('Discard changes?')).toBeNull();
    await waitFor(() => expect(router.state.location.search).toEqual({ sel: 'walk-token' }));
    expect(await screen.findByText(strings['detail.facts'])).toBeTruthy();
    router.history.back();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('sel'));
    expect(screen.queryByRole('dialog', { name: strings['edit.newTitle'] })).toBeNull();
  });

  it('from the empty state button too', async () => {
    const { router } = await renderPage(page, { state: 'empty', path: '/vault' });
    await screen.findByText(strings['empty.title']);
    await userEvent.click(screen.getByRole('button', { name: strings['action.new'] }));
    await fillAndSave('walk-first');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['edit.newTitle'] })).toBeNull());
    expect(screen.queryByText('Discard changes?')).toBeNull();
    await waitFor(() => expect(router.state.location.search).toEqual({ sel: 'walk-first' }));
  });

  it('the drawer no longer reads as unsaved when it tells the page it saved', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await fillAndSave('walk-clean');
    await waitFor(() => expect(atSaved).toEqual([false]));
  });

  it('while its close is landing, a saved drawer takes no more input and sends nothing more', async () => {
    hold.on = true;
    await renderPage(page, { path: '/vault?edit=new' });
    await fillAndSave('walk-held');
    await waitFor(() => expect(atSaved).toEqual([false]));
    const puts = () => requestLog.filter((r) => r.method === 'PUT').length;
    expect(puts()).toBe(1);
    const value = screen.getByLabelText(strings['edit.value']);
    await userEvent.type(value, 'typed-after-save{Enter}');
    expect((value as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(puts()).toBe(1);
  });

  it('a link straight to the form (?edit=new) still closes and opens the entry', async () => {
    const { router } = await renderPage(page, { path: '/vault?edit=new' });
    await fillAndSave('walk-link');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['edit.newTitle'] })).toBeNull());
    await waitFor(() => expect(router.state.location.search).toEqual({ sel: 'walk-link' }));
  });
});
