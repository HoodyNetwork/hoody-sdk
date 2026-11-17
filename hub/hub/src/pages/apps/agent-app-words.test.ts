// Vitest: the program app on a computer is "the Agent app" in every Apps string,
// now that the Hub's own panel is called Agent; a bare "the Agent" would read as that panel.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe('Apps strings name the Agent app', () => {
  it('agent_app_words_apps_github_pane', () => {
    expect(strings['gh.inAgent']).toContain('the Agent app');
    expect(strings['gh.openAgent']).toBe('Open the Agent app');
  });
});
