// Playwright: the AI tab's Agents and Settings screens: Connections (GitHub accounts,
// from its notes) and Rules & safety (Pause all and Stop everything). Fixtures: the ai page's states.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { links } from './links';
import strings from './strings.en.json';
import agentStrings from './agents/strings.en.json';
import ghStrings from './settings/connections/strings.en.json';

// The kit's own words (kit/agent/Pause.strings.en.json, StopAll.strings.en.json): pages never import kit internals.
const pauseStrings = { 'pause.pause': 'Pause agents', 'pause.resume': 'Resume', 'pause.strip': 'Paused · turns wait at their next step' };
const stopStrings = { 'stop.open': 'Stop everything in this realm…', 'stop.confirm': 'Stop everything' };

// The Agents list is a DataTable: a table named for the list; a group is a toggle row, an agent a row.
const index = (page: Page) => page.getByRole('table', { name: agentStrings['list.label'] });
/** The page's own Pause all row, in its Emergency controls section: the AI pane foot shows a second
 *  Pause control for the same store. */
const pauseSection = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: strings['rules.emergency.title'] }) });

test('Agents: the index is grouped; choosing an agent marks it, puts it in the URL; reload and Back keep the route', async ({ page }) => {
  test.slow(); // two page loads (open, reload) and a Back in one test
  await gotoHub(page, links.agents);
  await expect(index(page).getByRole('button', { name: new RegExp(`^${agentStrings['group.core']}\\s\\d+$`) })).toBeVisible();
  await expect(index(page).getByRole('button', { name: new RegExp(`^${agentStrings['group.yours']}\\s\\d+$`) })).toBeVisible();
  const reviewer = index(page).getByRole('row', { name: /reviewer/ });
  // The row's middle: every cell's words are row text, so a plain row click opens the agent.
  await reviewer.click();
  await expect(reviewer).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/ai\/agents\/reviewer$/);
  await expect(page.getByRole('article', { name: /reviewer/ })).toBeVisible();
  await page.reload();
  // A reload loads the whole Hub again and the lazy Agents screen with it: on a busy machine that is past 7 s.
  await expect(page.getByRole('article', { name: /reviewer/ })).toBeVisible({ timeout: 20_000 });
  await page.goBack();
  await expect(page).toHaveURL(/#\/ai\/agents$/);
  await expect(page.getByRole('article', { name: /reviewer/ })).toBeHidden();
});

