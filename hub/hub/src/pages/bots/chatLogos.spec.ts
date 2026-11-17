// Playwright: wherever the Bots page names Telegram, Slack or Discord in text (the
// empty page's intro (its line naming the doors), the Chat apps tab's description, the table's Chat apps column, the webhook notice and its dialog, the
// People add dialog, the add flow's setup steps), each app's official mark sits right before its name, on the same line, in
// light and dark, at 1440 and 390.
import { expect, test, type Locator } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const CHIEF = '?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

const NAME: Record<string, string> = { telegram: 'Telegram', slack: 'Slack', discord: 'Discord' };

type Box = { x: number; y: number; width: number; height: number };

/** An app's mark and its whole name box, read in one frame: a drawer still sliding in (or a dialog scaling in) moves
 *  both alike, so two separate reads would differ by the motion between them, not by the layout. */
async function markAndApp(app: Locator): Promise<{ m: Box | null; a: Box }> {
  return app.evaluate((el) => {
    const box = (r: DOMRect): Box => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    const svg = el.querySelector('svg');
    return { m: svg ? box(svg.getBoundingClientRect()) : null, a: box(el.getBoundingClientRect()) };
  });
}

async function marksBeforeNames(where: Locator, names: readonly string[] = ['Telegram', 'Slack', 'Discord']): Promise<void> {
  const apps = where.locator('[data-chat-app]');
  await expect(apps).toHaveCount(names.length);
  for (const [i, name] of names.entries()) {
    const app = apps.nth(i);
    await expect(app).toHaveText(name);
    const mark = app.locator('svg');
    await expect(mark).toBeVisible();
    const { m, a } = await markAndApp(app);
    expect(m && a && m.width > 0 && m.height > 0).toBe(true);
    expect(Math.abs((m?.x ?? 0) - (a?.x ?? -99))).toBeLessThan(1);
    expect(Math.abs((m?.y ?? 0) + (m?.height ?? 0) / 2 - ((a?.y ?? 0) + (a?.height ?? 0) / 2))).toBeLessThan(4);
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`empty Bots intro: chat app marks before their names (${theme}, ${width})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/bots', { state: 'empty', theme });
      // The intro says what a Bot is in one line; the line under it names the doors, the chat apps with their marks.
      await expect(page.getByText(/A Bot is an assistant/)).toBeVisible();
      const reach = page.getByText(/^Talk to it here/);
      await expect(reach).toBeVisible();
      await marksBeforeNames(reach);
      await expect(reach).toContainText('Talk to it here, in Telegram, Slack or Discord, or from any app');
      await noSideScroll(page);
      await reach.screenshot({ path: info.outputPath(`bots-empty-${theme}-${width}.png`) });
    });

    test(`Chat apps tab Kind column: each app's mark before its name (${theme}, ${width})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, `/bots${CHIEF}&tab=apps`, { theme });
      // The section's description names no app; the Apps table's Kind column does, one per row.
      const apps = page.locator('#bot-apps');
      await expect(apps.getByText('Let people talk to this Bot from the chat apps they already use.')).toBeVisible();
      for (const [label, name] of [['Support chat', 'Telegram'], ['Team workspace', 'Slack'], ['Community server', 'Discord']] as const) {
        // The Kind text: a table cell when wide, a list line when narrow. A pane too narrow for the Kind column sheds it (then no
        // name shows in the row at all); wherever the name shows, its mark comes right before it.
        const kind = apps.getByRole('row', { name: new RegExp(label) }).getByText(name, { exact: true });
        if (width > 600 && (await kind.count()) === 0) continue;
        await expect(kind).toHaveText(name);
        const mark = kind.locator('svg');
        await expect(mark).toBeVisible();
        // The mark sits on the name's line, right before it (in RTL, right of it).
        const [m, c] = await Promise.all([mark.boundingBox(), kind.evaluate((td) => { const r = document.createRange(); const n = [...td.querySelectorAll('*'), td].flatMap((e) => [...e.childNodes]).find((x) => x.nodeType === 3 && (x.textContent ?? '').trim() !== ''); if (!n) return null; r.selectNodeContents(n); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })]);
        expect(m && c && m.width > 0 && Math.abs(m.y + m.height / 2 - (c.y + c.h / 2)) < 4 && (m.x + m.width <= c.x + 1 || c.x + c.w <= m.x + 1)).toBe(true);
      }
      await noSideScroll(page);
      await apps.screenshot({ path: info.outputPath(`bots-apps-kind-${theme}-${width}.png`) });
    });

    test(`add flow setup steps: the agent's steps name their app with its mark (${theme}, ${width})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, `/bots${CHIEF}&tab=apps&app=new`, { theme });
      await page.getByRole('dialog').getByRole('button', { name: strings['ui.next'], exact: true }).click();
      // The agent's steps: the StepList group in the chat app (the add flow's Track around it holds the app's own mark too).
      const steps = page.getByRole('group', { name: strings['chan.setup.title'].replace('{{app}}', 'Telegram') }).getByRole('list', { name: strings['flow.group.where.app'] });
      // A StepList row, its number then the agent's words.
      const first = steps.getByRole('listitem').filter({ hasText: /^01Open Telegram/ });
      await expect(first).toHaveText('01Open Telegram and start a chat with @BotFather.');
      await marksBeforeNames(first, ['Telegram']);
      // Steps naming no app stay plain.
      await expect(steps.locator('[data-chat-app]')).toHaveCount(1);
      await noSideScroll(page);
      await steps.screenshot({ path: info.outputPath(`bots-setup-steps-${theme}-${width}.png`) });
    });

    test(`webhook step and dialog: the Telegram mark before its name (${theme}, ${width})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, `/bots${CHIEF}&tab=apps&app=ch-tg`, { state: 'channelWebhook', theme });
      const why = page.getByText(/sends this bot's messages to a webhook/);
      await expect(why).toBeVisible();
      await marksBeforeNames(why, ['Telegram']);
      await expect(why).toHaveText(strings['setup.why.webhook'].replace('{{telegram}}', 'Telegram'));
      await why.screenshot({ path: info.outputPath(`bots-webhook-step-${theme}-${width}.png`) });
      await page.getByRole('button', { name: strings['chan.webhook.go'] }).click();
      const dlg = page.getByRole('alertdialog', { name: strings['chan.webhook.confirmTitle'] });
      const body = dlg.getByText(/stops sending this bot/);
      await marksBeforeNames(body, ['Telegram']);
      await noSideScroll(page);
      await dlg.screenshot({ path: info.outputPath(`bots-webhook-dialog-${theme}-${width}.png`) });
    });

    test(`People add dialog: the app mark in its sentence and the user ID label (${theme}, ${width})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, `/bots${CHIEF}&tab=apps&app=ch-tg`, { theme });
      await page.getByRole('button', { name: strings['chan.rail.people'] }).click();
      await page.getByRole('button', { name: strings['chan.person.add'] }).click();
      const dlg = page.getByRole('dialog', { name: /Add a person to/ });
      await marksBeforeNames(dlg.getByText(/Add someone by their ID in/), ['Telegram']);
      await marksBeforeNames(dlg.getByText('User ID in Telegram', { exact: true }), ['Telegram']);
      await expect(dlg.getByRole('textbox', { name: 'User ID in Telegram' })).toBeVisible();
      await noSideScroll(page);
      await dlg.screenshot({ path: info.outputPath(`bots-people-add-${theme}-${width}.png`) });
    });
  }

  test(`Bots table: each app in the Chat apps column has its mark before its name (${theme}, 1440)`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/bots', { theme });
    await page.getByRole('radio', { name: /^List$/i }).click(); // the Chat apps column is List's (the page opens on cards)
    const tags = page.locator('#hub-main table [data-chat-app]');
    await expect(tags.first()).toBeVisible();
    const n = await tags.count();
    for (let i = 0; i < n; i++) {
      const tag = tags.nth(i);
      const k = (await tag.getAttribute('data-chat-app')) ?? '';
      await expect(tag).toHaveText(NAME[k] ?? '?');
      const { m, a } = await markAndApp(tag);
      expect(m && a && m.width > 0).toBe(true);
      expect(Math.abs((m?.x ?? 0) - (a?.x ?? -99))).toBeLessThan(1);
      expect(Math.abs((m?.y ?? 0) + (m?.height ?? 0) / 2 - ((a?.y ?? 0) + (a?.height ?? 0) / 2))).toBeLessThan(4);
      // Each app shows whole: its name is not cut by the cell (three apps fit).
      const clipped = await tag.evaluate((el) => {
        const cell = el.closest('td, [role="cell"], [role="gridcell"]') as HTMLElement | null;
        return cell ? el.getBoundingClientRect().right > cell.getBoundingClientRect().right + 0.5 : false;
      });
      expect(clipped).toBe(false);
    }
    // Every app name in the table is a marked one (a plain name would be a text node outside any mark), and the Bot with
    // all three apps lists them in order, three marks for three names.
    const plain = await page.locator('#hub-main table').evaluate((t) => {
      const out: string[] = [];
      const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\b(Telegram|Slack|Discord)\b/.test(n.textContent ?? '') && !n.parentElement?.closest('[data-chat-app]')) out.push(n.textContent ?? '');
      return out;
    });
    expect(plain).toEqual([]);
    // The apps are words of one line, a space between each.
    const all = page.locator('#hub-main table td').filter({ has: page.locator('[data-chat-app="discord"]') }).first();
    await expect(all).toHaveText('Telegram Slack Discord');
    await expect(all.locator('[data-chat-app]')).toHaveCount(3);
    await expect(all.locator('[data-chat-app] svg')).toHaveCount(3);
    // The marks cost no column: Link still shows at 1440.
    await expect(page.getByRole('columnheader', { name: strings['col.link'] })).toBeVisible();
    await page.locator('#hub-main table').screenshot({ path: info.outputPath(`bots-table-${theme}-1440.png`) });
  });
}
