// The slot rules of ChatNames, shared by the web component and its terminal sibling (no React, no DOM).
// A page's string writes {{telegram}}, {{slack}} or {{discord}}; the page passes CHAT_SLOTS to its t(), and ChatNames
// draws each slot as the app's mark and name.
import type strings from './ChatNames.strings.en.json';

export const CHAT_APPS = ['telegram', 'slack', 'discord'] as const;
export type ChatApp = (typeof CHAT_APPS)[number];
export const CHAT_NAME_KEY = { telegram: 'chat.telegram', slack: 'chat.slack', discord: 'chat.discord' } as const satisfies Record<ChatApp, keyof typeof strings>;

// Marks where an app is named while the string is built; strings never hold this character.
export const CHAT_SLOT = '\u0000';

/** The vars a page passes to t() for a string that names chat apps: each placeholder becomes a slot ChatNames draws. */
export const CHAT_SLOTS: Readonly<Record<ChatApp, string>> = Object.freeze({
  telegram: `${CHAT_SLOT}telegram${CHAT_SLOT}`,
  slack: `${CHAT_SLOT}slack${CHAT_SLOT}`,
  discord: `${CHAT_SLOT}discord${CHAT_SLOT}`,
});

export const isChatApp = (w: string): w is ChatApp => (CHAT_APPS as readonly string[]).includes(w);

const WORD = /\b(Telegram|Slack|Discord)\b/g;

/** Text the page did not write (an agent's setup steps, a setting's label in a refusal) as ChatNames text: each whole-word
 *  Telegram, Slack or Discord becomes that app's slot; every other character stays as it is (a stray slot marker is dropped). */
export function markChatApps(text: string): string {
  return text.replaceAll(CHAT_SLOT, '').replace(WORD, (w) => CHAT_SLOTS[w.toLowerCase() as ChatApp]);
}

/** Even parts are text; odd parts are what a slot held. */
export const chatParts = (text: string): string[] => text.split(CHAT_SLOT);