// A cell's words open the agent; its info icon beside them opens only its tip. The
// value and its icon stay on one line at a desktop's width, at a phone's (fine and coarse pointer: a coarse one makes
// the icon a 44 px box) and right to left.
const tipCases = [
  { at: '1440', width: 1440, touch: false, rtl: false },
  { at: '390', width: 390, touch: false, rtl: false },
  { at: '390 touch', width: 390, touch: true, rtl: false },
  { at: '390 touch rtl', width: 390, touch: true, rtl: true },
];
for (const c of tipCases) {
  test.describe(`Agents tip at ${c.at}`, () => {
    test.use({ viewport: { width: c.width, height: 900 }, hasTouch: c.touch, isMobile: c.touch });
    test(`Agents: a cell's words open the agent and its icon opens only the tip, at ${c.at}`, async ({ page }) => {
      await gotoHub(page, links.agents);
      if (c.rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
      const reviewer = index(page).getByRole('row', { name: /reviewer/ });
      const words = reviewer.getByText(agentStrings['tools.cell.every'], { exact: true });
      // The first visit loads the lazy Agents screen: on a busy machine that is past 7 s (as the reload above).
      await expect(words).toBeVisible({ timeout: 20_000 });
      const icon = reviewer.getByRole('button', { name: `About ${agentStrings['col.tools']}: ${agentStrings['tools.cell.every']}` });
      // One line: the words are one line box; the icon sits beside them (vertical centres within a few px), after them in
      // the reading direction.
      const line = await words.evaluate((cell) => {
        const text = [...cell.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        if (!text) return null;
        const r = document.createRange();
        r.selectNodeContents(text);
        const rects = [...r.getClientRects()];
        const b = cell.querySelector('button')!.getBoundingClientRect();
        const t = r.getBoundingClientRect();
        const rtl = getComputedStyle(cell).direction === 'rtl';
        return { lines: rects.length, dy: Math.abs(t.top + t.height / 2 - (b.top + b.height / 2)), after: rtl ? b.right <= t.left + 1 : b.left >= t.right - 1, rtl, w: b.width, x: t.left + t.width / 2, y: t.top + t.height / 2, l: t.left, r: t.right, top: t.top, rail: !!cell.closest('[data-rail]') };
      });
      expect(line, 'the words are the cell\'s own text').not.toBeNull();
      expect(line!.rtl, 'the page direction applied').toBe(c.rtl);
      expect(line!.lines, 'the words on one line').toBe(1);
      expect(line!.dy, 'the icon beside the words').toBeLessThan(4);
      expect(line!.after, 'the icon after the words').toBe(true);
      if (c.touch) expect(line!.w, 'a coarse pointer gets the 44 px icon box').toBeGreaterThanOrEqual(44);
      // In a table the status words stay level with the agent's name (the taller icon box never pushes them down the
      // row). In a rail (the narrow list: rows read as two lines) they are the row's second line: just under
      // the name, starting where it starts.
      const name = (await reviewer.locator('bdi', { hasText: 'reviewer' }).boundingBox())!;
      const nameMid = name.y + name.height / 2;
      expect(line!.rail, 'a rail at a phone width only').toBe(c.width < 600);
      if (!line!.rail) expect(Math.abs(nameMid - line!.y), 'the words level with the name').toBeLessThan(4);
      else {
        // Below the name, and with no room for a line between them: the gap from the name's bottom to the words' top is less
        // than one name line (8 px on a fine pointer, 16 px on a coarse one, where the line holds the 44 px icon box).
        const gap = line!.top - (name.y + name.height);
        expect(gap, 'the words on the line under the name').toBeGreaterThanOrEqual(-1);
        expect(gap, 'the words on the very next line, no line between').toBeLessThan(name.height);
        const startGap = c.rtl ? Math.abs(name.x + name.width - line!.r) : Math.abs(name.x - line!.l);
        expect(startGap, 'the words start where the name starts').toBeLessThan(4);
      }
      // Every icon is whole: the points a press lands on (its centre and both edges) are the icon itself, never a spot
      // an ellipsis or the cell's edge cut away (the longest words: "Default tools", "Product-owned").
      const clipped = await index(page).evaluate((table) =>
        [...table.querySelectorAll<HTMLElement>('button[aria-label^="About "]')]
          .filter((b) => {
            const r = b.getBoundingClientRect();
            const hit = (x: number) => b.contains(document.elementFromPoint(x, r.top + r.height / 2));
            return r.width === 0 || !hit(r.left + 2) || !hit(r.left + r.width / 2) || !hit(r.right - 2);
          })
          .map((b) => b.getAttribute('aria-label')),
      );
      expect(clipped, 'no tip icon cut off by its cell').toEqual([]);
      // Every icon's taps stay in its own row: its box lies inside the row, and the point just above it is still that
      // row, never the row or group header above (a 44 px box hanging over a 20 px line would fail here). Below, a
      // line-2 icon may end on the row's edge: the row keeps (44 - 20) / 2 px of padding for it (.listCell).
      const spills = await index(page).evaluate((table) =>
        [...table.querySelectorAll<HTMLElement>('button[aria-label^="About "]')]
          .filter((b) => {
            const row = b.closest<HTMLElement>('[role="row"], li, tr')!;
            const r = b.getBoundingClientRect();
            const o = row.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const near = (y: number) => row.contains(document.elementFromPoint(x, y));
            return r.top < o.top - 1 || r.bottom > o.bottom + 1 || !near(r.top - 2);
          })
          .map((b) => b.getAttribute('aria-label')),
      );
      expect(spills, 'no tip icon reaches past its row').toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`agents-tip-${c.at.replace(/ /g, '-')}.png`) });
      if (c.touch) await icon.tap();
      else await icon.click();
      await expect(page.getByRole('dialog').getByText(agentStrings['tools.tip.every'])).toBeVisible();
      await expect(reviewer).not.toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('article', { name: /reviewer/ })).toBeHidden();
      // On the words themselves (their text box), not the middle of the cell, which may lie on the icon beside them.
      if (c.touch) await page.touchscreen.tap(line!.x, line!.y);
      else await page.mouse.click(line!.x, line!.y);
      // The agent opens (at 390 its detail takes the place of the list).
      await expect(page).toHaveURL(/#\/ai\/agents\/reviewer$/);
      await expect(page.getByRole('article', { name: /reviewer/ })).toBeVisible();
    });
  });
}

test('Agents: an agent the list no longer has says so', async ({ page }) => {
  await gotoHub(page, links.agent('gone-agent'));
  await expect(page.getByText(agentStrings['state.gone'].replace('{{name}}', 'gone-agent'))).toBeVisible();
});

/** An account's row of the GitHub accounts table: the row holding its login. */
const ghRow = (page: Page, login: string) =>
  page.getByRole('table', { name: ghStrings.title }).getByRole('row').filter({ has: page.getByText(login, { exact: true }) });

