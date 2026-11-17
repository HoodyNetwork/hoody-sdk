// The kit's work-on-its-way cells on the gallery (/_kit?tab=pieces #work-cells): a download with a
// known size shows its Meter beside its words on one line, one without a size shows the words alone, one before any
// byte says Starting, and a row whose outcome is unknown shows the kit pill with Check again as the row's own inline
// button, which turns to Checking… and off while it runs. At 1440 (table) and 390 (list), both themes, nothing wider
// than the page.
// CellLines: the item cell stacks a name over its sub-line (a RowNote, a Tag), each line its own block
// that cuts on its own with an ellipsis inside the cell; a sub-line part that renders nothing takes no room; the row grows
// to hold both lines and clips nothing, at both densities.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kitStrings from '../strings.en.json';
import work from '../gallery/workCells.strings.en.json';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`work cells at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test('meter beside its words; words alone without a size; Check again inline and busy; no overflow', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=pieces', { theme });
        const sec = page.locator('#work-cells');
        await sec.scrollIntoViewIfNeeded();
        await expect(sec.getByRole('heading', { name: 'Work on its way' })).toBeVisible();
        const photos = sec.getByRole('row').filter({ hasText: 'photos-2026.zip' });
        const words = photos.getByText('76% · 38 MB of 50 MB', { exact: true });
        const meter = sec.getByRole('meter', { name: 'photos-2026.zip: 76% · 38 MB of 50 MB' });
        await expect(meter).toBeVisible();
        await expect(words).toBeVisible();
        const w = (await words.boundingBox())!;
        const m = (await meter.boundingBox())!;
        expect(Math.abs(m.y + m.height / 2 - (w.y + w.height / 2)), 'the meter sits on its words line').toBeLessThan(w.height);
        // No size: words alone, no percent, no meter for that item.
        await expect(sec.getByRole('row').filter({ hasText: 'a-very-long-video' }).getByText('1.2 GB so far', { exact: true })).toBeVisible();
        await expect(sec.getByRole('meter', { name: /^a-very-long-video/ })).toHaveCount(0);
        await expect(sec.getByRole('row').filter({ hasText: 'backup.tar' }).getByText('Starting', { exact: true })).toBeVisible();
        // Outcome unknown: the pill and the row's own inline Check again.
        const row = sec.getByRole('row').filter({ hasText: 'notes.md' });
        await expect(row.getByText('Outcome unknown')).toBeVisible();
        const check = row.getByRole('button', { name: 'Check again' });
        await expect(check).toBeVisible();
        await check.click();
        const busy = row.getByRole('button', { name: 'Checking…' });
        await expect(busy).toHaveAttribute('aria-disabled', 'true');
        await expect(row.getByRole('button', { name: 'Check again' })).toBeVisible({ timeout: 5000 });
        const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    });

/** The visible CellLines naming `name`: each line's text, display, ellipsis, cut and box, with its cell's and row's boxes. */
async function itemLines(sec: Locator, name: string) {
  const host = sec.locator('[class*="_lines_"]:visible').filter({ hasText: name }).first();
  return host.evaluate((el) => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    };
    const cell = el.closest('td, [role="cell"], [role="gridcell"], [role="rowheader"]') ?? el.parentElement!;
    const row = el.closest('[role="row"], tr') ?? cell;
    return {
      cell: box(cell),
      row: box(row),
      rowClips: row.scrollHeight - row.clientHeight,
      lines: [...el.children].map((l) => {
        const c = getComputedStyle(l);
        return { text: l.textContent ?? '', display: c.display, ellipsis: c.textOverflow, over: l.scrollWidth - l.clientWidth, box: box(l) };
      }),
    };
  });
}

/** The gallery's Transfers table switched to Compact through its View options, as a person does. */
async function toCompact(page: Page, sec: Locator) {
  await sec.getByRole('button', { name: kitStrings['table.view'] }).click();
  await page.getByRole('menuitemradio', { name: kitStrings['table.densityCompact'] }).or(page.getByRole('menuitem', { name: kitStrings['table.densityCompact'] })).click();
  await expect(sec.locator('[data-density="compact"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
}

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`CellLines at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      for (const density of width === 1440 ? (['normal', 'compact'] as const) : (['normal'] as const))
        test(`a sub-line stacks under its name and cuts on its own; an empty part takes no room; nothing clipped (${density})`, async ({ page }) => {
          await gotoHub(page, '/_kit?tab=pieces', { theme });
          const sec = page.locator('#work-cells');
          await sec.scrollIntoViewIfNeeded();
          await expect(sec.getByText(work['sub.photos'], { exact: true })).toBeVisible();
          if (density === 'compact') await toCompact(page, sec);
          // A name over its RowNote: two block lines, the note under the name, both inside the row.
          const photos = await itemLines(sec, work['row.photos']);
          expect(photos.lines.map((l) => l.text)).toEqual([work['row.photos'], work['sub.photos']]);
          expect(photos.lines.map((l) => l.display)).toEqual(['block', 'block']);
          const [name, note] = [photos.lines[0]!.box, photos.lines[1]!.box];
          expect(note.y, 'the note sits under its name').toBeGreaterThanOrEqual(name.bottom - 1);
          expect(Math.abs(note.x - name.x), 'the lines share their start').toBeLessThanOrEqual(1);
          expect(note.bottom, 'the row holds the second line').toBeLessThanOrEqual(photos.row.bottom + 0.5);
          expect(photos.rowClips, 'the row clips nothing').toBeLessThanOrEqual(0);
          // A Tag as the sub-line.
          const notes = await itemLines(sec, work['row.notes']);
          expect(notes.lines.map((l) => l.text)).toEqual([work['row.notes'], work['sub.notes']]);
          expect(notes.lines[1]!.box.bottom).toBeLessThanOrEqual(notes.row.bottom + 0.5);
          // The long sub-line (a RowNote with cut) cuts on its own with an ellipsis, inside its cell.
          const video = await itemLines(sec, work['sub.video']);
          const long = video.lines[1]!;
          expect(long.ellipsis).toBe('ellipsis');
          expect(long.over, 'the long sub-line is cut').toBeGreaterThan(0);
          expect(long.box.right, 'inside its cell').toBeLessThanOrEqual(video.cell.right + 0.5);
          // A sub-line part that renders nothing: its line is there, empty, and takes no room.
          const backup = await itemLines(sec, work['row.backup']);
          expect(backup.lines.map((l) => [l.text, l.display])).toEqual([
            [work['row.backup'], 'block'],
            ['', 'none'],
          ]);
          const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
          expect(over).toBeLessThanOrEqual(0);
        });
    });
