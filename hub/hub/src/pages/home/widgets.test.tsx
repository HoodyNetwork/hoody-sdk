// Home web widgets on the page: add from Customize, the card (frame or "can't be shown here"), its menu, and the
// Customize order list (drag = buttons = Alt+arrows).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import menuStrings from '@kit/overlays/strings.en.json';
import homeStrings from './strings.en.json';
import { moveKeyTo } from './widgets/order';
import { OrderList } from './widgets/OrderList';
import strings from './widgets/strings.en.json';
import { FRAME_SANDBOX } from './widgets/WidgetCard';
import './testWaits';

const ID = '0123456789abcdef01234567';
const KIT = `https://p-${ID}-agent-1.srv.fixture.invalid/app`;

// The fixture world's proxy domain is fixture.invalid (core transport.ts).
afterEach(() => {
  vi.restoreAllMocks();
});

async function add(url: string, name = '') {
  const form = screen.getByRole('region', { name: strings['add.title'] });
  const field = within(form).getByLabelText(strings['add.url']);
  await userEvent.clear(field);
  await userEvent.type(field, url);
  const nameField = within(form).getByLabelText(strings['add.name']);
  await userEvent.clear(nameField);
  if (name) await userEvent.type(nameField, name);
  await userEvent.click(within(form).getByRole('button', { name: strings['add.submit'] }));
}

/** Customize is a modal drawer: the page behind it takes no clicks until Done. */
async function done() {
  await userEvent.click(screen.getByRole('button', { name: homeStrings['customize.done'] }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: homeStrings['customize.title'] })).toBeNull());
}

const cardOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section') as HTMLElement;

describe('adding a web widget', () => {
  it('a Kit address shows in a sandboxed frame, its address masked', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add(KIT, 'Docs');
    const card = await waitFor(() => cardOf('Docs'));
    const frame = card.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe(KIT);
    expect(frame.getAttribute('sandbox')).toBe(FRAME_SANDBOX);
    expect(FRAME_SANDBOX.split(' ').sort()).toEqual(['allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin', 'allow-scripts']);
    expect(frame.getAttribute('allow')).toBe('');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.getAttribute('title')).toBe(strings['card.frame'].replace('{{name}}', 'Docs'));
    expect(card.textContent).not.toContain(ID);
    expect(card.textContent).toContain('0123…4567');
    // The new card also joins the Customize list.
    expect(screen.getByRole('switch', { name: 'Docs' })).toBeChecked();
  });

  it('any other site makes no frame: "can\'t be shown here" with Open in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add('https://example.org/page');
    await waitFor(() => cardOf('example.org'));
    await done();
    const card = cardOf('example.org');
    expect(card.querySelector('iframe')).toBeNull();
    expect(within(card).getByText(strings['card.blocked'])).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: strings['card.open'] }));
    expect(open).toHaveBeenCalledWith('https://example.org/page', '_blank', 'noopener,noreferrer');
  });

  it('http on the proxy domain is not framed either', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add('http://a.srv.fixture.invalid/');
    const card = await waitFor(() => cardOf('a.srv.fixture.invalid'));
    expect(card.querySelector('iframe')).toBeNull();
  });

  it.each([
    ['javascript:alert(1)', 'add.refused.scheme'],
    ['https://user:pw@example.org/', 'add.refused.credentials'],
    ['https://exa mple.org', 'add.refused.bad'],
  ] as const)('refuses %j and adds nothing', async (url, key) => {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add(url);
    expect(await screen.findByText(strings[key])).toBeInTheDocument();
    expect(document.querySelectorAll('[data-key^="home-web:"]')).toHaveLength(0);
  });

  it('refuses the Hub page itself', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add(`${location.origin}/auth/home`);
    expect(await screen.findByText(strings['add.refused.hub'])).toBeInTheDocument();
  });

  it('a name is text, never markup', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add('https://example.org/', '<b>bold</b>');
    const card = await waitFor(() => cardOf('<b>bold</b>'));
    expect(card.querySelector('h2 b')).toBeNull();
  });
});

describe('realms', () => {
  it('with All realms selected nothing can be added and no widget shows', async () => {
    await renderPage(page, { path: '/home?customize=1', realm: 'all' });
    const form = await screen.findByRole('region', { name: strings['add.title'] });
    expect(within(form).getByText(strings['add.noRealm'])).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: strings['add.submit'] })).toBeDisabled();
  });
});

