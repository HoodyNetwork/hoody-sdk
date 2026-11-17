// PageHeader's primary action in the terminal draws its icon as the web does (PageHeader.tsx PrimaryButton passes
// icon={action.icon}): Keys' "+ New key" lost its "+" while the terminal PrimaryButton dropped the icon.
import { afterEach, expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { semanticsOf } from '../../term/prim/semantics';
import { routed } from './termHarness';
import { PageHeader, PrimaryButton } from './PageHeader';
import type { IconName } from '../icons';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

async function draw(node: () => ReactElement): Promise<string> {
  const { element } = routed(() => <FocusRoot>{node()}</FocusRoot>);
  t = await drawTest(element, { width: 80, height: 6 });
  return t.settle();
}

test('the header primary draws its glyph icon before the words; its name stays the words', async () => {
  const f = await draw(() => <PageHeader title="Keys and tokens" primary={{ label: 'New key', icon: 'plus', onPress: () => undefined }} />);
  expect(f).toContain('+ New key');
  const button = semanticsOf(t!.renderer).find((s) => s.role === 'button' && s.name === 'New key');
  expect(button).toBeDefined();
});

test('PrimaryButton on its own (Layouts header path) draws the icon too', async () => {
  const f = await draw(() => <PrimaryButton action={{ label: 'New key', icon: 'plus', onPress: () => undefined }} />);
  expect(f).toContain('+ New key');
});

test('control: a decorative icon draws nothing, and no icon draws the words alone', async () => {
  const deco = await draw(() => <PrimaryButton action={{ label: 'New key', icon: 'key' as IconName, onPress: () => undefined }} />);
  expect(deco).toContain('New key');
  expect(deco).not.toContain('+');
  t?.renderer.destroy(); t = null;
  const bare = await draw(() => <PrimaryButton action={{ label: 'New key', onPress: () => undefined }} />);
  expect(bare).toContain('New key');
  expect(bare).not.toContain('+');
});
