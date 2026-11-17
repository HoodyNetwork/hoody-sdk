// "Another tab", "a reload", "Reload the page": nine sentences on the AI, Scripts and Schedules pages and in an agent
// conversation named the web's surface as where another sender is or how to start over. A terminal has no tab and no
// reload: the other sender is another Hub, and starting over is opening the page again or quitting the Hub. The
// terminal app gives each key its own wording (termWords.json); the web keeps its text.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const SRC = path.resolve(import.meta.dir, '../..');
const KEYS: readonly (readonly [string, string])[] = [
  ['kit/agent/Conversation.strings.en.json', 'agent.d.elsewhere'],
  ['pages/ai/strings.en.json', 'err.reload'],
  ['pages/ai/auto/workflows/Runs.strings.en.json', 'seen.unclear'],
  ['pages/ai/knowledge/instructions/strings.en.json', 'leave.body'],
  ['pages/scripts/strings.en.json', 'build.discardRefused'],
  ['pages/scripts/strings.en.json', 'flow.built.refused.stale'],
  ['pages/scripts/strings.en.json', 'flow.live.elsewhere'],
  ['pages/scripts/strings.en.json', 'ai.err.map_lost'],
  ['pages/schedules/strings.en.json', 'st.loadFailed'],
];
const WEB_PLACE = /\bbrowsers?\b|\breload(s|ed|ing)?\b|\b(another|other|this|the|a new) (tab|window)\b/i;

test('the three new tables are ones the terminal app rewrites', () => {
  for (const name of ['kit/agent/Conversation.strings.en.json', 'pages/ai/auto/workflows/Runs.strings.en.json', 'pages/schedules/strings.en.json']) {
    expect(Object.keys(TERM_WORD_TABLES)).toContain(name);
  }
});

test('each of the nine has a terminal wording with no tab, window or reload in it; the web sentence did name one', () => {
  for (const [name, key] of KEYS) {
    const web = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)[key];
    const term = TERM_WORDS[name]?.[key];
    expect({ name, key, webNamesIt: typeof web === 'string' && WEB_PLACE.test(web) }).toEqual({ name, key, webNamesIt: true });
    expect({ name, key, term: typeof term === 'string' && !WEB_PLACE.test(term) }).toEqual({ name, key, term: true });
  }
});

test('the other sender is another Hub; starting over is said in terminal words', () => {
  expect(TERM_WORDS['pages/scripts/strings.en.json']?.['flow.live.elsewhere']).toBe('Another Hub is making this draft live now.');
  expect(TERM_WORDS['kit/agent/Conversation.strings.en.json']?.['agent.d.elsewhere']).toBe('Decided in another Hub or app');
  expect(TERM_WORDS['pages/schedules/strings.en.json']?.['st.loadFailed']).toBe("This part couldn't load. Open the page again and try again.");
  expect(TERM_WORDS['pages/ai/strings.en.json']?.['err.reload']).toBe('That did not work. Quit the Hub, start it again and try again.');
});
