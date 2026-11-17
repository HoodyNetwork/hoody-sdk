// Vitest: the API page's words name things as the page and the Hub do: endpoints (not an "operation list"), the Keys
// and tokens page by its name, IDs in capitals, and an endpoint whose description names no auth in plain words.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe('API page words', () => {
  it('names endpoints, Keys and tokens and IDs as the Hub does', () => {
    expect(strings['export.label']).toBe('Download the endpoint list (JSON)');
    expect(strings['link.keys']).toBe('Keys and tokens');
    expect(strings['auth.account']).toContain('from Keys and tokens.');
    expect(strings['fact.id']).toBe('Operation ID');
  });

  it('an endpoint with no auth in the description says so without jargon', () => {
    expect(strings['auth.undeclared']).not.toMatch(/\bspec\b|^Auth\b/);
    expect(strings['auth.undeclared']).toContain('account token');
  });

  it('the Authorisation card stays within one region of explanation (150 characters)', () => {
    const longest = Math.max(...(['account', 'public', 'kit', 'notes'] as const).map((k) => strings[`auth.${k}`].length));
    expect(longest + strings['auth.undeclared'].length).toBeLessThanOrEqual(150);
  });
});
