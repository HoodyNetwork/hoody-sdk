// The Copy, QR and Board buttons of an "Open on <name>" tile sit in a row of their own under the tile,
// laid out at rest as on hover, so nothing appears, moves or covers the tile. Opening the QR moves focus and
// the pointer into the popover, which lives outside the tile; the row stays laid out, so the QR button keeps its box
// and the popover keeps its anchor (a hidden anchor would put it at the page's top-left corner).
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import strings from './strings.en.json';
import page from './page';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The page's own stylesheet, read as text (the test DOM gets no CSS from the module import). Vitest may run from the
// repo root or from hub/.
const CSS_PATH = ['hub/src', 'src'].map((r) => join(process.cwd(), r, 'pages/computers/parts/parts.module.css')).find((p) => existsSync(p));
const css = CSS_PATH ? readFileSync(CSS_PATH, 'utf8') : '';

let sheet: HTMLStyleElement | null = null;
afterEach(() => {
  sheet?.remove();
  sheet = null;
});

describe('computers: the tile actions row is always laid out, so an open QR keeps its anchor', () => {
  it('the row shows at rest, and the QR button keeps its box after its popover opens and the pointer leaves', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    expect(css).toContain('.useActions');
    // The old floating row is gone from the page's stylesheet (the Home widget used it last).
    expect(css).not.toContain('.useHover');
    sheet = document.createElement('style');
    sheet.textContent = css;
    document.head.appendChild(sheet);
    const actions = await screen.findByRole('group', { name: interpolate(strings['use.actions'], { what: strings['use.terminal.name'] }) }, { timeout: 8000 });
    // At rest: laid out, never hidden until hover (the old floating row was display: none).
    expect(getComputedStyle(actions).display).not.toBe('none');
    const qr = within(actions).getByRole('button', { name: 'QR code' });
    await userEvent.click(qr);
    await screen.findByRole('dialog', {}, { timeout: 3000 });
    await userEvent.unhover(qr);
    // Focus is in the popover now, outside the tile, and the pointer has left it.
    expect(actions.contains(document.activeElement)).toBe(false);
    expect(getComputedStyle(actions).display).not.toBe('none');
  });
});
