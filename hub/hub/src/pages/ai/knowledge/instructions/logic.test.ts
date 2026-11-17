// The instructions answer is read strictly (text, on/off and revision together, the agent's answer shape), a 409
// instructions_overridden's fields are read strictly, and an agent without the route is told apart from a real refusal.
import { describe, expect, it } from 'vitest';
import { effectOf, instructionsOf, overriddenFields, routeMissing, sameAs } from './logic';

const OK = { text: 'Answer in English.', enabled: true, revision: 'r1' };

describe('instructionsOf', () => {
  it('reads text, on/off and revision together (GET, and a PUT\'s 200)', () => {
    expect(instructionsOf(OK)).toEqual({ text: 'Answer in English.', enabled: true, revision: 'r1' });
    expect(instructionsOf({ ...OK, text: '', enabled: false })).toEqual({ text: '', enabled: false, revision: 'r1' });
  });

  it('extra fields are ignored; the text is kept byte for byte', () => {
    expect(instructionsOf({ ...OK, text: '  a\n\tb  ', status: 'ok' })).toEqual({ text: '  a\n\tb  ', enabled: true, revision: 'r1' });
  });

  it.each([
    ['no text', { ...OK, text: undefined }],
    ['text not a string', { ...OK, text: 3 }],
    ['no enabled', { ...OK, enabled: undefined }],
    ['enabled as a string', { ...OK, enabled: 'true' }],
    ['no revision', { ...OK, revision: undefined }],
    ['empty revision', { ...OK, revision: '' }],
    ['revision too long', { ...OK, revision: 'x'.repeat(257) }],
    ['a list', [OK]],
    ['null', null],
  ])('%s is a failed read, never blank instructions', (_n, raw) => {
    expect(instructionsOf(raw)).toBeNull();
  });
});

describe('sameAs', () => {
  it('equal only when text is byte for byte equal and the switch matches', () => {
    expect(sameAs(OK, { text: 'Answer in English.', enabled: true })).toBe(true);
    expect(sameAs(OK, { text: 'Answer in English. ', enabled: true })).toBe(false);
    expect(sameAs(OK, { text: 'Answer in English.', enabled: false })).toBe(false);
  });
});

describe('overriddenFields', () => {
  it('reads text, enabled, or both', () => {
    expect(overriddenFields({ fields: ['text'] })).toEqual(['text']);
    expect(overriddenFields({ fields: ['enabled'] })).toEqual(['enabled']);
    expect(overriddenFields({ fields: ['text', 'enabled'] })).toEqual(['text', 'enabled']);
  });
  it.each([
    ['no details', undefined],
    ['no fields', {}],
    ['empty', { fields: [] }],
    ['an unknown field', { fields: ['model'] }],
    ['a repeat', { fields: ['text', 'text'] }],
    ['too many', { fields: ['text', 'enabled', 'text'] }],
    ['not a list', { fields: 'text' }],
  ])('%s cannot be read (null): the words then name no field', (_n, d) => {
    expect(overriddenFields(d)).toBeNull();
  });
});

describe('effectOf', () => {
  it('on with text = given; off = off; blank text = blank whatever the switch', () => {
    expect(effectOf(OK)).toBe('given');
    expect(effectOf({ ...OK, enabled: false })).toBe('off');
    expect(effectOf({ ...OK, text: '  \n' })).toBe('blank');
    expect(effectOf({ text: '', enabled: false })).toBe('blank');
  });
});

describe('routeMissing', () => {
  it('only the bare 404 of an unknown path (no code) means the agent lacks the route', () => {
    expect(routeMissing({ status: 404, code: null })).toBe(true);
    expect(routeMissing({ status: 404, code: '' })).toBe(true);
    expect(routeMissing({ status: 404 })).toBe(true);
    expect(routeMissing({ status: 404, code: 'not_found' })).toBe(false);
    expect(routeMissing({ status: 500, code: '' })).toBe(false);
    expect(routeMissing({ status: null, code: null })).toBe(false);
    expect(routeMissing(null)).toBe(false);
  });
});
