// The Bot's model chip follows the one name rule: a hidden Hoody AI name never shows.
import { describe, expect, it } from 'vitest';
import { modelRowLabel, rowOf, specLabel, viewOf } from './data';

const chip = (model: string) => rowOf({ id: 'chief', name: 'Chief', model }, 'c1').modelLabel;

describe('the Bot row\'s model label', () => {
  it('a Hoody AI id that is not in Hoody\'s own form reads "A model", never the id', () => {
    expect(chip('hoody-ai/upstream')).toBe('A model');
    expect(chip('hoody-ai/fast-upstream')).toBe('A model');
  });
  it('a Hoody AI id in Hoody\'s own form reads its id after the provider', () => {
    expect(chip('hoody-ai/hoody-fast')).toBe('hoody-fast');
  });
  it('a Bot that follows the AI page never reads blank: the Bots default words until its model is resolved', () => {
    expect(chip('')).toBe('Bots default (AI page)');
    expect(viewOf({ id: 'chief', name: 'Chief', model: '' }, 'c1|global|chief').modelLabel).toBe('Bots default (AI page)');
  });
  it('another provider\'s model keeps its name, a bare spec too', () => {
    expect(chip('openai/gpt-5')).toBe('gpt-5');
    expect(chip('acme/auto')).toBe('auto');
    expect(chip('bare')).toBe('bare');
  });
});

describe('a listed model\'s label', () => {
  it('an agent-supplied name passes the rule; none left falls back to the spec\'s', () => {
    expect(modelRowLabel({ name: 'Upstream' }, 'hoody-ai/upstream')).toBe('A model');
    expect(modelRowLabel({ name: 'Hoody Fast' }, 'hoody-ai/hoody-fast')).toBe('Hoody Fast');
    expect(modelRowLabel({ label: 'Fast' }, 'openai/x')).toBe('Fast');
    expect(modelRowLabel({}, 'openai/gpt-5')).toBe(specLabel('openai/gpt-5'));
  });
});
