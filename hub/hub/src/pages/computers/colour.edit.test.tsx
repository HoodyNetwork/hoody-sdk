// A computer's colour is changed from its page, by the header swatch or the Colour row in Details. Both
// open one dialog (the kit ColorPicker); Save sends only the colour, once, for the computer it opened on; a lost
// answer is held, never sent again. Where the colour can't be changed, both stay plain. "Not in
// this realm" on a project says why it shows, on hover, focus and a press.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computerColor } from '@core';
import { interpolate } from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as dataModule from './data';
import { colourLanded, colourSends, computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';

// noUpdate: the key lacks computers.update (the Rename and colour permission).
let noUpdate = false;
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useCaps: () => {
      const caps = real.useCaps();
      if (!noUpdate) return caps;
      const all = caps === 'all' ? ['computers.actions.start', 'computers.actions.stop', 'computers.actions.restart', 'computers.delete', 'account'] : [...caps];
      return new Set(all.filter((x) => x !== 'computers.update'));
    },
  };
});

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture atlas');
const COLOUR = computerColor(atlas);
if (!COLOUR) throw new Error('fixture atlas colour');
const SEL = '/computers?sel=atlas.00a1';
const changeName = interpolate(strings['colour.change'], { name: 'atlas', colour: COLOUR });
const triggers = async () => {
  await screen.findByRole('heading', { name: strings['facts.title'] }, { timeout: 20000 });
  return screen.findAllByRole('button', { name: changeName });
};
/** A preset other than the computer's own colour, picked in the dialog: its value as the API keeps it. */
const pickOther = async (d: HTMLElement) => {
  const other = within(d).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') !== 'true' && !(r as HTMLInputElement).checked);
  if (!other) throw new Error('no other preset');
  await userEvent.click(other);
  return computerColor({ color: (other as HTMLInputElement).value });
};

beforeEach(() => {
  noUpdate = false;
  colourSends.length = 0;
  colourLanded.shown = true;
  delete colourLanded.as;
  delete colourLanded.on;
});

