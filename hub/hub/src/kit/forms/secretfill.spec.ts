// Playwright: the secret field of "Add a chat app" asks the browser for nothing. A browser ignores
// autocomplete="off" on a password input and fills the saved login of the site into it and into the text field before it
// (the username went into Name, the password into Bot token in Firefox). The token input says new-password and carries the
// password-manager opt-outs, the Name field before it is a plain text input, and both are empty after load. A saved login
// cannot be put in a fresh test profile, so this checks what the browser is told, in Chromium and in Firefox; a real fill
// is checked by hand.
import { expect, firefox, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../../pages/bots/strings.en.json';

const NEW_APP = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=apps&app=new';

async function checkTokenField(page: Page) {
  await gotoHub(page, NEW_APP, { state: 'channelGroupAsks' });
  await page.getByRole('button', { name: strings['ui.next'], exact: true }).click();
  const token = page.getByLabel(strings['chan.token'], { exact: true });
  await expect(token).toBeVisible();
  await expect(token).toHaveAttribute('type', 'password');
  await expect(token).toHaveAttribute('autocomplete', 'new-password');
  await expect(token).toHaveAttribute('data-1p-ignore', 'true');
  await expect(token).toHaveAttribute('data-lpignore', 'true');
  await expect(token).toHaveAttribute('data-bwignore', 'true');
  await expect(token).toHaveAttribute('data-form-type', 'other');
  const name = page.getByRole('textbox', { name: strings['chan.label'], exact: true });
  await expect(name).toHaveAttribute('type', 'text');
  await expect(name).toHaveValue('');
  await expect(token).toHaveValue('');
  // The name field says what it is for, in this Hub.
  await expect(name).toHaveAccessibleDescription(strings['chan.name.help']);
}

test('@secretfill chromium: Add a chat app, the Bot token is new-password with the opt-outs and both fields start empty', async ({ page }) => {
  await checkTokenField(page);
});

// Firefox is where the saved login landed. The config runs Chromium only, so this one launches Firefox itself.
test('@secretfill firefox: Add a chat app, the Bot token is new-password with the opt-outs and both fields start empty', async () => {
  test.setTimeout(120_000);
  const browser = await firefox.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await checkTokenField(page);
  } finally {
    await browser.close();
  }
});
