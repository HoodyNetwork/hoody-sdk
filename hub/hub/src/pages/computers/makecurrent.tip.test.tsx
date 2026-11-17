// "Make current" says what it does: hovering or focusing it shows a short tooltip (the top-bar computer, which
// programs, schedules, SSH keys and the Board then use). atlas is the fixture world's current computer, so borealis
// shows the button.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('computers: Make current explains itself', () => {
  it('hovering Make current shows what it does', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    const b = await screen.findByRole('button', { name: strings['menu.makeCurrent'] }, { timeout: 8000 });
    // React Aria opens a tooltip on hover once the pointer is the input in use (as after any mouse move in a browser).
    await userEvent.click(document.body);
    await userEvent.hover(b);
    const tip = await screen.findByRole('tooltip', {}, { timeout: 3000 });
    expect(tip).toHaveTextContent(strings['menu.makeCurrent.tip']);
  });

  it('keyboard focus on Make current shows the same tooltip', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    const b = await screen.findByRole('button', { name: strings['menu.makeCurrent'] }, { timeout: 8000 });
    let guard = 0;
    while (document.activeElement !== b && guard++ < 200) await userEvent.tab();
    expect(document.activeElement).toBe(b);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(strings['menu.makeCurrent.tip']));
  });
});
