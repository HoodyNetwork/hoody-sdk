// Vitest: the "Other websites" setting names CORS wherever it is shown or chosen (the Link tab's glance, both link drawers),
// says it is about calls from a browser, and the FAQ says servers and apps are not affected.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

const CORS_KEYS = ['linkGlance.cors', 'giveLink.cors', 'giveLink.corsHelp'] as const;

describe('the website setting says it is CORS', () => {
  it.each(CORS_KEYS)('%s names CORS', (key) => {
    expect(strings[key]).toMatch(/CORS/);
  });
  it('the help says what it is for in plain words', () => {
    expect(strings['giveLink.corsHelp']).toMatch(/another website/);
  });
  it('the help says it only governs calls made from a browser', () => {
    expect(strings['giveLink.corsHelp']).toMatch(/from a browser/);
  });
  it('the FAQ answer says servers and apps are not affected', () => {
    expect(strings['faq.corsLimits.a']).toMatch(/from a browser/);
    expect(strings['faq.corsLimits.a']).toMatch(/Servers and apps are not affected\./);
  });
});
