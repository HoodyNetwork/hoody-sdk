// Vitest: the Bots page's questions. The builder is the one list the list pane's Questions section and the single-answer
// links (empty list, Link tab, link drawers, chat-app setup and groups, Settings) read: nine questions in a fixed order, each answered from its own
// strings. The numbers in the answers are written in the text (the FAQ contract takes no vars) and pinned here to the ones the code
// enforces (KEYS_MAX, LIMITS), so a change to a limit fails here until the answer says it too.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import { KEYS_MAX, LIMITS } from './logic';
import strings from './strings.en.json';

const IDS = ['whatIsBot', 'defaultBot', 'linkKeys', 'corsLimits', 'autoApprove', 'chatOwner', 'telegramPrivacy', 'groupChats', 'models'] as const;
const t = (k: keyof typeof strings) => strings[k] as string;
const range = (name: string) => {
  const l = LIMITS.find((x) => x.name === name)!;
  return `${l.min} to ${l.max}`;
};

describe('bots pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the nine questions in order, each id once, each read from its own strings', () => {
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

  it('the key count and the call limits are the ones the code enforces (logic.ts KEYS_MAX, LIMITS)', () => {
    expect(byId.linkKeys.a).toContain(`A link holds at most ${KEYS_MAX} keys.`);
    expect(byId.corsLimits.a).toContain(`A key takes ${range('key_rpm')} calls a minute and ${range('key_concurrency')} at once`);
    expect(byId.corsLimits.a).toContain(`all keys together take ${range('bot_rpm')} a minute and ${range('bot_concurrency')} at once`);
    // The fallback values are not stated: the code does not say they are server defaults.
    for (const l of LIMITS) expect(byId.corsLimits.a).not.toContain(` ${l.fallback} `);
  });

  it('the answers keep what the shortened lines gave up', () => {
    // empty.body: who can reach a Bot
    expect(byId.whatIsBot.a).toMatch(/OpenAI, Anthropic and MCP clients/);
    // giveLink.corsHelp: servers are not affected, when to turn it off
    expect(byId.corsLimits.a).toMatch(/Servers and apps are not affected/);
    expect(byId.corsLimits.a).toMatch(/Turn it off if only your own code on a server calls the link/);
    // the Link tab's old address and example sections: the chat page and the skill file, the command line and the SDK
    expect(byId.linkKeys.a).toMatch(/open the chat page or the skill file/);
    expect(byId.linkKeys.a).toMatch(/install\.hoody\.com for the command line and sdk\.hoody\.com for the SDK/);
    // flow.owner.lede: the owner decides, others are invited from People
    expect(byId.chatOwner.a).toMatch(/The owner decides who may use the Bot/);
    expect(byId.chatOwner.a).toMatch(/you invite everyone else from People afterwards/);
    // flow.privacy.title: privacy off in @BotFather, then add it again
    expect(byId.telegramPrivacy.a).toMatch(/Turn privacy off in @BotFather/);
    expect(byId.telegramPrivacy.a).toMatch(/remove the Bot from each group and add it again/);
    // flow.privacy.title: the warning is the app's @BotFather privacy setting (privacyOn, chatFlow.ts:17), not every app's groups
    expect(byId.telegramPrivacy.a).toMatch(/^The warning shows on a chat app whose bot has privacy on in @BotFather\./);
    // model.desc: when a change applies
    expect(byId.models.a).toMatch(/A change applies when the Bot's conversation next restarts/);
  });

  it('the shortened lines keep their own point in place', () => {
    expect(strings['giveLink.corsHelp']).toMatch(/another website/);
    expect(strings['empty.body']).toMatch(/^A Bot is an assistant/);
    // The chat apps are named in the reach line under the one-line intro.
    expect(strings['empty.reach']).toContain('{{telegram}}');
    expect(strings['link.noneBody']).toContain('Nothing is public until you make a key.');
  });

  it('mixed names every mixed state the pill shows (AutoApprove.tsx: mixed-on, refused, mixed-off)', () => {
    expect(byId.autoApprove.a).toContain('on for the Bot, but some helpers have not confirmed it yet');
    expect(byId.autoApprove.a).toContain('or their approval policies do not allow it');
    expect(byId.autoApprove.a).toContain('off for the Bot, but some helpers have not confirmed it and may still approve alone');
  });

  it('the pairing time is per app, so the answer names no minute count', () => {
    expect(byId.chatOwner.a).not.toMatch(/\d+ minutes/);
  });
});
