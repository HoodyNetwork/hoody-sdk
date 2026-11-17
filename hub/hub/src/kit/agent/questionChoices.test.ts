// questionChoices: the card's own free answer is added only when the agent offers no free-answer choice of its own.
import { describe, expect, it } from 'vitest';
import { ELSE, isFreeAnswer, optionValue, questionChoices } from './questionChoices';

const id = (o: string) => o;
describe('isFreeAnswer', () => {
  it('Something else and Other, in any case, alone or with one bracketed note or closing punctuation', () => {
    for (const o of ['Something else', 'something else', 'SOMETHING ELSE', "Something else (I'll describe it)", 'Something else [type it]', 'Other', 'other', 'Other:', 'Other (please specify)', '  Other  ', 'Something else…', 'Something else.']) {
      expect(isFreeAnswer(o), o).toBe(true);
    }
  });
  it('a longer label is a listed option, sent as written', () => {
    for (const o of ['Other branch', 'Something else entirely: port 9000', 'Others', 'Another', 'Something', 'else', 'Other (a) (b)', '8080', '', 'Use the other one']) {
      expect(isFreeAnswer(o), o).toBe(false);
    }
  });
});

describe('questionChoices', () => {
  it('no free-answer option from the agent: its options, then the card\'s own Something else', () => {
    expect(questionChoices(['8080', '3000'], id, 'Something else')).toEqual([
      { value: optionValue('8080'), label: '8080' }, { value: optionValue('3000'), label: '3000' }, { value: ELSE, label: 'Something else' },
    ]);
  });
  it('the agent\'s own "Something else (I\'ll describe it)" stands for the free answer in its place; no second one is added', () => {
    expect(questionChoices(['8080', "Something else (I'll describe it)"], id, 'Something else')).toEqual([
      { value: optionValue('8080'), label: '8080' }, { value: ELSE, label: "Something else (I'll describe it)" },
    ]);
  });
  it('two free-answer options: only the first opens the field; the other stays a listed option', () => {
    expect(questionChoices(['Other', 'Something else'], id, 'Something else').map((c) => c.value)).toEqual([ELSE, optionValue('Something else')]);
  });
  it('labels go through the given cleaner; values never do', () => {
    expect(questionChoices(['a\u0007b'], (o) => o.replace('\u0007', ''), 'Something else')[0]).toEqual({ value: optionValue('a\u0007b'), label: 'ab' });
  });
});
