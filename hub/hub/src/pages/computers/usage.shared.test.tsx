// The usage tiles say that CPU, memory and disk are the server's, shared by every computer on it: nothing is
// reserved for one computer (free slices have no per-computer quota). It is the Usage section's one-sentence
// description, so it reads the same with usage off and on.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

describe('computers: usage is shared across the server', () => {
  it('the Usage section names the server the resources are shared on, before and after turning usage on', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const title = await screen.findByRole('heading', { name: strings['ov.status'] }, { timeout: 8000 });
    const section = title.closest('section') as HTMLElement;
    const line = interpolate(strings['usage.shared'], { server: 'n12' });
    expect(within(section).getByText(line)).toBeVisible();
    await userEvent.click(within(section).getByRole('switch', { name: strings['usage.show'] }));
    await within(section).findAllByRole('meter', {}, { timeout: 8000 });
    expect(within(section).getAllByText(line)).toHaveLength(1);
  });
});
