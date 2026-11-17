// Vitest: the Tunnels page says what it is for in every state of a running computer. The one-line intro
// is the subtitle, the questions sit under every state (empty ones too), the empty states link to "What is a tunnel for?",
// and a computer with no tunnel program gets the way to its programs instead of a second Connect.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { links as computersLinks } from '../computers/links';
import page from './page';
import strings from './strings.en.json';

const intro = strings['subtitle.on'].replaceAll('{{name}}', 'atlas');
const faqTitle = () => screen.findByRole('heading', { name: kitStrings['faq.title'] });
const howLink = () => screen.findByRole('link', { name: strings['setup.intro.more'] });

describe('tunnels: what the page is for, in every state', () => {
  const states = [
    { state: 'not-installed', text: strings['st.none'] },
    { state: 'program-stopped', text: strings['st.stopped'] },
    { state: 'idle', text: strings['st.idle'] },
    { state: 'program-unknown', text: strings['st.unknown'] },
    { state: 'daemon-error', text: strings['st.title.daemon'] },
  ] as const;
  for (const { state, text } of states) {
    it(`${state}: the intro is the subtitle and the questions are under the state`, async () => {
      await renderPage(page, { state });
      expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
      // The intro leads the subtitle (the idle state adds its summary after it).
      expect(document.body.textContent).toContain(intro);
      await faqTitle();
      expect(screen.getByRole('button', { name: strings['faq.what.q'] })).toBeInTheDocument();
    });
  }

  it('the list keeps the questions, and its subtitle is the intro followed by the summary', async () => {
    await renderPage(page);
    await screen.findByRole('table', { name: strings.title });
    await faqTitle();
    expect(document.body.textContent).toContain(`${intro} 2 sessions connected to atlas`);
  });

  for (const state of ['not-installed', 'program-stopped', 'idle'] as const) {
    it(`${state}: the empty state links to "What is a tunnel for?"`, async () => {
      await renderPage(page, { state });
      expect(await howLink()).toHaveAttribute('href', expect.stringContaining('#faq-what'));
    });
  }

  it("no tunnel program: what it needs and the way to the computer's programs, never a Connect", async () => {
    await renderPage(page, { state: 'not-installed' });
    // One sentence after the other in the state's body.
    expect(await screen.findByText(`${strings['st.none']} ${strings['st.none.alt'].replaceAll('{{name}}', 'atlas')}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['st.openPrograms'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['setup.open'] })).toBeNull();
    // Its destination: that computer's Programs tab.
    expect(computersLinks.programs('atlas.00a1')).toBe('/computers?sel=atlas.00a1&tab=programs');
  });

  it("a running program with nothing connected has one Connect, the header's", async () => {
    await renderPage(page, { state: 'idle' });
    await screen.findByText(strings['st.idle']);
    expect(screen.getAllByRole('button', { name: strings['setup.open'] })).toHaveLength(1);
  });

  it('the two-ways answer carries the two worked examples', () => {
    expect(strings['faq.twoWays.a']).toMatch(/web app you are building on your laptop online/);
    expect(strings['faq.twoWays.a']).toMatch(/database on your laptop in/);
  });
});