test('Connections: the accounts list; Use this account moves In use; Log out… names what stays and the row goes', async ({ page }) => {
  await gotoHub(page, links.connections);
  await expect(page.getByRole('heading', { level: 1, name: strings['connections.title'] })).toBeVisible();
  await expect(ghRow(page, 'ada')).toContainText(ghStrings.active);
  await expect(ghRow(page, 'ada')).toContainText(ghStrings['health.ok']);
  await ghRow(page, 'ada-work').getByRole('button', { name: ghStrings['action.use'] }).click();
  await expect(ghRow(page, 'ada-work')).toContainText(ghStrings.active);
  await expect(ghRow(page, 'ada')).not.toContainText(ghStrings.active);
  await expect(page).toHaveURL(/#\/ai\/connections$/);
  // Log out… sits under the row's ⋯ (the kit's "Row actions"); Use this account is the one inline action.
  await ghRow(page, 'ada').getByRole('button', { name: 'Row actions', exact: true }).click();
  await page.getByRole('menuitem', { name: ghStrings['action.logout'] }).click();
  // The confirm is an alertdialog (the Row actions menu's popover may still be closing beside it).
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('revoke the token on GitHub');
  await dialog.getByRole('button', { name: ghStrings['logout.confirm'], exact: true }).click();
  await expect(ghRow(page, 'ada')).toHaveCount(0);
  await expect(ghRow(page, 'ada-work')).toBeVisible();
});

test('Connections: Add a GitHub account shows the code and the GitHub link, then "Linked as ada-lab"', async ({ page }) => {
  // Each poll answers 2.5 s late (fixture state githubSlowLink), so the code and the link are on screen, not a flash.
  await gotoHub(page, links.connections, { state: 'githubSlowLink' });
  await page.getByRole('button', { name: ghStrings['add.start'] }).click();
  // The add flow is a dialog: nothing is asked of GitHub until Get a code.
  const add = page.getByRole('dialog', { name: ghStrings['add.title'] });
  await add.getByRole('button', { name: ghStrings['add.go'], exact: true }).click();
  await expect(add.getByText('WDJB-MJHT')).toBeVisible();
  const link = page.locator('a[href="https://github.com/login/device"]');
  await expect(link).toBeVisible();
  await expect(link).toContainText(ghStrings['add.open']);
  await expect(page.getByText('Linked as ada-lab')).toBeVisible();
  await expect(ghRow(page, 'ada-lab')).toBeVisible();
});

for (const [state, press, kept] of [
  ['pauseRefused', 'pause.pause', 'pause.pause'],
  ['resumeRefused', 'pause.resume', 'pause.resume'],
] as const) {
  test(`Rules & safety: a refused ${press === 'pause.pause' ? 'Pause' : 'Resume'} says so and keeps the action`, async ({ page }) => {
    await gotoHub(page, links.rules, { state });
    await pauseSection(page).getByRole('button', { name: pauseStrings[press] }).click();
    const alert = pauseSection(page).getByRole('alert');
    await expect(alert).toContainText(strings['rules.pause.refused'].replace('{{code}}', 'pause_busy'));
    // The refusal's facts sit behind Details, with Copy details for support (conformance.errors E1).
    await alert.getByRole('button', { name: /details/i }).click();
    await expect(page.getByText('pause_busy').last()).toBeVisible();
    await expect(pauseSection(page).getByRole('button', { name: pauseStrings[kept] })).toBeEnabled();
    if (state === 'resumeRefused') await expect(pauseSection(page).getByText(pauseStrings['pause.strip'])).toBeVisible();
  });
}

test('Rules & safety: Pause agents pauses this computer and Resume ends it', async ({ page }) => {
  await gotoHub(page, links.rules);
  await expect(page.getByRole('heading', { level: 1, name: strings['rules.title'] })).toBeVisible();
  const own = pauseSection(page);
  // What pausing does is in view beside the button (the kit's one description), not only for screen readers.
  await expect(own.getByText(/Nothing is cancelled\./)).toBeVisible();
  await own.getByRole('button', { name: pauseStrings['pause.pause'] }).click();
  await expect(own.getByText(pauseStrings['pause.strip'])).toBeVisible();
  // One store: the pane foot's control says Paused too.
  await expect(page.getByText(pauseStrings['pause.strip'])).toHaveCount(2);
  await own.getByRole('button', { name: pauseStrings['pause.resume'] }).click();
  await expect(own.getByRole('button', { name: pauseStrings['pause.pause'] })).toBeVisible();
  await expect(page.getByText(pauseStrings['pause.strip'])).toHaveCount(0);
});

test('Rules & safety: Stop everything asks first, then says what it stopped', async ({ page }) => {
  await gotoHub(page, links.rules);
  await page.getByRole('button', { name: stopStrings['stop.open'] }).click();
  // The confirm is an alertdialog (the Row actions menu's popover may still be closing beside it).
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(/Stop everything in realm .+\?/);
  await dialog.getByRole('button', { name: stopStrings['stop.confirm'], exact: true }).click();
  await expect(page.getByText(/2 stopped/)).toBeVisible();
});
