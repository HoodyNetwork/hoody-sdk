// The list's "Ask the Agent" sits in the toolbar's row and opens the kit's drawer;
// how a question went shows in that drawer, never inside the toolbar's row (where a sentence squeezed search and cut
// the other controls) nor under it.
import { afterEach, describe, expect, it } from 'vitest';
import { dropAskDraft, useAskDock } from '@kit/ask';
import { act, renderHook, renderPage, screen, userEvent, within } from '@app/testing';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import { resetAccess } from './fixtures';
import page from './page';
import { resetAccessAsks } from './parts/AccessDrawer';

const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('computers list: where Ask the Agent says how it went', () => {
  afterEach(() => {
    act(() => dropAskDraft());
    resetAccess();
    resetAccessAsks();
  });

  it('the button stays in the toolbar row; the outcome shows in the drawer it opens, outside the toolbar', async () => {
    await renderPage(page);
    const button = await screen.findByRole('button', { name: ask['aa.label'] }, { timeout: 8000 });
    const toolbar = button.closest('.toolbar');
    expect(toolbar).not.toBeNull();
    const dock = renderHook(() => useAskDock()).result;
    await userEvent.click(button);
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: ask['aa.explain'] }));
    let taken: ReturnType<ReturnType<typeof useAskDock>['takeDraft']>;
    for (let n = 0; n < 80 && !dock.current.draft; n++) await settle(50);
    act(() => { taken = dock.current.takeDraft(); });
    act(() => taken?.onStart?.('unknown'));
    const note = await within(d).findByText(ask['aa.unknown']);
    expect(toolbar?.contains(note)).toBe(false);
    expect(document.querySelector('.toolbarNote')).toBeNull();
  }, 30000);
});
