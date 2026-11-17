// Vitest: the Run tab brings the row that says what a run ended as into view when the answer arrives. The row is
// under the output panel (240px at least), so in a short window a refused command ended with "Output shows here" on
// screen and its "didn't go through" below the fold. The row is scrolled to by its nearest edge; focus stays in the
// Command field; typing, hovering and opening the tab scroll nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const calls: { el: Element; arg: unknown }[] = [];
const proto = Element.prototype as unknown as { scrollIntoView?: (arg?: unknown) => void };
const before = proto.scrollIntoView;
beforeEach(() => {
  calls.length = 0;
  proto.scrollIntoView = function (this: Element, arg?: unknown) { calls.push({ el: this, arg }); };
});
afterEach(() => {
  proto.scrollIntoView = before;
  vi.restoreAllMocks();
});

const CASES = [
  // A refused command (422).
  { state: 'runFailed', type: 'ls', says: strings['run.failed'] },
  // A command that ran and failed.
  { state: 'runNonZero', type: 'nope', says: strings['run.exit.code'].replace('{{code}}', '127') },
  // No answer came back: the command may have run.
  { state: 'pendingOps', type: 'ls', says: strings['held.run'].replace('{{name}}', 'atlas') },
] as const;

describe('computers: Run tab, the status row comes into view when the answer arrives', () => {
  for (const c of CASES) {
    it(`${c.state}: scrolled to once, by the nearest edge; focus stays in the field`, { timeout: 60000 }, async () => {
      await renderPage(page, { state: c.state, path: '/computers?sel=atlas.00a1&tab=run' });
      const box = await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 30000 });
      await userEvent.hover(box);
      await userEvent.type(box, c.type);
      // Opening the tab, hovering and typing scroll nothing to the status row.
      const row = () => calls.filter((x) => x.el.textContent?.includes(c.says));
      expect(row()).toEqual([]);
      await userEvent.keyboard('{Enter}');
      const said = await screen.findByText(c.says, {}, { timeout: 8000 });
      await waitFor(() => expect(row().length).toBe(1));
      // The element scrolled to holds the status and is not the output panel.
      const hit = row()[0]!;
      expect(hit.el.contains(said)).toBe(true);
      expect(hit.el.textContent).not.toContain(strings['run.outputEmpty']);
      expect(hit.arg).toEqual({ block: 'nearest' });
      expect(document.activeElement).toBe(box);
      // Hovering the status afterwards scrolls nothing more.
      await userEvent.hover(said);
      expect(row().length).toBe(1);
    });
  }
});
