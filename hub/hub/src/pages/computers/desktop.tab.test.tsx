// Vitest: the Desktop tab. A computer's desktop shows inside the Hub from the address the Hub builds
// itself (urls.ts desktopUrl, core portAddress, the proxy's `desktop` service), in a frame whose sandbox and allow list
// are the deliberate ones in desktop.ts; beside it "Open in a new tab", Put on Board (the display the desktop opens,
// 1600 + N) and, only when the computer has more than desktop 1, a switcher. A stopped computer shows no frame.
import { describe, expect, it } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { tileHostFits } from '../board/links';
import { DESKTOP_FRAME_FEATURES, DESKTOP_FRAME_SANDBOX, DESKTOP_MAX, desktopDisplay, desktopFrameAllow, desktopsOf } from './desktop';
import { computers } from './fixtures';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';
import { desktopUrl, desktopViewerUrl } from './urls';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

const frameOf = async () => {
  const f = await screen.findByTitle(strings['desktop.frame'].replace('{{name}}', 'atlas').replace('{{n}}', '1'), undefined, { timeout: 8000 });
  return f as HTMLIFrameElement;
};

describe('computers: desktop numbers', () => {
  it('keeps only desktop sessions in range, desktop 1 always first, nothing else of a row', () => {
    expect(desktopsOf([
      { terminal_id: '1', desktop_mode: false },
      { terminal_id: '1603', desktop_mode: true, command_history: ['x'] },
      { terminal_id: 1602, desktop_mode: true },
      { terminal_id: '1602', desktop_mode: true },
      { terminal_id: '1600', desktop_mode: true },
      { terminal_id: '10000', desktop_mode: true },
      { terminal_id: '1604', desktop_mode: 'true' },
      { terminal_id: '16a5', desktop_mode: true },
      null,
      [],
    ])).toEqual([1, 2, 3]);
    expect(desktopsOf({ data: [] })).toEqual([1]);
    expect(desktopsOf(undefined)).toEqual([1]);
  });

  it('builds the desktop address from the computer alone: desktop-N, no query, nothing out of range', () => {
    const u = desktopUrl(atlas, 3);
    expect(u).toMatch(/^https:\/\/[0-9a-f]+-c0a7150000000000000000a1-desktop-3\./);
    expect(u).not.toContain('?');
    expect(u).not.toContain('#');
    expect(desktopUrl(atlas, 0)).toBe('');
    expect(desktopUrl(atlas, 8400)).toBe('');
    expect(desktopUrl(atlas, 1.5)).toBe('');
  });

  it('pins the frame’s sandbox and allow list exactly', () => {
    expect(DESKTOP_FRAME_SANDBOX).toBe('allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock');
    expect(DESKTOP_FRAME_FEATURES).toEqual(['clipboard-read', 'clipboard-write', 'fullscreen', 'keyboard-map']);
  });

  it('grants the features to exactly the desktop’s origin and its display’s (the redirect target), nothing else', () => {
    const desk = new URL(desktopUrl(atlas, 3)).origin;
    const disp = new URL(desktopViewerUrl(atlas, 3)).origin;
    expect(disp).toMatch(/^https:\/\/[0-9a-f]+-c0a7150000000000000000a1-display-1603\./);
    expect(desktopFrameAllow([desktopUrl(atlas, 3), desktopViewerUrl(atlas, 3)])).toBe(
      `clipboard-read ${desk} ${disp}; clipboard-write ${desk} ${disp}; fullscreen ${desk} ${disp}; keyboard-map ${desk} ${disp}`,
    );
    expect(desktopFrameAllow(['', 'http://plain.example', 'javascript:alert(1)', 'not a url'])).toBe('');
    expect(desktopFrameAllow([desktopUrl(atlas, 1), desktopUrl(atlas, 1)])).toBe(DESKTOP_FRAME_FEATURES.map((f) => `${f} ${new URL(desktopUrl(atlas, 1)).origin}`).join('; '));
  });

  it('the Board can address every desktop’s display (1600 + N, up to 9999) on this computer', () => {
    const host = { id: atlas.id, project_id: atlas.project_id, server_name: atlas.server?.name ?? atlas.server_name };
    expect(DESKTOP_MAX).toBe(8399);
    expect(desktopDisplay(DESKTOP_MAX)).toBe(9999);
    for (const n of [1, 3, DESKTOP_MAX]) expect(tileHostFits('display', desktopDisplay(n), host)).toBe(true);
  });

  it('links to a computer’s Desktop tab', () => {
    expect(links.desktop('atlas.00a1')).toBe('/computers?sel=atlas.00a1&tab=desktop');
  });
});

