// Vitest: a JSON value shows formatted with colours, Raw gives the stored text, and Copy always copies the exact stored
// bytes. A value nested past the formatter's bound shows as stored, with the line saying so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { JSON_FIXTURE_VALUE, requestLog, resetFixtureVaults } from './fixtures';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

let written: string[] = [];
beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  written = [];
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => vi.unstubAllGlobals());

// The switch and the note are the kit's own words (kit/forms forms.strings.en.json); a page reaches the kit only via @kit.
const kitStrings = { 'secret.formatted': 'Formatted', 'secret.raw': 'Raw', 'secret.rawOnly': 'Shown as stored: too large or too deeply nested to format here.' } as const;

const FORMATTED = '{\n  "retries": 3,\n  "hosts": [\n    "a.example",\n    "b.example"\n  ],\n  "tls": {\n    "verify": true\n  }\n}';

/** The value's own scrolling region: the innermost of the two named Value (the entry's Value section is one too). */
const valueRegion = () => screen.getAllByRole('region', { name: strings['value.field'] }).at(-1)!;

async function showJson(sel: string) {
  await renderPage(page, { state: 'jsonValues', path: `/vault?sel=${sel}` });
  await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
  await screen.findByRole('button', { name: strings['value.hideEye'] });
}

describe('JSON value', () => {
  it('shows formatted in a scrolling region, coloured, with the kit Formatted | Raw switch', async () => {
    await showJson('app.config');
    const region = valueRegion();
    expect(region.textContent).toBe(FORMATTED);
    expect(region.querySelectorAll('span').length).toBeGreaterThan(4);
    expect(screen.getByRole('radio', { name: kitStrings['secret.formatted'] })).toBeChecked();
    expect(screen.getByRole('radio', { name: kitStrings['secret.raw'] })).toBeInTheDocument();
  });

  it('Copy copies the exact stored text, not the formatted one', async () => {
    await showJson('app.config');
    await userEvent.click(screen.getByRole('button', { name: strings['value.copy'] }));
    await waitFor(() => expect(written).toEqual([JSON_FIXTURE_VALUE]));
  });

  it('Raw shows the stored text; hiding and showing again goes back to Formatted', async () => {
    await showJson('app.config');
    await userEvent.click(screen.getByRole('radio', { name: kitStrings['secret.raw'] }));
    expect(valueRegion().textContent).toBe(JSON_FIXTURE_VALUE);
    await userEvent.click(screen.getByRole('button', { name: strings['value.hideEye'] }));
    await userEvent.click(screen.getByRole('button', { name: strings['value.showEye'] }));
    expect(await screen.findByRole('radio', { name: kitStrings['secret.formatted'] })).toBeChecked();
  });

  it('too deep to format: shown as stored with the line, no switch', async () => {
    await showJson('deep.config');
    expect(screen.getByText(kitStrings['secret.rawOnly'])).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: kitStrings['secret.raw'] })).toBeNull();
  });

  it('a plain value has no switch and no formatted region', async () => {
    await showJson('github-token');
    expect(screen.queryByRole('radio', { name: kitStrings['secret.raw'] })).toBeNull();
    expect(screen.queryByText(kitStrings['secret.rawOnly'])).toBeNull();
  });

  it('masked, nothing of the JSON is in the page', async () => {
    await renderPage(page, { state: 'jsonValues', path: '/vault?sel=app.config' });
    await screen.findByRole('button', { name: strings['value.showEye'] });
    expect(document.body.innerHTML).not.toContain('retries');
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
