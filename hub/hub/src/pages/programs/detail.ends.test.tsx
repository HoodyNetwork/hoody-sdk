// A temporary program's details say when it ends once: the fact is labelled "Ends" and its value starts at the time
// ("in 40 minutes (02:07 PM)"), never "Ends: Ends in …".
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('program details: when a temporary program ends', () => {
  it('the Ends fact does not repeat its label in its value', async () => {
    await renderPage(page, { path: '/programs?sel=temp%3Aquick_1760000000_1' });
    const label = strings['fact.ends'];
    await waitFor(() => expect(screen.getAllByText(label, { selector: 'dt' }).length).toBe(1));
    const dt = screen.getByText(label, { selector: 'dt' });
    const value = (dt.nextElementSibling?.textContent ?? '').trim();
    expect(value.length).toBeGreaterThan(0);
    expect(value.startsWith(label)).toBe(false);
  });
});
