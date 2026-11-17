import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Text } from '../../term/prim';
import { CHAT_SLOTS, ChatNames, markChatApps } from './ChatNames';

test('ChatNames draws the sentence with each app named, alone or inside running text', async () => {
  const s = `Talk to it on ${CHAT_SLOTS.telegram} or ${CHAT_SLOTS.slack}.`;
  let t = await drawTest(<ChatNames text={s} />, { width: 60, height: 2 });
  expect(await t.settle()).toContain('Talk to it on Telegram or Slack.');
  t.renderer.destroy();
  t = await drawTest(<Text>Chats: <ChatNames text={markChatApps('Discord waits')} marksInRail /></Text>, { width: 60, height: 2 });
  expect(await t.settle()).toContain('Chats: Discord waits');
  t.renderer.destroy();
});
