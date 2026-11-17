// Playwright: the Bots idea names Telegram, Slack and Discord, each with its
// official mark right before the name, on the same line, in both places the ideas show (the Welcome and the setup card),
// in light and dark, at 1440 and 390.
import { expect } from '@playwright/test';
import { hubUrl, test, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

const BODY = strings['intro.bots.body'].replace('{{telegram}}', 'Telegram').replace('{{slack}}', 'Slack').replace('{{discord}}', 'Discord');
const PLACES = [
  { name: 'Welcome', path: '/home?intro=1', state: undefined, realm: undefined, heading: '#home-fits' },
  // The setup card shows for the all-realms account with no computer (fixture 'invite': setup read answers an invite).
  { name: 'setup card', path: '/home', state: 'invite', realm: 'all', heading: '#home-fits-setup' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    for (const place of PLACES) {
      test(`Bots idea in the ${place.name}: each chat app has its mark before its name (${theme}, ${width})`, async ({ hubPage: page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        const url = hubUrl(place.path, { theme, ...(place.state ? { state: place.state } : {}) });
        await page.goto(place.realm ? url.replace('/?', `/?fxrealm=${place.realm}&`) : url);
        await page.locator('#hub-main').waitFor();
        const list = page.locator(`#hub-main ol[aria-labelledby="${place.heading.slice(1)}"]`);
        const idea = list.locator('[data-idea="bots"]');
        await expect(idea).toBeVisible();
        const apps = idea.locator('[data-chat-app]');
        await expect(apps).toHaveCount(3);
        for (const [i, name] of ['Telegram', 'Slack', 'Discord'].entries()) {
          const app = apps.nth(i);
          await expect(app).toHaveText(name);
          const mark = app.locator('svg');
          await expect(mark).toBeVisible();
          const m = await mark.boundingBox();
          const a = await app.boundingBox();
          expect(m && a && m.width > 0 && m.height > 0).toBe(true);
          // The mark starts the name and sits on its line.
          expect(Math.abs((m?.x ?? 0) - (a?.x ?? -99))).toBeLessThan(1);
          expect(Math.abs((m?.y ?? 0) + (m?.height ?? 0) / 2 - ((a?.y ?? 0) + (a?.height ?? 0) / 2))).toBeLessThan(4);
        }
        // The body reads as the whole sentence, each name once.
        await expect(idea.locator('[class*="ideaBody"]')).toHaveText(BODY);
        await noSideScroll(page);
        await idea.screenshot({ path: info.outputPath(`home-bots-idea-${place.state ?? 'welcome'}-${theme}-${width}.png`) });
      });
    }
  }
}