describe('computers: Desktop tab', () => {
  it('is a tab of the detail, reached by pointer and by keyboard', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
    const tab = await screen.findByRole('tab', { name: strings['tab.desktop'] }, { timeout: 8000 });
    await userEvent.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    await frameOf();
    const ports = screen.getByRole('tab', { name: strings['tab.ports'] });
    await userEvent.click(ports);
    expect(screen.queryByTitle(/desktop 1$/)).toBeNull();
    ports.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: strings['tab.desktop'] })).toHaveFocus();
  }, 30000);

  it('frames desktop 1 from the Hub’s own address with the deliberate sandbox and allow list', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    const f = await frameOf();
    expect(f.getAttribute('src')).toBe(desktopUrl(atlas, 1));
    expect(f.getAttribute('sandbox')).toBe(DESKTOP_FRAME_SANDBOX);
    expect(f.getAttribute('allow')).toBe(desktopFrameAllow([desktopUrl(atlas, 1), desktopViewerUrl(atlas, 1)]));
    expect(f.getAttribute('referrerpolicy')).toBe('no-referrer');
    for (const w of ['allow-top-navigation', 'allow-modals', 'allow-downloads']) expect(DESKTOP_FRAME_SANDBOX).not.toContain(w);
    for (const w of ['microphone', 'camera', 'autoplay', 'geolocation', '*', "'src'"]) expect(f.getAttribute('allow')).not.toContain(w);
    const open = screen.getByRole('link', { name: strings['desktop.open'] });
    expect(open).toHaveAttribute('href', desktopUrl(atlas, 1));
    expect(open).toHaveAttribute('target', '_blank');
    expect(open.getAttribute('rel')).toContain('noopener');
  }, 30000);

  it('says it is loading until the frame loads, never a bare frame as working', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    const f = await frameOf();
    const box = f.closest('[data-desktop]');
    if (!box) throw new Error('no desktop box');
    expect(box).toHaveAttribute('data-desktop', 'loading');
    fireEvent.load(f);
    await waitFor(() => expect(box).toHaveAttribute('data-desktop', 'loaded'));
  }, 30000);

  it('offers the desktops the terminal program lists, and switching frames that desktop', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    await frameOf();
    const pick = await screen.findByRole('button', { name: new RegExp(strings['desktop.pick']) }, { timeout: 8000 });
    await userEvent.click(pick);
    const list = await screen.findByRole('listbox');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Desktop 1', 'Desktop 3']);
    await userEvent.click(within(list).getByRole('option', { name: 'Desktop 3' }));
    const f3 = await screen.findByTitle('atlas, desktop 3');
    expect(f3.getAttribute('src')).toBe(desktopUrl(atlas, 3));
    expect(screen.getByRole('link', { name: strings['desktop.open'] })).toHaveAttribute('href', desktopUrl(atlas, 3));
  }, 30000);

  it('keeps desktop 1, with no switcher, when the list does not answer', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop', state: 'desktopsDown' });
    await frameOf();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('button', { name: new RegExp(strings['desktop.pick']) })).toBeNull();
  }, 30000);

  it('puts the display the desktop opens (1600 + N) on the Board', async () => {
    const r = await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    await frameOf();
    const panel = screen.getByRole('tabpanel');
    await userEvent.click(within(panel).getByRole('button', { name: 'Put on Board' }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/board'));
    const q = new URLSearchParams(r.router.state.location.searchStr);
    expect(q.get('add')).toBe('display-1601');
    expect(q.get('cid')).toBe(atlas.id);
  }, 30000);

  it('a stopped computer shows no frame and offers its Start', async () => {
    await renderPage(page, { path: '/computers?sel=cedar.00c3&tab=desktop' });
    await screen.findByText(strings['desktop.stopped'].replace('{{name}}', 'cedar'), undefined, { timeout: 8000 });
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('button', { name: strings['menu.start'] })).toBeInTheDocument();
    expect(panel.querySelector('iframe')).toBeNull();
    expect(within(panel).queryByRole('link', { name: strings['desktop.open'] })).toBeNull();
  }, 30000);

  it('the Leave desktop button takes focus out of the frame', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    const f = await frameOf();
    f.focus();
    await userEvent.click(screen.getByRole('button', { name: strings['desktop.leave'] }));
    expect(document.activeElement).not.toBe(f);
    expect(screen.getByRole('tabpanel').contains(document.activeElement)).toBe(true);
  }, 30000);
});
