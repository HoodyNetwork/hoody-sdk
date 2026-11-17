// Playwright: at in-between widths the Address column, the one a person reads and copies, gets the
// larger share of the table; Shared as holds short labels.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

for (const w of [700, 900, 1100]) {
  test.describe(`at ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test(`the Address column is wider than Shared as at ${w}px`, async ({ page }) => {
      await gotoHub(page, '/tunnels');
      const what = page.getByRole('columnheader', { name: strings['col.what'] });
      const addr = page.getByRole('columnheader', { name: strings['col.address'] });
      await addr.waitFor();
      const [a, b] = [(await what.boundingBox())!.width, (await addr.boundingBox())!.width];
      expect(b).toBeGreaterThan(a);
    });
  });
}
