// useDoneFlash in a page kept loaded (useKeepPage): hiding the page runs the flash's
// cleanup and showing it runs the effect again. A done outcome flashes once, for its own time, counted from the save: a
// show after the flash ended shows nothing, a show inside it shows only the rest, and a new save flashes again. Every
// kit place that flashes a done outcome is held: OutcomeSlot, FormFooter, SettingRow, and a row in a SettingGroup.
import { act, render, screen } from '@testing-library/react';
import { Activity, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import strings from './forms.strings.en.json';
import { Form, FormFooter } from './more';
import { OutcomeSlot } from './Outcome';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';

const T = strings as Record<string, string>;
const done = (): OutcomeLike => ({ kind: 'done' });

beforeEach(() => {
  boot();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Each kit place that flashes a done outcome, and the words it flashes. */
const places: [string, (o: OutcomeLike) => ReactNode, string][] = [
  ['OutcomeSlot', (o) => <OutcomeSlot outcome={o}><button type="button">Go</button></OutcomeSlot>, T['outcome.done']!],
  ['FormFooter', (o) => <FormFooter dirty={false} outcome={o} onSubmit={() => undefined} />, T['form.saved']!],
  ['SettingRow', (o) => <SettingRow label="Region" outcome={o}>Singapore</SettingRow>, T['form.saved']!],
  ['a row in a SettingGroup', (o) => <SettingGroup><SettingRow label="Region" outcome={o}>Singapore</SettingRow></SettingGroup>, T['form.saved']!],
  ['FormFooter on its Form\'s outcome', (o) => <Form outcome={o} onSubmit={() => undefined}><FormFooter dirty={false} /></Form>, T['form.saved']!],
];

const at = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const shown = (node: ReactNode, on: boolean) => <Activity mode={on ? 'visible' : 'hidden'}>{node}</Activity>;

describe.each(places)('%s: a done flash in a page kept loaded', (_name, place, words) => {
  it('the flash ended: hidden and shown again, nothing flashes', () => {
    const o = done();
    const v = render(shown(place(o), true));
    expect(screen.getByText(words)).toBeInTheDocument();
    at(2500);
    expect(screen.queryByText(words)).toBeNull();
    v.rerender(shown(place(o), false));
    at(10_000);
    v.rerender(shown(place(o), true));
    expect(screen.queryByText(words)).toBeNull();
    at(3000);
    expect(screen.queryByText(words)).toBeNull();
  });

  it('hidden inside the flash and shown inside it: the rest of the flash shows, and it ends at its own time', () => {
    const o = done();
    const v = render(shown(place(o), true));
    at(1000);
    v.rerender(shown(place(o), false));
    at(500);
    v.rerender(shown(place(o), true));
    expect(screen.getByText(words)).toBeInTheDocument();
    // 2.4 s from the save, not 2.4 s from the show.
    at(950);
    expect(screen.queryByText(words)).toBeNull();
  });

  it('hidden inside the flash and shown after its end: nothing flashes', () => {
    const o = done();
    const v = render(shown(place(o), true));
    at(1000);
    v.rerender(shown(place(o), false));
    at(2000);
    v.rerender(shown(place(o), true));
    expect(screen.queryByText(words)).toBeNull();
  });

  it('a new save after the show flashes again for its whole time', () => {
    const o = done();
    const v = render(shown(place(o), true));
    at(2500);
    v.rerender(shown(place(o), false));
    v.rerender(shown(place(o), true));
    const again = done();
    v.rerender(shown(place(again), true));
    expect(screen.getByText(words)).toBeInTheDocument();
    at(2300);
    expect(screen.getByText(words)).toBeInTheDocument();
    at(200);
    expect(screen.queryByText(words)).toBeNull();
  });

  it('hidden and shown many times inside the flash: it still ends at its own time', () => {
    const o = done();
    const v = render(shown(place(o), true));
    for (let i = 0; i < 4; i++) {
      at(300);
      v.rerender(shown(place(o), false));
      at(200);
      v.rerender(shown(place(o), true));
    }
    expect(screen.getByText(words)).toBeInTheDocument();
    at(399);
    expect(screen.getByText(words)).toBeInTheDocument();
    at(1);
    expect(screen.queryByText(words)).toBeNull();
  });

  it('the same done object again after a pending outcome is a new result: it flashes again in full', () => {
    const o = done();
    const v = render(shown(place(o), true));
    at(2500);
    v.rerender(shown(place({ kind: 'pending' }), true));
    v.rerender(shown(place(o), true));
    expect(screen.getByText(words)).toBeInTheDocument();
    at(2300);
    expect(screen.getByText(words)).toBeInTheDocument();
    at(200);
    expect(screen.queryByText(words)).toBeNull();
  });

  it('not kept: a second save flashes again, and StrictMode flashes once for the save time', () => {
    const v = render(<StrictMode>{place(done())}</StrictMode>);
    expect(screen.getByText(words)).toBeInTheDocument();
    at(2450);
    expect(screen.queryByText(words)).toBeNull();
    v.rerender(<StrictMode>{place(done())}</StrictMode>);
    expect(screen.getByText(words)).toBeInTheDocument();
  });
});

describe('OutcomeSlot: the actions and the flash time', () => {
  const slot = (o: OutcomeLike, doneFor?: number) => <OutcomeSlot outcome={o} doneFor={doneFor}><button type="button">Go</button></OutcomeSlot>;

  it('the actions come back when the flash ends, and stay after a hide and show', () => {
    const o = done();
    const v = render(shown(slot(o), true));
    expect(screen.queryByRole('button', { name: 'Go' })).toBeNull();
    at(2500);
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    v.rerender(shown(slot(o), false));
    v.rerender(shown(slot(o), true));
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('a new flash time for the same outcome restarts the flash for that time, as before', () => {
    const o = done();
    const v = render(shown(slot(o, 1000), true));
    at(500);
    v.rerender(shown(slot(o, Infinity), true));
    at(60_000);
    expect(screen.getByText(T['outcome.done']!)).toBeInTheDocument();
    v.rerender(shown(slot(o, 1000), true));
    at(999);
    expect(screen.getByText(T['outcome.done']!)).toBeInTheDocument();
    at(1);
    expect(screen.queryByText(T['outcome.done']!)).toBeNull();
    // Off (0) then on again: a new flash.
    v.rerender(shown(slot(o, 0), true));
    expect(screen.queryByText(T['outcome.done']!)).toBeNull();
    v.rerender(shown(slot(o, 1000), true));
    expect(screen.getByText(T['outcome.done']!)).toBeInTheDocument();
  });
});

describe('a flash kept on (doneFor Infinity) in a page kept loaded', () => {
  it('stays shown across a hide and show', () => {
    const o = done();
    const slot = <OutcomeSlot outcome={o} doneFor={Infinity}><button type="button">Go</button></OutcomeSlot>;
    const v = render(shown(slot, true));
    at(60_000);
    expect(screen.getByText(T['outcome.done']!)).toBeInTheDocument();
    v.rerender(shown(slot, false));
    v.rerender(shown(slot, true));
    at(60_000);
    expect(screen.getByText(T['outcome.done']!)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go' })).toBeNull();
  });
});
