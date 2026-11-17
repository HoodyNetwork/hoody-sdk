// Vitest: the Chat apps door points to the program app on a computer, "the Agent
// app", never a bare "the Agent" (the Hub's own panel is called Agent).
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe('Guide strings name the Agent app', () => {
  it('agent_app_words_guide_chat_door', () => {
    expect(strings['door.chat.note']).toMatch(/^In the Agent app, /);
  });
});
