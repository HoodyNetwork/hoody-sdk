// Playwright: WCAG 2.5.3 Label in Name for the kit picker trigger. Every ComputerPicker, ProjectPicker
// and ProgramPicker trigger is named by the words it shows (the pick or the placeholder / loading words, the realm, the
// state), then what it is for, so a voice user who says what they see reaches it. Each trigger's whole name is checked,
// and axe's label-content-name-mismatch judges it in a real browser, alone and inside a PickerField, at desktop and
// phone widths. The gallery holds every trigger state; Files and Logs carry the triggers pages show at rest.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import files from '../../pages/files/strings.en.json';
import logs from '../../pages/logs/strings.en.json';
import computerPieces from '../gallery/computerPicker.strings.en.json';
import pickerPieces from '../gallery/projectProgramPicker.strings.en.json';

// PickerTrigger's class, under the dev server's readable CSS module names.
const TRIGGER = 'button[class*="ComputerPicker-module__trigger"]';
const pane = (p: string) => files['pick.label'].replace('{{pane}}', p);

// Each place's triggers in page order, by what each is for: at desktop, then at phone width (a phone shows one Files
// pane). The gallery's last one sits in a PickerField, whose visible label is its purpose.
const GALLERY = [computerPieces.picked, computerPieces.none, computerPieces.loading, computerPieces.long, pickerPieces.project, pickerPieces.program, pickerPieces.field];
const PLACES = [
  { name: 'the kit gallery (alone, loading, placeholder, long realm, in a PickerField)', path: '/_kit?tab=pieces', purposes: [GALLERY, GALLERY] },
  { name: 'Files, both panes', path: '/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1', purposes: [[pane(files['pane.a']), pane(files['pane.b'])], [pane(files['pane.a'])]] },
  { name: 'Logs, the toolbar', path: '/logs', purposes: [[logs['f.computer']], [logs['f.computer']]] },
];

/** The visible triggers, each with its words: its text, never the decorative aria-hidden marks (state dot, flag). */
async function triggers(page: Page) {
  const out: { button: ReturnType<Page['locator']>; shown: string }[] = [];
  for (const button of await page.locator(TRIGGER).all()) {
    if (!(await button.isVisible())) continue;
    const shown = await button.evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach((n) => n.remove());
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
    out.push({ button, shown });
  }
  return out;
}

for (const [w, width] of [1440, 390].entries()) {
  test.describe(`picker triggers say what they show first, at ${width}`, () => {
    for (const place of PLACES) {
      test(place.name, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 900 });
        await gotoHub(page, place.path);
        await expect(page.locator(TRIGGER).first()).toBeVisible();
        const purposes = place.purposes[w]!;
        const seen = await triggers(page);
        expect(seen.length, 'the triggers this place shows').toBe(purposes.length);
        for (const [i, t] of seen.entries()) {
          expect(t.shown, 'a trigger shows words').not.toBe('');
          await expect(t.button).toHaveAccessibleName(`${t.shown} ${purposes[i]}`);
        }
        const axe = await new AxeBuilder({ page }).include(TRIGGER).withRules(['label-content-name-mismatch']).analyze();
        expect(axe.violations.flatMap((v) => v.nodes.map((n) => n.html))).toEqual([]);
      });
    }
  });
}
