// Vitest: the capability is checked again when a change is sent. A token session's
// capabilities can drop while a dialog is open (core rechecks the token); the page saw exec allowed when it rendered,
// the send finds it gone. Here core's exported can() turns false for exec once `off.on` is set, while useCan (core's
// own) still answers from the session: the button stays enabled, exactly the race.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Core from '@core';
import { resetFiles, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const off = vi.hoisted(() => ({ on: false }));
vi.mock('@core', async (importOriginal) => {
  const m = await importOriginal<typeof Core>();
  return { ...m, can: (cap: string) => (off.on && cap === 'computers.actions.exec' ? false : m.can(cap)) };
});

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

beforeEach(() => { resetFiles(); off.on = false; sentChanges.length = 0; });
// react-aria's live announcer delays its first message 100 ms when that message comes inside a findBy/waitFor (the
// testing library turns its act environment off there), and that timer then writes to the document. A timer set
// here after the test, for no less, fires after it while the document is still up.
afterAll(() => new Promise<void>((done) => { setTimeout(done, 100); }));

describe('changes turned off between render and send', () => {
  it('sends nothing and says changes are off', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fhome%2Fada' });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    await within(pane).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
    const newFolder = within(pane).getByRole('button', { name: strings['action.newFolder'] });
    expect(newFolder).toBeEnabled();
    expect(newFolder).not.toHaveAttribute('aria-disabled', 'true');
    // New folder and Upload are as tall as the bar's other controls (32 px): never the small button.
    for (const b of [newFolder, within(pane).getByRole('button', { name: 'Upload' })]) expect(b).not.toHaveClass('sm');
    await userEvent.click(newFolder);
    const d = await screen.findByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'drafts');
    off.on = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    expect(await within(d).findByText(strings['changes.off'])).toBeInTheDocument();
    expect(within(d).queryByText(/may have gone through/i)).toBeNull();
    expect(sentChanges).toEqual([]);
  });
});
