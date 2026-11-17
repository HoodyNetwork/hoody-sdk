// Vitest: the Bot's Details panel (its status facts, running tasks and settings summary) opens from
// the header's Details button, never from a disclosure in the flow. Closed by default; the button says whether the panel is
// open (aria-pressed); the keyboard goes into the panel on open and back to the button on close; the address keeps it
// (?details=1). "Message" on a task is one press of Details away. The geometry (beside the log, above it on a phone) is
// measured in a browser (details.spec.ts); these pin the structure and the stylesheet.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';
import K from '@kit/strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (extra = '') => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}${extra}` });
const css = readFileSync(path.join(__dirname, 'parts/pane.module.css'), 'utf8');
const rule = (sel: string, from = css) => from.match(new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';
const wide = css.slice(css.indexOf('@container bot-pane (min-width: 1000px)'));
const toggle = () => document.querySelector<HTMLElement>('[data-details-toggle]');
const panel = () => screen.queryByRole('complementary', { name: strings['rail.details'] });

describe('the Details panel', () => {
  it('is closed by default: no panel and no Details disclosure in the tab, and the header button is not pressed', async () => {
    await open();
    await screen.findByRole('textbox', { name: strings['say.label'] });
    await waitFor(() => expect(toggle()).not.toBeNull());
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(toggle()).toHaveAccessibleName(strings['details.open']);
    expect(panel()).toBeNull();
    // The old inline disclosure is gone: the one Details button is the header's.
    expect(screen.getAllByRole('button', { name: strings['details.open'] })).toEqual([toggle()]);
    expect(screen.queryByText(strings['rail.status'])).toBeNull();
  });

  it('the header button opens it, says so, keeps it in the address and puts the keyboard in it; Close brings the keyboard back', async () => {
    const { router } = await open();
    await waitFor(() => expect(toggle()).not.toBeNull());
    await userEvent.click(toggle()!);
    const side = await screen.findByRole('complementary', { name: strings['rail.details'] });
    expect((router.state.location.search as Record<string, unknown>).details).toBe('1');
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(toggle()).toHaveAccessibleName(strings['details.close']);
    await waitFor(() => expect(side).toHaveFocus());
    expect(within(side).getByRole('heading', { name: strings['rail.details'] })).toBeInTheDocument();
    expect(within(side).getByText(strings['rail.status'])).toBeInTheDocument();
    // The panel's Close (a kit SubSection action: folded into More actions on a narrow pane, as jsdom measures it).
    const direct = within(side).queryByRole('button', { name: strings['details.close'] });
    if (direct) await userEvent.click(direct);
    else {
      await userEvent.click(within(side).getByRole('button', { name: K['action.more'] }));
      await userEvent.click(await screen.findByRole('menuitem', { name: strings['details.close'] }));
    }
    await waitFor(() => expect(panel()).toBeNull());
    expect((router.state.location.search as Record<string, unknown>).details).toBeUndefined();
    await waitFor(() => expect(toggle()).toHaveFocus());
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('pressed again, the header button closes it and keeps the keyboard on itself', async () => {
    await open('&details=1');
    await screen.findByRole('complementary', { name: strings['rail.details'] });
    await userEvent.click(toggle()!);
    await waitFor(() => expect(panel()).toBeNull());
    await waitFor(() => expect(toggle()).toHaveFocus());
  });

  it('Message on a running task is one press of Details away', async () => {
    const { router } = await open();
    await waitFor(() => expect(toggle()).not.toBeNull());
    expect(screen.queryByRole('button', { name: strings['task.messageOne'].replace('{{title}}', 'Read deploy log') })).toBeNull();
    await userEvent.click(toggle()!);
    const side = await screen.findByRole('complementary', { name: strings['rail.details'] });
    await userEvent.click(await within(side).findByRole('button', { name: strings['task.messageOne'].replace('{{title}}', 'Read deploy log') }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).msg).toBe('sess-a1');
  });

  it('the header button is the Activity tab\'s only: another tab has none', async () => {
    await open('&tab=work');
    await screen.findByRole('tab', { name: new RegExp(`^${strings['tab.work']}`), selected: true });
    expect(toggle()).toBeNull();
  });

  it('the stylesheet: above the log on a narrow pane, a column beside the log on a wide one', () => {
    expect(css).not.toMatch(/\.rail(Inline|Side)\b/);
    expect(rule('.activityDetails')).toMatch(/grid-template-rows: auto minmax\(0, 1fr\) auto;/);
    expect(rule('.activityDetails', wide)).toMatch(/grid-template-columns: minmax\(0, 1fr\) 320px;/);
    expect(rule('.details', wide)).toMatch(/grid-column: 2;/);
    expect(rule('.details', wide)).toMatch(/grid-row: 1;/);
    // Held beside the reader's place in the thread, under the stuck tab strip.
    expect(rule('.details', wide)).toMatch(/position: sticky;/);
    expect(rule('.details', wide)).toMatch(/inset-block-start: calc\(var\(--detail-head-live, var\(--tabs-sticky-top, 0px\)\) \+ var\(--tabs-h\)/);
    expect(rule('.activityDetails > .logCol', wide)).toMatch(/grid-column: 1;/);
  });
});
