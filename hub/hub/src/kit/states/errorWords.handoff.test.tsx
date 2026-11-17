// The standalone Hub (one HTML file) sends no payment: shared.js refuses every money route unsent with
// STANDALONE_HANDOFF. The words say where payments are made and that nothing was sent, with one link to the same page
// of the served Hub. It is a refusal before sending: never pending, never Check again.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorInfo, servedHubUrl } from '@core';
import { boot } from '@core/test/env';
import { Outcome } from '../forms/Outcome';
import { Band } from './Band';
import { errorWords, ERROR_WORD_KEYS } from './errorWords';
import { ErrorState, OutcomeBanner } from './States';
import strings from './strings.en.json';

const WORDS = 'Payments are made in your Hoody Hub online. Nothing was sent.';
const refusal = { status: 403, code: 'STANDALONE_HANDOFF', handoff: true, notSent: true };
const info = () => errorInfo(refusal, { page: 'billing' });

beforeEach(() => {
  boot();
});
afterEach(cleanup);

describe('STANDALONE_HANDOFF', () => {
  it('keeps its code and reads as a refusal before sending', () => {
    expect(info().code).toBe('STANDALONE_HANDOFF');
    expect(info().outcome).toBe('not_sent');
  });

  it('says where payments are made, with one link to the same page of the served Hub', () => {
    const w = errorWords(info());
    expect(w.key).toBe('err.standaloneHandoff');
    expect((strings as Record<string, string>)['err.standaloneHandoff']).toBe(WORDS);
    expect(w.link?.href).toBe(servedHubUrl('/billing'));
    expect(ERROR_WORD_KEYS).toContain('err.standaloneHandoff');
  });

  it('the same code answered after a send (never expected) still says it, never the general refusal', () => {
    expect(errorWords(errorInfo({ status: 403, code: 'STANDALONE_HANDOFF' }, { page: 'billing' })).key).toBe('err.standaloneHandoff');
  });

  it('a pending outcome keeps the C9 words whatever the code', () => {
    expect(errorWords(errorInfo({ ...refusal, notSent: false, pending: true }, { page: 'billing' })).key).toBe('err.pending');
  });

  it('every error surface shows the words and the link, and none offers Check again', () => {
    const href = servedHubUrl('/billing');
    const surfaces = [
      <ErrorState key="s" error={info()} />,
      <ErrorState key="c" size="compact" error={info()} />,
      <Band key="b" tone="danger" error={info()} />,
      <OutcomeBanner key="o" kind="failed" error={info()} />,
      <Outcome key="l" outcome={{ kind: 'not_sent' }} error={info()} />,
    ];
    for (const el of surfaces) {
      const { unmount } = render(el);
      expect(screen.getByText(/Payments are made in your Hoody Hub online\./)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: strings['handoff.open'] })).toHaveAttribute('href', href);
      expect(screen.queryByRole('button', { name: /Check again/ })).toBeNull();
      unmount();
    }
  });
});

// A settings switch the standalone Hub hands off (auto-renew, cancel: shared.js `setting: true`) charges nothing, so its
// words say where to change it, not where payments are made; same link, same refusal before sending.
describe('STANDALONE_SETTINGS_HANDOFF', () => {
  const SETTINGS = 'Change this in your Hoody Hub online. Nothing was sent.';
  const settings = () => errorInfo({ status: 403, code: 'STANDALONE_SETTINGS_HANDOFF', handoff: true, notSent: true }, { page: 'billing' });

  it('keeps its code and reads as a refusal before sending', () => {
    expect(settings().code).toBe('STANDALONE_SETTINGS_HANDOFF');
    expect(settings().outcome).toBe('not_sent');
  });

  it('says to change it in the Hoody Hub online, with the same one link, never the payment words', () => {
    const w = errorWords(settings());
    expect(w.key).toBe('err.standaloneSettings');
    expect((strings as Record<string, string>)['err.standaloneSettings']).toBe(SETTINGS);
    expect(w.link).toEqual({ href: servedHubUrl('/billing'), label: 'handoff.open' });
    expect(ERROR_WORD_KEYS).toContain('err.standaloneSettings');
  });

  it('a pending outcome keeps the C9 words whatever the code', () => {
    expect(errorWords(errorInfo({ status: 403, code: 'STANDALONE_SETTINGS_HANDOFF', pending: true }, { page: 'billing' })).key).toBe('err.pending');
  });

  it('every error surface shows the settings words and the link, and none offers Check again', () => {
    const href = servedHubUrl('/billing');
    for (const el of [<ErrorState key="s" error={settings()} />, <Band key="b" tone="danger" error={settings()} />, <Outcome key="l" outcome={{ kind: 'not_sent' }} error={settings()} />]) {
      const { unmount } = render(el);
      expect(screen.getByText(/Change this in your Hoody Hub online\./)).toBeInTheDocument();
      expect(screen.queryByText(/Payments are made/)).toBeNull();
      expect(screen.getByRole('link', { name: strings['handoff.open'] })).toHaveAttribute('href', href);
      expect(screen.queryByRole('button', { name: /Check again/ })).toBeNull();
      unmount();
    }
  });
});