describe('computers: change a computer\'s colour from its page', () => {
  it('the header swatch and the Colour row are both buttons that say the colour, with the tooltip on hover', async () => {
    await renderPage(page, { path: SEL });
    const both = await triggers();
    expect(both).toHaveLength(2);
    // React Aria opens a tooltip on hover once the pointer is the input in use (as after any mouse move in a browser).
    await userEvent.click(document.body);
    for (const [i, b] of both.entries()) {
      await userEvent.hover(b);
      const tip = await screen.findByRole('tooltip', {}, { timeout: 3000 }).catch(() => { throw new Error(`no tooltip on trigger ${i}`); });
      expect(tip).toHaveTextContent(strings['colour.tip']);
      await userEvent.unhover(b);
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    }
  });

  it('Save sends only the picked colour, once, for this computer; the dialog closes', async () => {
    await renderPage(page, { path: SEL });
    await userEvent.click((await triggers())[1]!);
    const d = await screen.findByRole('alertdialog', { name: interpolate(strings['colour.title'], { name: 'atlas' }) });
    const save = within(d).getByRole('button', { name: strings['colour.go'] });
    // The computer's own colour sends nothing.
    expect(save).toBeDisabled();
    const picked = await pickOther(d);
    await userEvent.click(save);
    await waitFor(() => expect(colourSends).toHaveLength(1));
    expect(colourSends[0]!.body).toEqual({ color: picked });
    expect(colourSends[0]!.path).toBe(`/computers/${atlas.id}`);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(colourSends).toHaveLength(1);
  });

  it('by keyboard: Enter on the header swatch opens it, Escape closes it and focus returns to the swatch', async () => {
    await renderPage(page, { path: SEL });
    const head = (await triggers())[0]!;
    head.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('alertdialog', { name: interpolate(strings['colour.title'], { name: 'atlas' }) })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(head).toHaveFocus());
    expect(colourSends).toHaveLength(0);
  });

  it('keyboard focus on the Colour row shows the same tooltip', async () => {
    await renderPage(page, { path: SEL });
    const row = (await triggers())[1]!;
    for (let i = 0; i < 200 && document.activeElement !== row; i += 1) await userEvent.tab();
    expect(row).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(strings['colour.tip']));
  });

  it('a lost answer is held: the band says so and Save stays off (never sent twice)', async () => {
    await renderPage(page, { path: SEL, state: 'pendingOps' });
    await userEvent.click((await triggers())[1]!);
    const d = await screen.findByRole('alertdialog');
    await pickOther(d);
    await userEvent.click(within(d).getByRole('button', { name: strings['colour.go'] }));
    expect(await within(d).findByText(interpolate(strings['held.colour'], { name: 'atlas' }), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['colour.go'] })).toBeDisabled();
    expect(colourSends).toHaveLength(1);
  });

  // A held send that a read proves closes the dialog; a read that proves nothing keeps the hold.
  const TITLE = interpolate(strings['colour.title'], { name: 'atlas' });
  const HELD = interpolate(strings['held.colour'], { name: 'atlas' });
  const saveHeld = async (state: string) => {
    await renderPage(page, { path: SEL, state });
    await userEvent.click((await triggers())[1]!);
    const d = await screen.findByRole('alertdialog', { name: TITLE });
    const picked = await pickOther(d);
    await userEvent.click(within(d).getByRole('button', { name: strings['colour.go'] }));
    return { d, picked };
  };
  const checkAgain = async (d: HTMLElement) => userEvent.click(await within(d).findByRole('button', { name: strings['outcome.check'] }, { timeout: 8000 }));
  const stillHeld = async (d: HTMLElement) => {
    await new Promise((r) => setTimeout(r, 800));
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBe(d);
    expect(within(d).getByText(HELD)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['colour.go'] })).toBeDisabled();
    expect(colourSends).toHaveLength(1);
  };

  it('a lost answer that did go through: core\'s own read-back proves it and the dialog closes; one send', async () => {
    await saveHeld('colourLanded');
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: TITLE })).toBeNull(), { timeout: 8000 });
    expect(colourSends).toHaveLength(1);
  }, 40000);

  it('a lost answer proved only later: the hold stays until Check again reads it, then the dialog closes; one send', async () => {
    colourLanded.shown = false;
    const { d } = await saveHeld('colourLanded');
    expect(await within(d).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
    colourLanded.shown = true;
    await checkAgain(d);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: TITLE })).toBeNull(), { timeout: 8000 });
    expect(colourSends).toHaveLength(1);
  }, 40000);

  it('a lost answer that did not go through: Check again keeps the hold, Save off', async () => {
    const { d } = await saveHeld('pendingOps');
    expect(await within(d).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
    await checkAgain(d);
    await stillHeld(d);
  }, 40000);

  it('the sent colour on another computer, or another colour on this one, proves nothing: the hold stays', async () => {
    const other = computers.find((c) => c.id !== atlas.id);
    if (!other) throw new Error('fixture other computer');
    colourLanded.on = other.id;
    const { d } = await saveHeld('colourLanded');
    expect(await within(d).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
    await checkAgain(d);
    await stillHeld(d);
    delete colourLanded.on;
    colourLanded.as = COLOUR;
    await checkAgain(d);
    await stillHeld(d);
  }, 40000);

  it('your own Dismiss is not proof: the dialog stays open on the picker, even when the list shows the sent colour', async () => {
    colourLanded.shown = false;
    const { d } = await saveHeld('colourLanded');
    await userEvent.click(await within(d).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    colourLanded.shown = true;
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    expect(await within(d).findByRole('radiogroup', {}, { timeout: 8000 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBe(d);
    expect(colourSends).toHaveLength(1);
  }, 40000);

  it('closed and opened again, the hold is still shown and Save stays off', async () => {
    const { d } = await saveHeld('pendingOps');
    expect(await within(d).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: TITLE })).toBeNull());
    await userEvent.click((await triggers())[0]!);
    const again = await screen.findByRole('alertdialog', { name: TITLE });
    expect(await within(again).findByText(HELD, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(again).getByRole('button', { name: strings['colour.go'] })).toBeDisabled();
    expect(colourSends).toHaveLength(1);
  }, 40000);

  it('without computers.update both stay plain: the colour shows, nothing to press', async () => {
    noUpdate = true;
    await renderPage(page, { path: SEL });
    await screen.findByRole('heading', { name: strings['facts.title'] }, { timeout: 20000 });
    expect(screen.queryByRole('button', { name: changeName })).toBeNull();
    expect(screen.getByText(COLOUR)).toBeInTheDocument();
  });
});

describe('computers: "Not in this realm" says why', () => {
  const tip = strings['proj.outsideTip'];
  const name = interpolate(strings['proj.outsideName'], { tip });
  it('on a project row: a button named with the tag and the sentence; hover shows the tooltip, a press the popover', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutside' });
    const tags = await screen.findAllByRole('button', { name }, { timeout: 8000 });
    expect(tags[0]).toHaveTextContent(strings['proj.outside']);
    await userEvent.click(document.body);
    await userEvent.hover(tags[0]!);
    expect(await screen.findByRole('tooltip', {}, { timeout: 3000 })).toHaveTextContent(tip);
    await userEvent.unhover(tags[0]!);
    await userEvent.click(tags[0]!);
    expect(await screen.findByRole('dialog', { name: strings['proj.outside'] })).toHaveTextContent(tip);
  });

  it('by keyboard focus the tooltip shows at once', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutside' });
    const tags = await screen.findAllByRole('button', { name }, { timeout: 8000 });
    // Tab until the first tag has focus (keyboard focus is what shows a tooltip with no delay).
    for (let i = 0; i < 60 && document.activeElement !== tags[0]; i += 1) await userEvent.tab();
    expect(tags[0]).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(tip);
  });
});
