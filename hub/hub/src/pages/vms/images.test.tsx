// Vitest: the Images view over its fixture states. Each change is sent once; a lost answer is held and only a read
// frees it; refusals read in the view's words; a download being checked cannot be cancelled; a shared server is asked
// nothing.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldChanges } from '@core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports fixtures.images and calls its states(), so it must start the cycle.
import './fixtures';
import { imageLog, imageReadLog, resetImageFixtures } from './fixtures.images';
import { IMAGES_LOCK } from './images';
import page from './page';
import strings from './strings.en.json';

// A test here opens a drawer or a dialog, sends, and reads again: several waits, each bounded by WAIT.
vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const A = 'a'.repeat(64);
const J = (c: string) => c.repeat(32);
const path = '/vms?view=images';
const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const images = () => screen.findByRole('table', { name: say('images.label', { name: 'atlas' }) }, WAIT).catch(() => screen.findByRole('grid', { name: say('images.label', { name: 'atlas' }) }, WAIT));
const downloads = () => screen.findByRole('table', { name: say('images.dl.label', { name: 'atlas' }) }, WAIT).catch(() => screen.findByRole('grid', { name: say('images.dl.label', { name: 'atlas' }) }, WAIT));
const dialog = (name: string) => screen.findByRole('alertdialog', { name }, WAIT).catch(() => screen.findByRole('dialog', { name }, WAIT));
const sent = (change: string) => imageLog.filter((x) => x.change === change);

// Pasted, not typed key by key: a link is long.
async function put(field: HTMLElement, text: string) {
  await userEvent.click(field);
  await userEvent.paste(text);
}
async function askDelete(name = 'Debian 13') {
  await images();
  await userEvent.click(await screen.findByRole('button', { name: say('images.row.deleteName', { name }) }, WAIT));
  return dialog(say('images.remove.title', { name }));
}
async function openAdd(url: string, sha = '') {
  await images();
  await userEvent.click(await screen.findByRole('button', { name: strings['images.add.open'] }, WAIT));
  const drawer = await dialog(strings['images.add.title']);
  await put(within(drawer).getByRole('textbox', { name: strings['images.add.url'] }), url);
  if (sha) await put(within(drawer).getByRole('textbox', { name: strings['images.add.sha'] }), sha);
  return drawer;
}
const submitAdd = (drawer: HTMLElement) => userEvent.click(within(drawer).getByRole('button', { name: strings['images.add.go'] }));

// The page's view is loaded once here, so no test's own time goes to loading it.
beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => {
  resetImageFixtures();
});

