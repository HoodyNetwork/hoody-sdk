// Playwright: the composer's "@" file picker in a chat on atlas (fixtures: s-old, a chat the fixture agent has,
// runs in /home/ada; the Files fixtures answer its folders). An "@" at a word start lists the folder above the draft box,
// inside the viewport and never over the box; a folder goes one level down, a file is written with a space after it, and
// nothing is sent; a path out of the folder says only files in this folder. At 360, 390 and 1440, left-to-right and
// right-to-left.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import conv from '@kit/agent/Conversation.strings.en.json';
import { chatLink } from './links';

const CHAT = chatLink({ computer: 'atlas.00a1', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 's-old' });
const box = (page: Page) => page.getByRole('textbox', { name: conv['agent.composer'] });
const list = (page: Page) => page.getByRole('listbox', { name: conv['agent.mentionList'] });
const folder = (n: string) => conv['agent.mentionFolder'].replace('{{name}}', n);

for (const c of [
  { width: 1440, rtl: false }, { width: 390, rtl: false }, { width: 360, rtl: false }, { width: 390, rtl: true },
]) {
  test(`a chat at ${c.width}${c.rtl ? ' rtl' : ''}: "@" lists the chat folder above the box; a folder goes down, a file is written`, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: c.width < 600 ? 844 : 900 });
    await gotoHub(page, CHAT);
    if (c.rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
    await box(page).click();
    await box(page).pressSequentially('see @');
    await expect(list(page)).toBeVisible({ timeout: 20000 });
    const opts = list(page).getByRole('option');
    await expect(opts.filter({ hasText: folder('projects') })).toHaveCount(1);
    await expect(opts.filter({ hasText: 'notes.txt' })).toHaveCount(1);
    await expect(opts.filter({ hasText: 'bell' }), 'a name with a control character is not offered').toHaveCount(0);
    await noSideScroll(page);
    const vp = page.viewportSize()!;
    const m = (await list(page).locator('xpath=..').boundingBox())!;
    const b = (await box(page).boundingBox())!;
    expect(m.x >= -0.5 && m.y >= -0.5 && m.x + m.width <= vp.width + 0.5 && m.y + m.height <= vp.height + 0.5, 'the menu is inside the viewport').toBe(true);
    expect(m.y + m.height, 'the menu ends above the draft box').toBeLessThanOrEqual(b.y + 0.5);
    const hit = await opts.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === el || el.contains(at));
    });
    expect(hit, 'the first entry is not covered').toBe(true);
    await box(page).pressSequentially('proj');
    await box(page).press('Enter');
    await expect(box(page)).toHaveValue('see @projects/');
    await expect(opts.filter({ hasText: 'README.md' })).toHaveCount(1, { timeout: 20000 });
    await box(page).pressSequentially('READ');
    await box(page).press('Enter');
    await expect(box(page)).toHaveValue('see @projects/README.md ');
    await expect(list(page)).toHaveCount(0);
    await expect(box(page)).toBeFocused();
  });
}

test('a chat: a path out of the chat folder says only files in this folder, and an email is plain text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, CHAT);
  await box(page).click();
  await box(page).pressSequentially('@../');
  await expect(page.getByText(conv['agent.mentionOutside'], { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(list(page)).toHaveCount(0);
  await box(page).fill('');
  await box(page).pressSequentially('mail ada@example.com');
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByText(conv['agent.mentionOutside'], { exact: true })).toHaveCount(0);
});
