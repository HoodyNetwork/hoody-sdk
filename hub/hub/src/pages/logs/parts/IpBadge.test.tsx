// Vitest: the visitor address with its country (parts/IpBadge.tsx): the flag slot is always there, the flag and the
// code only for a known country, and an address the platform does not know stands alone.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@app/testing';
import { IpBadge } from './IpBadge';
import strings from '../strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const cell = (c: HTMLElement) => Array.from(c.children) as HTMLElement[];

describe('IpBadge', () => {
  afterEach(cleanup);

  it('a known country: the flag (named for the country), the address, then the two-letter code', () => {
    const { container } = render(<IpBadge t={t} ip="8.8.8.8" geo={{ s: 'known', ip: '8.8.8.8', country: 'US' }} />);
    const [slot, text, code] = cell(container);
    expect(slot?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('From United States');
    expect(slot?.textContent).toBe('🇺🇸');
    expect(text?.textContent).toBe('8.8.8.8');
    expect(code?.textContent).toBe('US');
    expect(cell(container)).toHaveLength(3);
  });

  it('a lookup still out: an empty slot (the address does not move when the country arrives), no flag, no code', () => {
    const { container } = render(<IpBadge t={t} ip="8.8.8.8" geo={{ s: 'pending' }} />);
    const [slot, text] = cell(container);
    expect(slot?.getAttribute('data-geo')).toBe('pending');
    expect(slot?.textContent).toBe('');
    expect(text?.textContent).toBe('8.8.8.8');
    expect(cell(container)).toHaveLength(2);
  });

  it('a country the platform does not hold says so on hover; the address stands alone', () => {
    const { container } = render(<IpBadge t={t} ip="8.8.4.4" geo={{ s: 'unknown' }} />);
    const [slot, text] = cell(container);
    expect(slot?.textContent).toBe('');
    expect(text?.getAttribute('title')).toBe('Country unknown');
    expect(cell(container)).toHaveLength(2);
  });

  it('an address that is never looked up (private, IPv6, text) is shown as it is, with no hover claim about its country', () => {
    const { container } = render(<IpBadge t={t} ip="10.0.0.5" geo={{ s: 'skip' }} />);
    const [slot, text] = cell(container);
    expect(slot?.textContent).toBe('');
    expect(text?.textContent).toBe('10.0.0.5');
    expect(text?.hasAttribute('title')).toBe(false);
  });
});
