// A pause read that failed is shown (never a running Pause, never paused), a refused
// change has Details, and an unknown decision reads "may have gone through" (C9 words).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { agent } from '@core';
import { errorSentence, infoOf } from '../states/ErrorDetails';
import stateStrings from '../states/strings.en.json';
import details from './DetailsPanel.strings.en.json';
import { PauseBand, PauseControl } from './Pause';
import strings from './Pause.strings.en.json';
import { createPauseStore, type PauseStore } from './pause';

type Answer = Awaited<ReturnType<agent.PauseApi['get']>>;
const ok = (b: unknown): Answer => ({ ok: true, body: b });
const refused = (status: number, code: string): Answer => ({ ok: false, err: { kind: 'failed', code, status, retryAfter: null, details: {} } });

let getA: Answer, setA: Answer, gets: number, store: PauseStore;
beforeEach(() => {
  vi.useFakeTimers();
  getA = refused(503, 'unavailable'); setA = ok({ paused: true, since_ms: 1000, gen: 2 }); gets = 0;
  store = createPauseStore({ api: { get: () => { gets++; return Promise.resolve(getA); }, set: () => Promise.resolve(setA) } });
});
afterEach(() => { store.reset(); vi.useRealTimers(); });
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });

describe('Pause: a read that failed while the state is unknown', () => {
  it('PauseBand says so, with Try again and Details', async () => {
    render(<PauseBand store={store} computer="atlas" />);
    await flush();
    expect(screen.getByText(strings['pause.readFailed'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
    if (getA.ok) throw new Error('fixture');
    expect(document.body).toHaveTextContent(errorSentence(infoOf(getA.err)));
    const n = gets;
    fireEvent.click(screen.getByRole('button', { name: strings['pause.tryAgain'] }));
    await flush();
    expect(gets).toBeGreaterThan(n);
  });
  it('PauseControl shows no Pause button that reads as running, only Try again', async () => {
    render(<PauseControl store={store} computer="atlas" />);
    await flush();
    expect(screen.queryByRole('button', { name: strings['pause.pause'] })).toBeNull();
    expect(screen.getByText(strings['pause.readFailedStrip'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['pause.tryAgain'] })).toBeInTheDocument();
  });
  it('a refused change shows Details beside its words', async () => {
    getA = ok({ paused: false, since_ms: 0, gen: 1 }); setA = refused(409, 'pause_conflict');
    render(<><PauseControl store={store} computer="atlas" /><PauseBand store={store} computer="atlas" /></>);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: strings['pause.pause'] }));
    await flush();
    expect(screen.getByText(strings['pause.setFailed'].replace('{{code}}', 'pause_conflict'), { exact: false })).toBeInTheDocument();
    if (setA.ok) throw new Error('fixture');
    expect(document.body).toHaveTextContent(errorSentence(infoOf(setA.err)));
    expect(screen.getByRole('button', { name: stateStrings['err.details'] })).toBeInTheDocument();
  });
});

describe('C9 words for an unknown decision', () => {
  it('Details: "may have gone through", never "may not"', () => {
    expect(details['det.unsure']).toContain('may have gone through');
    expect(details['det.unsure']).not.toContain('may not');
  });
});