describe('the cap', () => {
  it('at 12 widgets the form locks and says why', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    const form = await screen.findByRole('region', { name: strings['add.title'] });
    for (let i = 0; i < 12; i++) {
      fireEvent.change(within(form).getByLabelText(strings['add.url']), { target: { value: `https://e${i}.example/` } });
      await userEvent.click(within(form).getByRole('button', { name: strings['add.submit'] }));
      await waitFor(() => expect(document.querySelectorAll('li[data-key^="home-web:"]')).toHaveLength(i + 1));
    }
    expect(within(form).getByText(strings['add.full'])).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: strings['add.submit'] })).toBeDisabled();
  });
});

describe('the card menu', () => {
  async function withCard() {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add(KIT, 'Docs');
    await waitFor(() => cardOf('Docs'));
    await done();
    return cardOf('Docs');
  }
  const menu = async (card: HTMLElement, label: string) => {
    await userEvent.click(within(card).getByRole('button', { name: menuStrings.more }));
    await screen.findByRole('menu');
    const items = [...screen.queryAllByRole('menuitem'), ...screen.queryAllByRole('menuitemcheckbox')];
    const item = items.find((el) => el.textContent?.trim() === label);
    expect(item, label).toBeTruthy();
    await userEvent.click(item as HTMLElement);
  };

  it('resizes to the fixed sizes', async () => {
    const card = await withCard();
    expect(card.querySelector('[data-size]')?.getAttribute('data-size')).toBe('m');
    await menu(card, strings['menu.large']);
    await waitFor(() => expect(cardOf('Docs').querySelector('[data-size]')?.getAttribute('data-size')).toBe('l'));
  });

  it('renames, and an empty name goes back to the host', async () => {
    const card = await withCard();
    await menu(card, strings['menu.rename'].replace('{{name}}', 'Docs'));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(strings['rename.label']);
    await userEvent.clear(field);
    await userEvent.type(field, 'Wiki');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['rename.save'] }));
    await waitFor(() => cardOf('Wiki'));
    await menu(cardOf('Wiki'), strings['menu.rename'].replace('{{name}}', 'Wiki'));
    const d2 = await screen.findByRole('dialog');
    await userEvent.clear(within(d2).getByLabelText(strings['rename.label']));
    await userEvent.click(within(d2).getByRole('button', { name: strings['rename.save'] }));
    const host = await waitFor(() => cardOf('p-0123…4567-agent-1.srv.fixture.invalid'));
    expect(host.textContent).not.toContain(ID);
    expect(host.querySelector('iframe')?.getAttribute('title')).not.toContain(ID);
  });

  it('a rename saved unchanged keeps the name as typed (the title shows it masked)', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    await screen.findByText(strings['add.title']);
    await add('https://example.org/', `Docs ${ID}`);
    await waitFor(() => cardOf('Docs 0123…4567'));
    await done();
    await menu(cardOf('Docs 0123…4567'), strings['menu.rename'].replace('{{name}}', 'Docs 0123…4567'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(strings['rename.label'])).toHaveValue(`Docs ${ID}`);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['rename.save'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await menu(cardOf('Docs 0123…4567'), strings['menu.rename'].replace('{{name}}', 'Docs 0123…4567'));
    expect(within(await screen.findByRole('dialog')).getByLabelText(strings['rename.label'])).toHaveValue(`Docs ${ID}`);
  });

  it('removes after a confirm', async () => {
    const card = await withCard();
    await menu(card, strings['menu.remove'].replace('{{name}}', 'Docs'));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['remove.confirm'] }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'Docs' })).toBeNull());
  });

  it('hides like any other card (the Customize switch turns off)', async () => {
    const card = await withCard();
    await menu(card, strings['menu.hide'].replace('{{name}}', 'Docs'));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'Docs' })).toBeNull());
    await userEvent.keyboard('c');
    expect(await screen.findByRole('switch', { name: 'Docs' })).not.toBeChecked();
  });
});

