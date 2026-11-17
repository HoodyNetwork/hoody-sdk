// The terminal reply footer's Copy writes the reply with its keys hidden, as the Prose draws it (the web footer's rule), a
// percent-encoded key too.
import { expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { ReplyFooter } from './Reply';

const KEY = 'sk-live0123456789abcdef';
// Built here, never written whole: the key above percent-encoded, which a scrub of the written text does not find.
const ENC = 'sk%2D' + 'live0123456789abcdef';

/** What the terminal was asked to copy: the renderer's OSC 52 call, observed in this test only. */
function copies(t: TestTerm): string[] {
  const got: string[] = [];
  (t.renderer as unknown as { copyToClipboardOSC52(s: string): boolean }).copyToClipboardOSC52 = (s) => { got.push(s); return true; };
  return got;
}

/** What Copy on the footer of a reply saying `text` copies. */
async function copyOf(text: string): Promise<string[]> {
  const t = await drawTest(<FocusRoot><ReplyFooter text={text} cost={null} at={null} /></FocusRoot>, { width: 60, height: 3 });
  const copied = copies(t);
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  t.renderer.destroy();
  return copied;
}

test('Copy on a reply holding a key copies it hidden, the rest as written', async () => {
  const copied = await copyOf(`Set it with \`export TOKEN=${KEY}\` and run the tests.`);
  expect(copied.length).toBe(1);
  expect(copied[0]).not.toContain(KEY);
  expect(copied[0]).toContain('[hidden]');
  expect(copied[0]).toContain('and run the tests.');
});

test('Copy on a reply holding a percent-encoded key copies it hidden, the rest as written', async () => {
  const copied = await copyOf(`Your key ${ENC} did not work.`);
  expect(copied).toEqual(['Your key [hidden] did not work.']);
});
