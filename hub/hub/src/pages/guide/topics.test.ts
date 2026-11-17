// Vitest: a topic another page contributes says "From <that page's title>", never a capitalised page id.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useContributions: () => ({
    widgets: [],
    guideTopics: [{ pageId: 'ai', pageTitle: 'Ask the agent', id: 'models', title: 'Pick a model', body: 'Models are listed in the picker.' }],
  }),
}));

describe('guide topics', () => {
  it('names the contributing page by its title', async () => {
    await renderPage(page);
    expect(await screen.findByText(strings['topics.from'].replace('{{page}}', 'Ask the agent'))).toBeInTheDocument();
    expect(screen.queryByText(strings['topics.from'].replace('{{page}}', 'Ai'))).toBeNull();
  });
});
