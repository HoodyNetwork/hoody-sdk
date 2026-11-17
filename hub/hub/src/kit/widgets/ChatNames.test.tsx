// Vitest: a sentence that names Telegram, Slack or Discord draws each name
// with the app's own mark (the kit icon of that name) right before it, and reads exactly as the plain sentence.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { interpolate } from '../strings';
import { CHAT_SLOTS, ChatNames, markChatApps } from './ChatNames';
import strings from './ChatNames.strings.en.json';

const draw = (text: string) => render(<p><ChatNames text={interpolate(text, CHAT_SLOTS)} /></p>).container;

describe('ChatNames', () => {
  it('draws each chat app placeholder as its mark then its name, and the sentence reads as plain text', () => {
    const box = draw('Reach it from {{telegram}}, {{slack}} or {{discord}}.');
    expect(box.textContent).toBe('Reach it from Telegram, Slack or Discord.');
    const apps = [...box.querySelectorAll('[data-chat-app]')];
    expect(apps.map((a) => a.getAttribute('data-chat-app'))).toEqual(['telegram', 'slack', 'discord']);
    for (const a of apps) {
      const app = a.getAttribute('data-chat-app') as 'telegram' | 'slack' | 'discord';
      // The mark comes first (before any text) and is decoration; the name after it is the app's own word.
      expect(a.firstChild?.nodeName.toLowerCase()).toBe('svg');
      expect(a.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(a.lastChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(a.textContent).toBe(strings[`chat.${app}`]);
    }
  });

  it('draws the official mark of each app (the same drawing as the kit icon of that name)', async () => {
    const { Icon } = await import('../icons');
    const box = draw('{{telegram}} {{slack}} {{discord}}');
    for (const app of ['telegram', 'slack', 'discord'] as const) {
      const want = render(<Icon name={app} size="sm" />).container.querySelector('svg');
      const got = box.querySelector(`[data-chat-app="${app}"] svg`);
      expect(got?.getAttribute('viewBox')).toBe(want?.getAttribute('viewBox'));
      expect(got?.innerHTML).toBe(want?.innerHTML);
    }
  });

  it('a sentence without a chat app placeholder is the same text, with no mark', () => {
    const box = draw('Assistants that work on your computers.');
    expect(box.textContent).toBe('Assistants that work on your computers.');
    expect(box.querySelector('svg')).toBeNull();
  });

  it('an app named twice gets its mark twice', () => {
    const box = draw('{{slack}} and {{slack}}');
    expect(box.querySelectorAll('[data-chat-app="slack"] svg')).toHaveLength(2);
    expect(box.textContent).toBe('Slack and Slack');
  });

  it('a slot that names no chat app shows its word plainly, and the slot marker itself never shows', () => {
    const box = draw('a \u0000matrix\u0000 b');
    expect(box.textContent).toBe('a matrix b');
    expect(box.querySelector('svg')).toBeNull();
    expect(draw('x \u0000 y').textContent).toBe('x  y');
  });

  it('every app has a slot and a name', () => {
    expect(Object.keys(CHAT_SLOTS).sort()).toEqual(['discord', 'slack', 'telegram']);
    expect(Object.keys(strings).sort()).toEqual(['chat.discord', 'chat.slack', 'chat.telegram']);
  });
});

describe('markChatApps (text the page did not write)', () => {
  const mark = (text: string) => render(<p><ChatNames text={markChatApps(text)} /></p>).container;
  const appsIn = (box: HTMLElement) => [...box.querySelectorAll('[data-chat-app]')].map((a) => a.getAttribute('data-chat-app'));
  it('marks each whole-word app name and keeps every other character', () => {
    const text = 'Open Telegram, then Slack\'s app page (Discord: later). Telegram again.';
    const box = mark(text);
    expect(box.textContent).toBe(text);
    expect(appsIn(box)).toEqual(['telegram', 'slack', 'discord', 'telegram']);
    for (const a of box.querySelectorAll('[data-chat-app]')) expect(a.firstChild?.nodeName.toLowerCase()).toBe('svg');
  });
  it('leaves a name inside a longer word, another case, and text naming no app as it is', () => {
    for (const text of ['SlackBot and Telegrams', 'open telegram or DISCORD', 'Copy the token BotFather gives you.', '']) {
      const box = mark(text);
      expect([text, box.textContent]).toEqual([text, text]);
      expect([text, appsIn(box)]).toEqual([text, []]);
    }
  });
  it('drops a stray slot marker, so outside text can never make a mark of its own', () => {
    const box = mark('a\u0000slack\u0000b');
    expect(box.textContent).toBe('aslackb');
    expect(appsIn(box)).toEqual([]);
  });
});
