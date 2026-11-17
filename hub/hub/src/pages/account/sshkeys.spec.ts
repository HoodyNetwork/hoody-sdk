// SSH keys rows (no button repeated on every
// row): a fine pointer draws no button in any row (the row opens, by click or Enter); a touch phone shows the kit's row
// chevron, an icon named for its computer. The key cell holds the type and last characters on one line and the comment on
// a second (cut on a fine pointer, wrapped whole on a touch phone). Nothing in a row overlaps and the page never scrolls
// sideways, at 1440 and on a 390 px touch phone.
import { expect } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import strings from './strings.en.json';

const cases = [
  { at: '1440', width: 1440, touch: false },
  { at: '390 fine', width: 390, touch: false },
  { at: '390 touch', width: 390, touch: true },
];
const NAMES = ['atlas', 'borealis', 'cedar', 'fjord', 'granite'];
// The fixture comments: atlas's short one, and granite's long one that must wrap over several lines when shown whole.
const LONG = 'ci-deploy@build-runner-07.acme.example (rotated 2026-11-01, owner platform team, read-only)';
const COMMENTS = ['ada@laptop', LONG];

for (const c of cases) {
  test.describe(`SSH keys rows at ${c.at}`, () => {
    test.use({ viewport: { width: c.width, height: 900 }, hasTouch: c.touch, isMobile: c.touch });
    test(`SSH keys: no row button on a fine pointer, a named chevron on touch, nothing overlaps, at ${c.at}`, async ({ page }) => {
      await gotoHub(page, '/account');
      const view = page.getByRole('table', { name: strings['k.title'] }).or(page.getByRole('list', { name: strings['k.title'] })).first(); // one of the two: a table wide, a list on a phone
      await expect(view).toBeVisible({ timeout: 20_000 });
      await view.scrollIntoViewIfNeeded();
      for (const name of NAMES) {
        const open = view.getByRole('button', { name: strings['k.open'].replace('{{name}}', name), exact: true });
        const add = view.getByRole('button', { name: strings['k.add'].replace('{{name}}', name), exact: true });
        // Touch: exactly one chevron per row, an icon (no words). Fine pointer: none at all.
        await expect(open.or(add), `${name}'s row chevron`).toHaveCount(c.touch ? 1 : 0);
        if (c.touch) await expect(open.or(add)).toHaveText('');
      }
      if (!c.touch) await expect(view.locator('[data-row-actions] button')).toHaveCount(0);
      if (c.touch) await expect(view.getByRole('button', { name: strings['k.add'].replace('{{name}}', 'borealis'), exact: true })).toHaveCount(1);
      // Every row: the chevron's box (touch) meets no text box of its row; the comment is one line, cut, inside its row.
      const rows = await view.evaluate((root, comments) => {
        const rowEls = [...root.querySelectorAll('tr, [role="listitem"], li')].filter((r) => r.querySelector('bdi'));
        // How many line boxes the element's text sits on (distinct tops of its text's client rects).
        const lineTops = (el: Element) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
        };
        const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        return rowEls.map((row) => {
          const btn = row.querySelector('button')?.getBoundingClientRect();
          const texts: { text: string; box: DOMRect }[] = [];
          const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (!n.textContent?.trim() || n.parentElement?.closest('button')) continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            // What shows: the text's box cut to every clipping ancestor in the row (a CSS-cut comment runs on, hidden, past
            // its note's edge).
            let { left, right, top, bottom } = r.getBoundingClientRect();
            for (let a = n.parentElement; a && a !== row; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
              const c = a.getBoundingClientRect();
              left = Math.max(left, c.left); right = Math.min(right, c.right); top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom);
            }
            texts.push({ text: n.textContent.trim(), box: new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top)) });
          }
          const overlaps = btn ? texts.filter((t) => t.box.width > 0 && hit(t.box, btn)).map((t) => t.text) : [];
          // The note holding a fixture comment (the computer's name is a bdi too, so pick by the comment's text).
          const note = [...row.querySelectorAll('bdi')].find((e) => comments.includes(e.textContent ?? ''))?.parentElement;
          const nb = note?.getBoundingClientRect();
          const rb = row.getBoundingClientRect();
          return {
            row: (row.textContent ?? '').slice(0, 40),
            overlaps,
            note: note
              ? { text: note.textContent ?? '', ellipsis: getComputedStyle(note).textOverflow, wrap: getComputedStyle(note).whiteSpace, oneLine: lineTops(note) === 1, inside: nb!.right <= rb.right + 0.5 && nb!.left >= rb.left - 0.5 }
              : null,
          };
        });
      }, COMMENTS);
      expect(rows.length, 'one row per computer').toBe(NAMES.length);
      for (const r of rows) expect(r.overlaps, `nothing overlaps the button in "${r.row}"`).toEqual([]);
      const notes = rows.filter((r) => r.note);
      expect(notes.length, 'the rows with a comment show it').toBeGreaterThanOrEqual(2);
      // A fine pointer cuts it to one line (its tooltip shows it whole); a touch phone has no tooltip, so it wraps whole,
      // the long one over several lines.
      for (const r of notes) {
        const { text, ...note } = r.note!;
        expect(note, `the comment of "${r.row}" is ${c.touch ? 'wrapped whole' : 'one cut line'} inside its row`).toEqual(
          c.touch ? { ellipsis: 'ellipsis', wrap: 'normal', oneLine: text !== LONG, inside: true } : { ellipsis: 'ellipsis', wrap: 'nowrap', oneLine: true, inside: true },
        );
      }
      // No clipping ancestor (the phone list's one-line field, a cell) hides any part of a comment, unfocused or while the
      // row's button holds keyboard focus; at 390 the long one, shown whole, spans several lines.
      const clipped = () =>
        view.evaluate((root, comments) =>
          [...root.querySelectorAll('bdi')]
            .filter((e) => comments.includes(e.textContent ?? ''))
            .flatMap((e) => {
              const b = e.getBoundingClientRect();
              const out: string[] = [];
              for (let a = e.parentElement; a && a !== root.parentElement; a = a.parentElement) {
                const cs = getComputedStyle(a);
                if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
                const r = a.getBoundingClientRect();
                if (b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5) out.push(`${e.textContent} cut by ${a.tagName}.${a.className}`);
              }
              return out;
            }),
          COMMENTS,
        );
      const longLines = () =>
        view.evaluate((root, long) => {
          const e = [...root.querySelectorAll('bdi')].find((x) => x.textContent === long);
          if (!e) return 0;
          const r = document.createRange();
          r.selectNodeContents(e);
          return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
        }, LONG);
      expect(await clipped(), 'every comment is whole inside its clipping ancestors').toEqual([]);
      if (c.touch) expect(await longLines(), 'the long comment wraps over several lines on a touch phone').toBeGreaterThan(1);
      // Keyboard focus in granite's row: its chevron on touch, the row itself (row navigation) on a fine pointer.
      const rowOf = (name: string) => view.locator('tr, [role="listitem"], li').filter({ has: page.getByText(name, { exact: true }) }).first(); // a phone list item may nest an li in its listitem: the outer row
      const graniteOpen = c.touch ? view.getByRole('button', { name: strings['k.open'].replace('{{name}}', 'granite'), exact: true }) : rowOf('granite');
      await graniteOpen.focus();
      expect(await clipped(), 'still whole while the row holds keyboard focus').toEqual([]);
      if (c.width === 390) expect(await longLines(), 'keyboard focus shows the long comment whole, over several lines').toBeGreaterThan(1);
      await graniteOpen.blur();
      if (!c.touch) {
        // Keyboard: focus on atlas's row wraps its cut comment whole (no tooltip needed).
        const open = rowOf('atlas');
        await open.focus();
        await expect(view.getByText('ada@laptop', { exact: true }).locator('..')).toHaveCSS('white-space', 'normal');
        await open.blur();
        await expect(view.getByText('ada@laptop', { exact: true }).locator('..')).toHaveCSS('white-space', 'nowrap');
      }
      await noSideScroll(page);
    });
  });
}
