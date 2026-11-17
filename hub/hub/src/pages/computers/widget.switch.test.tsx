// The Home widget's Start belongs to the computer it was pressed on: after a switch, the next computer shows
// neither that press's busy Start nor its outcome, and a late answer never lands on it.
import { chooseComputer, fixtureWorld } from '@core';
import kitStrings from '@kit/strings.en.json';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import strings from './strings.en.json';
import page from './page';

// The widget has the shape of a page view, so the page harness renders it through the real router.
const host = { ...page, load: () => import('./widget') };
const named = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const choose = (n: string) => act(async () => { chooseComputer(named(n)); });

describe('computers widget: a Start press stays on its computer', () => {
  it("an unknown answer for cedar is not shown on fjord, and fjord's Resume can be pressed", async () => {
    await renderPage(host, { state: 'pendingOps' });
    await choose('cedar');
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.start'] }, { timeout: 8000 }));
    // cedar: the press may have gone through (core holds it, or the widget's own banner says so).
    expect(await screen.findByText(/gone through/i, {}, { timeout: 8000 })).toBeInTheDocument();
    await choose('fjord');
    const resume = await screen.findByRole('button', { name: strings['menu.resume'] }, { timeout: 8000 });
    expect(screen.queryByText(kitStrings['outcome.pending.title'])).toBeNull();
    expect(screen.queryByText(/gone through/i)).toBeNull();
    expect(resume).not.toHaveAttribute('aria-disabled', 'true');
  });

  it("a slow answer for cedar leaves fjord's Resume idle, and does not land on fjord when it arrives", async () => {
    await renderPage(host, { state: 'pendingOps', latency: 'slow' });
    await choose('cedar');
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.start'] }, { timeout: 8000 }));
    await choose('fjord');
    const resume = await screen.findByRole('button', { name: strings['menu.resume'] }, { timeout: 8000 });
    expect(resume).not.toHaveAttribute('aria-disabled', 'true');
    // cedar's answer arrives (slow is 2.5 s, plus core's retries): still nothing on fjord.
    await new Promise((r) => setTimeout(r, 4000));
    await waitFor(() => expect(screen.queryByText(kitStrings['outcome.pending.title'])).toBeNull());
    expect(screen.getByRole('button', { name: strings['menu.resume'] })).not.toHaveAttribute('aria-disabled', 'true');
  }, 20000);
});
