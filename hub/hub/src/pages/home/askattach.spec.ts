// Playwright: images and text files go with a message to the Agent. The add menu's "Upload files…", paste and drop all
// add files; each shows as a chip with a remove button; anything over a limit gets its line and is never sent. A
// screenshot over 4 MB is made smaller in the browser and says so. While the agent works, a message with an image is queued
// by Send (a follow-up carries text only) and goes when the reply ends. One send carries the text, the files and the images.
import { expect, test, type Page } from '@playwright/test';
import { hubUrl } from '@app/e2e';

// The Agent's words, as they show (a page spec imports no src/ask file).
const COMPOSER = 'Message to your agent';
// The + opens a menu (Upload files…, Screenshot of a display); the file picker is its first item.
const ADD = 'Add files', UPLOAD = /^Upload files/;
const LIST = 'Files with this message', SENT = 'Sent with this message';
const HINT = "Images can't join a reply that is already running. Send queues this message for when the reply ends.";
const QUEUED = 'Queued. Sends when this reply ends, while this stays open. You can still change it.';
const REPLY = /Got the screenshot and build\.log/;

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const LOG = Buffer.from('error: missing semicolon\n  at line 12\n');

test.setTimeout(120_000);

const composer = (page: Page) => page.getByRole('textbox', { name: COMPOSER });
const chips = (page: Page) => page.getByRole('list', { name: LIST });
const send = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });

async function open(page: Page, fx: string) {
  await page.goto(hubUrl('/home').replace('/?', `/?ask=1&askfx=${fx}&`));
  await page.locator('#hub-main').waitFor();
  await page.keyboard.press('Control+j');
  await expect(composer(page)).toBeVisible({ timeout: 30_000 });
}
async function pick(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: ADD, exact: true }).click();
  await page.getByRole('menuitem', { name: UPLOAD }).click();
  await (await chooser).setFiles(files);
}
/** A paste or drop of one file, as the browser delivers it (a DataTransfer holding a File). */
async function deliver(page: Page, how: 'paste' | 'drop', name: string, b64: string, type: string) {
  await composer(page).evaluate((el, a) => {
    const bin = atob(a.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], a.name, { type: a.type }));
    if (a.how === 'paste') {
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } else {
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }, { how, name, b64, type });
}

test('the add button adds a screenshot and a log; one send carries both and the message shows them', async ({ page }) => {
  await open(page, 'attach');
  await pick(page, [
    { name: 'shot.png', mimeType: 'image/png', buffer: PNG },
    { name: 'build.log', mimeType: 'text/plain', buffer: LOG },
  ]);
  await expect(chips(page).getByText('shot.png')).toBeVisible();
  await expect(chips(page).getByText('build.log')).toBeVisible();
  await expect(chips(page).getByText('2 lines · goes in as text')).toBeVisible();
  await composer(page).fill('Why does the build fail?');
  await composer(page).press('Enter');
  const sent = page.getByRole('list', { name: SENT });
  await expect(sent.getByText('shot.png')).toBeVisible({ timeout: 20_000 });
  await expect(sent.getByText('build.log')).toBeVisible();
  await expect(chips(page)).toHaveCount(0);
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText(REPLY)).toBeVisible({ timeout: 30_000 });
  // The fenced log goes in the message's text; the bubble shows the chip, never the bytes or a data: URL.
  await expect(sent.locator('img[src^="data:"]')).toHaveCount(0);
  await expect(sent.locator('img[src^="blob:"]')).toHaveCount(1);
});

