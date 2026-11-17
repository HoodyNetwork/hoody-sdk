import { afterEach, expect, test } from 'bun:test';
import { useRef } from 'react';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Text } from '../../../term/prim';
import type { SectionId } from '../logic';
import { useFollowSection, useScrollSpy } from './useScrollSpy';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const order = ['ask', 'connect', 'skills'] as unknown as readonly SectionId[];
let api: { jump: (id: SectionId) => void } | null = null;

function Spy({ hash, ready, visible = order }: { hash?: SectionId; ready: boolean; visible?: readonly SectionId[] }) {
  const [current, jump] = useScrollSpy(visible);
  const followed = useRef<SectionId | null>(null);
  useFollowSection(hash, ready, followed, jump, visible);
  api = { jump };
  return <Text>{`current=${String(current)}`}</Text>;
}

test('starts at the first section; a jump marks the section current', async () => {
  t = await drawTest(<Spy ready />, { width: 30, height: 1 });
  expect(await t.settle()).toContain('current=ask');
  api!.jump('skills' as SectionId);
  expect(await t.settle()).toContain('current=skills');
});

test('the URL section is followed once the data is ready, not before', async () => {
  t = await drawTest(<Spy hash={'connect' as SectionId} ready={false} />, { width: 30, height: 1 });
  expect(await t.settle()).toContain('current=ask');
  t.renderer.destroy();
  t = await drawTest(<Spy hash={'connect' as SectionId} ready />, { width: 30, height: 1 });
  expect(await t.settle()).toContain('current=connect');
});

test('a section that left the list is never current (falls back to the first shown)', async () => {
  t = await drawTest(<Spy hash={'skills' as SectionId} ready visible={['ask', 'connect'] as unknown as SectionId[]} />, { width: 30, height: 1 });
  expect(await t.settle()).toContain('current=ask');
});
