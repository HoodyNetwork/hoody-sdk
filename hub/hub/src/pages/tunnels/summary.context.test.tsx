// Vitest: with the sessions summary, the header line is live status ("2 sessions connected to atlas ·
// tunnel program running since …"), so it is the header's context row, never its subtitle: the subtitle is a two-line clamp
// (kit PageHeader) that cut the summary off on every phone and up to 900 px. The intro alone stays the subtitle.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const intro = strings['subtitle.on'].replaceAll('{{name}}', 'atlas');

describe('tunnels: the header line', () => {
  it('with the sessions summary it sits in the header, outside the clamped subtitle', async () => {
    await renderPage(page);
    await screen.findByRole('table', { name: strings.title });
    const line = await screen.findByText(/sessions? connected to atlas/);
    expect(line.closest('header')?.querySelector('h1[data-hub-title]')).not.toBeNull();
    // The subtitle is the header's <p>; the context row is a <div>.
    expect(line.closest('p')).toBeNull();
    expect(line.textContent).toContain(`${intro} 2 sessions connected to atlas`);
  });

  it('the intro alone stays the subtitle', async () => {
    await renderPage(page, { state: 'not-installed' });
    await screen.findByText(strings['st.none'], { exact: false });
    const line = screen.getByText(intro);
    expect(line.tagName).toBe('P');
    expect(line.closest('header')?.querySelector('h1[data-hub-title]')).not.toBeNull();
  });
});
