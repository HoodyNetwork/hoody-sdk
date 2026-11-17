// Usage numbers come raw from the API (a CPU of 0.12884237357487155%, gigabytes worked out from bytes). Every place
// shows them rounded the same way: one formatter for percentages, and the kit's formatStorage for sizes.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { pctText, usageReadings } from './logic';
import page from './page';
import strings from './strings.en.json';

const LONG = /\d[.,]\d{2,}/; // two or more decimals: a raw number reached the screen

describe('computers: usage numbers are rounded the same everywhere', () => {
  it('percentages: one decimal under 10, whole numbers from 10, a floor for tiny values', () => {
    expect(pctText(0.12884237357487155)).toBe('0.1');
    expect(pctText(0.04)).toBe('<0.1');
    expect(pctText(0)).toBe('0');
    expect(pctText(9.96)).toBe('10');
    expect(pctText(9.95)).toBe('10');
    expect(pctText(99.5)).toBe('100');
    expect(pctText(Number.POSITIVE_INFINITY)).toBe('—');
    expect(pctText(9.94)).toBe('9.9');
    expect(pctText(42.4615)).toBe('42');
    expect(pctText(100)).toBe('100');
    expect(pctText(-3)).toBe('0');
    expect(pctText(Number.NaN)).toBe('—');
  });

  it('the Overview usage tiles show rounded numbers, never the raw value', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const title = await screen.findByRole('heading', { name: strings['ov.status'] }, { timeout: 8000 });
    const section = title.closest('section') as HTMLElement;
    await userEvent.click(within(section).getByRole('switch', { name: strings['usage.show'] }));
    expect(await within(section).findByText('0.1%', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(section).getByText('1.2 GB of 6 GB')).toBeInTheDocument();
    expect(section.textContent ?? '').not.toMatch(LONG);
    for (const m of within(section).getAllByRole('meter')) expect(m.getAttribute('aria-label') ?? '').not.toMatch(LONG);
  });

  it('the list column and the Overview draw the same rounded readings', () => {
    const r = usageReadings({ cpu: 0.12884237357487155, mem: { used: 1.1734, total: 6 }, disk: { used: 4.2871, total: 40 } });
    expect(r.map((x) => [x.id, x.text])).toEqual([
      ['cpu', '0.1'],
      ['mem', '20'],
      ['disk', '11'],
    ]);
    expect(usageReadings({ cpu: null, mem: null, disk: { used: 1, total: 0 } }).map((x) => x.text)).toEqual([null, null, null]);
    // Memory and disk round exactly as CPU: no earlier whole-number rounding.
    expect(usageReadings({ cpu: 9.94, mem: { used: 9.94, total: 100 }, disk: { used: 0.04, total: 100 } }).map((x) => x.text)).toEqual(['9.9', '9.9', '<0.1']);
    expect(usageReadings({ cpu: Number.NaN, mem: null, disk: null })[0]?.text).toBeNull();
  });
});
