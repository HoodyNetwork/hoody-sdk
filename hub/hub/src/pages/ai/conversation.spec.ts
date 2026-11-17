// Playwright: the open chat on /ai/c in the whole Hub (fixtures). At 1024, 1350, 1700 and
// 2500, with the sidebar open and as a rail: the conversation frame fills the AI region with no sideways scroll; the header,
// the Details button and Send are inside the viewport and topmost at their centre; Send says why it cannot send (here
// the source is the active one; the fixture agent does not have this chat, so the reason is "not on this computer"); the pane sits beside the chat with Details closed; opening Details puts it in the pane's place at m and l and
// beside the pane at xl and wider, never over the conversation. On a phone the chat is alone with Back to chats.
// The header's chat menu (⋯) sits in the header beside the title and Details at 1440 and on a phone, overlapping
// neither, and its menu opens inside the viewport.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import head from '@kit/agent/ConvHeader.strings.en.json';
import sv from '@kit/agent/SessionView.strings.en.json';
import conv from '@kit/agent/Conversation.strings.en.json';
import { chatLink } from './links';
import paneStrings from './parts/Pane.strings.en.json';
import menu from './parts/ConvMenu.strings.en.json';
// eslint-disable-next-line no-restricted-imports -- the shell's own button label, read by a whole-Hub test
import shell from '@shell/strings.en.json';

const CHAT = chatLink({ computer: 'atlas.00a1', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 's-geo-1' });
const pane = (page: Page) => page.getByRole('navigation', { name: paneStrings['pane.label'], exact: true });

async function open(page: Page, width: number, rail: boolean): Promise<void> {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await gotoHub(page, CHAT);
  await expect(page.locator('[data-details]')).toBeVisible();
  // The rail: the person collapses the sidebar with its own button (shell/strings.en.json nav.collapse). Where the shell
  // already draws a rail at this width the button is not there, and the page is the same as without.
  const collapse = page.getByRole('button', { name: shell['nav.collapse'], exact: true });
  if (rail && await collapse.isVisible()) await collapse.click();
}

async function topmost(page: Page, l: Locator, what: string): Promise<void> {
  await expect(l, what).toBeVisible();
  const box = (await l.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5, `${what} inside the viewport`).toBe(true);
  const hit = await l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (at && (at === el || el.contains(at))) return 'ok';
    return at ? `${at.tagName.toLowerCase()}.${String((at as HTMLElement).className)} [${(at.closest('[aria-label]') as HTMLElement | null)?.getAttribute('aria-label') ?? ''}]` : 'nothing';
  });
  expect(hit, `${what} is the topmost element at its centre`).toBe('ok');
}

for (const width of [1024, 1350, 1700, 2500]) {
  for (const rail of [false, true]) {
    test(`/ai/c at ${width}${rail ? ' (rail)' : ''}: the chat, its controls and Details obey the frame rule`, async ({ page }) => {
      await open(page, width, rail);
      const frame = page.locator('[data-details]');
      const size = (await frame.getAttribute('data-size')) as string;
      await noSideScroll(page);
      await topmost(page, page.getByRole('button', { name: head['head.details'], exact: true }), 'Details');
      // The reason is Send's description, never its name (kit/agent/Composer.tsx).
      const send = page.getByRole('button', { name: conv['agent.send'], exact: true });
      await topmost(page, send, 'Send');
      await expect(send).toBeDisabled();
      await expect(send).toHaveAccessibleDescription(sv['sv.why.missing']);
      await expect(pane(page)).toBeVisible();
      // The frame fills the AI region's height: the composer sits at its foot, not after a page-long scroll.
      const fb = (await frame.boundingBox())!;
      expect(fb.y + fb.height, 'the frame ends inside the viewport').toBeLessThanOrEqual(page.viewportSize()!.height + 1);

      await page.getByRole('button', { name: head['head.details'], exact: true }).click();
      await expect(frame).toHaveAttribute('data-details', 'column');
      if (size === 'm' || size === 'l') await expect(pane(page)).toBeHidden();
      else await expect(pane(page)).toBeVisible();
      await noSideScroll(page);
      await topmost(page, page.locator('[data-details-toggle]'), 'Close details (the header toggle)');
      await expect(page.locator('[data-details-toggle]')).toHaveAccessibleName(head['head.detailsClose']);
      await topmost(page, send, 'Send with Details open');
    });
  }
}

test('/ai/c on a phone: the chat alone, Back to chats leads to the list', async ({ page }) => {
  await open(page, 390, false);
  await expect(pane(page)).toBeHidden();
  await noSideScroll(page);
  const back = page.getByRole('button', { name: head['head.back'], exact: true });
  await topmost(page, back, 'Back to chats');
  const send = page.getByRole('button', { name: conv['agent.send'], exact: true });
  await topmost(page, send, 'Send');
  await expect(send).toHaveAccessibleDescription(sv['sv.why.missing']);
  await back.click();
  await expect(page).toHaveURL(/#\/ai$/);
  await expect(pane(page)).toBeVisible();
});

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const width of [1440, 390]) {
  test(`/ai/c at ${width}: the chat menu sits in the header, overlaps neither the title nor Details, and opens inside the viewport`, async ({ page }) => {
    await open(page, width, false);
    const button = page.getByRole('button', { name: menu['menu.label'], exact: true });
    await topmost(page, button, 'the chat menu button');
    const header = page.locator('[data-details] header').first(); // the conversation's own header comes first; Details may draw its own
    const hb = (await header.boundingBox())!, bb = (await button.boundingBox())!;
    expect(bb.y >= hb.y - 0.5 && bb.y + bb.height <= hb.y + hb.height + 0.5, 'the menu button is inside the header').toBe(true);
    const title = header.getByRole('heading', { level: 2 });
    expect(overlaps(bb, (await title.boundingBox())!), 'the menu button does not cover the title').toBe(false);
    // Details is in the header at every width; Back only on a phone.
    const others = width < 600 ? [head['head.back'], head['head.details']] : [head['head.details']];
    for (const name of others) {
      expect(overlaps(bb, (await header.getByRole('button', { name, exact: true }).boundingBox())!), `the menu button does not cover ${name}`).toBe(false);
    }
    await noSideScroll(page);
    await button.click();
    for (const name of [menu['menu.rename'], menu['menu.export']]) {
      await topmost(page, page.getByRole('menuitem', { name: new RegExp(name) }), `${name} in the open menu`);
    }
    await noSideScroll(page);
  });
}
