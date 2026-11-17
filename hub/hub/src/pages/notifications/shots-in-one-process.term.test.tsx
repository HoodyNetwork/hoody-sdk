// The notifications shots, drawn one after another in ONE process (as the golden runner and every test file do), each
// show the text the shot waits for.
//   - The fake server's memory (fixtures.ts: notices marked read) must not outlive the render that made it: "detail" marks
//     the atlas notice read, while "needs-a-look", "formatted" (opened twice) and the ack states still need their rows. The
//     fixture boot starts every page's fake server empty
//     (app/fixtures.ts resetFixtureServers, term/app/boot.ts).
//   - Each shot waits for text its state draws in the terminal (shots.ts), never for words the web keeps in a closed FAQ
//     answer. ack-unconfirmed's sentence wraps in the
//     inspector, beside the list: the shot's wait-text matcher reads each strip between borders (wait-text.ts), so
//     the shot keeps its whole sentence.
//   - '/learn#browser' opens on the section the anchor names: the terminal SettingsPage shows it on arrival
//     (kit/layouts/Layouts.term.tsx).
//   - The learn-browser-* shots wait for the web card's words, which a terminal never draws: it has no browser alerts,
//     so every browser state shows the same hand-off (parts/BrowserCard.term.tsx). Here each state shows that.
// One test: the order is the point.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { frameShows } from '../../../scripts/term/wait-text';
import termStrings from './parts/BrowserCard.term.strings.en.json';

// Judged as the golden runner judges a shot (scripts/term/wait-text.ts): the whole frame, whitespace collapsed.

async function shot(o: { path: string; fx?: string }, want: string): Promise<string> {
  const s = await renderPage({ page: 'notifications', cols: 120, rows: 40, ...o });
  try {
    let text = await s.settle();
    // Opening a notice sends its mark-read; the answer comes a few turns later.
    for (let i = 0; i < 30 && !frameShows(text, want); i++) { await new Promise((r) => setTimeout(r, 100)); text = await s.settle(); }
    expect(s.failures).toEqual([]);
    // The shot shows its text, or the test fails here, naming the shot; callers then read the real frame.
    const name = o.fx ? `${o.path} (${o.fx})` : o.path;
    expect({ name, shown: frameShows(text, want) }).toEqual({ name, shown: true });
    return text.replace(/\s+/g, ' ');
  } finally {
    s.close();
  }
}

test('each shot shows its text, whatever was drawn before it', async () => {
  const atlas = '/notifications?sel=4e0000000000000000000000';
  const news = '/notifications?sel=4e0007000000000000000000';
  // detail: opening the atlas notice marks it read on the fake server.
  expect(await shot({ path: atlas }, 'This one needs a look.')).toContain('This one needs a look.');
  // needs-a-look: a new boot, so atlas is unread again and leads the list.
  const look = await shot({ path: '/notifications?look=1' }, 'Computer atlas stopped');
  expect(look).toContain('Computer atlas stopped');
  expect(look).toContain('Inbox 26');
  // formatted, twice: unread both times, so both say Marked read.
  expect(await shot({ path: news }, 'Marked read')).toContain('Marked read');
  expect(await shot({ path: news }, 'Marked read')).toContain('Marked read');
  // The ack states still have a notice to mark.
  await shot({ path: atlas, fx: 'ack-lost' }, 'Check again before trying it twice');
  expect(await shot({ path: atlas, fx: 'ack-failed' }, 'as read.')).toContain('as read.');
  // Get notified, arriving on #browser, in each browser state: the terminal's hand-off, whatever the fixture browser.
  const reason = termStrings['term.alerts.reason'];
  for (const fx of ['browser-ask', 'browser-on', 'browser-off', 'browser-blocked', 'browser-broken', 'browser-ios', 'browser-insecure'] as const) {
    const text = await shot({ path: '/notifications/learn#browser', fx }, reason);
    // The Browser alerts section is the one marked in the rail, not the first.
    expect(text).toContain('▌Browser alerts');
  }
}, 600_000);
