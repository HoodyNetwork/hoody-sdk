// The language menu: every language Hoody is written in, the current one checked; one that is not available stays in
// the arrow-key order, says it is coming soon and does nothing when chosen. Nothing is stored and nothing is sent.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUB_LOCALE, HUB_LOCALES } from '../locales';
import { LanguageMenu } from './LanguageMenu';
import strings from './LanguageMenu.strings.en.json';

const CODES = ['en', 'ar', 'br', 'bs', 'da', 'de', 'es', 'fr', 'ja', 'ko', 'no', 'pl', 'ru', 'th', 'zh', 'zht'];
const rows = () => screen.getAllByRole('menuitemradio');
const open = async () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Language: English' })); });

let setItem: ReturnType<typeof vi.spyOn>;
let fetched: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setItem = vi.spyOn(Storage.prototype, 'setItem');
  fetched = vi.fn(() => Promise.reject(new Error('no request expected')));
  vi.stubGlobal('fetch', fetched);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LanguageMenu', () => {
  it('the list is the sign-in pages’ sixteen languages, each once, English first', () => {
    expect(HUB_LOCALES.map((l) => l.code)).toEqual(CODES);
    expect(new Set(HUB_LOCALES.map((l) => l.name)).size).toBe(16);
    expect(HUB_LOCALE).toBe('en');
    // The sign-in pages' tags: the code itself, except zht and br.
    expect(HUB_LOCALES.filter((l) => l.tag !== l.code).map((l) => [l.code, l.tag])).toEqual([['br', 'pt-BR'], ['zht', 'zh-TW']]);
  });

  it('its button names the language in use; the menu lists all sixteen with English checked', async () => {
    render(<LanguageMenu available={['en']} current="en" />);
    const button = screen.getByRole('button', { name: 'Language: English' });
    expect(button).toHaveTextContent('English');
    await open();
    expect(rows().map((r) => r.textContent)).toEqual(HUB_LOCALES.map((l) => l.name));
    expect(rows().filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['English']);
  });

  it('only English can be chosen: every other language is aria-disabled and described as coming soon', async () => {
    render(<LanguageMenu available={['en']} current="en" />);
    await open();
    const [english, ...others] = rows();
    expect(english).not.toHaveAttribute('aria-disabled');
    expect(others).toHaveLength(15);
    for (const row of others) {
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row).toHaveAccessibleDescription(strings['language.note']);
    }
    expect(strings['language.note']).toMatch(/coming soon/);
    // Said once, at the top of the list.
    expect(screen.getAllByText(strings['language.note'])).toHaveLength(1);
  });

  it('choosing a coming-soon language does nothing: the menu stays, nothing changes, is stored or is sent', async () => {
    const onChange = vi.fn();
    render(<LanguageMenu available={['en']} current="en" onChange={onChange} />);
    await open();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Deutsch' }));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(rows().filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['English']);
    expect(onChange).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
  });

  it('keyboard: Enter opens on the current language, arrows reach the coming-soon ones, Escape gives focus back', async () => {
    render(<LanguageMenu available={['en']} current="en" />);
    const button = screen.getByRole('button', { name: 'Language: English' });
    button.focus();
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'العربية' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Português (Brasil)' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('a later switch: an available language is chosen through onChange and the current one is checked', async () => {
    const onChange = vi.fn();
    render(<LanguageMenu available={['en', 'fr', 'de']} current="fr" onChange={onChange} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Language: Français' })); });
    expect(rows().filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['Français']);
    expect(screen.getByRole('menuitemradio', { name: 'Deutsch' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('menuitemradio', { name: '日本語' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Deutsch' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('de');
  });

  it('every language available: no coming-soon note', async () => {
    render(<LanguageMenu available={CODES} current="en" />);
    await open();
    expect(screen.queryByText(strings['language.note'])).toBeNull();
    expect(rows().every((r) => !r.hasAttribute('aria-disabled'))).toBe(true);
  });
});
