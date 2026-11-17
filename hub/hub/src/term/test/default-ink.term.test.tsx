// DefaultInk colours Texts with no colour of their own; an own colour wins.
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { DefaultInk, FocusRoot, Text } from '../prim';

test('a Text with no colour takes the DefaultInk; an own colour wins', async () => {
  const t = await drawTest(<FocusRoot><DefaultInk colour="muted"><Text>plain</Text><Text colour="blueText">link</Text></DefaultInk><Text>outside</Text><Text colour="muted">mutedref</Text></FocusRoot>, { width: 20, height: 3 });
  await t.renderOnce();
  // Colour check through the renderables: the drawn text nodes carry their fg.
  const texts: { plainText?: string; fg?: unknown }[] = [];
  const walk = (n: { getChildren?: () => unknown[]; plainText?: string; fg?: unknown; constructor: { name: string } }): void => { if (/Text/.test(n.constructor.name)) texts.push(n); for (const c of n.getChildren?.() ?? []) walk(c as never); };
  walk(t.renderer.root as never);
  const fg = (s: string): string => JSON.stringify(texts.find((x) => x.plainText === s)?.fg);
  expect(fg('plain')).toBe(fg('mutedref'));
  expect(fg('plain')).not.toBe(fg('outside'));
  expect(fg('link')).not.toBe(fg('plain'));
  t.renderer.destroy();
});