describe('OrderList: drag, buttons and Alt+arrows give the same order', () => {
  const all = ['a', 'b', 'c', 'd'].map((k) => ({ key: k, title: k.toUpperCase() }));
  function setup() {
    const onMove = vi.fn();
    const onMoveTo = vi.fn();
    const r = render(<OrderList all={all} hiddenKeys={new Set()} onToggle={() => undefined} onMove={onMove} onMoveTo={onMoveTo} />);
    const rows = Array.from(r.container.querySelectorAll('li')) as HTMLElement[];
    rows.forEach((row, i) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}) } as DOMRect);
    });
    const grips = rows.map((row) => row.querySelector('[data-grip]') as HTMLElement);
    return { onMove, onMoveTo, rows, grips };
  }

  it('dropping A below C moves it to place 2, as two Move down presses would', () => {
    const { onMoveTo, grips } = setup();
    const grip = grips[0] as HTMLElement;
    fireEvent.pointerDown(grip, { button: 0, pointerId: 7, clientY: 20 });
    fireEvent.pointerMove(grip, { pointerId: 7, clientY: 101 });
    fireEvent.pointerUp(grip, { pointerId: 7, clientY: 101 });
    expect(onMoveTo).toHaveBeenCalledWith('a', 2);
    expect(moveKeyTo(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('marks the dragged row and the drop place while dragging', () => {
    const { grips, rows } = setup();
    fireEvent.pointerDown(grips[3] as HTMLElement, { button: 0, pointerId: 1, clientY: 140 });
    fireEvent.pointerMove(grips[3] as HTMLElement, { pointerId: 1, clientY: 10 });
    expect(rows[3]?.hasAttribute('data-dragging')).toBe(true);
    expect(rows[0]?.getAttribute('data-drop')).toBe('before');
  });

  it('a drop in its own place, a cancelled pointer or another pointer move nothing', () => {
    const { onMoveTo, grips } = setup();
    const g = grips[1] as HTMLElement;
    fireEvent.pointerDown(g, { button: 0, pointerId: 2, clientY: 60 });
    fireEvent.pointerUp(g, { pointerId: 2, clientY: 61 });
    fireEvent.pointerDown(g, { button: 0, pointerId: 3, clientY: 60 });
    fireEvent.pointerMove(g, { pointerId: 3, clientY: 150 });
    fireEvent.pointerCancel(g, { pointerId: 3, clientY: 150 });
    fireEvent.pointerDown(g, { button: 0, pointerId: 5, clientY: 60 });
    fireEvent.pointerMove(g, { pointerId: 5, clientY: 150 });
    fireEvent.pointerUp(g, { pointerId: 6, clientY: 150 });
    expect(onMoveTo).not.toHaveBeenCalled();
  });

  it('a right-button press starts no drag', () => {
    const { onMoveTo, grips } = setup();
    const g = grips[0] as HTMLElement;
    fireEvent.pointerDown(g, { button: 2, pointerId: 9, clientY: 20 });
    fireEvent.pointerMove(g, { pointerId: 9, clientY: 150 });
    fireEvent.pointerUp(g, { pointerId: 9, clientY: 150 });
    expect(onMoveTo).not.toHaveBeenCalled();
  });

  it('a second pointer cannot take over a drag in progress', () => {
    const { onMoveTo, grips } = setup();
    fireEvent.pointerDown(grips[0] as HTMLElement, { button: 0, pointerId: 7, clientY: 20 });
    fireEvent.pointerDown(grips[3] as HTMLElement, { button: 0, pointerId: 8, clientY: 140 });
    fireEvent.pointerMove(grips[3] as HTMLElement, { pointerId: 8, clientY: 5 });
    fireEvent.pointerUp(grips[3] as HTMLElement, { pointerId: 8, clientY: 5 });
    expect(onMoveTo).not.toHaveBeenCalled();
    fireEvent.pointerMove(grips[0] as HTMLElement, { pointerId: 7, clientY: 101 });
    fireEvent.pointerUp(grips[0] as HTMLElement, { pointerId: 7, clientY: 101 });
    expect(onMoveTo).toHaveBeenCalledWith('a', 2);
  });

  it('lost pointer capture cancels the drag, and a new drag works after it', () => {
    const { onMoveTo, grips } = setup();
    const g = grips[0] as HTMLElement;
    fireEvent.pointerDown(g, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(g, { pointerId: 1, clientY: 101 });
    fireEvent.lostPointerCapture(g, { pointerId: 1 });
    fireEvent.pointerUp(g, { pointerId: 1, clientY: 101 });
    expect(onMoveTo).not.toHaveBeenCalled();
    fireEvent.pointerDown(g, { button: 0, pointerId: 2, clientY: 20 });
    fireEvent.pointerMove(g, { pointerId: 2, clientY: 61 });
    fireEvent.pointerUp(g, { pointerId: 2, clientY: 61 });
    expect(onMoveTo).toHaveBeenCalledWith('a', 1);
  });

  it('the grip is hidden from assistive tech; the buttons and Alt+arrows stay', async () => {
    const { onMove, grips } = setup();
    expect(grips[0]?.getAttribute('aria-hidden')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: homeStrings['customize.down'].replace('{{title}}', 'A') }));
    expect(onMove).toHaveBeenCalledWith('a', 1);
    fireEvent.keyDown(screen.getByRole('button', { name: homeStrings['customize.up'].replace('{{title}}', 'C') }), { key: 'ArrowUp', altKey: true });
    expect(onMove).toHaveBeenCalledWith('c', -1);
    expect(screen.getByRole('button', { name: homeStrings['customize.up'].replace('{{title}}', 'A') })).toBeDisabled();
  });
});