describe('the lists', () => {
  it('images-many: every image by what it is, and one download in each state', async () => {
    await renderPage(page, { state: 'images-many', path });
    const t = await images();
    for (const text of ['Debian 13', 'CCCOMA_X64FRE_EN-US_DV9', 'Ubuntu 24.04', strings['images.unnamed'], strings['images.state.otherArch'], strings['images.state.uploading']]) expect(within(t).getAllByText(text).length).toBeGreaterThan(0);
    const d = await downloads();
    for (const key of ['running', 'verifying', 'ready', 'failed', 'interrupted'] as const) expect(within(d).getAllByText(strings[`images.dl.state.${key}`]).length).toBeGreaterThan(0);
    expect(within(d).getByText('the site answered 404 for this link')).toBeInTheDocument();
    expect(within(d).getByText(strings['images.dl.words.unchecked'])).toBeInTheDocument();
    // Only the site of a link is shown, never the link.
    expect(within(d).getAllByText('releases.ubuntu.com').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('ubuntu-24.04.1-live-server-amd64.iso');
    expect(imageLog).toEqual([]);
  });

  it('images-empty: both lists say so', async () => {
    await renderPage(page, { state: 'images-empty', path });
    expect(await screen.findByText(strings['images.empty.title'], undefined, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(strings['images.dl.empty'], undefined, WAIT)).toBeInTheDocument();
  });

  it('images-loading: skeletons, no rows', async () => {
    await renderPage(page, { state: 'images-loading', path });
    await screen.findByRole('heading', { name: strings['images.title'] }, WAIT);
    await pause();
    expect(screen.queryByText('Debian 13')).toBeNull();
    expect(document.querySelectorAll('[data-skeleton]')).toHaveLength(2);
  });

  it('images-error: the image list fails by itself; the downloads still show', async () => {
    await renderPage(page, { state: 'images-error', path });
    await downloads();
    expect(screen.queryByText('Debian 13')).toBeNull();
    expect((await screen.findAllByRole('button', { name: /try again|retry/i }, WAIT)).length).toBeGreaterThan(0);
  });

  it('images-shared: the view is not offered and the image store is never asked', async () => {
    await renderPage(page, { state: 'images-shared', path });
    expect(await screen.findByText(say('st.shared', { name: 'atlas' }), undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: strings['view.images'] })).toBeNull();
    await pause();
    expect(screen.queryByRole('heading', { name: strings['images.title'] })).toBeNull();
    expect(imageReadLog).toEqual([]);
    expect(imageLog).toEqual([]);
  });
});

describe('delete an image', () => {
  it('asks first, naming the image; cancel sends nothing; confirm sends once and the image leaves the list', async () => {
    await renderPage(page, { state: 'images-many', path });
    let d = await askDelete();
    expect(within(d).getByText(say('images.remove.body', { computer: 'atlas' }))).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    await pause();
    expect(imageLog).toEqual([]);
    d = await askDelete();
    await userEvent.click(within(d).getByRole('button', { name: strings['images.remove.go'] }));
    await waitFor(() => expect(sent('remove')).toHaveLength(1), WAIT);
    expect(sent('remove')[0]!.path.endsWith(`/${A}`)).toBe(true);
    expect(await screen.findByText(strings['images.remove.done'], undefined, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: say('images.row.deleteName', { name: 'Debian 13' }) })).toBeNull(), WAIT);
    expect(heldChanges(IMAGES_LOCK)).toEqual([]);
  });

  it('images-remove-refused: the view\'s sentence for the code, nothing held, the image still listed', async () => {
    await renderPage(page, { state: 'images-remove-refused', path });
    const d = await askDelete();
    await userEvent.click(within(d).getByRole('button', { name: strings['images.remove.go'] }));
    expect(await screen.findByText(strings['images.err.remove.BadState'], undefined, WAIT)).toBeInTheDocument();
    // The VM program's own message may name another VM: it is not shown.
    expect(document.body.textContent).not.toContain('attached to VM');
    expect(heldChanges(IMAGES_LOCK)).toEqual([]);
    expect(screen.queryByText(strings['images.remove.done'])).toBeNull();
    expect(sent('remove')).toHaveLength(1);
  });

  it('images-remove-lost-kept: a lost answer is held, never sent again, and a list that still holds the image proves nothing', async () => {
    await renderPage(page, { state: 'images-remove-lost-kept', path });
    const d = await askDelete();
    await userEvent.click(within(d).getByRole('button', { name: strings['images.remove.go'] }));
    expect(await screen.findByText(say('images.held.remove', { name: 'Debian 13' }), undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(IMAGES_LOCK).map((h) => (h.identity as { image?: string }).image)).toEqual([A]);
    expect(screen.queryByText(strings['images.remove.done'])).toBeNull();
    // While held, no other delete can be pressed.
    const other = await screen.findByRole('button', { name: say('images.row.deleteName', { name: 'Ubuntu 24.04' }) }, WAIT);
    expect(other).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(500);
    expect(screen.getByText(say('images.held.remove', { name: 'Debian 13' }))).toBeInTheDocument();
    expect(sent('remove')).toHaveLength(1);
  });

  it('images-remove-lost: Check again proves it from a fresh list and frees the lock', async () => {
    await renderPage(page, { state: 'images-remove-lost', path });
    const d = await askDelete();
    await userEvent.click(within(d).getByRole('button', { name: strings['images.remove.go'] }));
    await waitFor(() => expect(heldChanges(IMAGES_LOCK)).toHaveLength(1), WAIT);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, WAIT));
    await waitFor(() => expect(heldChanges(IMAGES_LOCK)).toEqual([]), WAIT);
    expect(sent('remove')).toHaveLength(1);
  });
});

