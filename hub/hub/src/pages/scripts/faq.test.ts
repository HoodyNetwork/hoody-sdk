// Vitest: the scripts page's questions. The builder is the one list the page's Questions section and the single-answer
// links (Overview, Settings) read: ten questions in a fixed order, each answered from its own strings. The answers carry the
// rules the decision text shares, so a change to a rule is made in both places or fails here.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import strings from './strings.en.json';

const IDS = ['whatIsScript', 'needCode', 'whatCan', 'assistant', 'schedule', 'publicLink', 'accessKey', 'secrets', 'settingsAtTop', 'versionsAndDelete'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('scripts pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the ten questions in order, each id once, each read from its own strings', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    for (const i of items) {
      expect(i.q).toBe(strings[`faq.${i.id}.q` as keyof typeof strings]);
      expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
    }
  });

  it('byId names the same item objects the list holds', () => {
    for (const id of IDS) expect(byId[id]).toBe(items.find((i) => i.id === id));
  });

  it('every question is a question and every answer is a short plain paragraph', () => {
    for (const i of items) {
      expect(i.q.endsWith('?')).toBe(true);
      expect(i.a.length).toBeGreaterThan(40);
      expect(i.a.length).toBeLessThanOrEqual(600);
      expect(i.a).not.toMatch(/\n|<|\{\{/);
    }
  });

  it('the answers keep the rules the decision text states: the key is shown once, the public link can be guessed if short, Restore needs a press', () => {
    expect(strings['key.shownBody']).toContain("It won't be shown again");
    expect(byId.accessKey.a).toContain('A key is shown once');
    expect(strings['link.guess']).toContain('A short name of your own can be found by anyone who tries it');
    expect(byId.publicLink.a).toContain('a short name of your own can be found by anyone who tries it');
    expect(strings['versions.previewBody']).toContain('Nothing is restored until you press Restore this version');
    expect(byId.versionsAndDelete.a).toContain('nothing is restored until you press Restore this version');
  });

  it('the cron help the schedule answer repeats is the one the form shows', () => {
    expect(strings['flow.where.cronHelp']).toContain('minute, hour, day of the month, month, day of the week');
    expect(byId.schedule.a).toContain('minute, hour, day of the month, month, day of the week');
    expect(byId.schedule.a).toContain('Times are UTC');
    expect(strings['flow.where.cronHelp']).toContain('Times are UTC');
  });

  it('the retention sentence is the approved one: the copy is kept "for a while", with no duration anywhere in the answer (the code states none)', () => {
    expect(byId.versionsAndDelete.a).toContain("A deleted script's address stops answering, but the computer keeps a copy for a while.");
    // Strip the one approved sentence, then no duration word or digit may remain in the retention part of the answer.
    const rest = byId.versionsAndDelete.a.replace("A deleted script's address stops answering, but the computer keeps a copy for a while.", '');
    expect(rest).not.toMatch(/\d|\b(second|minute|hour|day|week|month|year)s?\b|\b(one|two|three|four|five|six|seven|ten|twenty|thirty|few|several)\s+(second|minute|hour|day|week|month)/i);
  });

  it('the answers keep the conditions the code sets: masking is partial, creation and restore are conditional', () => {
    expect(byId.assistant.a).toContain('replaces detected secret-like values with placeholders');
    expect(byId.assistant.a).toContain('Review your request and your code for secrets before sending');
    expect(byId.assistant.a).not.toMatch(/secrets are hidden before anything is sent/);
    expect(byId.schedule.a).toContain('Also on a schedule');
    expect(byId.schedule.a).toContain('may run only when called');
    expect(byId.schedule.a).not.toMatch(/you can change it once the script is live/);
    expect(byId.publicLink.a).toContain('for an eligible live script, make one from Overview');
    expect(byId.publicLink.a).toContain('For an address with a variable part, make a link for a fixed address from a Share page');
    expect(byId.secrets.a).toContain('When this computer supports secret values and the script is editable');
    expect(byId.secrets.a).not.toMatch(/code review warns/);
    expect(byId.publicLink.a).not.toContain('you can edit can have one');
    expect(byId.schedule.a).toContain('or on the schedule its generated code sets (UTC)');
    expect(byId.versionsAndDelete.a).toContain('a deleted script while its copy is kept, when the computer allows it');
    expect(byId.versionsAndDelete.a).toContain('if ownership cannot be checked');
    expect(byId.versionsAndDelete.a).toContain('another realm manages the script');
    expect(byId.versionsAndDelete.a).not.toMatch(/^Yes, both/);
  });

  it('the assistant drawer says what the answer says: the code is masked only for detected secrets, the request and a prefilled error are not, check them', () => {
    // Whole sentences, not fragments: a reworded line that keeps some of the words must fail here and be read again.
    expect(strings['ai.sub']).toBe('Looking at {{name}}. Detected secrets in the code are masked. Your request and any prefilled error are not: check them for secrets.');
    expect(strings['ai.codeIntro']).toBe('Current code is shared with detected secret-like values replaced by placeholders.');
    // the prefilled error is the request's text (parts/AiDrawer.tsx: ai.fixPrefill fills the box; sendNow sends the box text unmasked)
    expect(strings['ai.fixPrefill']).toContain('{{error}}');
  });
});
