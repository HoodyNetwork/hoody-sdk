// This browser on the account page has the Language row: the kit's language menu, as in the account menu. The Hub is
// in English; the other languages are listed as coming soon, and nothing is kept or sent.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { bootFixtureCore } from '@core';
import { renderPage } from '@app/testing';
import perfStrings from '@kit/perf.strings.en.json';
import languageStrings from '@kit/pickers/LanguageMenu.strings.en.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import { LanguageRow } from './parts/LanguageRow';
import strings from './strings.en.json';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('account: Language', () => {
  it('a row named Language that says the Hub is in English, with the current language on its button', () => {
    render(<LanguageRow />);
    expect(screen.getByText(strings['lang.label'])).toBeInTheDocument();
    expect(screen.getByText(strings['lang.help'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Language: English' })).toHaveTextContent('English');
  });

  it('the list: sixteen languages, English checked, the others coming soon; nothing is stored or sent', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetched = vi.fn(() => Promise.reject(new Error('no request expected')));
    vi.stubGlobal('fetch', fetched);
    render(<LanguageRow />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Language: English' })); });
    const rows = within(screen.getByRole('menu')).getAllByRole('menuitemradio');
    expect(rows).toHaveLength(16);
    expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['English']);
    expect(rows.filter((r) => r.getAttribute('aria-disabled') === 'true')).toHaveLength(15);
    await act(async () => { fireEvent.click(screen.getByRole('menuitemradio', { name: 'Français' })); });
    expect(screen.getByRole('button', { name: 'Language: English' })).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
  });

  it('the page: Language is the first row of This browser, above Performance mode', async () => {
    bootFixtureCore();
    await renderPage(page, { path: '/account' });
    const button = await screen.findByRole('button', { name: 'Language: English' });
    const perf = screen.getByRole('switch', { name: perfStrings['perf.label'] });
    expect(button.compareDocumentPosition(perf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const heading = screen.getByRole('heading', { name: strings['w.section'] });
    expect(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(strings['lang.help'])).toBeInTheDocument();
  });

  it('with the list open the coming-soon sentence shows once: the row says what the setting is, the list says the rest', async () => {
    render(<LanguageRow />);
    expect(strings['lang.help']).not.toBe(languageStrings['language.note']);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Language: English' })); });
    expect(screen.getAllByText(languageStrings['language.note'])).toHaveLength(1);
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(1);
  });
});
