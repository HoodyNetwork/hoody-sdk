// Vitest: the Assistant drawer's words about secrets say only what the code does.
// parts/AiDrawer.tsx masks the secret-like literals it detects in the current code; the request text and a prefilled error
// are sent as typed. So the drawer may not claim that secrets are hidden before anything is sent, and it tells the person
// to check their request.
import { describe, expect, it } from 'vitest';
import strings from './strings.en.json';

describe('the assistant drawer secrets wording', () => {
  it('the sub line names detected secrets in the code as masked, and says the request and a prefilled error are not', () => {
    expect(strings['ai.sub']).toContain('Detected secrets in the code are masked');
    expect(strings['ai.sub']).toContain('Your request and any prefilled error are not');
    expect(strings['ai.sub']).toContain('check them for secrets');
  });

  it('the code intro says detected secret-like values are replaced by placeholders, not that all secrets are', () => {
    expect(strings['ai.codeIntro']).toContain('detected secret-like values replaced by placeholders');
  });

  it('no string claims that secrets are hidden before anything is sent', () => {
    const claims = Object.entries(strings).filter(([, v]) => /(secrets?|keys?)\b[^.]*\b(hidden|masked|removed)\b[^.]*\bbefore\b[^.]*\bsent\b|before anything is sent/i.test(String(v)));
    expect(claims).toEqual([]);
  });
});