test('a pasted screenshot and a dropped log are added; Remove takes one out', async ({ page }) => {
  await open(page, 'attach');
  await deliver(page, 'paste', 'pasted.png', PNG.toString('base64'), 'image/png');
  await expect(chips(page).getByText('pasted.png')).toBeVisible();
  await deliver(page, 'drop', 'dropped.log', LOG.toString('base64'), 'text/plain');
  await expect(chips(page).getByText('dropped.log')).toBeVisible();
  await page.getByRole('button', { name: 'Remove pasted.png' }).click();
  await expect(chips(page).getByText('pasted.png')).toHaveCount(0);
  await expect(chips(page).getByText('dropped.log')).toBeVisible();
  // Pasting a file never puts its name or bytes into the typed text.
  await expect(composer(page)).toHaveValue('');
});

test('over a limit: a big log and a binary file each get their line, are never added, and the line can be dismissed', async ({ page }) => {
  await open(page, 'attach');
  await pick(page, [
    { name: 'huge.log', mimeType: 'text/plain', buffer: Buffer.alloc(30 * 1024, 'a') },
    { name: 'tool.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 1, 2, 0xff, 0xfe, 0, 3]) },
  ]);
  await expect(page.getByText(/^huge\.log is 30 KB\. Text files up to 24 KB go into the message/)).toBeVisible();
  await expect(page.getByText("tool.bin isn't an image or a text file.")).toBeVisible();
  await expect(chips(page)).toHaveCount(0);
  await page.getByRole('status').filter({ hasText: 'huge.log' }).getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText(/^huge\.log is /)).toHaveCount(0);
});

test('a screenshot over 4 MB is made smaller in the browser and says so', async ({ page }) => {
  await open(page, 'attach');
  // Noise does not compress: a 1500×1000 PNG of it is over 4 MB.
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1500; c.height = 1000;
    const g = c.getContext('2d')!;
    const img = g.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3) ? 255 : Math.floor(Math.random() * 256);
    g.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png'));
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const buffer = Buffer.from(b64, 'base64');
  expect(buffer.length).toBeGreaterThan(4 * 1024 * 1024);
  await pick(page, [{ name: 'retina.png', mimeType: 'image/png', buffer }]);
  await expect(chips(page).getByText('retina.png')).toBeVisible({ timeout: 20_000 });
  await expect(chips(page).getByText(/^Made smaller to fit \(\d[\d.,]* MB → \d[\d.,]* (MB|KB)\)$/)).toBeVisible();
});

test('while the agent works, Send queues a message with an image: it stays in the box, marked queued, and nothing goes yet', async ({ page }) => {
  await open(page, 'working');
  await composer(page).fill('Build me a small dashboard');
  await composer(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 30_000 });
  await pick(page, [{ name: 'later.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(chips(page).getByText('later.png')).toBeVisible();
  await composer(page).fill('And use this');
  await expect(page.getByText(HINT)).toBeVisible();
  await expect(send(page)).toBeEnabled();
  await composer(page).press('Enter');
  await expect(page.getByText(QUEUED)).toBeVisible();
  await expect(page.getByRole('button', { name: "Don't send" })).toBeVisible();
  await expect(composer(page)).toHaveValue('And use this');
  await expect(chips(page).getByText('later.png')).toBeVisible();
});

test('a file that only looks like an image is refused by name, before anything is sent', async ({ page }) => {
  await open(page, 'attach');
  await pick(page, [{ name: 'broken.png', mimeType: 'image/png', buffer: PNG.subarray(0, 8) }]);
  await expect(page.getByText("broken.png looks like an image but can't be read as one, so it wasn't added.")).toBeVisible();
  await expect(chips(page)).toHaveCount(0);
});

test('closing the panel lets the attached files go, and says so when it opens again', async ({ page }) => {
  await open(page, 'attach');
  await pick(page, [{ name: 'shot.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(chips(page).getByText('shot.png')).toBeVisible();
  await page.getByRole('button', { name: 'Close Agent' }).click();
  await expect(composer(page)).toHaveCount(0);
  await page.keyboard.press('Control+j');
  await expect(composer(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('The files you had attached were let go when the panel closed. Add them again to send them.')).toBeVisible();
  await expect(chips(page)).toHaveCount(0);
});