describe('add from a link', () => {
  const URL = 'https://mirror.example.org/x/new.iso?key=secret';
  it('sends the link once, with the SHA-256 only when one was typed, and the download is listed', async () => {
    await renderPage(page, { state: 'images-many', path });
    const drawer = await openAdd(URL, 'AB'.repeat(32));
    await submitAdd(drawer);
    await waitFor(() => expect(sent('add')).toHaveLength(1), WAIT);
    expect(sent('add')[0]!.body).toEqual({ url: URL, sha256: 'ab'.repeat(32) });
    expect(await screen.findByText(strings['images.add.done'], undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(IMAGES_LOCK)).toEqual([]);
  });

  it('an empty form says what Add image waits for, until a link is in', async () => {
    await renderPage(page, { state: 'images-many', path });
    await images();
    await userEvent.click(await screen.findByRole('button', { name: strings['images.add.open'] }, WAIT));
    const drawer = await dialog(strings['images.add.title']);
    expect(within(drawer).getByRole('button', { name: strings['images.add.go'] })).toBeDisabled();
    expect(within(drawer).getByText(strings['images.add.need'])).toBeInTheDocument();
    await put(within(drawer).getByRole('textbox', { name: strings['images.add.url'] }), URL);
    await waitFor(() => expect(within(drawer).queryByText(strings['images.add.need'])).toBeNull(), WAIT);
    expect(sent('add')).toHaveLength(0);
  });

  it('no SHA-256 typed: none is sent', async () => {
    await renderPage(page, { state: 'images-many', path });
    await submitAdd(await openAdd(URL));
    await waitFor(() => expect(sent('add')).toHaveLength(1), WAIT);
    expect(sent('add')[0]!.body).toEqual({ url: URL });
  });

  it('a link that is not a public web link, or a malformed SHA-256, is never sent', async () => {
    await renderPage(page, { state: 'images-many', path });
    const drawer = await openAdd('ftp://mirror.example.org/x.iso');
    expect(await within(drawer).findByText(strings['images.add.url.invalid'])).toBeInTheDocument();
    await submitAdd(drawer).catch(() => undefined);
    const url = within(drawer).getByRole('textbox', { name: strings['images.add.url'] });
    await userEvent.clear(url);
    await put(url, URL);
    await put(within(drawer).getByRole('textbox', { name: strings['images.add.sha'] }), 'abc');
    expect(await within(drawer).findByText(strings['images.add.sha.invalid'])).toBeInTheDocument();
    await submitAdd(drawer).catch(() => undefined);
    await pause();
    expect(imageLog).toEqual([]);
  });

  it.each([
    ['images-add-refused-link', 'images.err.add.SpecInvalid'],
    ['images-add-already', 'images.err.add.AlreadyExists'],
    ['images-add-busy', 'images.err.add.OperationInProgress'],
  ] as const)('%s: refused in the view\'s words, nothing held, the drawer stays for another try', async (state, words) => {
    await renderPage(page, { state, path });
    const drawer = await openAdd(URL);
    await submitAdd(drawer);
    expect(await within(drawer).findByText(strings[words], undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(IMAGES_LOCK)).toEqual([]);
    expect(screen.queryByText(strings['images.add.done'])).toBeNull();
    expect(sent('add')).toHaveLength(1);
  });

  it('images-add-lost: held by the site of the link (never the link), not sent again, and Stop tracking frees it', async () => {
    await renderPage(page, { state: 'images-add-lost', path });
    await submitAdd(await openAdd(URL));
    const text = say('images.held.add', { site: 'mirror.example.org' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(JSON.stringify(heldChanges(IMAGES_LOCK))).not.toContain('secret');
    expect(screen.queryByText(strings['images.add.done'])).toBeNull();
    // No read proves an add: Check again keeps it.
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(500);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: strings['images.add.open'] }, WAIT)).toHaveAttribute('aria-disabled', 'true');
    expect(sent('add')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /stop tracking/i }));
    const q = await screen.findByRole('alertdialog', undefined, WAIT);
    await userEvent.click(within(q).getAllByRole('button').find((b) => /stop tracking/i.test(b.textContent ?? ''))!);
    await waitFor(() => expect(heldChanges(IMAGES_LOCK)).toEqual([]), WAIT);
    expect(sent('add')).toHaveLength(1);
  });

  it('images-add-cannot-fetch: a 503 is held with what the computer reported, never shown as refused or done', async () => {
    await renderPage(page, { state: 'images-add-cannot-fetch', path });
    await submitAdd(await openAdd(URL));
    expect(await screen.findByText(say('images.held.add', { site: 'mirror.example.org' }), undefined, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(strings['images.reason.DownloadFailed'], undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(strings['images.add.done'])).toBeNull();
    expect(heldChanges(IMAGES_LOCK)).toHaveLength(1);
  });

  it('images-no-catalogue-read: the link can still be typed and sent', async () => {
    await renderPage(page, { state: 'images-no-catalogue-read', path });
    const drawer = await openAdd(URL);
    expect(await within(drawer).findByText(strings['images.add.system.unread'], undefined, WAIT)).toBeInTheDocument();
    await submitAdd(drawer);
    await waitFor(() => expect(sent('add')).toHaveLength(1), WAIT);
  });
});

describe('downloads', () => {
  const cancelName = say('images.dl.cancelName', { site: 'releases.ubuntu.com' });
  it('cancel asks first; keep sends nothing; confirm sends once for that download', async () => {
    await renderPage(page, { state: 'images-many', path });
    await downloads();
    await userEvent.click(await screen.findByRole('button', { name: cancelName }, WAIT));
    let d = await dialog(strings['images.stop.title']);
    await userEvent.click(within(d).getByRole('button', { name: strings['images.stop.keep'] }));
    await pause();
    expect(imageLog).toEqual([]);
    await userEvent.click(await screen.findByRole('button', { name: cancelName }, WAIT));
    d = await dialog(strings['images.stop.title']);
    await userEvent.click(within(d).getByRole('button', { name: strings['images.stop.go'] }));
    await waitFor(() => expect(sent('stop')).toHaveLength(1), WAIT);
    expect(sent('stop')[0]!.path.endsWith(`/${J('1')}`)).toBe(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: cancelName })).toBeNull(), WAIT);
  });

  it('a finished row is cleared without a question; a download being checked can be neither cancelled nor cleared', async () => {
    await renderPage(page, { state: 'images-many', path });
    await downloads();
    const all = await screen.findAllByRole('button', { name: new RegExp(`^${say('images.dl.clearName', { site: 'cdimage.debian.org' })}`) }, WAIT);
    // Two rows from that site: the one being checked is off, the finished one is not.
    expect(all.map((b) => b.getAttribute('aria-disabled') === 'true').sort()).toEqual([false, true]);
    await userEvent.click(all.find((b) => b.getAttribute('aria-disabled') === 'true')!);
    await pause();
    expect(imageLog).toEqual([]);
    await userEvent.click(all.find((b) => b.getAttribute('aria-disabled') !== 'true')!);
    await waitFor(() => expect(sent('stop')).toHaveLength(1), WAIT);
    expect(sent('stop')[0]!.path.endsWith(`/${J('4')}`)).toBe(true);
    expect(await screen.findByText(strings['images.stop.done'], undefined, WAIT)).toBeInTheDocument();
  });

  it('images-stop-refused: the view\'s sentence, nothing held', async () => {
    await renderPage(page, { state: 'images-stop-refused', path });
    await downloads();
    await userEvent.click(await screen.findByRole('button', { name: cancelName }, WAIT));
    await userEvent.click(within(await dialog(strings['images.stop.title'])).getByRole('button', { name: strings['images.stop.go'] }));
    expect(await screen.findByText(strings['images.err.stop.BadState'], undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(IMAGES_LOCK)).toEqual([]);
    expect(screen.queryByText(strings['images.stop.done'])).toBeNull();
  });

  it('images-clear-lost-kept: a lost clear of an already cancelled row is not proved by that row still reading cancelled', async () => {
    await renderPage(page, { state: 'images-clear-lost-kept', path });
    await downloads();
    await userEvent.click(await screen.findByRole('button', { name: say('images.dl.clearName', { site: 'mirror.example.org' }) }, WAIT));
    const text = say('images.held.stop', { site: 'mirror.example.org' });
    expect(await screen.findByText(text, undefined, WAIT)).toBeInTheDocument();
    expect(heldChanges(IMAGES_LOCK).map((h) => h.identity)).toEqual([expect.objectContaining({ job: J('7'), how: 'clear' })]);
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await pause(500);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(heldChanges(IMAGES_LOCK)).toHaveLength(1);
    expect(screen.queryByText(strings['images.stop.done'])).toBeNull();
    expect(sent('stop')).toHaveLength(1);
  });

  it('images-stop-lost: held, then proved by a fresh list', async () => {
    await renderPage(page, { state: 'images-stop-lost', path });
    await downloads();
    await userEvent.click(await screen.findByRole('button', { name: cancelName }, WAIT));
    await userEvent.click(within(await dialog(strings['images.stop.title'])).getByRole('button', { name: strings['images.stop.go'] }));
    await waitFor(() => expect(heldChanges(IMAGES_LOCK)).toHaveLength(1), WAIT);
    expect(heldChanges(IMAGES_LOCK)[0]!.identity).toMatchObject({ job: J('1'), how: 'cancel' });
    expect(screen.queryByText(strings['images.stop.done'])).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, WAIT));
    await waitFor(() => expect(heldChanges(IMAGES_LOCK)).toEqual([]), WAIT);
    expect(sent('stop')).toHaveLength(1);
  });
});
