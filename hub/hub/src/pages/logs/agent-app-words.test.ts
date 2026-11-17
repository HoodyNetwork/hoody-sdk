// Vitest: the button that opens the program app on a computer says "the Agent
// app" (the Hub's own panel is called Agent).
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe('Logs strings name the Agent app', () => {
  it('agent_app_words_logs_open_button', () => {
    expect(strings['act.agent']).toBe('Open the Agent app');
    expect(strings['explain.pick.note']).toContain('the Agent app');
  });
});
